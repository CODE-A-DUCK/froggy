import { ChatInputCommandInteraction } from "discord.js";

import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { replyWithState } from "../../utils/reply.js";

export async function executeLeave(interaction: ChatInputCommandInteraction, context: any) {
  const validation = await validateVoiceState(interaction, { requireSameVC: true, requireController: true });
  if (!validation) return;
  const { guild, botVoiceChannel } = validation;
  const { voiceGateway } = context;

  try {
    const player = voiceGateway.getPlayer(guild.id);
    if (player) {
      await player.stopPlaying(true).catch(() => null);
    }
    await voiceGateway.disconnectFromChannel(guild.id);
    await replyWithState(interaction, "success", `${EMOJIS.logoutcircleline} | 我已離開語音頻道：\`${botVoiceChannel?.name ?? "語音頻道"}\``);
  } catch (err) {
    console.error("[Command] Leave error:", err);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`);
  }
}
