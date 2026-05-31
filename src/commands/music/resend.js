import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const resendCommand = {
  name: "resend",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("resend")
    .setDescription("重新發送音樂遙控器"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;
    await interaction.deferReply({ ephemeral: true });

    const session = context.guildPlayerManager.getSession(interaction.guildId);
    if (!session?.currentTrack) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: "音樂中心",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setDescription(":notepad_spiral: | 列隊裏沒有任何歌曲。")
            .setColor(0xa855f7)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
      });
    }

    try {
      await context.guildPlayerManager.dispatch({
        guild_id: interaction.guildId,
        action: "resend_ui",
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        content: ":arrows_counterclockwise: | 已重新發送遙控器。",
      });
    } catch (err) {
      console.error("[Command] Resend error:", err);
      await interaction.editReply({
        content: ":x: | 執行時發生錯誤，請稍後再試。",
      });
    }
  },
};
