import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const resendCommand = {
  name: "resend",
  data: new SlashCommandBuilder()
    .setName("resend")
    .setDescription("重新傳送音樂遙控器"),
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const validation = await validateVoiceState(interaction, {
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

    const { guild } = validation;

    try {
      await broker.publishCommand(guild.id, "resend_ui", {
        interaction_token: interaction.token,
        text_channel_id: interaction.channelId,
      });

      await interaction.editReply({
        content: ":white_check_mark: | 正在爲你重新傳送遙控器...",
      });
    } catch (error) {
      console.error("[Command] Resend error:", error);
      await interaction.editReply({
        content: `:x: | 發生錯誤：${error.message}`,
      });
    }
  },
};
