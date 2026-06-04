import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const joinCommand = {
  name: "join",
  category: `${EMOJIS.music2line} | 音樂`,
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("讓我加入你的語音頻道"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;
    await interaction.deferReply();
    const { guild, userVoiceChannel } = validation;
    try {
      await context.guildPlayerManager.dispatch({
        guild_id: guild.id,
        action: "join",
        channel_id: userVoiceChannel.id,
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.headphoneline} | 我已加入語音頻道：\`${userVoiceChannel.name}\``,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    } catch (err) {
      console.error("[Command] Join error:", err);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  },
};
