import { Events, MessageFlags, EmbedBuilder } from "discord.js";
import { handleInteraction } from "../commands/index.js";
import { controllerStore } from "../store/ControllerStore.js";
import { CONTROLLER_DENIED_MESSAGE } from "../utilities/voiceGuard.js";
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
        await handleButtonInteraction(interaction, context);
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
        new EmbedBuilder().setDescription(description).setColor(0xef4444),
      ],
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => null);

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
        ":x: | 我目前不在語音頻道中，無法執行此操作。",
      );

    if (!member.voice.channel || member.voice.channel.id !== botVoiceChannel.id)
      return replyError(
        interaction,
        `:x: | 你必須跟我進入同一個頻道 <#${botVoiceChannel.id}> 才能控制我！`,
      );

    const ownerId = control.ownerId ?? controllerStore.getOwner(guildId);
    if (ownerId && ownerId !== interaction.user.id)
      return replyError(interaction, CONTROLLER_DENIED_MESSAGE);

    if (control.action === "details") {
      const track = controllerStore.getCurrentTrack(guildId);
      if (!track)
        return replyError(interaction, ":x: | 找不到目前的歌曲資訊。");
      return interaction
        .followUp({
          embeds: [buildDetailsEmbed(track)],
          flags: MessageFlags.Ephemeral,
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
    console.error(`[Button] Critical error:`, error);
  }
};

function buildDetailsEmbed(event) {
  return new EmbedBuilder()
    .setTitle(":information_source: | 歌曲詳情")
    .setDescription(
      `**[${event.title ?? "未知標題"}](${event.source_url ?? event.url})**`,
    )
    .setColor(0xf59e0b)
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

function shouldOptimisticallyUpdate(action) {
  return action === "pause" || action === "resume" || action === "loop";
}

async function optimisticallyUpdateController(interaction, action) {
  const components = interaction.message?.components?.map((c) => c.toJSON());
  if (!components?.length) return;
  await interaction.message
    .edit({
      components: applyOptimisticState(components, action),
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => null);
}

function applyOptimisticState(components, action) {
  const nextLoopLabel = {
    關閉: "重播一次",
    重播一次: "單曲循環",
    單曲循環: "關閉",
  };

  const visit = (c) => {
    if (!c || typeof c !== "object") return c;
    if (Array.isArray(c.components)) c.components = c.components.map(visit);
    if (typeof c.content === "string")
      c.content = updateContent(c.content, action);
    const id = c.custom_id;
    if (id === "MusicButtonControlPause" && action === "pause")
      Object.assign(c, {
        custom_id: "MusicButtonControlResume",
        label: "繼續",
        style: 3,
      });
    else if (id === "MusicButtonControlResume" && action === "resume")
      Object.assign(c, {
        custom_id: "MusicButtonControlPause",
        label: "暫停",
        style: 1,
      });
    else if (id === "MusicButtonControlLoop" && action === "loop") {
      const current = `${c.label}`.split("：").pop()?.trim();
      c.label = `循環：${nextLoopLabel[current] ?? "關閉"}`;
    }
    return c;
  };
  return components.map(visit);
}

function updateContent(content, action) {
  if (action === "pause")
    return content
      .replace("### :notes: 正在播放：", "### :pause_button: 目前暫停：")
      .replace("**狀態**：播放中", "**狀態**：暫停");
  if (action === "resume")
    return content
      .replace("### :pause_button: 目前暫停：", "### :notes: 正在播放：")
      .replace("**狀態**：暫停", "**狀態**：播放中");
  if (action === "loop") {
    const nextLoopLabel = {
      關閉: "重播一次",
      重播一次: "單曲循環",
      單曲循環: "關閉",
    };
    return content.replace(/\*\*循環\*\*：[^・\n]+/, (m) => {
      const current = m.split("：").pop()?.trim();
      return `**循環**：${nextLoopLabel[current] ?? "關閉"}`;
    });
  }
  return content;
}
