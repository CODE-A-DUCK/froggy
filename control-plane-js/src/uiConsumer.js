import Redis from "ioredis";
import { config } from "./config.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from "discord.js";
import { broker } from "./broker.js";

export class UIConsumer {
  constructor(client) {
    this.client = client;
    this.subscriber = new Redis(config.redisUrl);
    this.subscriber.on("error", (err) =>
      console.error("[UIConsumer] Redis Error:", err),
    );
    this.groupName = "ui-workers";
    this.consumerName = `ui-consumer-${process.pid}`;
  }

  async start() {
    try {
      await this.subscriber.xgroup(
        "CREATE",
        "ui-events",
        this.groupName,
        "$",
        "MKSTREAM",
      );
    } catch (err) {
      if (!err.message.includes("BUSYGROUP")) {
        console.error("[UIConsumer] Error creating consumer group:", err);
      }
    }

    console.info("[UIConsumer] Started listening for UI events...");
    this.consume();
  }

  async consume() {
    while (true) {
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
          const [_streamName, messages] = result[0];

          for (const message of messages) {
            const [messageId, fields] = message;

            for (let i = 0; i < fields.length; i += 2) {
              const eventType = fields[i];
              const eventData = JSON.parse(fields[i + 1]);

              switch (eventType) {
                case "track_playing":
                  await this.handleTrackPlaying(eventData);
                  break;
                case "track_finished":
                  await this.handleTrackFinished(eventData);
                  break;
                case "track_stopped":
                  await this.handleTrackStopped(eventData);
                  break;
                case "track_added":
                  await this.handleTrackAdded(eventData);
                  break;
                case "track_error":
                  await this.handleTrackError(eventData);
                  break;
                default:
                  console.warn(`[UIConsumer] Unknown event type: ${eventType}`);
              }
            }

            await this.subscriber.xack("ui-events", this.groupName, messageId);
          }
        }
      } catch (err) {
        console.error("[UIConsumer] Error reading from stream:", err);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  buildControllerRows(event) {
    const isPaused = event.is_paused ?? false;
    const loopState = event.loop_state ?? 0;

    const row1 = new ActionRowBuilder().addComponents(
      isPaused
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

    const loopButtons = [
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoopNormal")
        .setLabel("正常播放")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoopAgain")
        .setLabel("重播一次")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoopLoop")
        .setLabel("循環播放")
        .setStyle(ButtonStyle.Secondary),
    ];

    const row2 = new ActionRowBuilder().addComponents(
      loopButtons[loopState] || loopButtons[0],
    );

    return [row1, row2];
  }

  async handleTrackPlaying(event) {
    console.info(
      `[UIConsumer] Received track_playing for Guild ${event.guild_id}: ${event.title}`,
    );

    try {
      const guild = await this.client.guilds.fetch(event.guild_id);
      if (!guild) return;

      const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents((section) => {
          section.addTextDisplayComponents((text) => {
            const titleLink = event.source_url
              ? `[${event.title || "未知標題"}](${event.source_url})`
              : event.title || "未知標題";
            return text.setContent(`### :notes: 正在播放：${titleLink}`);
          });
          if (event.thumbnail) {
            section.setThumbnailAccessory(
              new ThumbnailBuilder().setURL(event.thumbnail),
            );
          }
          return section;
        });

      const rows = this.buildControllerRows(event);
      container.addActionRowComponents(...rows);

      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );

      if (!targetChannel) {
        console.warn(
          `[UIConsumer] No sendable text channel found for guild ${event.guild_id}`,
        );
        return;
      }

      let messageId = null;

      if (event.is_update) {
        const oldMsgId = await broker.getControllerMessageId(event.guild_id);
        if (oldMsgId) {
          try {
            const oldMsg = await targetChannel.messages.fetch(oldMsgId);
            if (oldMsg) {
              await oldMsg.edit({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
              });
              messageId = oldMsgId;
              console.info(
                `[UIConsumer] Edited existing container for Guild ${event.guild_id}`,
              );
            }
          } catch (err) {
            console.warn(
              `[UIConsumer] Failed to edit existing message: ${err.message}`,
            );
          }
        }
      }

      if (!messageId) {
        await this.disablePreviousController(
          event.guild_id,
          event.text_channel_id,
        );

        if (event.interaction_token) {
          try {
            const applicationId =
              this.client.application?.id ?? this.client.user.id;

            const res = await fetch(
              `https://discord.com/api/v10/webhooks/${applicationId}/${event.interaction_token}/messages/@original`,
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
              const interactionMsg = await res.json();
              messageId = interactionMsg.id;
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

        if (!messageId) {
          const ctrlMsg = await targetChannel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
          messageId = ctrlMsg.id;
          console.info(
            `[UIConsumer] Sent track_playing container for Guild ${event.guild_id}`,
          );
        }
      }

      if (messageId) {
        await broker.setControllerMessageId(event.guild_id, messageId);
      }
    } catch (err) {
      console.error("[UIConsumer] Error handling track_playing event:", err);
    }
  }

  async handleTrackFinished(event) {
    console.info(
      `[UIConsumer] Received track_finished for Guild ${event.guild_id}: ${event.title}`,
    );

    try {
      const guild = await this.client.guilds.fetch(event.guild_id);
      if (!guild) return;

      await this.disablePreviousController(
        event.guild_id,
        event.text_channel_id,
      );

      const embed = new EmbedBuilder()
        .setDescription(`:white_check_mark: | 隊列內的歌曲均已播放完畢！`)
        .setColor(0x189e00)
        .setTimestamp();

      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );
      if (targetChannel) await targetChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[UIConsumer] Error handling track_finished event:", err);
    }
  }
  async handleTrackStopped(event) {
    console.info(
      `[UIConsumer] Received track_stopped for Guild ${event.guild_id}`,
    );

    try {
      const guild = await this.client.guilds.fetch(event.guild_id);
      if (!guild) return;

      await this.disablePreviousController(
        event.guild_id,
        event.text_channel_id,
      );

      const embed = new EmbedBuilder()
        .setDescription(`:octagonal_sign: | 已停止播放並清空隊列。`)
        .setColor(0xed4245)
        .setTimestamp();

      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );
      if (targetChannel) await targetChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[UIConsumer] Error handling track_stopped event:", err);
    }
  }
  async handleTrackAdded(event) {
    console.info(
      `[UIConsumer] Received track_added for Guild ${event.guild_id}: ${event.title}`,
    );

    try {
      const guild = await this.client.guilds.fetch(event.guild_id);
      if (!guild) return;

      const durationStr = event.duration
        ? `${Math.floor(event.duration / 60)}:${String(event.duration % 60).padStart(2, "0")}`
        : "LIVE";

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "已加入隊列",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTitle(event.title)
        .setURL(event.url)
        .setThumbnail(event.thumbnail || null)
        .addFields({ name: "時長", value: durationStr, inline: true })
        .setColor(0x5865f2)
        .setTimestamp();

      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );
      if (targetChannel) await targetChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[UIConsumer] Error handling track_added event:", err);
    }
  }

  async handleTrackError(event) {
    console.error(
      `[UIConsumer] Received track_error for Guild ${event.guild_id}: ${event.error}`,
    );

    try {
      const guild = await this.client.guilds.fetch(event.guild_id);
      if (!guild) return;

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "播放錯誤",
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTitle(event.title || "未知歌曲")
        .setDescription(`:x: | 無法播放此歌曲：\n\`\`\`${event.error}\`\`\``)
        .setColor(0xed4245)
        .setTimestamp();

      const targetChannel = await this.resolveTextChannel(
        guild,
        event.text_channel_id,
      );
      if (targetChannel) await targetChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[UIConsumer] Error handling track_error event:", err);
    }
  }

  async disablePreviousController(guildId, channelId) {
    try {
      const oldMsgId = await broker.getControllerMessageId(guildId);
      if (!oldMsgId) return;

      const guild = await this.client.guilds.fetch(guildId);
      const channel = await this.resolveTextChannel(guild, channelId);
      if (!channel) return;

      const oldMsg = await channel.messages.fetch(oldMsgId).catch(() => null);
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
    }
  }

  async resolveTextChannel(guild, preferredChannelId) {
    if (preferredChannelId) {
      const ch = await guild.channels
        .fetch(preferredChannelId)
        .catch(() => null);
      if (ch && ch.isTextBased()) return ch;
    }

    try {
      const currentData = await broker.publisher.get(
        `music:current:${guild.id}`,
      );
      if (currentData) {
        const event = JSON.parse(currentData);
        if (event.text_channel_id) {
          const ch = await guild.channels
            .fetch(event.text_channel_id)
            .catch(() => null);
          if (ch && ch.isTextBased()) return ch;
        }
      }
    } catch (err) {
      console.warn(
        `[UIConsumer] Redis fallback failed for Guild ${guild.id}:`,
        err,
      );
    }

    try {
      const lastCtrlMsgId = await broker.getControllerMessageId(guild.id);
      if (lastCtrlMsgId) {
      }
    } catch {}

    const channels = await guild.channels.fetch();
    const sortedChannels = Array.from(channels.values()).sort((a, b) => {
      const names = ["music", "bot", "general", "chat"];
      const aMatch = names.findIndex((n) => a.name?.toLowerCase().includes(n));
      const bMatch = names.findIndex((n) => b.name?.toLowerCase().includes(n));
      if (aMatch !== -1 && bMatch !== -1) return aMatch - bMatch;
      if (aMatch !== -1) return -1;
      if (bMatch !== -1) return 1;
      return 0;
    });

    return (
      sortedChannels.find(
        (c) =>
          c.isTextBased() &&
          c.permissionsFor(this.client.user).has("SendMessages"),
      ) ?? null
    );
  }

  /** Convert YYYYMMDD to YYYY-MM-DD. */
  formatDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr;
  }
}
