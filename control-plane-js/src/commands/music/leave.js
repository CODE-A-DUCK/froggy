import { SlashCommandBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const leaveCommand = {
  name: "leave",
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("讓 Froggy 離開語音頻道"),
  async execute(interaction) {
    await interaction.deferReply();
    const validation = await validateVoiceState(interaction, {
      requireSameVC: true,
    });
    if (!validation) return;

    const { guild, botVoiceChannel } = validation;

    try {
      guild.shard.send({
        op: 4,
        d: {
          guild_id: guild.id,
          channel_id: null,
          self_mute: false,
          self_deaf: false,
        },
      });

      await broker.clearControllerOwner(guild.id);
      await interaction.editReply({
        content: `:wave: | 我已離開語音頻道：\`${botVoiceChannel.name}\``,
      });
    } catch (error) {
      console.error("[Command] Leave error:", error);
      await interaction.editReply({
        content: `:x: | 發生錯誤：${error.message}`,
      });
    }
  },
};
