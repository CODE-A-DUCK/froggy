import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const resendCommand = {
  name: "resend",
  category: ":notes: | 音樂",
  data: new SlashCommandBuilder()
    .setName("resend")
    .setDescription("重新發送音樂遙控器"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const session = context.guildPlayerManager.getSession(interaction.guildId);
    if (!session?.currentTrack) {
      return interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "info",
            `${EMOJIS.playlistline} | 列隊裏沒有任何歌曲。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    try {
      await context.guildPlayerManager.dispatch({
        guild_id: interaction.guildId,
        action: "resend_ui",
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.remotecontrol2line} | 已重新發送遙控器。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    } catch (err) {
      console.error("[Command] Resend error:", err);
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
