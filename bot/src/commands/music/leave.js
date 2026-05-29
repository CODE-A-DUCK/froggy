import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const leaveCommand = {
  name: "leave",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("讓 Froggy 離開語音頻道"),
  async execute(interaction) {
    const validation = await validateVoiceState(interaction, {
      requireSameVC: true,
    });
    if (!validation) return;

    await interaction.deferReply();

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
      const controllerMsgId = await broker.getControllerMessageId(guild.id);
      if (controllerMsgId) {
        const currentTrack = await broker.getCurrentTrack(guild.id);
        const channelId = currentTrack?.text_channel_id ?? interaction.channelId;

        try {
          const ch = await guild.channels.fetch(channelId).catch(() => null);
          if (ch?.isTextBased()) {
            const msg = await ch.messages.fetch(controllerMsgId).catch(() => null);
            await msg?.delete().catch(() => null);
          }
        } catch {
        } finally {
          await broker.clearControllerMessageId(guild.id).catch(() => null);
        }
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`:wave: | 我已離開語音頻道：\`${botVoiceChannel.name}\``)
            .setColor(0x5865f2),
        ],
      });
    } catch (error) {
      console.error("[Command] Leave error:", error);
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
