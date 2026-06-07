import { EventEmitter } from "node:events";
import { Player, Track } from "shoukaku";

export type RepeatMode = "off" | "track" | "queue";

export class GuildPlayer extends EventEmitter {
  public shoukakuPlayer: Player;
  public guildId: string;
  public queue: Track[] = [];
  public currentTrack: Track | null = null;
  public repeatMode: RepeatMode = "off";

  public textChannelId: string | null = null;
  public interactionToken: string | null = null;
  public controllerUserId: string | null = null;
  private eqApplied: boolean = false;

  constructor(guildId: string, player: Player) {
    super();
    this.guildId = guildId;
    this.shoukakuPlayer = player;

    // 只在建立時先設定音量
    this.shoukakuPlayer.setGlobalVolume(95);

    this.shoukakuPlayer.on("start", (data) => {
      // 延遲 1.5 秒套用 EQ，讓 Lavalink 的緩衝區先填滿，避免冷啟動爆音
      if (!this.eqApplied) {
        this.eqApplied = true;
        setTimeout(() => {
          // https://www.reddit.com/r/Audeze/comments/19ey2op/what_is_the_best_eq_settings_for_clarity_more/
          this.shoukakuPlayer.setEqualizer([
            { band: 0, gain: 0.0 },   // 25Hz (~32Hz 0dB)
            { band: 1, gain: 0.0 },   // 40Hz
            { band: 2, gain: 0.0 },   // 63Hz (~64Hz 0dB)
            { band: 3, gain: 0.1 },   // 100Hz (~125Hz 1dB)
            { band: 4, gain: 0.1 },   // 160Hz
            { band: 5, gain: 0.1 },   // 250Hz (~250Hz 1dB)
            { band: 6, gain: 0.0 },   // 400Hz (~500Hz 0dB)
            { band: 7, gain: 0.1 },   // 630Hz (Transition)
            { band: 8, gain: 0.2 },   // 1kHz (~1kHz 2dB)
            { band: 9, gain: 0.1 },   // 1.6kHz (Transition)
            { band: 10, gain: 0.0 },  // 2.5kHz (~2kHz 0dB)
            { band: 11, gain: 0.4 },  // 4kHz (~4kHz 4dB)
            { band: 12, gain: 0.35 }, // 6.3kHz (Transition)
            { band: 13, gain: 0.3 },  // 10kHz (~8kHz 3dB)
            { band: 14, gain: 0.3 }   // 16kHz (~16kHz 3dB)
          ]).catch(err => console.error("[Player] Failed to apply EQ:", err));
        }, 1500);
      }
      this.emit("trackStart", this, this.currentTrack);
    });

    this.shoukakuPlayer.on("end", (data) => {
      if (data.reason === "replaced") return;

      const previousTrack = this.currentTrack;

      // 如果歌曲正常結束且開啟了單曲循環，則重複播放。
      // 如果 data.reason === "stopped"，表示使用者手動跳過，則中斷循環並播放下一首。
      if (this.repeatMode === "track" && previousTrack && data.reason !== "stopped") {
        this.play(previousTrack);
      } else {
        // 只有在不是手動停止/跳過的情況下才推入隊列
        if (this.repeatMode === "queue" && previousTrack && data.reason !== "stopped") {
          this.queue.push(previousTrack);
        }

        if (this.queue.length > 0) {
          const nextTrack = this.queue.shift()!;
          this.play(nextTrack);
        } else {
          this.currentTrack = null;
          // 發送 trackEnd 事件讓 UI 知道播放已完全停止
          this.emit("trackEnd", this, previousTrack, data);
          this.emit("queueEnd", this);
        }
      }
    });

    this.shoukakuPlayer.on("exception", (data) => {
      this.emit("trackError", this, this.currentTrack, data);
    });

    this.shoukakuPlayer.on("closed", (data) => {
      this.emit("playerDisconnect", this);
    });
  }

  public get paused() {
    return this.shoukakuPlayer.paused;
  }

  public async play(track?: Track) {
    if (track) {
      this.currentTrack = track;
      await this.shoukakuPlayer.playTrack({ track: { encoded: track.encoded } });
    } else if (this.queue.length > 0) {
      this.currentTrack = this.queue.shift()!;
      await this.shoukakuPlayer.playTrack({ track: { encoded: this.currentTrack.encoded } });
    }
  }

  public async stopPlaying(clearQueue = false) {
    if (clearQueue) this.queue = [];
    await this.shoukakuPlayer.stopTrack();
  }

  public async skip() {
    await this.shoukakuPlayer.stopTrack();
  }

  public destroy() {
    this.removeAllListeners();
  }
}
