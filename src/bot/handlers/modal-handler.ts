import { MessageFlags, ModalSubmitInteraction } from "discord.js";

import { ContainerFactory } from "../../player/ui/container-factory.js";
import { EMOJIS } from "../../shared/emojis.js";

export const handleModalInteraction = async (interaction: ModalSubmitInteraction, context: any) => {

  if (interaction.customId === "MusicQueueRemoveModal") {
    const selectedValues = interaction.fields.getCheckboxGroup("MusicQueueRemoveCheckboxes");
    const selectedIndices = [
      ...new Set(
        selectedValues
          .map((v: string) => parseInt(v, 10))
          .filter((v: number) => Number.isInteger(v)),
      ),
    ];

    if (selectedIndices.length === 0) {
      return interaction.reply({
        components: [
          ContainerFactory.buildReply(
            "warning",
            `${EMOJIS.errorwarningline} | 你沒有選擇任何歌曲。`,
            interaction.user as any,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    try {
      await interaction.deferReply().catch(() => null);

      const player = context.voiceGateway.getPlayer(interaction.guildId);
      const removed: any[] = [];

      if (player) {
        const isAdmin = interaction.memberPermissions?.has("Administrator");
        const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
        for (const index of sortedIndices) {
          if (index >= 0 && index < player.queue.length) {
            const track = player.queue[index];
            const isTrackOwner = track.pluginInfo?.requesterId === interaction.user.id;

            if (isAdmin || isTrackOwner) {
              removed.push(player.queue.splice(index, 1)[0].info);
            }
          }
        }
      }

      if (removed.length === 0) {
        return interaction
          .editReply({
            components: [
              ContainerFactory.buildReply(
                "warning",
                `${EMOJIS.errorwarningline} | 找不到要移除的歌曲，請確認隊列編號是否仍然有效。`,
                interaction.user as any,
              ),
            ],
            flags: [MessageFlags.IsComponentsV2],
          })
          .catch(() => null);
      }

      await interaction
        .editReply({
          components: [
            ContainerFactory.buildReply(
              "success",
              [
                `${EMOJIS.checkdoubleline} | 已成功從隊列中移除 ${removed.length} 首歌曲：`,
                removed.map((track: any) => `- ${track.title}`).join("\n"),
              ].join("\n"),
              interaction.user as any,
            ),
          ],
          flags: [MessageFlags.IsComponentsV2],
        })
        .catch(() => null);
    } catch (err) {
      console.error("[Modal] Remove error:", err);
      await interaction
        .editReply({
          components: [
            ContainerFactory.buildReply(
              "error",
              `${EMOJIS.errorwarningline} | 移除歌曲時發生錯誤。`,
              interaction.user as any,
            ),
          ],
          flags: [MessageFlags.IsComponentsV2],
        })
        .catch(() => null);
    }
  }
};
