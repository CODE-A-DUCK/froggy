import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const skipCommand = {
  name: "skip",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("跳過當前歌曲"),
  async execute(interaction) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    await interaction.deferReply();

    const { guild } = validation;

    try {
      await broker.publishCommand(guild.id, "skip", {
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":track_next: | 我已跳過當前歌曲。")
            .setColor(0x5865f2)
        ],
      });
    } catch (error) {
      console.error("[Command] Skip error:", error);
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
