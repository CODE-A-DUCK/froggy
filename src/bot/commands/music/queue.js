import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const queueCommand = {
  name: "queue",
  category: ":notes: | 音樂",
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("查看當前播放隊列，移除歌曲"),
  async execute(interaction, context) {
    try {
      const { current, queue } = await context.guildPlayerManager.getQueue(
        interaction.guildId,
      );

      if (!current && queue.length === 0) {
        return interaction.reply({
          components: [
            ContainerFactory.buildReply(
              "info",
              `${EMOJIS.playlistline} | 隊列是空的。`,
              interaction.user,
            ),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        });
      }

      if (queue.length === 0) {
        return interaction.reply({
          components: [
            ContainerFactory.buildReply(
              "info",
              `${EMOJIS.music2line} | 正在播放：**${current.title}**\n\n${EMOJIS.playlistline} | 隊列中沒有其他歌曲。`,
              interaction.user,
            ),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        });
      }

      const modal = ContainerFactory.buildRemoveQueueModal(queue);
      await interaction.showModal(modal);
    } catch (err) {
      console.error("[Command] Queue error:", err);
      await interaction.reply({
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      });
    }
  },
};
