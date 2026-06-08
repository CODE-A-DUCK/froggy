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

    this.shoukakuPlayer.setGlobalVolume(95);

    this.shoukakuPlayer.on("start", (data) => {
      this.emit("trackStart", this, this.currentTrack);
    });

    this.shoukakuPlayer.on("end", (data) => {
      if (data.reason === "replaced") return;

      const previousTrack = this.currentTrack;

      if (this.repeatMode === "track" && previousTrack && data.reason !== "stopped") {
        this.play(previousTrack);
      } else {
        if (this.repeatMode === "queue" && previousTrack && data.reason !== "stopped") {
          this.queue.push(previousTrack);
        }

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
