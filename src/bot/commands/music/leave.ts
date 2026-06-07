import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const leaveCommand = {
  name: "leave",
  category: `${EMOJIS.music2line} | 音樂`,
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("讓我離開語音頻道"),
  async execute(interaction: ChatInputCommandInteraction, context: any) {
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

      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.logoutcircleline} | 我已離開語音頻道：\`${botVoiceChannel?.name ?? "語音頻道"}\``,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    } catch (err) {
      console.error("[Command] Leave error:", err);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply("error", `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`, interaction.user as any),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }
  },
};
