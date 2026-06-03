import { EventEmitter } from "node:events";

import { 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  joinVoiceChannel, 
  VoiceConnectionStatus, 
  entersState 
} from "@discordjs/voice";

import { getTrackMetadata, createAudioStream } from "./youtube.js";

export class MusicPlayer extends EventEmitter {
  constructor(guildId, client) {
    super();
    this.guildId = guildId;
    this.client = client;
    this.queue = [];
    this.currentTrack = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.loopMode = 0; // 0: off, 1: replay once, 2: loop track
    this.textChannelId = null;
    this.isStopping = false;

    this.player.on(AudioPlayerStatus.Idle, () => this.onTrackEnd());
    this.player.on("error", (err) => {
      console.error(`[MusicPlayer] Player error in ${this.guildId}:`, err);
      this.emit("trackError", { guild_id: this.guildId, error: err.message, text_channel_id: this.textChannelId });
      this.onTrackEnd();
    });
  }

  /**
   * 播放歌曲或加入隊列
   */
  async play(query, options = {}) {
    try {
      this.textChannelId = options.textChannelId || this.textChannelId;
      const metadata = await getTrackMetadata(query);
      const track = {
        ...metadata,
        requested_at: new Date().toISOString(),
        interaction_token: options.interactionToken || "",
        controller_user_id: options.controllerUserId || null,
        text_channel_id: this.textChannelId
      };

      if (!this.currentTrack) {
        this.currentTrack = track;
        await this.ensureConnection(options.channelId);
        this.startPlayback();
      } else {
        this.queue.push(track);
        this.emit("trackQueued", { ...track, guild_id: this.guildId, silent: options.silent });
      }
      return track;
    } catch (err) {
      this.emit("trackError", { guild_id: this.guildId, error: err.message, text_channel_id: this.textChannelId, interaction_token: options.interactionToken });
      throw err;
    }
  }

  /**
   * 開始播放當前歌曲
   */
  async startPlayback() {
    if (!this.currentTrack) return;

    try {
      const trackUrl = this.currentTrack.url;
      const { stream, inputType, cleanup } = await createAudioStream(trackUrl);

      // 確保在取得串流的過程中，沒有被停止或切換歌曲
      if (!this.currentTrack || this.currentTrack.url !== trackUrl || this.isStopping) {
        cleanup();
        return;
      }

      this.#cleanupStream();
      this.activeStreamCleanup = cleanup;
      
      const resource = createAudioResource(stream, { inputType });
      this.player.play(resource);
      
      this.emit("trackStarted", { 
        ...this.currentTrack, 
        guild_id: this.guildId, 
        loop_state: this.loopMode,
        is_paused: false 
      });
    } catch (err) {
      console.error("[MusicPlayer] Start playback failed:", err);
      this.onTrackEnd();
    }
  }

  /**
   * 歌曲結束後的處理
   */
  onTrackEnd() {
    if (this.isStopping) {
      this.isStopping = false;
      return;
    }

    this.#cleanupStream();
    
    if (this.currentTrack) {
      this.currentTrack.interaction_token = "";
    }

    // 處理循環邏輯
    if (this.loopMode === 1) { // 重播一次
      this.loopMode = 0;
      return this.startPlayback();
    }
    if (this.loopMode === 2) { // 單曲循環
      return this.startPlayback();
    }

    // 下一首
    if (this.queue.length > 0) {
      this.currentTrack = this.queue.shift();
      this.currentTrack.interaction_token = "";
      this.startPlayback();
    } else {
      this.currentTrack = null;
      this.emit("queueFinished", { guild_id: this.guildId, text_channel_id: this.textChannelId });
    }
  }

  stop(options = {}) {
    this.isStopping = true;
    this.queue = [];
    this.currentTrack = null;
    this.player.stop();
    this.#cleanupStream();
    this.emit("trackStopped", { 
      guild_id: this.guildId, 
      text_channel_id: options.textChannelId || this.textChannelId,
      interaction_token: options.interactionToken,
      controller_user_id: options.controllerUserId
    });
  }

  skip() {
    this.player.stop(); // 會觸發 onTrackEnd
  }

  remove(indices) {
    const removed = [];
    this.queue = this.queue.filter((track, i) => {
      if (indices.includes(i)) {
        removed.push(track);
        return false;
      }
      return true;
    });
    return removed;
  }

  pause() {
    if (this.player.pause()) {
      this.emitUpdate();
    }
  }

  resume() {
    if (this.player.unpause()) {
      this.emitUpdate();
    }
  }

  toggleLoop() {
    this.loopMode = (this.loopMode + 1) % 3;
    this.emitUpdate();
    return this.loopMode;
  }

  emitUpdate() {
    if (!this.currentTrack) return;
    this.emit("sessionUpdated", {
      ...this.currentTrack,
      guild_id: this.guildId,
      loop_state: this.loopMode,
      is_paused: this.player.state.status === AudioPlayerStatus.Paused,
      is_update: true
    });
  }

  async ensureConnection(channelId, options = {}) {
    if (!channelId) throw new Error("缺少頻道 ID");
    this.textChannelId = options.textChannelId || this.textChannelId;

    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) throw new Error("找不到該伺服器");

    if (!this.connection || this.connection.state.status === VoiceConnectionStatus.Destroyed) {
      this.connection = joinVoiceChannel({
        guildId: this.guildId,
        channelId,
        adapterCreator: guild.voiceAdapterCreator,
      });
      this.connection.subscribe(this.player);
    }

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      if (this.connection) this.connection.destroy();
      this.connection = null;
      throw new Error("無法連接到語音頻道 (連線逾時)");
    }
  }

  #cleanupStream() {
    if (this.activeStreamCleanup) {
      this.activeStreamCleanup();
      this.activeStreamCleanup = null;
    }
  }

  /**
   * 更新語音狀態（相容舊有事件）
   */
  updateVoicePresence() {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return;
    
    const botMember = guild.members.me;
    if (!botMember || !botMember.voice.channel) {
      this.#clearAutoLeaveTimer();
      return;
    }

    const channel = botMember.voice.channel;
    const humans = channel.members.filter(m => !m.user.bot).size;

    if (humans === 0) {
      if (!this.autoLeaveTimer) {
        this.autoLeaveTimer = setTimeout(() => {
          this.emit("botDisconnect", { guild_id: this.guildId, text_channel_id: this.textChannelId, reason: "empty" });
          this.destroy();
        }, 3 * 60 * 1000);
      }
    } else {
      this.#clearAutoLeaveTimer();
    }
  }

  #clearAutoLeaveTimer() {
    if (this.autoLeaveTimer) {
      clearTimeout(this.autoLeaveTimer);
      this.autoLeaveTimer = null;
    }
  }

  destroy() {
    this.#clearAutoLeaveTimer();
    this.removeAllListeners();
    this.stop();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }
}
