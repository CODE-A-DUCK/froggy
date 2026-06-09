import { ChatInputCommandInteraction } from "discord.js";

import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { replyWithState } from "../../utils/reply.js";

export async function executeController(interaction: ChatInputCommandInteraction, context: any) {
  const validation = await validateVoiceState(interaction, { requireController: false });
  if (!validation) return;

  const currentTrack = context.controllerStore.getCurrentTrack(interaction.guildId);
  if (!currentTrack) {
    return replyWithState(interaction, "info", `${EMOJIS.playlistline} | 列隊裏沒有任何歌曲。`);
  }

  try {
    const player = context.voiceGateway.getPlayer(interaction.guildId);
    if (player) {
      player.textChannelId = interaction.channelId;
      player.interactionToken = null;
      context.voiceGateway.emit("trackStart", player, player.currentTrack);
    }
    await replyWithState(interaction, "success", `${EMOJIS.remotecontrol2line} | 已重新發送遙控器。`);
  } catch {
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`);
  }
}
