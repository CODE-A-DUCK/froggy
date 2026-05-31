import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const stopCommand = {
  name: "stop",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("停止播放並清空隊列"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction);
    if (!validation) return;
    await interaction.deferReply();
    const { guild } = validation;

    const session = context.guildPlayerManager.getSession(guild.id);
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
        guild_id: guild.id,
        action: "stop",
        text_channel_id: interaction.channelId,
        controller_user_id: interaction.user.id,
      });
      context.controllerStore.clearOwner(guild.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: "音樂中心",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setDescription(":octagonal_sign: | 我已停止播放並清空隊列。")
            .setColor(0xef4444)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[Command] Stop error:", err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: "音樂中心",
              iconURL: interaction.client.user.displayAvatarURL(),
            })
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
