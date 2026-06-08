import { ChatInputCommandInteraction } from "discord.js";

import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { replyWithState } from "../../utils/reply.js";

export async function executeSkip(interaction: ChatInputCommandInteraction, context: any) {
  const validation = await validateVoiceState(interaction, { requireController: true });
  if (!validation) return;

  const player = context.voiceGateway.getPlayer(interaction.guildId!);
  if (!player || (!player.currentTrack && player.queue.length === 0)) {
    return replyWithState(interaction, "info", `${EMOJIS.playlistline} | 隊列裏沒有任何歌曲。`);
  }

  try {
    if (player) {
      player.textChannelId = interaction.channelId;
      player.controllerUserId = interaction.user.id;
      player.interactionToken = interaction.token;
      await player.stopTrack();
    }
    await replyWithState(interaction, "success", `${EMOJIS.skipforwardline} | 已跳過歌曲。`);
  } catch (err) {
    console.error("[Command] Skip error:", err);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`);
  }
}
