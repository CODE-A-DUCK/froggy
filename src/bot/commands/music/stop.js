import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const stopCommand = {
  name: "stop",
  category: ":notes: | 音樂",
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
        components: [
          ContainerFactory.buildReply(
            "info",
            `${EMOJIS.playlistline} | 列隊裏沒有任何歌曲。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    try {
      await context.guildPlayerManager.dispatch({
        guild_id: guild.id,
        action: "stop",
        text_channel_id: interaction.channelId,
        controller_user_id: interaction.user.id,
        interaction_token: interaction.token,
      });
      context.controllerStore.clearOwner(guild.id);
    } catch (err) {
      console.error("[Command] Stop error:", err);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  },
};
