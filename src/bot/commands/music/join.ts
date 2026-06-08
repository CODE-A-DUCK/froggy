import { ChatInputCommandInteraction } from "discord.js";

import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { replyWithState } from "../../utils/reply.js";

export async function executeJoin(interaction: ChatInputCommandInteraction, context: any) {
  const validation = await validateVoiceState(interaction, {
    requireBotInVC: false,
    requireSameVC: false,
    requireController: false,
  });
  if (!validation) return;
  const { guild, userVoiceChannel } = validation;
  try {
    await context.voiceGateway.connectToChannel(guild.id, userVoiceChannel.id);
    await replyWithState(interaction, "success", `${EMOJIS.headphoneline} | 我已加入語音頻道：\`${userVoiceChannel.name}\``);
  } catch (err) {
    console.error("[Command] Join error:", err);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`);
  }
}
