import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const skipCommand = {
  name: "skip",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("跳過當前歌曲"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;
    await interaction.deferReply();

    const session = context.guildPlayerManager.getSession(interaction.guildId);
    if (!session?.currentTrack) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":notepad_spiral: | 列隊裏沒有任何歌曲。")
            .setColor(0xa855f7),
        ],
      });
    }

    try {
      await context.guildPlayerManager.dispatch({
        guild_id: interaction.guildId,
        action: "skip",
      });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":fast_forward: | 已跳過當前歌曲。")
            .setColor(0x22c55e),
        ],
      });
    } catch (err) {
      console.error("[Command] Skip error:", err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xef4444),
        ],
      });
    }
  },
};
