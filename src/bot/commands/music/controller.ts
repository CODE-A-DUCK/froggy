import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const controllerCommand = {
  name: "controller",
  category: `${EMOJIS.music2line} | 音樂`,
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName("controller")
    .setDescription("把遙控器找回來"),
  async execute(interaction: ChatInputCommandInteraction, context: any) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    const session = context.guildPlayerManager.getSession(interaction.guildId);
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
        guild_id: interaction.guildId,
        action: "refresh_controller",
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.remotecontrol2line} | 已重新發送遙控器。`,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    } catch (err) {
      console.error("[Command] Controller error:", err);
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
