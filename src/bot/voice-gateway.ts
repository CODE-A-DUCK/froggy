import { Client } from "discord.js";
import { Shoukaku } from "shoukaku";
import { GuildPlayer } from "../player/guild-player.js";
import { EventEmitter } from "node:events";

export class VoiceGatewayManager extends EventEmitter {
  private client: Client;
  private shoukaku: Shoukaku;
  public players: Map<string, GuildPlayer> = new Map();

  constructor(client: Client, shoukaku: Shoukaku) {
    super();
    this.client = client;
    this.shoukaku = shoukaku;
  }

  public getPlayer(guildId: string): GuildPlayer | undefined {
    return this.players.get(guildId);
  }

  public async connectToChannel(guildId: string, channelId: string): Promise<GuildPlayer> {
    let guildPlayer = this.players.get(guildId);
    
    if (!guildPlayer) {
      const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
      if (!node) throw new Error("No available Lavalink nodes");

      const player = await this.shoukaku.joinVoiceChannel({
        guildId,
        channelId,
        shardId: 0,
        deaf: true,
        mute: false
      });

      guildPlayer = new GuildPlayer(guildId, player);
      
      // Bubble up events
      guildPlayer.on("trackStart", (p, t) => this.emit("trackStart", p, t));
      guildPlayer.on("trackEnd", (p, t, d) => this.emit("trackEnd", p, t, d));
      guildPlayer.on("queueEnd", (p) => this.emit("queueEnd", p));
      guildPlayer.on("trackError", (p, t, d) => this.emit("trackError", p, t, d));
      guildPlayer.on("playerDisconnect", (p) => {
        this.emit("playerDisconnect", p);
        this.players.delete(guildId);
      });

      this.players.set(guildId, guildPlayer);
    } else {
      // If already connected, maybe update channel if needed? Not strictly necessary for shoukaku but let's do it
      // Actually Shoukaku does this automatically if we call joinVoiceChannel again or we can ignore it
      // For now just return it
    }

    return guildPlayer;
  }

  public async disconnectFromChannel(guildId: string): Promise<void> {
    const guildPlayer = this.players.get(guildId);
    if (guildPlayer) {
      guildPlayer.destroy();
      this.players.delete(guildId);
    }
    await this.shoukaku.leaveVoiceChannel(guildId);
  }
}
