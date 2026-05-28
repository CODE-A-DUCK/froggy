import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const joinCommand = {
  name: "join",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("讓 Froggy 加入你的語音頻道"),
  async execute(interaction) {
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

    await interaction.deferReply();

    const { guild, userVoiceChannel } = validation;

    try {
      guild.shard.send({
        op: 4,
        d: {
          guild_id: guild.id,
          channel_id: userVoiceChannel.id,
          self_mute: false,
          self_deaf: false,
        },
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:white_check_mark: | 我已加入語音頻道：\`${userVoiceChannel.name}\``,
            )
            .setColor(0x5865f2),
        ],
      });
    } catch (error) {
      console.error("[Command] Join error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }
  },
};
