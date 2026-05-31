import { Vibrant } from "node-vibrant/node";
import { MessageFlags } from "discord.js";
import { ContainerFactory } from "./ContainerFactory.js";

export class UIHandler {
  constructor({ client, controllerStore }) {
    this.client = client;
    this.controllerStore = controllerStore;
  }

  attach(guildPlayerManager) {
    guildPlayerManager.on("trackStarted", (e) =>
      this.#safe(() => this.#handleTrackPlaying(e)),
    );
    guildPlayerManager.on("sessionUpdated", (e) =>
      this.#safe(() => this.#handleTrackPlaying(e)),
    );
    guildPlayerManager.on("trackQueued", (e) =>
      this.#safe(() => this.#handleTrackAdded(e)),
    );
    guildPlayerManager.on("queueFinished", (e) =>
      this.#safe(() => this.#handleTrackEnded(e, false)),
    );
    guildPlayerManager.on("trackStopped", (e) =>
      this.#safe(() => this.#handleTrackEnded(e, true)),
    );
    guildPlayerManager.on("trackError", (e) =>
      this.#safe(() => this.#handleTrackError(e)),
    );
  }

  #safe(fn) {
    Promise.resolve()
      .then(fn)
      .catch((err) =>
        console.error("[UIHandler] Unhandled error in event handler:", err),
      );
  }

  async #handleTrackPlaying(event) {
    console.info(
      `[UIHandler] track_playing  Guild ${event.guild_id}: ${event.title}`,
    );
    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      this.controllerStore.setCurrentTrack(event.guild_id, event);

      const requester = event.controller_user_id
        ? await this.client.users
            .fetch(event.controller_user_id)
            .catch(() => null)
        : null;

      const container = ContainerFactory.buildNowPlaying(
        event,
        requester,
        this.client,
      );

      const targetChannel = await this.#resolveTextChannel(
        guild,
        event.text_channel_id,
      );
      if (!targetChannel) return;

      let messageId = null;

      // 編輯現有的控制器消息
      if (!event.force_new) {
        messageId = await this.#tryEdit(
          targetChannel,
          event.guild_id,
          container,
        );
      }

      // 透過 interaction token 編輯
      if (!messageId && !event.force_new && event.interaction_token) {
        const appId = this.client.application?.id ?? this.client.user.id;
        try {
          const res = await fetch(
            `https://discord.com/api/v10/webhooks/${appId}/${event.interaction_token}/messages/@original`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: null,
                embeds: [],
                components: [container],
              }),
            },
          );
          if (res.ok) messageId = (await res.json()).id;
        } catch {}
      }

      // 發新消息
      if (!messageId) {
        await this.#deletePreviousController(event.guild_id, targetChannel);
        const msg = await targetChannel.send({
          components: [container],
          flags: [MessageFlags.IsComponentsV2],
        });
        messageId = msg.id;
      }

      if (messageId)
        this.controllerStore.setMessageId(event.guild_id, messageId);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackPlaying:", err);
    }
  }

  async #handleTrackEnded(event, stopped) {
    console.info(
      `[UIHandler] ${stopped ? "track_stopped" : "track_finished"} Guild ${event.guild_id}`,
    );

    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      const requester = event.controller_user_id
        ? await this.client.users
            .fetch(event.controller_user_id)
            .catch(() => null)
        : null;

      const ch = await this.#resolveTextChannel(guild, event.text_channel_id);
      await this.#deletePreviousController(event.guild_id, ch);
      this.controllerStore.clearOwner(event.guild_id);
      this.controllerStore.clearCurrentTrack(event.guild_id);

      const container = ContainerFactory.buildSimpleMessage(
        "音樂中心",
        stopped
          ? ":octagonal_sign: | 已停止播放並清空隊列。"
          : ":white_check_mark: | 隊列內的歌曲均已播放完畢！",
        requester,
      );

      if (ch)
        await ch
          .send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
          })
          .catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackEnded:", err);
    }
  }

  async #handleTrackAdded(event) {
    console.info(
      `[UIHandler] track_added  Guild ${event.guild_id}: ${event.title}`,
    );
    try {
      const guild = this.client.guilds.cache.get(event.guild_id);
      if (!guild) return;

      const requester = event.controller_user_id
        ? await this.client.users
            .fetch(event.controller_user_id)
            .catch(() => null)
        : null;

      const container = ContainerFactory.buildSimpleMessage(
        "已加入隊列",
        `**${event.title}**\n${event.url}`,
        requester,
      );

      const ch = await this.#resolveTextChannel(guild, event.text_channel_id);
      if (ch)
        await ch
          .send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
          })
          .catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackAdded:", err);
    }
  }

  async #handleTrackError(event) {
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

      const container = ContainerFactory.buildSimpleMessage(
        "播放錯誤",
        `:x: | 無法播放此歌曲：\n\`\`\`${event.error}\`\`\``,
        requester,
      );

      const ch = await this.#resolveTextChannel(guild, event.text_channel_id);
      if (ch)
        await ch
          .send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
          })
          .catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackError:", err);
    }
  }

  // 遙控器管理

  async #deletePreviousController(guildId, channel) {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return;
    this.controllerStore.clearMessageId(guildId);
    if (!channel) return;
    try {
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      await msg?.delete().catch(() => null);
    } catch {}
  }

  async #tryEdit(channel, guildId, container) {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return null;
    try {
      const msg = await channel.messages.fetch(msgId);
      await msg.edit({
        content: null,
        embeds: [],
        components: [container],
        flags: [MessageFlags.IsComponentsV2],
      });
      return msgId;
    } catch {
      this.controllerStore.clearMessageId(guildId);
      return null;
    }
  }

  // 頻道解析

  async #resolveTextChannel(guild, preferredChannelId) {
    if (preferredChannelId) {
      const ch = await guild.channels
        .fetch(preferredChannelId)
        .catch(() => null);
      if (ch?.isTextBased()) return ch;
    }
    const priority = ["music", "bot", "general", "chat"];
    const channels = await guild.channels.fetch();
    return (
      Array.from(channels.values())
        .filter(
          (c) =>
            c.isTextBased() &&
            c.permissionsFor(this.client.user)?.has("SendMessages"),
        )
        .sort((a, b) => {
          const ai = priority.findIndex((n) =>
            a.name?.toLowerCase().includes(n),
          );
          const bi = priority.findIndex((n) =>
            b.name?.toLowerCase().includes(n),
          );
          if (ai !== -1 && bi !== -1) return ai - bi;
          return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
        })[0] ?? null
    );
  }

  async #getThumbnailColor(url) {
    if (!url) return 0xf59e0b;
    try {
      const palette = await Vibrant.from(url).getPalette();
      return palette.Vibrant
        ? parseInt(palette.Vibrant.hex.slice(1), 16)
        : 0xf59e0b;
    } catch {
      return 0xf59e0b;
    }
  }
}
