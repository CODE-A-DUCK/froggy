import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";

export const skipCommand = {
  name: "skip",
  category: ":notes: | 音樂",
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
        components: [
          ContainerFactory.buildReply(
            "info",
            "<:playlistline:1510533890257977457> | 列隊裏沒有任何歌曲。",
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    try {
      await context.guildPlayerManager.dispatch({
        guild_id: interaction.guildId,
        action: "skip",
      });
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            "<:skipforwardline:1510533902119473232> | 已跳過當前歌曲。",
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    } catch (err) {
      console.error("[Command] Skip error:", err);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "error",
            "<:errorwarningline:1510533865805058188> | 執行時發生錯誤，請稍後再試。",
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  },
};
