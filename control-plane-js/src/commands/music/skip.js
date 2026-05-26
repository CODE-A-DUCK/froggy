import { SlashCommandBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const skipCommand = {
  name: "skip",
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("跳過當前歌曲"),
  async execute(interaction) {
    await interaction.deferReply();
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    const { guild } = validation;

    try {
      await broker.publishCommand(guild.id, "skip", {
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        content: ":track_next: | 我已跳過當前歌曲。",
      });
    } catch (error) {
      console.error("[Command] Skip error:", error);
      await interaction.editReply({
        content: `:x: | 發生錯誤：${error.message}`,
      });
    }
  },
};
