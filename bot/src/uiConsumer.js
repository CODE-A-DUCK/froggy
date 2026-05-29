import Redis from "ioredis";
import { config } from "./config.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { broker } from "./broker.js";
import { formatDuration } from "./utilities/formatDuration.js";

export class UIConsumer {
  constructor(client) {
    this.client = client;
    this.subscriber = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    this.subscriber.on("error", (err) =>
      console.error("[UIConsumer] Redis Error:", err.message),
    );
    this.groupName = "ui-workers";
    this.consumerName = `ui-consumer-${process.pid}`;
    this._running = false;

    this.handlers = {
      track_playing: (e) => this.handleTrackPlaying(e),
      track_finished: (e) => this.handleTrackEnded(e, false),
      track_stopped: (e) => this.handleTrackEnded(e, true),
      track_added: (e) => this.handleTrackAdded(e),
      track_error: (e) => this.handleTrackError(e),
    };
  }

  async start() {
    this._running = true;
    try {
      await this.subscriber.xgroup(
        "CREATE",
        "ui-events",
        this.groupName,
        "$",
        "MKSTREAM",
      );
    } catch (err) {
      if (!err.message.includes("BUSYGROUP"))
        console.error("[UIConsumer] Error creating consumer group:", err);
    }
    console.info("[UIConsumer] Started listening for UI events...");
    this.consume();
  }

  stop() {
    this._running = false;
    this.subscriber.quit().catch(() => null);
    console.info("[UIConsumer] Stopping...");
  }

  async consume() {
    while (this._running) {
      try {
        const result = await this.subscriber.xreadgroup(
          "GROUP",
          this.groupName,
          this.consumerName,
          "BLOCK",
          5000,
          "COUNT",
          1,
          "STREAMS",
          "ui-events",
          ">",
        );

        if (result) {
          const [, messages] = result[0];
          for (const [messageId, fields] of messages) {
            for (let i = 0; i < fields.length; i += 2) {
              const handler = this.handlers[fields[i]];
              if (handler) await handler(JSON.parse(fields[i + 1]));
              else
                console.warn(`[UIConsumer] Unknown event type: ${fields[i]}`);
            }
            await this.subscriber.xack("ui-events", this.groupName, messageId);
          }
        }
      } catch (err) {
        console.error("[UIConsumer] Error reading from stream:", err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /* fetch guild → resolve channel → send embed */
  async sendEmbed(event, embed) {
    const guild = await this.client.guilds.fetch(event.guild_id);
    if (!guild) return;
    const ch = await this.resolveTextChannel(guild, event.text_channel_id);
    if (ch) await ch.send({ embeds: [embed] });
  }

  async handleTrackPlaying(event) {
    console.info(
      `[UIConsumer] track_playing  Guild ${event.guild_id}: ${event.title}`,
    );
    try {
      const guild = await this.client.guilds.fetch(event.guild_id);
      if (!guild) return;

      const embed = this.buildNowPlayingEmbed(event);
      const rows = this.buildControllerRows(event);
      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );

      if (!targetChannel) {
        console.warn(
          `[UIConsumer] No sendable text channel for guild ${event.guild_id}`,
        );
        return;
      }

      let messageId = null;

      if (!event.force_new) {
        messageId = await this.tryEditControllerMessage(
          targetChannel,
          event.guild_id,
          embed,
          rows,
        );
      }

      // 嘗試用 interaction token 更新原始訊息
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
          if (res.ok) {
            messageId = (await res.json()).id;
            console.info(
              `[UIConsumer] Edited interaction for Guild ${event.guild_id}`,
            );
          } else {
            console.warn(
              `[UIConsumer] Interaction edit returned ${res.status}: ${res.statusText}`,
            );
          }
        } catch (err) {
          console.error(
            "[UIConsumer] Interaction edit failed, falling back to channel send:",
            err,
          );
        }
      }

      // 全部失敗 -> 直接傳新訊息
      if (!messageId) {
        await this.disablePreviousController(
          event.guild_id,
          event.text_channel_id,
        );
        const ctrlMsg = await targetChannel.send({
          embeds: [embed],
          components: rows,
        });
        messageId = ctrlMsg.id;
        console.info(
          `[UIConsumer] Sent track_playing container for Guild ${event.guild_id}`,
        );
      }

      if (messageId)
        await broker.setControllerMessageId(event.guild_id, messageId);
    } catch (err) {
      console.error("[UIConsumer] Error handling track_playing event:", err);
    }
  }

  /**
   * track_finished / track_stopped ，邏輯相同，只差 UI。所以合併起來，就不用兩個 embed 了。
   * @param {boolean} stopped - true = 手動停止，false = 自然結束
   */
  async handleTrackEnded(event, stopped) {
    const label = stopped ? "track_stopped" : "track_finished";
    console.info(`[UIConsumer] ${label} Guild ${event.guild_id}`);
    try {
      await this.disablePreviousController(
        event.guild_id,
        event.text_channel_id,
      );
      await broker.clearControllerOwner(event.guild_id);

      const embed = stopped
        ? new EmbedBuilder()
            .setDescription(":octagonal_sign: | 已停止播放並清空隊列。")
            .setColor(0xed4245)
            .setTimestamp()
        : new EmbedBuilder()
            .setDescription(":white_check_mark: | 隊列內的歌曲均已播放完畢！")
            .setColor(0x274dea)
            .setTimestamp();

      await this.sendEmbed(event, embed);
    } catch (err) {
      console.error(`[UIConsumer] Error handling ${label} event:`, err);
    }
  }

  async handleTrackAdded(event) {
    console.info(
      `[UIConsumer] track_added  Guild ${event.guild_id}: ${event.title}`,
    );
    try {
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
        .setColor(0x5865f2)
        .setTimestamp();

      await this.sendEmbed(event, embed);
    } catch (err) {
      console.error("[UIConsumer] Error handling track_added event:", err);
    }
  }

  async handleTrackError(event) {
    console.error(
      `[UIConsumer] track_error  Guild ${event.guild_id}: ${event.error}`,
    );
    try {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "播放錯誤",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTitle(event.title ?? "未知歌曲")
        .setDescription(`:x: | 無法播放此歌曲：\n\`\`\`${event.error}\`\`\``)
        .setColor(0xed4245)
        .setTimestamp();

      await this.sendEmbed(event, embed);
    } catch (err) {
      console.error("[UIConsumer] Error handling track_error event:", err);
    }
  }

  // 遙控器

  async disablePreviousController(guildId, channelId) {
    try {
      const oldMsgId = await broker.getControllerMessageId(guildId);
      if (!oldMsgId) return;
      const guild = await this.client.guilds.fetch(guildId);
      const channel = await this.resolveTextChannel(guild, channelId);
      const oldMsg = await channel?.messages.fetch(oldMsgId).catch(() => null);
      if (oldMsg) {
        await oldMsg.delete().catch(() => null);
        console.info(
          `[UIConsumer] Deleted previous controller for Guild ${guildId}`,
        );
      }
    } catch (err) {
      console.warn(
        `[UIConsumer] Failed to delete previous controller: ${err.message}`,
      );
    } finally {
      await broker.clearControllerMessageId(guildId).catch(() => null);
    }
  }

  async tryEditControllerMessage(targetChannel, guildId, embed, rows) {
    const oldMsgId = await broker.getControllerMessageId(guildId);
    if (!oldMsgId) return null;
    try {
      const oldMsg = await targetChannel.messages.fetch(oldMsgId);
      await oldMsg.edit({ content: null, embeds: [embed], components: rows });
      console.info(
        `[UIConsumer] Edited existing container for Guild ${guildId}`,
      );
      return oldMsgId;
    } catch (err) {
      console.warn(
        `[UIConsumer] Failed to edit existing message: ${err.message}`,
      );
      await broker.clearControllerMessageId(guildId).catch(() => null);
      return null;
    }
  }

  // Embed

  buildNowPlayingEmbed(event) {
    const titleLink = event.source_url
      ? `[${event.title ?? "未知標題"}](${event.source_url})`
      : (event.title ?? "未知標題");

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        event.is_paused ? ":pause_button: | 目前暫停" : ":notes: | 正在播放",
      )
      .setDescription(`${titleLink}\n\n${this.buildMetadataLine(event)}`);

    if (event.thumbnail) embed.setThumbnail(event.thumbnail);
    return embed;
  }

  buildControllerRows(event) {
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
        .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoop")
        .setLabel(`循環：${this.getLoopLabel(event.loop_state)}`)
        .setStyle(ButtonStyle.Secondary),
    );

    return [row1, row2];
  }

  buildMetadataLine(event) {
    const parts = [
      `**時長**：${event.duration ? formatDuration(event.duration) : "LIVE"}`,
      `**循環**：${this.getLoopLabel(event.loop_state)}`,
      `**狀態**：${event.is_paused ? "暫停" : "播放中"}`,
    ];
    if (event.uploader) parts.push(`**發佈者**：${event.uploader}`);
    return parts.join(" | ");
  }

  getLoopLabel(loopState = 0) {
    return ["關閉", "重播一次", "單曲循環"][loopState] ?? "關閉";
  }

  async resolveTextChannel(guild, preferredChannelId) {
    if (preferredChannelId) {
      const ch = await guild.channels
        .fetch(preferredChannelId)
        .catch(() => null);
      if (ch?.isTextBased()) return ch;
    }

    try {
      const currentData = await broker.publisher.get(
        `music:current:${guild.id}`,
      );
      if (currentData) {
        const { text_channel_id } = JSON.parse(currentData);
        if (text_channel_id) {
          const ch = await guild.channels
            .fetch(text_channel_id)
            .catch(() => null);
          if (ch?.isTextBased()) return ch;
        }
      }
    } catch (err) {
      console.warn(
        `[UIConsumer] Redis fallback failed for Guild ${guild.id}:`,
        err,
      );
    }

    const channels = await guild.channels.fetch();
    const priority = ["music", "bot", "general", "chat"];

    return (
      Array.from(channels.values())
        .filter(
          (c) =>
            c.isTextBased() &&
            c.permissionsFor(this.client.user).has("SendMessages"),
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
