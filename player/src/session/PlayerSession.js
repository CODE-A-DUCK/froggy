import { EventEmitter } from 'node:events';
import {
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { LoopMode, SessionState } from '../core/playbackConstants.js';
import { VoiceConnectionError } from '../core/errors.js';
import { createRedisVoiceAdapter } from '../voiceAdapter.js';

const VOICE_READY_TIMEOUT_MS = 20_000;
const PLAYER_READY_TIMEOUT_MS = 15_000;
const IDLE_DISCONNECT_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes
const MAX_SERIAL_QUEUE_DEPTH = 50;

export class PlayerSession extends EventEmitter {
  constructor({ guildId, consumer, store, resolver }) {
    super();
    this.guildId = guildId;
    this.consumer = consumer;
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
    this.idleTimer = null;

    this.#bindPlayerEvents();
  }

  async ensureConnected(channelId) {
    return this.#runSerial(() => this.#ensureConnected(channelId));
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

  async queueTrack({
    query,
    textChannelId,
    interactionToken,
    controllerUserId,
  }) {
    return this.#runSerial(() =>
      this.#queueTrack({
        query,
        textChannelId,
        interactionToken,
        controllerUserId,
      }),
    );
  }

  async stop({ textChannelId } = {}) {
    return this.#runSerial(() => this.#stop({ textChannelId }));
  }

  async skip() {
    return this.#runSerial(async () => {
      if (this.player.state.status !== AudioPlayerStatus.Idle) {
        this.suppressNextIdleEvents += 1;
        this.player.stop(true);
      }

      return this.#startNextTrack({ forceAdvance: true });
    });
  }

  async pause() {
    return this.#runSerial(() => this.#pause());
  }

  async resume() {
    return this.#runSerial(() => this.#resume());
  }

  async toggleLoop() {
    return this.#runSerial(() => this.#toggleLoop());
  }

  async resendController({ textChannelId } = {}) {
    return this.#runSerial(() => this.#resendController({ textChannelId }));
  }

  /**
   * Fully tear down this session: stop audio, destroy voice connection, remove
   * all event listeners. Called by GuildPlayerManager after the idle timeout.
   */
  destroy() {
    this.#clearIdleTimer();
    this.#cleanupActiveStream();
    if (
      this.connection &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      this.connection.destroy();
    }
    this.connection = null;
    this.currentTrack = null;
    try {
      this.player.stop(true);
    } catch {
      // player may already be idle
    }
    this.removeAllListeners();
    console.info(`[PlayerSession] Destroyed session for guild ${this.guildId}`);
  }

  #bindPlayerEvents() {
    this.player.on(AudioPlayerStatus.Buffering, () => {
      if (this.state !== SessionState.STOPPING) {
        this.#setState(SessionState.BUFFERING);
      }
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      this.#setState(SessionState.PLAYING);
    });

    this.player.on(AudioPlayerStatus.Paused, () => {
      if (this.currentTrack) {
        this.#setState(SessionState.PAUSED);
      }
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.#cleanupActiveStream();

      if (this.suppressNextIdleEvents > 0) {
        this.suppressNextIdleEvents -= 1;
        return;
      }

      void this.#runSerial(() => this.#startNextTrack({ forceAdvance: false }));
    });

    this.player.on('error', (error) => {
      console.error(`[PlayerSession] Audio player error for guild ${this.guildId}:`, error);

      void this.#runSerial(async () => {
        this.#setState(SessionState.ERROR);
        this.emit('trackError', {
          guild_id: this.guildId,
          text_channel_id: this.textChannelId,
          error: error.message,
          title: this.currentTrack?.title,
        });

        await this.#startNextTrack({ forceAdvance: true });
      });
    });
  }

  async #ensureConnected(channelId) {
    if (
      this.connection &&
      this.connection.joinConfig.channelId === channelId &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      return this.connection;
    }

    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }

    const connection = joinVoiceChannel({
      guildId: this.guildId,
      channelId,
      adapterCreator: createRedisVoiceAdapter(this.guildId, this.consumer),
    });

    this.connection = connection;
    connection.subscribe(this.player);
    this.#bindConnectionEvents(connection);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
      return connection;
    } catch (error) {
      connection.destroy();
      if (this.connection === connection) {
        this.connection = null;
      }

      throw new VoiceConnectionError(
        `Voice connection did not become ready: ${error.message}`,
        {
          code: 'VOICE_NOT_READY',
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
        if (this.connection === connection) {
          this.connection = null;
        }
      }
    });

    connection.on('error', (error) => {
      console.error(
        `[PlayerSession] Voice connection error for guild ${this.guildId}:`,
        error,
      );
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
      if (shouldAutoplay) {
        this.#setState(SessionState.LOADING);
      }

      const track = await this.resolver.resolve(query, {
        textChannelId,
        interactionToken,
        controllerUserId,
      });

      await this.store.enqueue(track);
      this.textChannelId = textChannelId ?? this.textChannelId;

      if (shouldAutoplay) {
        await this.#startNextTrack({ forceAdvance: true });
        return track;
      }

      this.emit('trackQueued', {
        guild_id: this.guildId,
        text_channel_id: textChannelId,
        title: track.title,
        url: track.url,
        thumbnail: track.thumbnail,
        duration: track.duration,
      });

      return track;
    } catch (error) {
      this.#setState(SessionState.ERROR);
      this.emit('trackError', {
        guild_id: this.guildId,
        text_channel_id: textChannelId ?? this.textChannelId,
        error: error.message,
        title: query,
      });
      throw error;
    }
  }

  async #startNextTrack({ forceAdvance = false }) {
    let shouldForceAdvance = forceAdvance;

    while (true) {
      this.#cleanupActiveStream();

      const nextTrack = await this.#selectNextTrack({ forceAdvance: shouldForceAdvance });

      if (!nextTrack) {
        this.currentTrack = null;
        await this.store.clearCurrentTrack();
        this.#setState(SessionState.IDLE);

        this.emit('queueFinished', {
          guild_id: this.guildId,
          text_channel_id: this.textChannelId,
          title: 'Queue Finished',
        });
        return null;
      }

      this.currentTrack = nextTrack;
      this.textChannelId = nextTrack.text_channel_id ?? this.textChannelId;
      this.#setState(SessionState.BUFFERING);
      await this.store.setCurrentTrack(nextTrack);

      try {
        const playbackInput = await this.resolver.createStream(nextTrack);
        const stream = this.#getResourceStream(playbackInput);
        const inputType = this.#getResourceInputType(playbackInput);

        if (playbackInput && typeof playbackInput.cleanup === 'function') {
          this.activeStreamCleanup = playbackInput.cleanup;
        }

        const resource = createAudioResource(stream, {
          inputType,
          inlineVolume: true,
        });

        this.player.play(resource);
        await entersState(this.player, AudioPlayerStatus.Playing, PLAYER_READY_TIMEOUT_MS);

        await this.store.touchCurrentTrack();

        this.emit('trackStarted', await this.#buildPlaybackSnapshot({
          isUpdate: false,
          track: nextTrack,
        }));

        return nextTrack;
      } catch (error) {
        this.#cleanupActiveStream();
        this.#setState(SessionState.ERROR);
        this.emit('trackError', {
          guild_id: this.guildId,
          text_channel_id: this.textChannelId,
          error: error.message,
          title: nextTrack.title,
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
      if (loopMode === LoopMode.REPLAY_ONCE) {
        await this.store.setLoopMode(LoopMode.OFF);
      }
      return this.currentTrack;
    }

    return this.store.dequeue();
  }

  async #stop({ textChannelId } = {}) {
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

    this.emit('trackStopped', {
      guild_id: this.guildId,
      text_channel_id: this.textChannelId,
    });
  }

  #getResourceStream(playbackInput) {
    if (playbackInput && typeof playbackInput === 'object' && 'stream' in playbackInput) {
      return playbackInput.stream;
    }

    return playbackInput;
  }

  #getResourceInputType(playbackInput) {
    if (playbackInput && typeof playbackInput === 'object' && 'inputType' in playbackInput) {
      return playbackInput.inputType;
    }

    if (typeof playbackInput === 'string') {
      return undefined;
    }

    return StreamType.Arbitrary;
  }

  #cleanupActiveStream() {
    if (!this.activeStreamCleanup) {
      return;
    }

    const cleanup = this.activeStreamCleanup;
    this.activeStreamCleanup = null;

    try {
      cleanup();
    } catch (error) {
      console.warn(
        `[PlayerSession] Failed to cleanup active stream for guild ${this.guildId}:`,
        error,
      );
    }
  }

  async #pause() {
    if (!this.currentTrack) {
      return false;
    }

    this.player.pause();
    this.#setState(SessionState.PAUSED);
    await this.store.touchCurrentTrack();

    const snapshot = await this.#buildPlaybackSnapshot({ isUpdate: true });
    if (snapshot) {
      this.emit('sessionUpdated', snapshot);
    }

    return true;
  }

  async #resume() {
    if (!this.currentTrack) {
      return false;
    }

    this.player.unpause();
    this.#setState(SessionState.PLAYING);
    await this.store.touchCurrentTrack();

    const snapshot = await this.#buildPlaybackSnapshot({ isUpdate: true });
    if (snapshot) {
      this.emit('sessionUpdated', snapshot);
    }

    return true;
  }

  async #toggleLoop() {
    const loopMode = await this.store.cycleLoopMode();
    if (!this.currentTrack) {
      return loopMode;
    }

    await this.store.touchCurrentTrack();
    const snapshot = await this.#buildPlaybackSnapshot({
      isUpdate: true,
      loopState: loopMode,
    });

    if (snapshot) {
      this.emit('sessionUpdated', snapshot);
    }

    return loopMode;
  }

  async #resendController({ textChannelId } = {}) {
    if (!this.currentTrack) {
      return false;
    }

    this.textChannelId = textChannelId ?? this.textChannelId;
    await this.store.touchCurrentTrack();

    const snapshot = await this.#buildPlaybackSnapshot({ isUpdate: false });
    if (!snapshot) {
      return false;
    }

    this.emit('sessionUpdated', {
      ...snapshot,
      interaction_token: '',
      force_new: true,
      text_channel_id: this.textChannelId,
    });

    return true;
  }

  async #buildPlaybackSnapshot({ isUpdate, loopState, track } = {}) {
    const activeTrack = track ?? this.currentTrack;
    if (!activeTrack) {
      return null;
    }

    const resolvedLoopState = loopState ?? (await this.store.getLoopMode());

    return {
      ...activeTrack,
      guild_id: this.guildId,
      text_channel_id: activeTrack.text_channel_id ?? this.textChannelId,
      interaction_token: isUpdate ? '' : activeTrack.interaction_token ?? '',
      source_url: activeTrack.url,
      loop_state: resolvedLoopState,
      is_paused:
        this.state === SessionState.PAUSED ||
        this.player.state.status === AudioPlayerStatus.Paused,
      is_muted: false,
      is_update: isUpdate,
    };
  }

  #setState(nextState) {
    if (this.state === nextState) return;

    const previousState = this.state;
    this.state = nextState;

    if (nextState === SessionState.IDLE) {
      this.#startIdleTimer();
    } else {
      this.#clearIdleTimer();
    }

    this.emit('stateChanged', {
      guild_id: this.guildId,
      previous_state: previousState,
      state: nextState,
    });
  }

  #startIdleTimer() {
    this.#clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection.destroy();
        this.connection = null;
        console.info(`[PlayerSession] Auto-disconnected idle voice connection for guild ${this.guildId}`);
      }
    }, IDLE_DISCONNECT_TIMEOUT_MS);
  }

  #clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  #runSerial(operation) {
    if (this.serialQueueDepth >= MAX_SERIAL_QUEUE_DEPTH) {
      console.warn(`[PlayerSession] Serial queue full for guild ${this.guildId} (depth: ${this.serialQueueDepth})`);
      return Promise.reject(new Error('Command queue is full, please slow down'));
    }

    this.serialQueueDepth++;
    const nextOperation = this.serialChain.then(
      () => { this.serialQueueDepth--; return operation(); },
      () => { this.serialQueueDepth--; return operation(); },
    );
    this.serialChain = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
