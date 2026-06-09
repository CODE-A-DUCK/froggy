import { Client, MessageFlags, GuildTextBasedChannel, Guild, ChannelType, User } from "discord.js";

import { ControllerStore } from "../../bot/store/controller-store.js";
import { EMOJIS } from "../../shared/emojis.js";
import { TrackEvent } from "../../shared/types.js";
import { formatUserFacingError } from "../utils/error-formatter.js";

import { ContainerFactory } from "./container-factory.js";

interface UIHandlerConfig {
  client: Client;
  controllerStore: ControllerStore;
  voiceGateway: any;
}

type Requester = User | { tag: string };

const UNKNOWN_USER: Requester = { tag: "未知使用者" };
const CHANNEL_NAME_PRIORITY = ["music", "bot", "general", "chat"];

export class UIHandler {
  private readonly client: Client;
  private readonly controllerStore: ControllerStore;
  private readonly guildLocks = new Map<string, Promise<void>>();

  constructor({ client, controllerStore }: UIHandlerConfig) {
    this.client = client;
    this.controllerStore = controllerStore;
  }

  // API

  public onTrackPlaying(event: TrackEvent): void {
    this.enqueue(event.guild_id, () => this.handleTrackPlaying(event));
  }

  public onTrackEnded(event: TrackEvent, stopped: boolean): void {
    this.enqueue(event.guild_id, () => this.handleTrackEnded(event, stopped));
  }

  public onTrackError(event: TrackEvent): void {
    this.enqueue(event.guild_id, () => this.handleTrackError(event));
  }

  public onBotDisconnect(event: TrackEvent): void {
    this.enqueue(event.guild_id, () => this.handleBotDisconnect(event));
  }

  // Per-guild serialization

  private enqueue(guildId: string, fn: () => Promise<void>): void {
    const previous = this.guildLocks.get(guildId) ?? Promise.resolve();
    const next = previous.then(() =>
      fn().catch((err) => console.error(`[UIHandler] guild=${guildId}:`, err))
    );
    this.guildLocks.set(guildId, next);
  }

  // Helpers

  private guild(guildId: string): Guild | undefined {
    return this.client.guilds.cache.get(guildId);
  }

  private async fetchRequester(userId?: string): Promise<Requester> {
    if (!userId) return UNKNOWN_USER;
    return this.client.users.fetch(userId).catch(() => UNKNOWN_USER);
  }

  private async resolveTextChannel(guild: Guild, preferredId?: string | null): Promise<GuildTextBasedChannel | null> {
    if (preferredId) {
      const ch = guild.channels.cache.get(preferredId) ?? await guild.channels.fetch(preferredId).catch(() => null);
      if (ch?.isTextBased()) return ch as GuildTextBasedChannel;
    }

    const channels = guild.channels.cache.size > 0 ? guild.channels.cache : await guild.channels.fetch();

    const rankChannel = (c: GuildTextBasedChannel): number => {
      const name = (c as any).name?.toLowerCase() ?? "";
      const i = CHANNEL_NAME_PRIORITY.findIndex((n) => name.includes(n));
      return i === -1 ? Infinity : i;
    };

    return Array.from(channels.values())
      .filter((c): c is GuildTextBasedChannel => {
        if (!c || (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement)) return false;
        return c.permissionsFor(this.client.user!)?.has("SendMessages") ?? false;
      })
      .sort((a, b) => rankChannel(a) - rankChannel(b))[0] ?? null;
  }

  private async patchInteraction(token: string | null | undefined, components: any[]): Promise<string | null> {
    if (!token) return null;

    const appId = this.client.application?.id ?? this.client.user?.id;
    if (!appId) return null;

    try {
      const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "", embeds: [], components, flags: MessageFlags.IsComponentsV2 }),
      });

      if (res.ok) return ((await res.json()) as { id: string }).id;
    } catch {
      // 别管
    }
    return null;
  }

  private async deleteControllerMessage(guildId: string, currentChannel: GuildTextBasedChannel | null): Promise<void> {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return;

    this.controllerStore.clearMessageId(guildId);

    const oldEvent = this.controllerStore.getCurrentTrack(guildId);
    let channel = currentChannel;

    if (oldEvent?.text_channel_id && oldEvent.text_channel_id !== currentChannel?.id) {
      const guild = this.client.guilds.cache.get(guildId);
      channel = (guild?.channels.cache.get(oldEvent.text_channel_id) as GuildTextBasedChannel) ?? currentChannel;
    }

    if (!channel || typeof channel.messages?.fetch !== "function") return;
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    await msg?.delete().catch(() => null);
  }

  private async clearGuildState(guildId: string, channel: GuildTextBasedChannel | null): Promise<void> {
    await this.deleteControllerMessage(guildId, channel);
    this.controllerStore.clearOwner(guildId);
    this.controllerStore.clearCurrentTrack(guildId);
  }

  private async sendContainer(
    channel: GuildTextBasedChannel | null,
    token: string | null | undefined,
    container: any
  ): Promise<string | null> {
    const patchedId = await this.patchInteraction(token, [container.toJSON()]);
    if (patchedId) return patchedId;

    if (channel && typeof channel.send === "function") {
      const msg = await channel
        .send({ components: [container.toJSON() as any], flags: [MessageFlags.IsComponentsV2 as any] })
        .catch(() => null);
      return msg?.id ?? null;
    }

    return null;
  }

  // Event handlers

  private async handleTrackPlaying(event: TrackEvent): Promise<void> {
    const guild = this.guild(event.guild_id);
    if (!guild) return;

    this.controllerStore.setCurrentTrack(event.guild_id, event);

    const [requester, channel] = await Promise.all([
      this.fetchRequester(event.controller_user_id),
      this.resolveTextChannel(guild, event.text_channel_id),
    ]);

    if (!channel) return;

    const container = ContainerFactory.buildNowPlaying(event as any, requester, false);

    // 优先 patch 原始交互消息
    const patchedId = await this.patchInteraction(event.interaction_token, [container.toJSON()]);
    if (patchedId) {
      if (!event.is_update) await this.deleteControllerMessage(event.guild_id, channel);
      this.controllerStore.setMessageId(event.guild_id, patchedId);
      return;
    }

    // 若为更新且旧消息仍存在，就 edit 掉旧消息
    if (event.is_update) {
      const oldMsgId = this.controllerStore.getMessageId(event.guild_id);
      const msg = oldMsgId ? await channel.messages.fetch(oldMsgId).catch(() => null) : null;

      if (msg) {
        await msg.edit({ components: [container as any], flags: [MessageFlags.IsComponentsV2 as any] }).catch(() => null);
        return;
      }
    }

    // 回退：删除旧消息并发新消息
    await this.deleteControllerMessage(event.guild_id, channel);
    const messageId = await this.sendContainer(channel, undefined, container);
    if (messageId) this.controllerStore.setMessageId(event.guild_id, messageId);
  }

  private async handleTrackEnded(event: TrackEvent, stopped: boolean): Promise<void> {
    const guild = this.guild(event.guild_id);
    if (!guild) return;

    const [requester, channel] = await Promise.all([
      this.fetchRequester(event.controller_user_id),
      this.resolveTextChannel(guild, event.text_channel_id),
    ]);

    await this.clearGuildState(event.guild_id, channel);

    const description = stopped
      ? `${EMOJIS.fileshredline} | 已停止播放並清空隊列！`
      : `${EMOJIS.checkdoubleline} | 隊列內的歌曲均已播放完畢！`;

    const container = ContainerFactory.buildSimpleMessage(`${EMOJIS.LingLong} 音樂中心`, description, requester);
    await this.sendContainer(channel, event.interaction_token, container);
  }

  private async handleBotDisconnect(event: TrackEvent): Promise<void> {
    const guild = this.guild(event.guild_id);
    if (!guild) return;

    const chId = event.text_channel_id ?? this.controllerStore.getCurrentTrack(event.guild_id)?.text_channel_id;
    const channel = chId ? await this.resolveTextChannel(guild, chId) : null;
    if (!channel) return;

    await this.clearGuildState(event.guild_id, channel);

    const container = ContainerFactory.buildSimpleMessage(
      `${EMOJIS.LingLong} 音樂中心`,
      `${EMOJIS.logoutcircleline} | 由於語音頻道已無其他成員，我已自動離開！`
    );

    await this.sendContainer(channel, undefined, container);
  }

  private async handleTrackError(event: TrackEvent): Promise<void> {
    console.error(`[UIHandler] track_error guild=${event.guild_id}: ${event.error}`);

    const guild = this.guild(event.guild_id);
    if (!guild) return;

    const [requester, channel] = await Promise.all([
      this.fetchRequester(event.controller_user_id),
      this.resolveTextChannel(guild, event.text_channel_id),
    ]);

    const safeError = formatUserFacingError(event.error ?? "Unknown error");
    const container = ContainerFactory.buildSimpleMessage("播放錯誤", `${EMOJIS.errorwarningline} | ${safeError}`, requester);
    await this.sendContainer(channel, event.interaction_token, container);
  }
}