import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const leaveCommand = {
  name: "leave",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("讓 Froggy 離開語音頻道"),
  async execute(interaction, context) {
    const validation = await validateVoiceState(interaction, {
      requireSameVC: true,
    });
    if (!validation) return;
    await interaction.deferReply();
    const { guild, botVoiceChannel } = validation;
    const { guildPlayerManager, controllerStore: cs } = context;
    try {
      await guildPlayerManager.dispatch({
        guild_id: guild.id,
        action: "leave",
      });
      cs.clearOwner(guild.id);

      const msgId = cs.getMessageId(guild.id);
      if (msgId) {
        const track = guildPlayerManager.getSession(guild.id)?.currentTrack;
        const chId = track?.text_channel_id ?? interaction.channelId;
        const ch = await guild.channels.fetch(chId).catch(() => null);
        const msg = await ch?.messages.fetch(msgId).catch(() => null);
        await msg?.delete().catch(() => null);
        cs.clearMessageId(guild.id);
      }
      cs.clearCurrentTrack(guild.id);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:wave: | 我已離開語音頻道：\`${botVoiceChannel.name}\``,
            )
            .setColor(0x22c55e),
        ],
      });
    } catch (err) {
      console.error("[Command] Leave error:", err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xef4444),
        ],
      });
    }
  },
};
