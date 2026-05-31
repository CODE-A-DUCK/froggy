import { EventEmitter } from "node:events";
import {
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  getVoiceConnection,
} from "@discordjs/voice";
import { LoopMode, SessionState } from "../core/playbackConstants.js";
import { VoiceConnectionError } from "../core/errors.js";

const VOICE_READY_TIMEOUT_MS = 20_000;
const PLAYER_READY_TIMEOUT_MS = 15_000;
const EMPTY_VC_TIMEOUT_MS = 3 * 60 * 1_000;
const MAX_SERIAL_QUEUE_DEPTH = 50;

export class PlayerSession extends EventEmitter {
  constructor({ guildId, client, store, resolver }) {
    super();
    this.guildId = guildId;
    this.client = client;
    this.store = store;
    this.resolver = resolver;

    this.player = createAudioPlayer();
    this.connection = null;
    this.currentTrack = null;
    this.textChannelId = null;
    this.state = SessionState.IDLE;
    this.serialChain = Promise.resolve();
    this.serialQueueDepth = 0;
    this.suppressNextIdleEvents = 0;
    this.activeStreamCleanup = null;
    this.emptyTimer = null;

    this.#bindPlayerEvents();
  }

  async play({
    query,
    channelId,
    textChannelId,
    interactionToken,
    controllerUserId,
  }) {
    return this.#runSerial(async () => {
      await this.#ensureConnected(channelId);
      return this.#queueTrack({
        query,
        textChannelId,
        interactionToken,
        controllerUserId,
      });
    });
  }

  async stop({ textChannelId } = {}) {
    return this.#runSerial(() => this.#stop({ textChannelId }));
  }

  async pause() {
    return this.#runSerial(() => this.#setPauseState(true));
  }

  async resume() {
    return this.#runSerial(() => this.#setPauseState(false));
  }

  async skip() {
    return this.#runSerial(() => this.#startNextTrack({ forceAdvance: true }));
  }

  async toggleLoop() {
    return this.#runSerial(() => this.#toggleLoop());
  }

  async resendController({ textChannelId } = {}) {
    return this.#runSerial(() => this.#resendController({ textChannelId }));
  }

  async ensureConnected(channelId) {
    return this.#runSerial(() => this.#ensureConnected(channelId));
  }

  async disconnectVoice() {
    return this.#runSerial(async () => {
      this.#clearEmptyTimer();
      const conn = this.connection ?? getVoiceConnection(this.guildId);
      if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
        conn.destroy();
      }
      this.connection = null;

      // 強制移除語音狀態（應對重啟後失去 Library 狀態的情況）
      try {
        const guild = this.client.guilds.cache.get(this.guildId);
        const me =
          guild?.members.me ??
          (await guild?.members.fetch(this.client.user.id).catch(() => null));
        if (me?.voice.channel) {
          await me.voice.setChannel(null).catch(() => null);
        }
      } catch (err) {
        console.warn(
          `[PlayerSession] Failed to force-disconnect voice for guild ${this.guildId}:`,
          err.message,
        );
      }
    });
  }

  destroy() {
    this.#clearEmptyTimer();
    this.#cleanupActiveStream();
    if (this.connection?.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection?.destroy();
    }
    this.connection = null;
    this.currentTrack = null;
    try {
      this.player.stop(true);
    } catch {
      /* already idle */
    }
    this.removeAllListeners();
  }

  async #ensureConnected(channelId) {
    const conn = this.connection;
    if (
      conn &&
      conn.joinConfig.channelId === channelId &&
      conn.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      return conn;
    }

    conn?.destroy();
    this.connection = null;

    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild)
      throw new VoiceConnectionError(`Guild ${this.guildId} not in cache`);

    const connection = joinVoiceChannel({
      guildId: this.guildId,
      channelId,
      adapterCreator: guild.voiceAdapterCreator,
    });

    this.connection = connection;
    connection.subscribe(this.player);
    this.#bindConnectionEvents(connection);

    await this.updateVoicePresence();

    try {
      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        VOICE_READY_TIMEOUT_MS,
      );
      return connection;
    } catch (error) {
      connection.destroy();
      if (this.connection === connection) this.connection = null;
      throw new VoiceConnectionError(
        `Voice connection did not become ready: ${error.message}`,
        {
          code: "VOICE_NOT_READY",
          cause: error,
        },
      );
    }
  }

  #bindConnectionEvents(connection) {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        if (this.connection === connection) this.connection = null;
      }
    });

    connection.on("error", (error) =>
      console.error(
        `[PlayerSession] Voice connection error for guild ${this.guildId}:`,
        error,
      ),
    );
  }

  #bindPlayerEvents() {
    this.player.on(AudioPlayerStatus.Buffering, () => {
      if (this.state !== SessionState.STOPPING)
        this.#setState(SessionState.BUFFERING);
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      if (this.state !== SessionState.STOPPING)
        this.#setState(SessionState.PLAYING);
    });

    this.player.on(AudioPlayerStatus.Paused, () => {
      if (this.state !== SessionState.STOPPING)
        this.#setState(SessionState.PAUSED);
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.suppressNextIdleEvents > 0) {
        this.suppressNextIdleEvents--;
        return;
      }
      if (this.state !== SessionState.IDLE) {
        this.#startNextTrack({ forceAdvance: false }).catch((error) =>
          console.error(
            `[PlayerSession] Error advancing track for guild ${this.guildId}:`,
            error,
          ),
        );
      }
    });

    this.player.on("error", (error) => {
      console.error(
        `[PlayerSession] Audio player error for guild ${this.guildId}:`,
        error.message,
      );
      this.#cleanupActiveStream();
      this.#setState(SessionState.ERROR);
      this.emit("trackError", {
        guild_id: this.guildId,
        text_channel_id: this.textChannelId,
        error: error.message,
        title: this.currentTrack?.title,
      });
      this.#startNextTrack({ forceAdvance: true }).catch(() => null);
    });
  }

  async #queueTrack({
    query,
    textChannelId,
    interactionToken,
    controllerUserId,
  }) {
    const shouldAutoplay =
      this.player.state.status === AudioPlayerStatus.Idle && !this.currentTrack;

    try {
      if (shouldAutoplay) this.#setState(SessionState.LOADING);

      const track = await this.resolver.resolve(query, {
        textChannelId,
        interactionToken,
        controllerUserId,
      });
      await this.store.enqueue(track);
      this.textChannelId = textChannelId ?? this.textChannelId;

      if (shouldAutoplay) {
        await this.#startNextTrack({ forceAdvance: true });
      } else {
        this.emit("trackQueued", {
          guild_id: this.guildId,
          text_channel_id: textChannelId,
          title: track.title,
          url: track.url,
          thumbnail: track.thumbnail,
          duration: track.duration,
          controller_user_id: track.controller_user_id,
        });
      }
      return track;
    } catch (error) {
      this.#setState(SessionState.ERROR);
      this.emit("trackError", {
        guild_id: this.guildId,
        text_channel_id: textChannelId ?? this.textChannelId,
        error: error.message,
        title: query,
        controller_user_id: controllerUserId,
      });
      throw error;
    }
  }

  async #startNextTrack({ forceAdvance = false }) {
    let shouldForceAdvance = forceAdvance;

    while (true) {
      this.#cleanupActiveStream();
      const nextTrack = await this.#selectNextTrack({
        forceAdvance: shouldForceAdvance,
      });

      if (!nextTrack) {
        const lastRequesterId = this.currentTrack?.controller_user_id;
        this.currentTrack = null;
        await this.store.clearCurrentTrack();
        this.#setState(SessionState.IDLE);
        this.emit("queueFinished", {
          guild_id: this.guildId,
          text_channel_id: this.textChannelId,
          controller_user_id: lastRequesterId,
        });
        return null;
      }

      this.currentTrack = nextTrack;
      this.textChannelId = nextTrack.text_channel_id ?? this.textChannelId;
      this.#setState(SessionState.BUFFERING);
      await this.store.setCurrentTrack(nextTrack);

      try {
        const playbackInput = await this.resolver.createStream(nextTrack);
        const { stream, inputType } = this.#extractResource(playbackInput);
        if (typeof playbackInput?.cleanup === "function") {
          this.activeStreamCleanup = playbackInput.cleanup;
        }

        this.player.play(
          createAudioResource(stream, { inputType, inlineVolume: true }),
        );
        await entersState(
          this.player,
          AudioPlayerStatus.Playing,
          PLAYER_READY_TIMEOUT_MS,
        );
        await this.store.touchCurrentTrack();

        this.emit(
          "trackStarted",
          await this.#buildPlaybackSnapshot({
            isUpdate: false,
            track: nextTrack,
          }),
        );
        return nextTrack;
      } catch (error) {
        this.#cleanupActiveStream();
        this.#setState(SessionState.ERROR);
        this.emit("trackError", {
          guild_id: this.guildId,
          text_channel_id: this.textChannelId,
          error: error.message,
          title: nextTrack.title,
          controller_user_id: nextTrack.controller_user_id,
        });
        shouldForceAdvance = true;
      }
    }
  }

  async #selectNextTrack({ forceAdvance }) {
    const loopMode = await this.store.getLoopMode();
    if (
      !forceAdvance &&
      this.currentTrack &&
      (loopMode === LoopMode.REPLAY_ONCE || loopMode === LoopMode.TRACK)
    ) {
      if (loopMode === LoopMode.REPLAY_ONCE)
        await this.store.setLoopMode(LoopMode.OFF);
      return this.currentTrack;
    }
    return this.store.dequeue();
  }

  async #stop({ textChannelId, controllerUserId } = {}) {
    this.#setState(SessionState.STOPPING);
    this.textChannelId = textChannelId ?? this.textChannelId;
    this.#cleanupActiveStream();

    if (this.player.state.status !== AudioPlayerStatus.Idle) {
      this.suppressNextIdleEvents += 1;
      this.player.stop(true);
    }

    this.currentTrack = null;
    await this.store.clearQueue();
    await this.store.clearCurrentTrack();
    this.#setState(SessionState.IDLE);
    this.emit("trackStopped", {
      guild_id: this.guildId,
      text_channel_id: this.textChannelId,
      controller_user_id: controllerUserId,
    });
  }

  async #setPauseState(paused) {
    if (!this.currentTrack) return false;
    paused ? this.player.pause() : this.player.unpause();
    this.#setState(paused ? SessionState.PAUSED : SessionState.PLAYING);
    await this.store.touchCurrentTrack();
    const snapshot = await this.#buildPlaybackSnapshot({ isUpdate: true });
    if (snapshot) this.emit("sessionUpdated", snapshot);
    return true;
  }

  async #toggleLoop() {
    const loopMode = await this.store.cycleLoopMode();
    if (!this.currentTrack) return loopMode;
    const snapshot = await this.#buildPlaybackSnapshot({
      isUpdate: true,
      loopState: loopMode,
    });
    if (snapshot) this.emit("sessionUpdated", snapshot);
    return loopMode;
  }

  async #resendController({ textChannelId } = {}) {
    if (!this.currentTrack) return false;
    this.textChannelId = textChannelId ?? this.textChannelId;
    const snapshot = await this.#buildPlaybackSnapshot({ isUpdate: false });
    if (!snapshot) return false;
    this.emit("sessionUpdated", {
      ...snapshot,
      interaction_token: "",
      force_new: true,
      text_channel_id: this.textChannelId,
    });
    return true;
  }

  #extractResource(input) {
    if (input && typeof input === "object") {
      return {
        stream: "stream" in input ? input.stream : input,
        inputType:
          "inputType" in input ? input.inputType : StreamType.Arbitrary,
      };
    }
    return { stream: input, inputType: undefined };
  }

  #cleanupActiveStream() {
    if (!this.activeStreamCleanup) return;
    const cleanup = this.activeStreamCleanup;
    this.activeStreamCleanup = null;
    try {
      cleanup();
    } catch (err) {
      console.warn(
        `[PlayerSession] Stream cleanup failed for guild ${this.guildId}:`,
        err.message,
      );
    }
  }

  async #buildPlaybackSnapshot({ isUpdate, loopState, track } = {}) {
    const activeTrack = track ?? this.currentTrack;
    if (!activeTrack) return null;
    const resolvedLoopState = loopState ?? (await this.store.getLoopMode());
    return {
      ...activeTrack,
      guild_id: this.guildId,
      text_channel_id: activeTrack.text_channel_id ?? this.textChannelId,
      interaction_token: isUpdate ? "" : (activeTrack.interaction_token ?? ""),
      source_url: activeTrack.url,
      loop_state: resolvedLoopState,
      is_paused:
        this.state === SessionState.PAUSED ||
        this.player.state.status === AudioPlayerStatus.Paused,
      is_muted: false,
      is_update: isUpdate,
    };
  }

  async updateVoicePresence() {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return;

    const me =
      guild.members.me ||
      (await guild.members.fetch(this.client.user.id).catch(() => null));
    const channel = me?.voice.channel;

    if (!channel) {
      this.#clearEmptyTimer();
      return;
    }

    // 計算頻道內除了機器人以外的人數
    const humanMembers = channel.members.filter((m) => !m.user.bot);

    if (humanMembers.size === 0) {
      this.#startEmptyTimer();
    } else {
      this.#clearEmptyTimer();
    }
  }

  #startEmptyTimer() {
    if (this.emptyTimer) return;
    this.emptyTimer = setTimeout(async () => {
      console.info(
        `[PlayerSession] VC empty for ${EMPTY_VC_TIMEOUT_MS}ms, disconnecting guild ${this.guildId}`,
      );
      await this.disconnectVoice();
    }, EMPTY_VC_TIMEOUT_MS);
  }

  #clearEmptyTimer() {
    if (this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
  }

  #setState(nextState) {
    if (this.state === nextState) return;
    const previousState = this.state;
    this.state = nextState;

    this.emit("stateChanged", {
      guild_id: this.guildId,
      previous_state: previousState,
      state: nextState,
    });
  }

  #runSerial(operation) {
    if (this.serialQueueDepth >= MAX_SERIAL_QUEUE_DEPTH) {
      console.warn(
        `[PlayerSession] Serial queue full for guild ${this.guildId}`,
      );
      return Promise.reject(
        new Error("Command queue is full, please slow down"),
      );
    }
    this.serialQueueDepth++;
    const run = () => {
      this.serialQueueDepth--;
      return operation();
    };
    const next = this.serialChain.then(run, run);
    this.serialChain = next.then(
      () => {},
      () => {},
    );
    return next;
  }
}
