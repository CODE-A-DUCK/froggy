import { MessageFlags, ButtonInteraction } from "discord.js";

import { db } from "../../db/index.js";
import { ContainerFactory } from "../../player/ui/container-factory.js";
import { shouldOptimisticallyUpdate, optimisticallyUpdateController } from "../../player/ui/controller-sync.js";
import { CONTROLLER_DENIED_MESSAGE } from "../../player/utils/voice-guard.js";
import { EMOJIS } from "../../shared/emojis.js";
import { controllerStore } from "../store/controller-store.js";
import { replyWithState } from "../utils/reply.js";

const replyError = (interaction: ButtonInteraction, description: string) => replyWithState(interaction, "error", description, { followUp: true });

function parseMusicControl(customId: string): string | null {
  if (customId.startsWith("MusicButtonControl")) {
    const action = customId.replace("MusicButtonControl", "").toLowerCase();
    return action.startsWith("loop") ? "loop" : action;
  }
  if (customId.startsWith("MusicButtonLibrary")) {
    return `library${customId.replace("MusicButtonLibrary", "").toLowerCase()}`;
  }
  if (customId.startsWith("MusicLibraryPage_")) {
    return "librarypage";
  }
  if (customId.startsWith("music:")) {
    return customId.split(":")[1];
  }
  if (customId.startsWith("music_")) {
    return customId.replace("music_", "");
  }
  return null;
}

async function handleLibraryToggle(interaction: ButtonInteraction, guildId: string): Promise<boolean> {
  const currentTrack = controllerStore.getCurrentTrack(guildId);
  if (!currentTrack?.source_url) {
    await replyError(interaction, `${EMOJIS.errorwarningline} | 目前沒有播放任何可收藏的歌曲。`);
    return true;
  }

  try {
    const existing = await db.selectFrom("music_library")
      .select("id")
      .where("user_id", "=", interaction.user.id)
      .where("url", "=", currentTrack.source_url)
      .executeTakeFirst();

    const title = currentTrack.title ?? "未知歌曲";

    if (existing) {
      await db.deleteFrom("music_library").where("id", "=", existing.id).execute();
      await interaction.followUp({
        content: `${EMOJIS.heartaddline} | 已將 **${title}** 從你的音樂庫移除。`,
        flags: [MessageFlags.Ephemeral]
      }).catch(() => null);
    } else {
      const { count } = await db.selectFrom("music_library")
        .select(db.fn.count("id").as("count"))
        .where("user_id", "=", interaction.user.id)
        .executeTakeFirst() ?? { count: 0 };

      if (Number(count) >= 1000) {
        await replyError(interaction, `${EMOJIS.errorwarningline} | 你的音樂庫已達上限 (1000 首)，請先移除一些歌曲！`);
        return true;
      }

      await db.insertInto("music_library").values({
        user_id: interaction.user.id,
        url: currentTrack.source_url,
        title,
      }).execute();

      await interaction.followUp({
        content: `${EMOJIS.heartaddfill} | 已將 **${title}** 收藏至你的音樂庫！`,
        flags: [MessageFlags.Ephemeral]
      }).catch(() => null);
    }
  } catch (err) {
    console.error("Library toggle error:", err);
    await replyError(interaction, `${EMOJIS.errorwarningline} | 收藏歌曲時發生錯誤。`);
  }
  return true;
}

async function handleLibraryPage(interaction: ButtonInteraction): Promise<boolean> {
  const customId = interaction.customId;
  const parts = customId.split("_");
  if (parts.length < 2) return true;

  const page = parseInt(parts[1], 10);
  if (isNaN(page)) return true;

  try {
    const library = await db.selectFrom("music_library")
      .selectAll()
      .where("user_id", "=", interaction.user.id)
      .orderBy("id", "asc")
      .execute();

    if (library.length === 0) {
      await replyWithState(interaction, "info", `${EMOJIS.foldermusicline} | 你的音樂庫是空的！`);
      return true;
    }

    const lines = library.map((row, index) => `${index + 1}. **${row.title}**`);
    const chunks = [];
    for (let i = 0; i < lines.length; i += 10) {
      chunks.push(lines.slice(i, i + 10).join("\n"));
    }

    const safePage = Math.max(0, Math.min(page, chunks.length - 1));

    await interaction.editReply({
      components: [ContainerFactory.buildLibraryPage(`${EMOJIS.foldermusicline} | 你的音樂庫`, chunks, safePage, interaction.user as any).toJSON() as any],
      flags: [MessageFlags.IsComponentsV2 as any]
    });
  } catch (err) {
    console.error("Library page error:", err);
  }
  return true;
}

export const handleButtonInteraction = async (interaction: ButtonInteraction, context: any): Promise<boolean> => {
  try {
    if (!interaction.inCachedGuild()) return false;

    const action = parseMusicControl(interaction.customId);
    if (!action) return false;

    const VALID_ACTIONS = new Set(["stop", "skip", "pause", "resume", "loop", "refresh_controller", "librarytoggle", "librarypage"]);
    if (!VALID_ACTIONS.has(action)) return false;

    await interaction.deferUpdate().catch(() => null);

    const { guildId, member } = interaction;

    if (action === "librarytoggle") {
      return await handleLibraryToggle(interaction, guildId);
    }
    if (action === "librarypage") {
      return await handleLibraryPage(interaction);
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const botVoiceChannelId = botMember?.voice?.channelId;

    if (!botVoiceChannelId) {
      await replyError(interaction, `${EMOJIS.errorwarningline} | 我目前不在語音頻道中，無法執行此操作。`);
      return true;
    }

    if (member.voice.channelId !== botVoiceChannelId) {
      await replyError(interaction, `${EMOJIS.errorwarningline} | 你必須跟我進入同一個頻道 <#${botVoiceChannelId}> 才能控制我！`);
      return true;
    }

    if (controllerStore.getOwners(guildId).size > 0 && !controllerStore.isOwner(guildId, interaction.user.id)) {
      await replyError(interaction, CONTROLLER_DENIED_MESSAGE);
      return true;
    }

    const optimisticUpdate = shouldOptimisticallyUpdate(action)
      ? optimisticallyUpdateController(interaction, action)
      : Promise.resolve();

    const player = context.voiceGateway.getPlayer(guildId);
    if (player) {
      switch (action) {
      case "stop":
        await player.stopPlaying(true);
        break;
      case "skip":
        await player.skip();
        break;
      case "pause":
        await player.shoukakuPlayer.setPaused(true);
        break;
      case "resume":
        await player.shoukakuPlayer.setPaused(false);
        break;
      case "loop": {
        const modes: ("off" | "loop_once" | "track")[] = ["off", "loop_once", "track"];
        player.repeatMode = modes[(modes.indexOf(player.repeatMode) + 1) % modes.length];
        break;
      }
      case "refresh_controller":
        context.voiceGateway.emit("trackStart", player, player.currentTrack);
        break;
      }
    }

    await optimisticUpdate;
    return true;
  } catch (error) {
    console.error("[ButtonHandler] Error:", error);
    return true;
  }
};
