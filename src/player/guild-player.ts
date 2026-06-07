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

  constructor(guildId: string, player: Player) {
    super();
    this.guildId = guildId;
    this.shoukakuPlayer = player;

    // 套用「錄音室」等化器以獲得更豐富的音效，並將音量設為 95% 以防止破音
    this.shoukakuPlayer.setGlobalVolume(95);
    this.shoukakuPlayer.setEqualizer([
      { band: 0, gain: 0.15 },
      { band: 1, gain: 0.10 },
      { band: 2, gain: 0.05 },
      { band: 3, gain: 0.0 },
      { band: 4, gain: -0.05 },
      { band: 5, gain: -0.05 },
      { band: 6, gain: 0.0 },
      { band: 7, gain: 0.0 },
      { band: 8, gain: 0.0 },
      { band: 9, gain: 0.0 },
      { band: 10, gain: 0.05 },
      { band: 11, gain: 0.05 },
      { band: 12, gain: 0.10 },
      { band: 13, gain: 0.10 },
      { band: 14, gain: 0.15 }
    ]);

    this.shoukakuPlayer.on("start", (data) => {
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
