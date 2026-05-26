import { SlashCommandBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const joinCommand = {
  name: "join",
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("讓 Froggy 加入你的語音頻道"),
  async execute(interaction) {
    await interaction.deferReply();
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

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
        content: `:white_check_mark: | 我已加入語音頻道：\`${userVoiceChannel.name}\``,
      });
    } catch (error) {
      console.error("[Command] Join error:", error);
      await interaction.editReply({
        content: `:x: | 發生錯誤：${error.message}`,
      });
    }
  },
};
