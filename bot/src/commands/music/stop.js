import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const stopCommand = {
  name: "stop",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("停止播放並清空隊列"),
  async execute(interaction) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    await interaction.deferReply();

    const { guild } = validation;

    try {
      await broker.publishCommand(guild.id, "stop", {
        text_channel_id: interaction.channelId,
      });
      await broker.clearControllerOwner(guild.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":octagonal_sign: | 我已停止播放並清空隊列。")
            .setColor(0xed4245)
        ],
      });
    } catch (error) {
      console.error("[Command] Stop error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }
  },
};
