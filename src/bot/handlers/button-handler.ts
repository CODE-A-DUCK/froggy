import { EmbedBuilder, MessageFlags, ButtonInteraction } from "discord.js";
import { shouldOptimisticallyUpdate, optimisticallyUpdateController } from "../../player/ui/controller-sync.js";
import { formatDuration } from "../../player/utils/format-duration.js";
import { formatUploadDate } from "../../player/utils/format-upload-date.js";
import { CONTROLLER_DENIED_MESSAGE } from "../../player/utils/voice-guard.js";
import { EMOJIS } from "../../shared/emojis.js";
import { controllerStore } from "../store/controller-store.js";

const replyError = (interaction: ButtonInteraction, description: string) =>
  interaction
    .followUp({
      embeds: [new EmbedBuilder().setDescription(description).setColor(0xe9152d)],
      flags: [MessageFlags.Ephemeral],
    })
    .catch(() => null);

function buildDetailsEmbed(event: any) {
  return new EmbedBuilder()
    .setTitle("歌曲詳情")
    .setDescription(`**[${event.title ?? "未知標題"}](${event.source_url ?? event.url})**`)
    .setColor(0xa16b00)
    .setThumbnail(event.thumbnail ?? null)
    .addFields(
      {
        name: `${EMOJIS.userline} | 發佈者`,
        value: event.uploader ?? "未知",
        inline: true,
      },
      {
        name: `${EMOJIS.timeline} | 時長`,
        value: event.duration ? formatDuration(event.duration) : "LIVE",
        inline: true,
      },
      {
        name: `${EMOJIS.calendarline} | 上傳日期`,
        value: formatUploadDate(event.upload_date) ?? "未知",
        inline: true,
      },
      {
        name: `${EMOJIS.eyeline} | 觀看次數`,
        value: event.view_count?.toLocaleString() ?? "未知",
        inline: true,
      },
      {
        name: `${EMOJIS.thumbupline} | 點讚數量`,
        value: event.like_count?.toLocaleString() ?? "未知",
        inline: true,
      },
    );
}

function parseMusicControl(customId: string) {
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

export const handleButtonInteraction = async (interaction: ButtonInteraction, context: any) => {
  try {
    if (!interaction.inCachedGuild()) return false;

    const { guildId, member, channelId } = interaction;

    const control = parseMusicControl(interaction.customId);
    if (!control?.action) return false;

    await interaction.deferUpdate().catch(() => null);

    const VALID_BUTTON_ACTIONS = new Set([
      "stop",
      "skip",
      "pause",
      "resume",
      "loop",
      "details",
      "refresh_controller",
    ]);
    if (!VALID_BUTTON_ACTIONS.has(control.action)) return false;

    if (control.action === "details") {
      const track = controllerStore.getCurrentTrack(guildId);
      if (!track) {
        replyError(interaction, `${EMOJIS.errorwarningline} | 找不到目前的歌曲資訊。`);
        return true;
      }
      interaction
        .followUp({
          embeds: [buildDetailsEmbed(track)],
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => null);
      return true;
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const botVoiceChannel = botMember?.voice.channel;

    if (!botVoiceChannel) {
      replyError(interaction, `${EMOJIS.errorwarningline} | 我目前不在語音頻道中，無法執行此操作。`);
      return true;
    }

    if (!member.voice.channel || member.voice.channel.id !== botVoiceChannel.id) {
      replyError(
        interaction,
        `${EMOJIS.errorwarningline} | 你必須跟我進入同一個頻道 <#${botVoiceChannel.id}> 才能控制我！`,
      );
      return true;
    }

    const hasOwners = controllerStore.getOwners(guildId).size > 0;
    if (hasOwners && !controllerStore.isOwner(guildId, interaction.user.id)) {
      replyError(interaction, CONTROLLER_DENIED_MESSAGE);
      return true;
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
    return true;
  } catch (error) {
    console.error("[Button] Critical error:", error);
    return true;
  }
};
