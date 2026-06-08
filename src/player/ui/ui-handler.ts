import { Client, MessageFlags, TextBasedChannel, Guild, ChannelType } from "discord.js";

import { ControllerStore } from "../../bot/store/controller-store.js";
import { EMOJIS } from "../../shared/emojis.js";
import { formatUserFacingError } from "../utils/error-formatter.js";

import { ContainerFactory } from "./container-factory.js";

export class UIHandler {
  private client: Client;
  private controllerStore: ControllerStore;
  private voiceGateway: any;
  private guildLocks: Map<string, Promise<void>> = new Map();

  constructor({ client, controllerStore, voiceGateway }: { client: Client; controllerStore: ControllerStore; voiceGateway: any }) {
    this.client = client;
    this.controllerStore = controllerStore;
    this.voiceGateway = voiceGateway;
  }

  private safe(guildId: string, fn: () => Promise<void>): void {
    const previous = this.guildLocks.get(guildId) || Promise.resolve();
    const next = previous.then(() =>
      fn().catch((err) =>
        console.error(`[UIHandler] Unhandled error in event handler for guild ${guildId}:`, err),
      )
    );
    this.guildLocks.set(guildId, next);
  }

  public onTrackPlaying(event: any): void {
    this.safe(event.guild_id, () => this.handleTrackPlaying(event));
  }

  public onTrackEnded(event: any, stopped: boolean): void {
    this.safe(event.guild_id, () => this.handleTrackEnded(event, stopped));
  }

  public onTrackError(event: any): void {
    this.safe(event.guild_id, () => this.handleTrackError(event));
  }

  public onBotDisconnect(event: any): void {
    this.safe(event.guild_id, () => this.handleBotDisconnect(event));
  }

  private async getRequester(userId?: string) {
    if (!userId) return null;
    return this.client.users.fetch(userId).catch(() => ({ tag: "未知使用者" }));
  }

  private async updateInteraction(token: string, components: any[]): Promise<string | false> {
    if (!token) return false;
    const appId = this.client.application?.id ?? this.client.user!.id;
    try {
      const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "", embeds: [], components, flags: MessageFlags.IsComponentsV2 }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        return data.id;
      }
    } catch (err) {
      console.error("[UIHandler] Error updating interaction:", err);
    }
    return false;
  }

  private async deletePreviousController(guildId: string, channel: TextBasedChannel | null): Promise<void> {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return;
    this.controllerStore.clearMessageId(guildId);

    const oldEvent = this.controllerStore.getCurrentTrack(guildId);
    let targetCh = channel;
    if (oldEvent && oldEvent.text_channel_id && (!channel || channel.id !== oldEvent.text_channel_id)) {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        targetCh = guild.channels.cache.get(oldEvent.text_channel_id) as TextBasedChannel || channel;
      }
    }

    if (!targetCh) return;
    try {
      const msg = await (targetCh as any).messages.fetch(msgId).catch(() => null);
      await msg?.delete().catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error deleting previous controller:", err);
    }
  }

  private async resolveTextChannel(guild: Guild, preferredChannelId?: string | null): Promise<TextBasedChannel | null> {
    if (preferredChannelId) {
      const ch = guild.channels.cache.get(preferredChannelId) || await guild.channels.fetch(preferredChannelId).catch(() => null);
      if (ch?.isTextBased()) return ch as TextBasedChannel;
    }
    const priority = ["music", "bot", "general", "chat"];
    const channels = guild.channels.cache.size > 0 ? guild.channels.cache : await guild.channels.fetch();

    return Array.from(channels.values())
      .filter((c): c is any => !!c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.permissionsFor(this.client.user!)?.has("SendMessages") === true)
      .sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        const ai = priority.findIndex((n) => nameA.includes(n));
        const bi = priority.findIndex((n) => nameB.includes(n));
        if (ai !== -1 && bi !== -1) return ai - bi;
        return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
      })[0] as TextBasedChannel ?? null;
  }

  private async handleTrackPlaying(event: any): Promise<void> {
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    this.controllerStore.setCurrentTrack(event.guild_id, event);
    const requester = await this.getRequester(event.controller_user_id);
    const container = ContainerFactory.buildNowPlaying(event, requester);
    const targetChannel = await this.resolveTextChannel(guild, event.text_channel_id);
    if (!targetChannel) return;

    let messageId = await this.updateInteraction(event.interaction_token, [container.toJSON()]);

    if (!messageId) {
      if (event.is_update) {
        const oldMsgId = this.controllerStore.getMessageId(event.guild_id);
        if (oldMsgId) {
          const msg = await (targetChannel as any).messages.fetch(oldMsgId).catch(() => null);
          if (msg) {
            await msg.edit({ components: [container as any], flags: [MessageFlags.IsComponentsV2 as any] }).catch(() => null);
            return;
          }
        }
      }

      await this.deletePreviousController(event.guild_id, targetChannel);
      const msg = await (targetChannel as any).send({
        components: [container as any],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
      messageId = msg.id;
    } else if (!event.is_update) {
      await this.deletePreviousController(event.guild_id, targetChannel);
    }

    if (messageId) this.controllerStore.setMessageId(event.guild_id, messageId as string);
  }

  private async handleTrackEnded(event: any, stopped: boolean): Promise<void> {
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    const requester = await this.getRequester(event.controller_user_id);
    const ch = await this.resolveTextChannel(guild, event.text_channel_id);

    await this.deletePreviousController(event.guild_id, ch);
    this.controllerStore.clearOwner(event.guild_id);
    this.controllerStore.clearCurrentTrack(event.guild_id);

    const container = ContainerFactory.buildSimpleMessage(
      `${EMOJIS.LingLong} 音樂中心`,
      stopped ? `${EMOJIS.fileshredline} | 已停止播放並清空隊列！` : `${EMOJIS.checkdoubleline} | 隊列內的歌曲均已播放完畢！`,
      requester,
    );

    const updated = await this.updateInteraction(event.interaction_token, [container.toJSON()]);
    if (!updated && ch) {
      await (ch as any).send({ components: [container as any], flags: [MessageFlags.IsComponentsV2 as any] }).catch(() => null);
    }
  }

  private async handleBotDisconnect(event: any): Promise<void> {
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    const chId = event.text_channel_id || this.controllerStore.getCurrentTrack(event.guild_id)?.text_channel_id;
    const ch = chId ? await this.resolveTextChannel(guild, chId) : null;
    if (!ch) return;

    await this.deletePreviousController(event.guild_id, ch);
    this.controllerStore.clearOwner(event.guild_id);
    this.controllerStore.clearCurrentTrack(event.guild_id);

    const container = ContainerFactory.buildSimpleMessage(
      `${EMOJIS.LingLong} 音樂中心`,
      `${EMOJIS.logoutcircleline} | 由於語音頻道已無其他成員，我已自動離開！`,
    );

    await (ch as any).send({ components: [container as any], flags: [MessageFlags.IsComponentsV2 as any] }).catch(() => null);
  }

  private async handleTrackError(event: any): Promise<void> {
    console.error(`[UIHandler] track_error Guild ${event.guild_id}: ${event.error}`);
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    const requester = await this.getRequester(event.controller_user_id);
    const safeError = formatUserFacingError(event.error);
    const container = ContainerFactory.buildSimpleMessage("播放錯誤", `${EMOJIS.errorwarningline} | ${safeError}`, requester);

    const ch = await this.resolveTextChannel(guild, event.text_channel_id);
    const updated = await this.updateInteraction(event.interaction_token, [container.toJSON()]);

    if (!updated && ch) {
      await (ch as any).send({ components: [container as any], flags: [MessageFlags.IsComponentsV2 as any] }).catch(() => null);
    }
  }
}
