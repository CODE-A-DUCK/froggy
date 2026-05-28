import { Events, MessageFlags, EmbedBuilder } from "discord.js";
import { handleInteraction } from "../commands/index.js";
import { broker } from "../broker.js";
import {
  CONTROLLER_DENIED_MESSAGE,
  getActiveControllerOwner,
} from "../controllerAccess.js";
import { formatDuration } from "../utilities/formatDuration.js";
import { formatUploadDate } from "../utilities/formatUploadDate.js";

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
        await handleButtonInteraction(interaction);
      }
    } catch (error) {
      console.error(`[Interaction] Unhandled error:`, error);
    }
  },
};

const replyError = (interaction, description) =>
  interaction
    .followUp({
      embeds: [
        new EmbedBuilder().setDescription(description).setColor(0xed4245),
      ],
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => null);

const handleButtonInteraction = async (interaction) => {
  try {
    const { guildId, member, channelId } = interaction;
    const control = parseMusicControl(interaction.customId);
    if (!control?.action) return;

    await interaction.deferUpdate().catch(() => null);

    const botMember = await interaction.guild.members
      .fetch(interaction.client.user.id)
      .catch(() => null);
    const botVoiceChannel = botMember?.voice.channel;

    if (!botVoiceChannel) {
      return replyError(
        interaction,
        ":x: | 我目前不在語音頻道中，無法執行此操作。",
      );
    }

    if (
      !member.voice.channel ||
      member.voice.channel.id !== botVoiceChannel.id
    ) {
      return replyError(
        interaction,
        `:x: | 你必須跟我進入同一個頻道 <#${botVoiceChannel.id}> 才能控制我！`,
      );
    }

    const ownerId =
      control.ownerId ?? (await getActiveControllerOwner(guildId));
    if (ownerId && ownerId !== interaction.user.id) {
      return replyError(interaction, CONTROLLER_DENIED_MESSAGE);
    }

    if (control.action === "details") {
      const event = await broker.getCurrentTrack(guildId);
      if (!event)
        return replyError(interaction, ":x: | 找不到目前的歌曲資訊。");

      return interaction
        .followUp({
          embeds: [buildDetailsEmbed(event)],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
    }

    const optimisticUpdate = shouldOptimisticallyUpdateController(
      control.action,
    )
      ? optimisticallyUpdateControllerMessage(interaction, control.action)
      : Promise.resolve();

    await broker.publishCommand(guildId, control.action, {
      text_channel_id: channelId,
    });
    await optimisticUpdate;
  } catch (error) {
    console.error(`[Button] Critical error:`, error);
  }
};

function buildDetailsEmbed(event) {
  return new EmbedBuilder()
    .setTitle(":information_source: | 歌曲詳情")
    .setDescription(
      `**[${event.title ?? "未知標題"}](${event.source_url ?? event.url})**`,
    )
    .setColor(0x5865f2)
    .setThumbnail(event.thumbnail ?? null)
    .addFields(
      {
        name: ":busts_in_silhouette: | 發佈者",
        value: event.uploader ?? "未知",
        inline: true,
      },
      {
        name: ":clock230: | 時長",
        value: event.duration ? formatDuration(event.duration) : "LIVE",
        inline: true,
      },
      {
        name: ":calendar: | 上傳日期",
        value: formatUploadDate(event.upload_date) ?? "未知",
        inline: true,
      },
      {
        name: ":eyes: | 觀看次數",
        value: event.view_count?.toLocaleString() ?? "未知",
        inline: true,
      },
      {
        name: ":thumbsup: | 點讚數量",
        value: event.like_count?.toLocaleString() ?? "未知",
        inline: true,
      },
    );
}

function parseMusicControl(customId) {
  if (customId.startsWith("MusicButtonControl")) {
    const action = customId.replace("MusicButtonControl", "").toLowerCase();
    // loopnormal / loopagain / looploop 全都對應 "loop" 動作。谢谢 AC0xRPFS001 :>
    return {
      action: action.startsWith("loop") ? "loop" : action,
      ownerId: null,
    };
  }

  if (customId.startsWith("music:")) {
    const [, action, ownerId] = customId.split(":");
    return { action, ownerId: ownerId || null };
  }

  if (customId.startsWith("music_")) {
    return { action: customId.replace("music_", ""), ownerId: null };
  }

  return null;
}

function shouldOptimisticallyUpdateController(action) {
  return action === "pause" || action === "resume" || action === "loop";
}

async function optimisticallyUpdateControllerMessage(interaction, action) {
  const components = interaction.message?.components?.map((c) => c.toJSON());
  if (!components?.length) return;

  await interaction.message
    .edit({
      components: applyOptimisticControllerState(components, action),
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => null);
}

function applyOptimisticControllerState(components, action) {
  const nextLoopLabel = {
    關閉: "重播一次",
    重播一次: "單曲循環",
    單曲循環: "關閉",
  };

  const visit = (component) => {
    if (!component || typeof component !== "object") return component;
    if (Array.isArray(component.components))
      component.components = component.components.map(visit);
    if (typeof component.content === "string")
      component.content = updateOptimisticContent(component.content, action);

    const id = component.custom_id;
    if (id === "MusicButtonControlPause" && action === "pause") {
      Object.assign(component, {
        custom_id: "MusicButtonControlResume",
        label: "繼續",
        style: 3,
      });
    } else if (id === "MusicButtonControlResume" && action === "resume") {
      Object.assign(component, {
        custom_id: "MusicButtonControlPause",
        label: "暫停",
        style: 1,
      });
    } else if (id === "MusicButtonControlLoop" && action === "loop") {
      const current = `${component.label}`.split("：").pop()?.trim();
      component.label = `循環：${nextLoopLabel[current] ?? "關閉"}`;
    }

    return component;
  };

  return components.map(visit);
}

function updateOptimisticContent(content, action) {
  if (action === "pause") {
    return content
      .replace("### :notes: 正在播放：", "### :pause_button: 目前暫停：")
      .replace("**狀態**：播放中", "**狀態**：暫停");
  }
  if (action === "resume") {
    return content
      .replace("### :pause_button: 目前暫停：", "### :notes: 正在播放：")
      .replace("**狀態**：暫停", "**狀態**：播放中");
  }
  if (action === "loop") {
    const nextLoopLabel = {
      關閉: "重播一次",
      重播一次: "單曲循環",
      單曲循環: "關閉",
    };
    return content.replace(/\*\*循環\*\*：[^・\n]+/, (match) => {
      const current = match.split("：").pop()?.trim();
      return `**循環**：${nextLoopLabel[current] ?? "關閉"}`;
    });
  }
  return content;
}

