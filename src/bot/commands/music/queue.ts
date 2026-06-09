import { MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { replyWithState } from "../../utils/reply.js";

export async function executeQueue(interaction: ChatInputCommandInteraction, context: any) {
  const validation = await validateVoiceState(interaction, { requireController: false });
  if (!validation) return;

  try {
    const player = context.voiceGateway.getPlayer(interaction.guildId);
    const current = player?.currentTrack ? player.currentTrack.info : null;
    const queue = player?.queue ? player.queue.map((t: any) => t.info) : [];

    if (!current && queue.length === 0) {
      return replyWithState(interaction, "info", `${EMOJIS.playlistline} | 隊列是空的。`, { ephemeral: true, reply: true });
    }

    if (queue.length === 0) {
      return replyWithState(interaction, "info", `${EMOJIS.music2line} | 正在播放：**${current.title}**\n\n${EMOJIS.playlistline} | 隊列中沒有其他歌曲。`, { ephemeral: true, reply: true });
    }

    const isAdmin = interaction.memberPermissions?.has("Administrator");

    const removableTracks = player?.queue
      ? player.queue
        .map((track: any, index: number) => ({ track, index }))
        .filter(({ track }: any) => isAdmin || track.pluginInfo?.requesterId === interaction.user.id)
      : [];

    if (removableTracks.length > 0) {
      const modal = ContainerFactory.buildRemoveQueueModal(removableTracks);
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
  } catch {
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`, { ephemeral: true, reply: true });
  }
}
