import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const joinCommand = {
  name: "join",
  category: `${EMOJIS.music2line} | 音樂`,
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("讓我加入你的語音頻道"),
  async execute(interaction: ChatInputCommandInteraction, context: any) {
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;
    const { guild, userVoiceChannel } = validation;
    try {
      await context.voiceGateway.connectToChannel(guild.id, userVoiceChannel.id);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.headphoneline} | 我已加入語音頻道：\`${userVoiceChannel.name}\``,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    } catch (err) {
      console.error("[Command] Join error:", err);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }
  },
};
