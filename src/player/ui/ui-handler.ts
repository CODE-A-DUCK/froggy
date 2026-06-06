import { Client, MessageFlags, TextBasedChannel, Guild } from "discord.js";

import { ControllerStore } from "../../bot/store/controller-store.js";
import { EMOJIS } from "../../shared/emojis.js";
import { MusicManager } from "../MusicManager.js";
import { formatUserFacingError } from "../utils/error-formatter.js";

import { ContainerFactory } from "./container-factory.js";

export class UIHandler {
  private client: Client;
  private controllerStore: ControllerStore;
  private guildLocks: Map<string, Promise<void>> = new Map();

  constructor({ client, controllerStore }: { client: Client; controllerStore: ControllerStore }) {
    this.client = client;
    this.controllerStore = controllerStore;
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

  attach(guildPlayerManager: MusicManager): void {
    guildPlayerManager.on("trackStarted", (e: any) =>
      this.safe(e.guild_id, () => this.handleTrackPlaying(e)),
    );
    guildPlayerManager.on("sessionUpdated", (e: any) =>
      this.safe(e.guild_id, () => this.handleTrackPlaying(e)),
    );
    guildPlayerManager.on("trackQueued", (e: any) =>
      this.safe(e.guild_id, () => this.handleTrackAdded(e)),
    );
    guildPlayerManager.on("queueFinished", (e: any) =>
      this.safe(e.guild_id, () => this.handleTrackEnded(e, false)),
    );
    guildPlayerManager.on("trackStopped", (e: any) =>
      this.safe(e.guild_id, () => this.handleTrackEnded(e, true)),
    );
    guildPlayerManager.on("trackError", (e: any) =>
      this.safe(e.guild_id, () => this.handleTrackError(e)),
    );
    guildPlayerManager.on("botDisconnect", (e: any) =>
      this.safe(e.guild_id, () => this.handleBotDisconnect(e)),
    );
  }

  private async handleTrackPlaying(event: any): Promise<void> {
    console.info(
      `[UIHandler] track_playing  Guild ${event.guild_id}: ${event.title}`,
    );
    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      this.controllerStore.setCurrentTrack(event.guild_id, event);

      const requesterId = event.controller_user_id;
      const requester = requesterId
        ? (await this.client.users.fetch(requesterId).catch(() => ({ tag: "未知使用者" })))
        : null;

      const container = ContainerFactory.buildNowPlaying(
        event,
        requester,
      );

      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );
      if (!targetChannel) return;

      let acknowledged = false;
      let messageId: string | null = null;

      if (event.interaction_token) {
        const appId = this.client.application?.id ?? this.client.user!.id;
        try {
          const res = await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${event.interaction_token}/messages/@original`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: null,
                embeds: [],
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2,
              }),
            },
          );
          if (res.ok) {
            const data: any = await res.json();
            messageId = data.id;
            acknowledged = true;
          }
        } catch (err) {
          console.error("[UIHandler] Error in acknowledgment:", err);
        }
      }

      if (!acknowledged) {
        if (event.is_update) {
          const oldMessageId = this.controllerStore.getMessageId(event.guild_id);
          if (oldMessageId) {
            const msg = await (targetChannel as any).messages.fetch(oldMessageId).catch(() => null);
            if (msg) {
              await msg.edit({
                components: [container as any],
                flags: [MessageFlags.IsComponentsV2 as any],
              }).catch(() => null);
              return; // 如果成功編輯現有遙控器，就不用再發了
            }
          }
        }

        // 始終重新發送遙控器（刪除舊的並發送新的）
        await this.deletePreviousController(event.guild_id, targetChannel);
        const msg = await (targetChannel as any).send({
          components: [container as any],
          flags: [MessageFlags.IsComponentsV2 as any],
        });
        messageId = msg.id;
      } else {
        // 如果是新歌曲且已透過互動回應，我們需要清除之前的遙控器
        if (!event.is_update) {
          await this.deletePreviousController(event.guild_id, targetChannel);
        }
      }

      if (messageId) {
        this.controllerStore.setMessageId(event.guild_id, messageId);
      }
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackPlaying:", err);
    }
  }

  private async handleTrackEnded(event: any, stopped: boolean): Promise<void> {
    console.info(
      `[UIHandler] ${stopped ? "track_stopped" : "track_finished"} Guild ${event.guild_id}`,
    );

    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      const requesterId = event.controller_user_id;
      const requester = requesterId
        ? (await this.client.users.fetch(requesterId).catch(() => ({ tag: "未知使用者" })))
        : null;

      const ch = await this.resolveTextChannel(guild, event.text_channel_id);
      await this.deletePreviousController(event.guild_id, ch);
      this.controllerStore.clearOwner(event.guild_id);
      this.controllerStore.clearCurrentTrack(event.guild_id);

      const container = ContainerFactory.buildSimpleMessage(
        `${EMOJIS.LingLong} 音樂中心`,
        stopped
          ? `${EMOJIS.fileshredline} | 已停止播放並清空隊列！`
          : `${EMOJIS.checkdoubleline} | 隊列內的歌曲均已播放完畢！`,
        requester,
      );

      let acknowledged = false;

      // 透過 interaction token 編輯
      if (event.interaction_token) {
        const appId = this.client.application?.id ?? this.client.user!.id;
        try {
          const res = await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${event.interaction_token}/messages/@original`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: null,
                embeds: [],
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2,
              }),
            },
          );
          if (res.ok) acknowledged = true;
        } catch (err) {
          console.error("[UIHandler] Error in handleTrackPlaying:", err);
        }
      }

      if (!acknowledged && ch)
        await (ch as any)
          .send({
            components: [container as any],
            flags: [MessageFlags.IsComponentsV2 as any],
          })
          .catch((err: any) =>
            console.error("[UIHandler] Error sending stop message:", err),
          );
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackEnded:", err);
    }
  }

  private async handleBotDisconnect(event: any): Promise<void> {
    console.info(`[UIHandler] bot_disconnect Guild ${event.guild_id}`);
    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      const chId = event.text_channel_id || this.controllerStore.getCurrentTrack(event.guild_id)?.text_channel_id;
      if (!chId) return;

      const ch = await this.resolveTextChannel(guild, chId);
      if (!ch) return;

      await this.deletePreviousController(event.guild_id, ch);
      this.controllerStore.clearOwner(event.guild_id);
      this.controllerStore.clearCurrentTrack(event.guild_id);

      const container = ContainerFactory.buildSimpleMessage(
        `${EMOJIS.LingLong} 音樂中心`,
        `${EMOJIS.logoutcircleline} | 由於語音頻道已無其他成員，我已自動離開！`,
      );

      await (ch as any).send({
        components: [container as any],
        flags: [MessageFlags.IsComponentsV2 as any],
      }).catch((err: any) => console.error("[UIHandler] Error sending auto-leave message:", err));
    } catch (err) {
      console.error("[UIHandler] Error in handleBotDisconnect:", err);
    }
  }

  private async handleTrackAdded(event: any): Promise<void> {
    if (event.silent) return;

    console.info(
      `[UIHandler] track_added  Guild ${event.guild_id}: ${event.title}`,
    );
    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      const requesterId = event.controller_user_id;
      const requester = requesterId
        ? (await this.client.users.fetch(requesterId).catch(() => ({ tag: "未知使用者" })))
        : null;

      const container = ContainerFactory.buildSimpleMessage(
        `${EMOJIS.playlistaddline} | 已加入隊列`,
        `**[${event.title}](${event.url})**`,
        requester,
      );

      const ch = await this.resolveTextChannel(guild, event.text_channel_id);

      let acknowledged = false;
      if (event.interaction_token) {
        const appId = this.client.application?.id ?? this.client.user!.id;
        try {
          const res = await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${event.interaction_token}/messages/@original`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: null,
                embeds: [],
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2,
              }),
            },
          );
          if (res.ok) acknowledged = true;
        } catch (err) {
          console.error("[UIHandler] Error in acknowledgment:", err);
        }
      }

      if (!acknowledged && ch)
        await (ch as any)
          .send({
            components: [container as any],
            flags: [MessageFlags.IsComponentsV2 as any],
          })
          .catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackAdded:", err);
    }
  }

  private async handleTrackError(event: any): Promise<void> {
    console.error(
      `[UIHandler] track_error  Guild ${event.guild_id}: ${event.error}`,
    );
    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      const requester = event.controller_user_id
        ? await this.client.users
          .fetch(event.controller_user_id)
          .catch(() => null)
        : null;

      const safeError = formatUserFacingError(event.error);
      const container = ContainerFactory.buildSimpleMessage(
        "播放錯誤",
        `${EMOJIS.errorwarningline} | ${safeError}`,
        requester,
      );

      const ch = await this.resolveTextChannel(guild, event.text_channel_id);

      let acknowledged = false;
      if (event.interaction_token) {
        const appId = this.client.application?.id ?? this.client.user!.id;
        try {
          const res = await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${event.interaction_token}/messages/@original`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: null,
                embeds: [],
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2,
              }),
            },
          );
          if (res.ok) acknowledged = true;
        } catch (err) {
          console.error("[UIHandler] Error in acknowledgment:", err);
        }
      }

      if (!acknowledged && ch)
        await (ch as any)
          .send({
            components: [container as any],
            flags: [MessageFlags.IsComponentsV2 as any],
          })
          .catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackError:", err);
    }
  }

  // =============== 遙控器管理 ===============

  private async deletePreviousController(guildId: string, channel: TextBasedChannel | null): Promise<void> {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return;
    this.controllerStore.clearMessageId(guildId);
    if (!channel) return;
    try {
      const msg = await (channel as any).messages.fetch(msgId).catch(() => null);
      await msg?.delete().catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in deletePreviousController:", err);
    }
  }

  // =============== 頻道解析 ===============

  private async resolveTextChannel(guild: Guild, preferredChannelId?: string | null): Promise<TextBasedChannel | null> {
    if (preferredChannelId) {
      const cached = guild.channels.cache.get(preferredChannelId);
      if (cached?.isTextBased()) return cached as TextBasedChannel;
      const ch = await guild.channels
        .fetch(preferredChannelId)
        .catch(() => null);
      if (ch?.isTextBased()) return ch as TextBasedChannel;
    }
    const priority = ["music", "bot", "general", "chat"];
    let channels = guild.channels.cache;
    if (channels.size === 0) {
      channels = await guild.channels.fetch() as any;
    }
    return (
      Array.from(channels.values())
        .filter(
          (c) =>
            c !== null &&
            c.isTextBased() &&
            c.permissionsFor(this.client.user!)?.has("SendMessages"),
        )
        .sort((a, b) => {
          const ai = priority.findIndex((n) =>
            a && a.name?.toLowerCase().includes(n),
          );
          const bi = priority.findIndex((n) =>
            b && b.name?.toLowerCase().includes(n),
          );
          if (ai !== -1 && bi !== -1) return ai - bi;
          return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
        })[0] as TextBasedChannel ?? null
    );
  }
}
