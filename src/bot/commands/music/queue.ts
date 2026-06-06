import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const queueCommand = {
  name: "queue",
  category: `${EMOJIS.music2line} | 音樂`,
  defer: false,
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("查看當前播放隊列，移除歌曲"),
  async execute(interaction: ChatInputCommandInteraction, context: any) {
    try {
      const { current, queue } = await context.guildPlayerManager.getQueue(
        interaction.guildId!,
      );

      if (!current && queue.length === 0) {
        return interaction.reply({
          components: [
            ContainerFactory.buildReply(
              "info",
              `${EMOJIS.playlistline} | 隊列是空的。`,
              interaction.user as any,
            ),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        });
      }

      if (queue.length === 0) {
        return interaction.reply({
          components: [
            ContainerFactory.buildReply(
              "info",
              `${EMOJIS.music2line} | 正在播放：**${current.title}**\n\n${EMOJIS.playlistline} | 隊列中沒有其他歌曲。`,
              interaction.user as any,
            ),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
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
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
      });
    }
  },
};
