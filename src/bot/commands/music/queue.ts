import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

export const queueCommand = {
  name: "queue",
  category: `${EMOJIS.music2line} | 音樂`,
  defer: false,
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("查看當前播放隊列，移除歌曲"),
  async execute(interaction: ChatInputCommandInteraction, context: any) {
    const validation = await validateVoiceState(interaction, { requireController: false });
    if (!validation) return;

    try {
      const stateRes = await context.ipcClient.sendRequest("SYNC_STATE", { guild_id: interaction.guildId }).catch(() => null);
      const current = stateRes?.track ?? null;
      const queue = stateRes?.queue ?? [];

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
        }).catch(() => null);
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
        }).catch(() => null);
      }

      const owners = context.controllerStore.getOwners(interaction.guildId);
      const isOwner = owners.size === 0 || owners.has(interaction.user.id);

      if (isOwner) {
        const modal = ContainerFactory.buildRemoveQueueModal(queue);
        await interaction.showModal(modal).catch(() => null);
      } else {
        const songList = queue.slice(0, 10).map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
        return interaction.reply({
          components: [
            ContainerFactory.buildSimpleMessage(
              "播放隊列",
              `${EMOJIS.music2line} | 正在播放：**${current.title}**\n\n${songList}${queue.length > 10 ? `\n...以及其他 ${queue.length - 10} 首` : ""}`,
              interaction.user as any,
            ),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        }).catch(() => null);
      }
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
      }).catch(() => null);
    }
  },
};
