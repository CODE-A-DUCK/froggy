import { SlashCommandBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const stopCommand = {
  name: "stop",
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("停止播放並清空隊列"),
  async execute(interaction) {
    await interaction.deferReply();
    const validation = await validateVoiceState(interaction);
    if (!validation) return;

    const { guild } = validation;

    try {
      await broker.publishCommand(guild.id, "stop", {
        text_channel_id: interaction.channelId,
      });
      await broker.clearControllerOwner(guild.id);
      await interaction.editReply({
        content: ":octagonal_sign: | 我已停止播放並清空隊列。",
      });
    } catch (error) {
      console.error("[Command] Stop error:", error);
      await interaction.editReply({
        content: `:x: | 發生錯誤：${error.message}`,
      });
    }
  },
};
