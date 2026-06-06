import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const skipCommand = {
  name: "skip",
  category: `${EMOJIS.music2line} | 音樂`,
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("跳過當前歌曲"),
  async execute(interaction: ChatInputCommandInteraction, context: any) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    const session = context.guildPlayerManager.getSession(interaction.guildId!);
    if (!session?.currentTrack) {
      return interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "info",
            `${EMOJIS.playlistline} | 列隊裏沒有任何歌曲。`,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }

    try {
      await context.guildPlayerManager.dispatch({
        guild_id: interaction.guildId!,
        action: "skip",
      });
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.skipforwardline} | 已跳過當前歌曲。`,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    } catch (err) {
      console.error("[Command] Skip error:", err);
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
