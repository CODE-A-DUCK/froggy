import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const resendCommand = {
  name: "resend",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("resend")
    .setDescription("重新傳送音樂遙控器"),
  async execute(interaction) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    const { guild } = validation;
    const currentTrack = await broker.getCurrentTrack(guild.id);
    if (!currentTrack) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 目前沒有正在播放的歌曲，無法重新傳送遙控器。")
            .setColor(0xed4245)
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await broker.publishCommand(guild.id, "resend_ui", {
        text_channel_id: interaction.channelId,
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":white_check_mark: | 正在爲你重新傳送遙控器...")
            .setColor(0x5865f2)
        ],
      });
    } catch (error) {
      console.error("[Command] Resend error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xed4245)
        ],
      });
    }
  },
};
