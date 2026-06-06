import { EventEmitter } from "node:events";

import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
  AudioPlayer,
} from "@discordjs/voice";
import { Client } from "discord.js";

import { getTrackMetadata, createAudioStream } from "./youtube.js";

export class MusicPlayer extends EventEmitter {
  public guildId: string;
  public client: Client;
  public queue: any[];
  public currentTrack: any | null;
  public connection: VoiceConnection | null;
  public player: AudioPlayer;
  public loopMode: number; // 0: off, 1: replay once, 2: loop track
  public textChannelId: string | null;
  public isStopping: boolean;
  private activeStreamCleanup: (() => void) | null = null;
  private autoLeaveTimer: NodeJS.Timeout | null = null;

  constructor(guildId: string, client: Client) {
    super();
    this.guildId = guildId;
    this.client = client;
    this.queue = [];
    this.currentTrack = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.loopMode = 0;
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
  async play(query: string, options: { channelId?: string; textChannelId?: string; interactionToken?: string; controllerUserId?: string | null; silent?: boolean } = {}): Promise<any> {
    try {
      this.textChannelId = options.textChannelId || this.textChannelId;
      const metadata = await getTrackMetadata(query);
      const track = {
        ...metadata,
        requested_at: new Date().toISOString(),
        interaction_token: !this.currentTrack ? (options.interactionToken || "") : "",
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
    } catch (err: any) {
      this.emit("trackError", { guild_id: this.guildId, error: err.message, text_channel_id: this.textChannelId, interaction_token: options.interactionToken });
      throw err;
    }
  }

  /**
   * 開始播放當前歌曲
   */
  async startPlayback(): Promise<void> {
    if (!this.currentTrack) return;

    try {
      const trackUrl = this.currentTrack.url;
      const { stream, inputType, cleanup } = await createAudioStream(trackUrl);

      // 確保在取得串流的過程中，沒有被停止或切換歌曲
      if (!this.currentTrack || this.currentTrack.url !== trackUrl || this.isStopping) {
        cleanup();
        return;
      }

      this.cleanupStream();
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
  onTrackEnd(): void {
    if (this.isStopping) {
      this.isStopping = false;
      return;
    }

    this.cleanupStream();

    if (this.currentTrack) {
      this.currentTrack.interaction_token = "";
    }

    // 處理循環邏輯
    if (this.loopMode === 1) { // 重播一次
      this.loopMode = 0;
      this.startPlayback();
      return;
    }
    if (this.loopMode === 2) { // 單曲循環
      this.startPlayback();
      return;
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

  stop(options: { textChannelId?: string; interactionToken?: string; controllerUserId?: string } = {}): void {
    this.isStopping = true;
    this.queue = [];
    this.currentTrack = null;
    this.player.stop();
    this.cleanupStream();
    this.emit("trackStopped", {
      guild_id: this.guildId,
      text_channel_id: options.textChannelId || this.textChannelId,
      interaction_token: options.interactionToken,
      controller_user_id: options.controllerUserId
    });
  }

  skip(): void {
    this.player.stop(); // 會觸發 onTrackEnd
  }

  remove(indices: number[]): any[] {
    const removed: any[] = [];
    this.queue = this.queue.filter((track, i) => {
      if (indices.includes(i)) {
        removed.push(track);
        return false;
      }
      return true;
    });
    return removed;
  }

  pause(): void {
    if (this.player.pause()) {
      this.emitUpdate();
    }
  }

  resume(): void {
    if (this.player.unpause()) {
      this.emitUpdate();
    }
  }

  toggleLoop(): number {
    this.loopMode = (this.loopMode + 1) % 3;
    this.emitUpdate();
    return this.loopMode;
  }

  emitUpdate(): void {
    if (!this.currentTrack) return;
    this.emit("sessionUpdated", {
      ...this.currentTrack,
      guild_id: this.guildId,
      loop_state: this.loopMode,
      is_paused: this.player.state.status === AudioPlayerStatus.Paused,
      is_update: true
    });
  }

  async ensureConnection(channelId?: string, options: { textChannelId?: string } = {}): Promise<void> {
    if (!channelId) throw new Error("缺少頻道 ID");
    this.textChannelId = options.textChannelId || this.textChannelId;

    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) throw new Error("找不到該伺服器");

    if (!this.connection || this.connection.state.status === VoiceConnectionStatus.Destroyed) {
      this.connection = joinVoiceChannel({
        guildId: this.guildId,
        channelId,
        adapterCreator: guild.voiceAdapterCreator as any,
      });
      this.connection.subscribe(this.player);
    }

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      if (this.connection) this.connection.destroy();
      this.connection = null;
      throw new Error("無法連接到語音頻道 (連線逾時)");
    }
  }

  private cleanupStream(): void {
    if (this.activeStreamCleanup) {
      this.activeStreamCleanup();
      this.activeStreamCleanup = null;
    }
  }

  /**
   * 更新語音狀態（相容舊有事件）
   */
  updateVoicePresence(): void {
    const guild = this.client.guilds.cache.get(this.guildId);
    if (!guild) return;

    const botMember = guild.members.me;
    if (!botMember || !botMember.voice.channel) {
      this.clearAutoLeaveTimer();
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
      this.clearAutoLeaveTimer();
    }
  }

  private clearAutoLeaveTimer(): void {
    if (this.autoLeaveTimer) {
      clearTimeout(this.autoLeaveTimer);
      this.autoLeaveTimer = null;
    }
  }

  destroy(): void {
    this.clearAutoLeaveTimer();
    this.removeAllListeners();
    this.stop();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    } else {
      // Ghost Connection 爲了預防機器人重啓後，記憶體被清空，導致無法使用 music 指令。
      const guild = this.client.guilds.cache.get(this.guildId);
      if (guild && guild.members.me?.voice.channelId) {
        try {
          const ghostConnection = joinVoiceChannel({
            guildId: this.guildId,
            channelId: guild.members.me.voice.channelId,
            adapterCreator: guild.voiceAdapterCreator as any,
          });
          ghostConnection.destroy();
        } catch (err) {
          console.error("[MusicPlayer] Failed to destroy ghost connection:", err);
        }
      }
    }
  }
}
