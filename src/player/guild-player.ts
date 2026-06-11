import { EventEmitter } from "node:events";

import type { Track } from "shoukaku";
import { Player } from "shoukaku";

export type RepeatMode = "off" | "loop_once" | "track";

export class GuildPlayer extends EventEmitter {
  public shoukakuPlayer: Player;
  public guildId: string;
  public queue: Track[] = [];
  public currentTrack: Track | null = null;
  public repeatMode: RepeatMode = "off";
  public loopOnceCount: number = 0;

  public textChannelId: string | null = null;
  public interactionToken: string | null = null;
  public controllerUserId: string | null = null;

  constructor(guildId: string, player: Player) {
    super();
    this.guildId = guildId;
    this.shoukakuPlayer = player;

    this.shoukakuPlayer.setGlobalVolume(95);

    this.shoukakuPlayer.on("start", (_data) => {
      this.emit("trackStart", this, this.currentTrack);
    });

    this.shoukakuPlayer.on("end", (data) => {
      if (data.reason === "replaced") return;

      const previousTrack = this.currentTrack;

      if (this.repeatMode === "track" && previousTrack && data.reason !== "stopped") {
        this.play(previousTrack, true);
      } else if (this.repeatMode === "loop_once" && previousTrack && data.reason !== "stopped" && this.loopOnceCount === 0) {
        this.loopOnceCount = 1;
        this.play(previousTrack, true);
      } else {
        if (this.queue.length > 0) {
          const nextTrack = this.queue.shift()!;
          this.play(nextTrack);
        } else {
          this.currentTrack = null;
          this.emit("trackEnd", this, previousTrack, data);
          this.emit("queueEnd", this);
        }
      }
    });

    this.shoukakuPlayer.on("exception", (data) => {
      this.emit("trackError", this, this.currentTrack, data);
    });

    this.shoukakuPlayer.on("closed", (_data) => {
      this.emit("playerDisconnect", this);
    });

    let lastUpdate = 0;
    this.shoukakuPlayer.on("update", (data) => {
      const duration = this.currentTrack?.info?.length || 0;

      // 如果 duration <= 0 (代表是 LIVE 直播)，完全不需要更新進度條
      if (duration <= 0) return;

      const interval = Math.max(Math.floor(duration / 10 / 2), 15000);

      if (Date.now() - lastUpdate > interval) {
        lastUpdate = Date.now();
        this.emit("trackUpdate", this, this.currentTrack, data.state.position);
      }
    });
  }

  public get paused() {
    return this.shoukakuPlayer.paused;
  }

  public async play(track?: Track, isReplay: boolean = false) {
    if (!isReplay) this.loopOnceCount = 0;

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
