import { MessageFlags } from "discord.js";
import { ContainerFactory } from "./ContainerFactory.js";

function formatUserFacingError(errorMsg) {
  if (!errorMsg) return "發生未知錯誤";
  if (errorMsg.includes("FFMPEG_STALLED") || errorMsg.includes("音樂串流卡住"))
    return "串流處理逾時或無法取得音訊資料，正在嘗試重新啟動...";
  if (
    errorMsg.includes("confirm your age") ||
    errorMsg.includes("age-restricted")
  )
    return "此歌曲有年齡限制，無法播放";
  if (errorMsg.includes("Sign in to confirm your age"))
    return "此歌曲有年齡限制，無法播放";
  if (
    errorMsg.includes("Video unavailable") ||
    errorMsg.includes("Private video")
  )
    return "影片無法使用或已被設為私人";
  if (errorMsg.includes("copyright claim")) return "影片因版權問題無法使用";
  if (errorMsg.includes("ffmpeg exited with code"))
    return "音訊處理程序發生錯誤";
  return "獲取音訊時發生錯誤，或該連結不支援播放";
}

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
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2,
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
        "<:LingLong:1510515456321261699> 音樂中心",
        stopped
          ? "<:fileshredline:1510533869080805457> | 已停止播放並清空隊列！"
          : "<:checkdoubleline:1510533861052907621> | 隊列內的歌曲均已播放完畢！",
        requester,
      );

      let acknowledged = false;

      // 透過 interaction token 編輯
      if (event.interaction_token) {
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
                components: [container.toJSON()],
                flags: MessageFlags.IsComponentsV2,
              }),
            },
          );
          if (res.ok) acknowledged = true;
        } catch {}
      }

      if (!acknowledged && ch)
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
    if (event.silent) return;

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
        "<:playlistaddline:1510533888630329455> | 已加入隊列",
        `**[${event.title}](${event.url})**`,
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

      const safeError = formatUserFacingError(event.error);
      const container = ContainerFactory.buildSimpleMessage(
        "播放錯誤",
        `<:errorwarningline:1510533865805058188> | 無法播放此歌曲：\n\`\`\`${safeError}\`\`\``,
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
}
