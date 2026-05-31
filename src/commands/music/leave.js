import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { validateVoiceState } from "../../utils/voiceGuard.js";
import { ContainerFactory } from "../../ui/music/ContainerFactory.js";

export const leaveCommand = {
  name: "leave",
  category: ":notes: | 音樂",
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("讓我離開語音頻道"),
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
        components: [
          ContainerFactory.buildReply(
            "success",
            `<:logoutcircleline:1510533877545041980> | 我已離開語音頻道：\`${botVoiceChannel.name}\``,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    } catch (err) {
      console.error("[Command] Leave error:", err);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "error",
            "<:errorwarningline:1510533865805058188> | 執行時發生錯誤，請稍後再試。",
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  },
};
