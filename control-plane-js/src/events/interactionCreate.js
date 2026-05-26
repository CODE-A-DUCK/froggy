import { Events, MessageFlags } from "discord.js";
import { handleInteraction } from "../commands/index.js";
import { broker } from "../broker.js";
import {
  CONTROLLER_DENIED_MESSAGE,
  getActiveControllerOwner,
} from "../controllerAccess.js";

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
const handleButtonInteraction = async (interaction) => {
  try {
    const { customId, guildId, member, channelId } = interaction;
    const control = parseMusicControl(customId);
    if (!control?.action) return;

    // 1. Immediately acknowledge the interaction to prevent "Unknown interaction" (10062) timeouts
    await interaction.deferUpdate().catch(() => null);

    const guild = interaction.guild;
    const botMember = await guild.members.fetch(interaction.client.user.id).catch(() => null);
    if (!botMember) return;
    
    const botVoiceChannel = botMember.voice.channel;

    // 機器人是否同一個 vc
    if (!botVoiceChannel) {
      return interaction.followUp({
        content: ":x: | 我目前不在語音頻道中，無法執行此操作。",
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    // 用戶是否同一個 vc
    const userVoiceChannel = member.voice.channel;
    if (!userVoiceChannel || userVoiceChannel.id !== botVoiceChannel.id) {
      return interaction.followUp({
        content: `:x: | 你必須跟我進入同一個頻道 <#${botVoiceChannel.id}> 才能控制我！`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    // 遙控器是否空閒
    const ownerId = control.ownerId ?? (await getActiveControllerOwner(guildId));
    if (ownerId && ownerId !== interaction.user.id) {
      return interaction.followUp({
        content: CONTROLLER_DENIED_MESSAGE,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    if (control.action === "details") {
      const currentData = await broker.publisher.get(`music:current:${guildId}`);
      if (currentData) {
        const event = JSON.parse(currentData);
        const details = 
          `**👤 作者:** ${event.uploader || "未知"}\n` +
          `**🕒 時長:** ${event.duration ? Math.floor(event.duration / 60) + ":" + String(event.duration % 60).padStart(2, "0") : "LIVE"}\n` +
          `**📅 上傳日期:** ${event.upload_date || "未知"}\n` +
          `**👁️ 觀看次數:** ${event.view_count?.toLocaleString() ?? "未知"}\n` +
          `**👍 點讚數量:** ${event.like_count?.toLocaleString() ?? "未知"}`;
        
        return interaction.followUp({
          content: `### :information_source: 歌曲詳情\n${details}`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      } else {
        return interaction.followUp({
          content: ":x: | 找不到目前的歌曲資訊。",
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }

    await broker.publishCommand(guildId, control.action, {
      text_channel_id: channelId,
    });
  } catch (error) {
    console.error(`[Button] Critical error:`, error);
  }
};

function parseMusicControl(customId) {
  if (customId.startsWith("MusicButtonControl")) {
    const action = customId.replace("MusicButtonControl", "").toLowerCase();
    
    // Map specific actions if needed
    if (action === "loopnormal" || action === "loopagain" || action === "looploop") {
      return { action: "loop", ownerId: null };
    }
    
    return {
      action: action,
      ownerId: null,
    };
  }

  if (customId.startsWith("music:")) {
    const [, action, ownerId] = customId.split(":");
    return {
      action,
      ownerId: ownerId || null,
    };
  }

  if (customId.startsWith("music_")) {
    return {
      action: customId.replace("music_", ""),
      ownerId: null,
    };
  }

  return null;
}
