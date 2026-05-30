import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const joinCommand = {
  name: "join",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("讓 Froggy 加入你的語音頻道"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;
    await interaction.deferReply();
    const { guild, userVoiceChannel } = validation;
    try {
      await context.guildPlayerManager.dispatch({
        guild_id: guild.id,
        action: "join",
        channel_id: userVoiceChannel.id,
        text_channel_id: interaction.channelId,
      });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:white_check_mark: | 我已加入語音頻道：\`${userVoiceChannel.name}\``,
            )
            .setColor(0x22c55e)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[Command] Join error:", err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xef4444)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
      });
    }
  },
};
