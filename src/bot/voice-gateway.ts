import { Client } from "discord.js";
import { GatewayDispatchEvents } from "discord-api-types/v10";
import { ControlPlaneClient } from "./ws-client.js";

export class VoiceGatewayManager {
  private client: Client;
  private ipc: ControlPlaneClient;

  private pendingConnections: Map<string, {
    session_id?: string,
    token?: string,
    endpoint?: string,
    channel_id: string,
    resolve: () => void,
    reject: (err: any) => void,
    timeout: NodeJS.Timeout
  }> = new Map();

  constructor(client: Client, ipc: ControlPlaneClient) {
    this.client = client;
    this.ipc = ipc;

    this.client.ws.on(GatewayDispatchEvents.VoiceStateUpdate, (data: any) => {
      if (data.user_id !== this.client.user?.id) return;
      if (!data.channel_id || !data.session_id) return;

      const pending = this.pendingConnections.get(data.guild_id);
      if (pending) {
        pending.session_id = data.session_id;
        this.checkAndConnect(data.guild_id);
      }
    });

    this.client.ws.on(GatewayDispatchEvents.VoiceServerUpdate, (data: any) => {
      const pending = this.pendingConnections.get(data.guild_id);
      if (pending) {
        pending.token = data.token;
        pending.endpoint = data.endpoint;
        this.checkAndConnect(data.guild_id);
      }
    });
  }

  public connectToChannel(guildId: string, channelId: string): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return Promise.reject(new Error("Guild not found"));

    return new Promise((resolve, reject) => {
      if (this.pendingConnections.has(guildId)) {
        clearTimeout(this.pendingConnections.get(guildId)!.timeout);
      }

      const timeout = setTimeout(() => {
        this.pendingConnections.delete(guildId);
        reject(new Error("Discord Gateway failed to provide voice credentials within 7s"));
      }, 7000);

      this.pendingConnections.set(guildId, { channel_id: channelId, resolve, reject, timeout });

      this.sendOpcode4(guild, null);
      this.sendOpcode4(guild, channelId);
    });
  }

  public disconnectFromChannel(guildId: string): void {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    this.sendOpcode4(guild, null);
  }

  private sendOpcode4(guild: any, channelId: string | null) {
    guild.shard.send({
      op: 4,
      d: {
        guild_id: guild.id,
        channel_id: channelId,
        self_mute: false,
        self_deaf: true,
      },
    });
  }

  private async checkAndConnect(guildId: string) {
    const pending = this.pendingConnections.get(guildId);
    if (!pending) return;

    if (pending.session_id && pending.token && pending.endpoint) {
      clearTimeout(pending.timeout);
      this.pendingConnections.delete(guildId);

      try {
        console.log(`[VoiceGateway] Credentials harvested! Forwarding to Audio Node...`);
        await this.ipc.sendRequest("VOICE_CONNECT", {
          guild_id: guildId,
          channel_id: pending.channel_id,
          session_id: pending.session_id,
          token: pending.token,
          endpoint: pending.endpoint,
          bot_user_id: this.client.user!.id
        });

        console.log(`[VoiceGateway] Audio Node acknowledged!`);
        pending.resolve();
      } catch (err) {
        pending.reject(err);
      }
    }
  }
}
