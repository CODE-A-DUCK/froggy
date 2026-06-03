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
        this.emit("trackQueued", { ...track, guild_id: this.guildId });
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
      const { stream, inputType, cleanup } = createAudioStream(this.currentTrack.url);
      this.activeStreamCleanup = cleanup;
      const resource = createAudioResource(stream, { inputType, inlineVolume: true });
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
  async onTrackEnd() {
    if (this.activeStreamCleanup) this.activeStreamCleanup();
    
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
      this.startPlayback();
    } else {
      this.currentTrack = null;
      this.emit("queueFinished", { guild_id: this.guildId, text_channel_id: this.textChannelId });
    }
  }

  async stop() {
    this.queue = [];
    this.currentTrack = null;
    this.player.stop();
    if (this.activeStreamCleanup) this.activeStreamCleanup();
    this.emit("trackStopped", { guild_id: this.guildId, text_channel_id: this.textChannelId });
  }

  skip() {
    this.player.stop(); // 會觸發 onTrackEnd
  }

  pause() {
    this.player.pause();
    this.emitUpdate();
  }

  resume() {
    this.player.unpause();
    this.emitUpdate();
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

  async ensureConnection(channelId) {
    const guild = this.client.guilds.cache.get(this.guildId);
    this.connection = joinVoiceChannel({
      guildId: this.guildId,
      channelId,
      adapterCreator: guild.voiceAdapterCreator,
    });
    this.connection.subscribe(this.player);
    await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
  }

  /**
   * 更新語音狀態（相容舊有事件）
   */
  async updateVoicePresence() {
    // 這裡可以實作自動離開空頻道的邏輯，或者暫時留空以避免報錯
  }

  destroy() {
    this.stop();
    if (this.connection) this.connection.destroy();
    this.removeAllListeners();
  }
}
