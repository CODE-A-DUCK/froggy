import { Events, MessageFlags, EmbedBuilder } from "discord.js";

import {
  shouldOptimisticallyUpdate,
  optimisticallyUpdateController,
} from "../../player/ui/controller-sync.js";
import { formatDuration } from "../../player/utils/format-duration.js";
import { formatUploadDate } from "../../player/utils/format-upload-date.js";
import { CONTROLLER_DENIED_MESSAGE } from "../../player/utils/voice-guard.js";
import { handleInteraction } from "../commands/index.js";
import { handleMusicSearchModal } from "../commands/music/search.js";
import { controllerStore } from "../store/controller-store.js";

export const interactionCreateEvent = {
  name: Events.InteractionCreate,
  async execute(interaction, context) {
    try {
      if (
        interaction.isChatInputCommand() ||
        interaction.isAutocomplete() ||
        interaction.isStringSelectMenu()
      ) {
        await handleInteraction(interaction, context);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction, context);
      } else if (interaction.isModalSubmit()) {
        await handleModalInteraction(interaction, context);
      }
    } catch (error) {
      console.error("[Interaction] Unhandled error:", error);
    }
  },
};

const replyError = (interaction, description) =>
  interaction
    .followUp({
      embeds: [
        new EmbedBuilder().setDescription(description).setColor(0xe9152d),
      ],
      flags: [MessageFlags.Ephemeral],
    })
    .catch(() => null);

const handleModalInteraction = async (interaction, context) => {
  if (interaction.customId === "MusicSearchModal") {
    await handleMusicSearchModal(interaction, context);
    return;
  }

  if (interaction.customId === "MusicQueueRemoveModal") {
    const selectedValues = interaction.fields.getCheckboxGroup(
      "MusicQueueRemoveCheckboxes",
    );
    const selectedIndices = [
      ...new Set(
        selectedValues
          .map((v) => parseInt(v, 10))
          .filter((v) => Number.isInteger(v)),
      ),
    ];

    if (selectedIndices.length === 0) {
      return interaction.reply({
        content:
          "<:errorwarningline:1510533865805058188> | 你沒有選擇任何歌曲。",
        flags: [MessageFlags.Ephemeral],
      });
    }

    try {
      const removed = await context.guildPlayerManager.dispatch({
        guild_id: interaction.guildId,
        action: "remove",
        indices: selectedIndices,
      });

      if (removed.length === 0) {
        return interaction.reply({
          content:
            "<:errorwarningline:1510533865805058188> | 找不到要移除的歌曲，請確認隊列編號是否仍然有效。",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.reply({
        content: [
          `<:checkdoubleline:1510533861052907621> | 已成功從隊列中移除 ${removed.length} 首歌曲：`,
          removed.map((track) => `- ${track.title}`).join("\n"),
        ].join("\n"),
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.error("[Modal] Remove error:", err);
      await interaction.reply({
        content:
          "<:errorwarningline:1510533865805058188> | 移除歌曲時發生錯誤。",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
};

const handleButtonInteraction = async (interaction, context) => {
  try {
    const { guildId, member, channelId } = interaction;

    const control = parseMusicControl(interaction.customId);
    if (!control?.action) return;

    await interaction.deferUpdate().catch(() => null);

    const botMember = await interaction.guild.members
      .fetch(interaction.client.user.id)
      .catch(() => null);
    const botVoiceChannel = botMember?.voice.channel;

    if (!botVoiceChannel)
      return replyError(
        interaction,
        "<:errorwarningline:1510533865805058188> | 我目前不在語音頻道中，無法執行此操作。",
      );

    if (!member.voice.channel || member.voice.channel.id !== botVoiceChannel.id)
      return replyError(
        interaction,
        `<:errorwarningline:1510533865805058188> | 你必須跟我進入同一個頻道 <#${botVoiceChannel.id}> 才能控制我！`,
      );

    const ownerId = controllerStore.getOwner(guildId);
    if (ownerId && ownerId !== interaction.user.id)
      return replyError(interaction, CONTROLLER_DENIED_MESSAGE);

    const VALID_BUTTON_ACTIONS = new Set([
      "stop",
      "skip",
      "pause",
      "resume",
      "loop",
      "details",
      "resend_ui",
    ]);
    if (!VALID_BUTTON_ACTIONS.has(control.action)) return;

    if (control.action === "details") {
      const track = controllerStore.getCurrentTrack(guildId);
      if (!track)
        return replyError(
          interaction,
          "<:errorwarningline:1510533865805058188> | 找不到目前的歌曲資訊。",
        );
      return interaction
        .followUp({
          embeds: [buildDetailsEmbed(track)],
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => null);
    }

    const optimisticUpdate = shouldOptimisticallyUpdate(control.action)
      ? optimisticallyUpdateController(interaction, control.action)
      : Promise.resolve();

    await context.guildPlayerManager.dispatch({
      guild_id: guildId,
      action: control.action,
      text_channel_id: channelId,
    });
    await optimisticUpdate;
  } catch (error) {
    console.error("[Button] Critical error:", error);
  }
};

function buildDetailsEmbed(event) {
  return new EmbedBuilder()
    .setTitle("歌曲詳情")
    .setDescription(
      `**[${event.title ?? "未知標題"}](${event.source_url ?? event.url})**`,
    )
    .setColor(0xa16b00)
    .setThumbnail(event.thumbnail ?? null)
    .addFields(
      {
        name: "<:userline:1510539696906965022> | 發佈者",
        value: event.uploader ?? "未知",
        inline: true,
      },
      {
        name: "<:timeline:1510539695111540797> | 時長",
        value: event.duration ? formatDuration(event.duration) : "LIVE",
        inline: true,
      },
      {
        name: "<:calendarline:1510539690841866342> | 上傳日期",
        value: formatUploadDate(event.upload_date) ?? "未知",
        inline: true,
      },
      {
        name: "<:eyeline:1510533867583569920> | 觀看次數",
        value: event.view_count?.toLocaleString() ?? "未知",
        inline: true,
      },
      {
        name: "<:thumbupline:1510533908331237488> | 點讚數量",
        value: event.like_count?.toLocaleString() ?? "未知",
        inline: true,
      },
    );
}

function parseMusicControl(customId) {
  if (customId.startsWith("MusicButtonControl")) {
    const action = customId.replace("MusicButtonControl", "").toLowerCase();
    return { action: action.startsWith("loop") ? "loop" : action };
  }
  if (customId.startsWith("music:")) {
    const [, action] = customId.split(":");
    return { action };
  }
  if (customId.startsWith("music_")) {
    return { action: customId.replace("music_", "") };
  }
  return null;
}
