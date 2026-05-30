import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Vibrant } from "node-vibrant/node";
import { formatDuration } from "../utilities/formatDuration.js";

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

      const color = await this.#getThumbnailColor(event.thumbnail);
      const embed = this.#buildNowPlayingEmbed(event, color, requester);
      const rows = this.#buildControllerRows(event);
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
          embed,
          rows,
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
                embeds: [embed.toJSON()],
                components: rows.map((r) => r.toJSON()),
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
          embeds: [embed],
          components: rows,
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

      const ch = await this.#resolveTextChannel(guild, event.text_channel_id);
      await this.#deletePreviousController(event.guild_id, ch);
      this.controllerStore.clearOwner(event.guild_id);
      this.controllerStore.clearCurrentTrack(event.guild_id);

      const embed = stopped
        ? new EmbedBuilder()
            .setDescription(":octagonal_sign: | 已停止播放並清空隊列。")
            .setColor(0xef4444)
            .setTimestamp()
        : new EmbedBuilder()
            .setDescription(":white_check_mark: | 隊列內的歌曲均已播放完畢！")
            .setColor(0x22c55e)
            .setTimestamp();

      if (ch) await ch.send({ embeds: [embed] }).catch(() => null);
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

      const color = await this.#getThumbnailColor(event.thumbnail);
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "已加入隊列",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTitle(event.title)
        .setURL(event.url)
        .setThumbnail(event.thumbnail ?? null)
        .addFields({
          name: "時長",
          value: event.duration ? formatDuration(event.duration) : "LIVE",
          inline: true,
        })
        .setColor(color)
        .setTimestamp();

      if (requester) {
        embed.setFooter({
          text: requester.tag,
          iconURL: requester.displayAvatarURL(),
        });
      }

      const ch = await this.#resolveTextChannel(guild, event.text_channel_id);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => null);
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

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "播放錯誤",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTitle(event.title ?? "未知歌曲")
        .setDescription(`:x: | 無法播放此歌曲：\n\`\`\`${event.error}\`\`\``)
        .setColor(0xef4444)
        .setTimestamp();

      if (requester) {
        embed.setFooter({
          text: requester.tag,
          iconURL: requester.displayAvatarURL(),
        });
      }

      const ch = await this.#resolveTextChannel(guild, event.text_channel_id);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
      console.error("[UIHandler] Error in handleTrackError:", err);
    }
  }

  // 遙控器

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

  async #tryEdit(channel, guildId, embed, rows) {
    const msgId = this.controllerStore.getMessageId(guildId);
    if (!msgId) return null;
    try {
      const msg = await channel.messages.fetch(msgId);
      await msg.edit({ content: null, embeds: [embed], components: rows });
      return msgId;
    } catch {
      this.controllerStore.clearMessageId(guildId);
      return null;
    }
  }

  // Embed

  #buildNowPlayingEmbed(event, color = 0xf59e0b, requester = null) {
    const titleLink = event.source_url
      ? `[${event.title ?? "未知標題"}](${event.source_url})`
      : (event.title ?? "未知標題");

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
        event.is_paused ? ":pause_button: | 目前暫停" : ":notes: | 正在播放",
      )
      .setDescription(`${titleLink}\n\n${this.#buildMetadataLine(event)}`);

    if (requester) {
      embed.setFooter({
        text: requester.tag,
        iconURL: requester.displayAvatarURL(),
      });
      embed.setTimestamp();
    }

    if (event.thumbnail) embed.setThumbnail(event.thumbnail);
    return embed;
  }

  #buildControllerRows(event) {
    const row1 = new ActionRowBuilder().addComponents(
      event.is_paused
        ? new ButtonBuilder()
            .setCustomId("MusicButtonControlResume")
            .setLabel("繼續")
            .setStyle(ButtonStyle.Success)
        : new ButtonBuilder()
            .setCustomId("MusicButtonControlPause")
            .setLabel("暫停")
            .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlSkip")
        .setLabel("跳過")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlDetails")
        .setLabel("歌曲詳情")
        .setStyle(ButtonStyle.Success),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoop")
        .setLabel(`循環：${this.#getLoopLabel(event.loop_state)}`)
        .setStyle(ButtonStyle.Secondary),
    );
    return [row1, row2];
  }

  #buildMetadataLine(event) {
    const parts = [
      `**時長**：${event.duration ? formatDuration(event.duration) : "LIVE"}`,
      `**循環**：${this.#getLoopLabel(event.loop_state)}`,
      `**狀態**：${event.is_paused ? "暫停" : "播放中"}`,
    ];
    if (event.uploader) parts.push(`**發佈者**：${event.uploader}`);
    return parts.join(" | ");
  }

  #getLoopLabel(loopState = 0) {
    return ["關閉", "重播一次", "單曲循環"][loopState] ?? "關閉";
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
