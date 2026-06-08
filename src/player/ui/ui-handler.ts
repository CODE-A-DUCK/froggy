import { Client, MessageFlags, GuildTextBasedChannel, Guild, ChannelType, User, Message } from "discord.js";

import { ControllerStore } from "../../bot/store/controller-store.js";
import { EMOJIS } from "../../shared/emojis.js";
import { formatUserFacingError } from "../utils/error-formatter.js";
import { TrackEvent } from "../../shared/types.js";
import { ContainerFactory } from "./container-factory.js";

// 類別

interface UIHandlerConfig {
  client: Client;
  controllerStore: ControllerStore;
  voiceGateway: any;
}

// UI Handler

export class UIHandler {
  private readonly client: Client;
  private readonly controllerStore: ControllerStore;
  private readonly guildLocks = new Map<string, Promise<void>>();

  constructor({ client, controllerStore }: UIHandlerConfig) {
    this.client = client;
    this.controllerStore = controllerStore;
  }

  // 防止併發
  private safe(guildId: string, fn: () => Promise<void>): void {
    const previous = this.guildLocks.get(guildId) ?? Promise.resolve();
    const next = previous.then(() =>
      fn().catch((err) => console.error(`[UIHandler] Unhandled error for guild ${guildId}:`, err))
    );
    this.guildLocks.set(guildId, next);
  }

  // 處理事件

  public onTrackPlaying(event: TrackEvent): void {
    this.safe(event.guild_id, () => this.handleTrackPlaying(event));
  }

  public onTrackEnded(event: TrackEvent, stopped: boolean): void {
    this.safe(event.guild_id, () => this.handleTrackEnded(event, stopped));
  }

  public onTrackError(event: TrackEvent): void {
    this.safe(event.guild_id, () => this.handleTrackError(event));
  }

  public onBotDisconnect(event: TrackEvent): void {
    this.safe(event.guild_id, () => this.handleBotDisconnect(event));
  }

  private async getRequester(userId?: string): Promise<User | { tag: string; username?: string }> {
    if (!userId) return { tag: "未知使用者" };
    return this.client.users.fetch(userId).catch(() => ({ tag: "未知使用者" }));
  }

  private async updateInteraction(token: string | null | undefined, components: any[]): Promise<string | null> {
    if (!token) return null;

    const appId = this.client.application?.id ?? this.client.user?.id;
    if (!appId) return null;

    try {
      const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "", embeds: [], components, flags: MessageFlags.IsComponentsV2 }),
      });

      if (res.ok) {
        const data = await res.json() as { id: string };
        return data.id;
      }
    } catch {
      // 忽略網路錯誤
    }
    return null;
  }

  private async fetchMessage(channel: GuildTextBasedChannel | null, messageId: string | null): Promise<Message | null> {
    if (!channel || !messageId || typeof channel.messages?.fetch !== "function") return null;
    return channel.messages.fetch(messageId).catch(() => null);
  }

  private async deletePreviousController(guildId: string, currentChannel: GuildTextBasedChannel | null): Promise<void> {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return;

    this.controllerStore.clearMessageId(guildId);

    const oldEvent = this.controllerStore.getCurrentTrack(guildId);
    const guild = this.client.guilds.cache.get(guildId);

    let targetCh = currentChannel;
    if (guild && oldEvent?.text_channel_id && oldEvent.text_channel_id !== currentChannel?.id) {
      targetCh = guild.channels.cache.get(oldEvent.text_channel_id) as GuildTextBasedChannel ?? currentChannel;
    }

    const msg = await this.fetchMessage(targetCh, msgId);
    await msg?.delete().catch(() => null);
  }

  private async resolveTextChannel(guild: Guild, preferredId?: string | null): Promise<GuildTextBasedChannel | null> {
    if (preferredId) {
      const ch = guild.channels.cache.get(preferredId) ?? await guild.channels.fetch(preferredId).catch(() => null);
      if (ch?.isTextBased()) return ch as GuildTextBasedChannel;
    }

    const channels = guild.channels.cache.size > 0 ? guild.channels.cache : await guild.channels.fetch();
    const priority = ["music", "bot", "general", "chat"];

    return Array.from(channels.values())
      .filter((c): c is GuildTextBasedChannel => {
        if (!c || (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement)) return false;
        return c.permissionsFor(this.client.user!)?.has("SendMessages") ?? false;
      })
      .sort((a, b) => {
        const nameA = (a as any).name?.toLowerCase() ?? "";
        const nameB = (b as any).name?.toLowerCase() ?? "";
        const ai = priority.findIndex((n) => nameA.includes(n));
        const bi = priority.findIndex((n) => nameB.includes(n));

        if (ai !== -1 && bi !== -1) return ai - bi;
        return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
      })[0] ?? null;
  }

  private async sendOrUpdateMessage(
    channel: GuildTextBasedChannel | null,
    token: string | null | undefined,
    container: any
  ): Promise<string | null> {
    const payload = { components: [container.toJSON() as any], flags: [MessageFlags.IsComponentsV2 as any] };

    const updatedId = await this.updateInteraction(token, [container.toJSON()]);
    if (updatedId) return updatedId;

    if (channel && typeof channel.send === "function") {
      const msg = await channel.send(payload).catch(() => null);
      return msg?.id ?? null;
    }

    return null;
  }

  private async handleTrackPlaying(event: TrackEvent): Promise<void> {
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    this.controllerStore.setCurrentTrack(event.guild_id, event);
    const requester = await this.getRequester(event.controller_user_id);
    const container = ContainerFactory.buildNowPlaying(event as any, requester, false);
    const channel = await this.resolveTextChannel(guild, event.text_channel_id);

    if (!channel) return;

    let messageId = await this.updateInteraction(event.interaction_token, [container.toJSON()]);

    if (!messageId) {
      if (event.is_update) {
        const oldMsgId = this.controllerStore.getMessageId(event.guild_id);
        const msg = await this.fetchMessage(channel, oldMsgId);

        if (msg) {
          await msg.edit({ components: [container as any], flags: [MessageFlags.IsComponentsV2 as any] }).catch(() => null);
          return;
        }
      }

      await this.deletePreviousController(event.guild_id, channel);
      messageId = await this.sendOrUpdateMessage(channel, undefined, container);
    } else if (!event.is_update) {
      await this.deletePreviousController(event.guild_id, channel);
    }

    if (messageId) {
      this.controllerStore.setMessageId(event.guild_id, messageId);
    }
  }

  private async handleTrackEnded(event: TrackEvent, stopped: boolean): Promise<void> {
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    const requester = await this.getRequester(event.controller_user_id);
    const channel = await this.resolveTextChannel(guild, event.text_channel_id);

    await this.deletePreviousController(event.guild_id, channel);
    this.controllerStore.clearOwner(event.guild_id);
    this.controllerStore.clearCurrentTrack(event.guild_id);

    const description = stopped
      ? `${EMOJIS.fileshredline} | 已停止播放並清空隊列！`
      : `${EMOJIS.checkdoubleline} | 隊列內的歌曲均已播放完畢！`;

    const container = ContainerFactory.buildSimpleMessage(`${EMOJIS.LingLong} 音樂中心`, description, requester);
    await this.sendOrUpdateMessage(channel, event.interaction_token, container);
  }

  private async handleBotDisconnect(event: TrackEvent): Promise<void> {
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    const chId = event.text_channel_id ?? this.controllerStore.getCurrentTrack(event.guild_id)?.text_channel_id;
    const channel = chId ? await this.resolveTextChannel(guild, chId) : null;
    if (!channel) return;

    await this.deletePreviousController(event.guild_id, channel);
    this.controllerStore.clearOwner(event.guild_id);
    this.controllerStore.clearCurrentTrack(event.guild_id);

    const container = ContainerFactory.buildSimpleMessage(
      `${EMOJIS.LingLong} 音樂中心`,
      `${EMOJIS.logoutcircleline} | 由於語音頻道已無其他成員，我已自動離開！`
    );

    await this.sendOrUpdateMessage(channel, undefined, container);
  }

  private async handleTrackError(event: TrackEvent): Promise<void> {
    console.error(`[UIHandler] track_error Guild ${event.guild_id}: ${event.error}`);
    const guild = this.client.guilds.cache.get(event.guild_id);
    if (!guild) return;

    const requester = await this.getRequester(event.controller_user_id);
    const safeError = formatUserFacingError(event.error ?? "Unknown error");
    const container = ContainerFactory.buildSimpleMessage("播放錯誤", `${EMOJIS.errorwarningline} | ${safeError}`, requester);

    const channel = await this.resolveTextChannel(guild, event.text_channel_id);
    await this.sendOrUpdateMessage(channel, event.interaction_token, container);
  }
}
