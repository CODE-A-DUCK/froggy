import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

import { db } from "../../../db/index.js";
import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize.js";
import { replyWithState } from "../../utils/reply.js";

import { resolveAndQueue } from "./play.js";

// ── Shared helpers ──────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function getUserLibrary(userId: string) {
  return db.selectFrom("music_library")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("id", "asc")
    .execute();
}

function resolveTrackByIndex<T>(library: T[], index: number): T | null {
  return library[index - 1] ?? null;
}

function attachRequester(track: any, requesterId: string): any {
  track.pluginInfo = { ...track.pluginInfo, requesterId };
  return track;
}

async function backgroundResolveLibrary(
  library: { url: string }[],
  player: any,
  node: any,
  requesterId: string,
): Promise<void> {
  for (const track of library) {
    try {
      const result = await node.rest.resolve(track.url);
      if (!result) continue;

      if (result.loadType === "track" || result.loadType === "search") {
        const resolved = result.loadType === "search" ? result.data[0] : result.data;
        player.queue.push(attachRequester(resolved, requesterId));
        if (!player.currentTrack && !player.paused) await player.play();
      } else if (result.loadType === "playlist") {
        for (const t of result.data.tracks) player.queue.push(attachRequester(t, requesterId));
        if (!player.currentTrack && !player.paused) await player.play();
      }
    } catch (e) {
      console.error(`[LibraryPlay] Failed to background resolve ${track.url}:`, e);
    }
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

export async function executeLibraryAdd(interaction: ChatInputCommandInteraction, context: any) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let url = interaction.options.getString("url");
  let title = "未知歌曲";

  if (!url) {
    const currentTrack = context.controllerStore.getCurrentTrack(interaction.guildId!);
    if (!currentTrack) {
      return replyWithState(interaction, "info", `${EMOJIS.playlistline} | 目前沒有播放任何歌曲，請提供歌曲網址。`);
    }
    const info = currentTrack.info || currentTrack;
    url = info.uri;
    title = info.title || "未知歌曲";
  } else {
    const validation = validatePlayUrl(url);
    if (!validation.ok) {
      return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 無效的網址：${validation.reason}`);
    }
    url = validation.url;
    title = "自訂連結歌曲";
  }

  try {
    const countRes = await db.selectFrom("music_library")
      .select(db.fn.count("id").as("count"))
      .where("user_id", "=", interaction.user.id)
      .executeTakeFirst();

    if (Number(countRes?.count ?? 0) >= 500) {
      return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 你的音樂庫已達上限 (500 首)，請先移除一些歌曲！`);
    }

    await db.insertInto("music_library")
      .values({ user_id: interaction.user.id, url: url as string, title })
      .execute();

    await replyWithState(interaction, "success", `${EMOJIS.heartaddfill} | 已將 **${title}** 加入你的音樂庫！`);
  } catch (err) {
    console.error("Library Add Error:", err);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 儲存失敗。`);
  }
}

export async function executeLibraryList(interaction: ChatInputCommandInteraction, _context: any) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const library = await getUserLibrary(interaction.user.id);

    if (library.length === 0) {
      return replyWithState(interaction, "info", `${EMOJIS.foldermusicline} | 你的音樂庫是空的！`);
    }

    const chunks = chunk(library.map((row, i) => `${i + 1}. **${row.title}**`), 10).map(c => c.join("\n"));

    await interaction.editReply({
      components: [ContainerFactory.buildLibraryPage(`${EMOJIS.foldermusicline} | 你的音樂庫`, chunks, 0, interaction.user as any).toJSON() as any],
      flags: [MessageFlags.IsComponentsV2 as any],
    });
  } catch (err) {
    console.error("Library List Error:", err);
  }
}

export async function executeLibraryPlay(interaction: ChatInputCommandInteraction, context: any) {
  await interaction.deferReply();

  const index = interaction.options.getInteger("index");
  const validation = await validateVoiceState(interaction, { requireBotInVC: false, requireController: false });
  if (!validation) return;

  try {
    const library = await getUserLibrary(interaction.user.id);

    if (library.length === 0) {
      return replyWithState(interaction, "info", `${EMOJIS.foldermusicline} | 你的音樂庫是空的！`);
    }

    // 播放指定編號
    if (index !== null) {
      const track = resolveTrackByIndex(library, index);
      if (!track) {
        return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 找不到編號為 ${index} 的歌曲！`);
      }
      return resolveAndQueue(interaction, track.url, interaction.user.id, context);
    }

    // 播放整個音樂庫（後台非同步載入），不然一直刷信息很烦人
    const top10 = library.slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join("\n");
    await replyWithState(interaction, "success",
      `${EMOJIS.playlistaddline} | 已將你的音樂庫 (${library.length} 首歌曲) 排入後台載入序列！\n\n**前 10 首**：\n${top10}`
    );

    const { voiceGateway, shoukaku } = context;
    const userVoiceChannel = (interaction.member as any).voice.channel!;

    let player = voiceGateway.getPlayer(interaction.guild!.id);
    if (!player) player = await voiceGateway.connectToChannel(interaction.guild!.id, userVoiceChannel.id).catch(() => null);
    if (!player) return;

    player.textChannelId = interaction.channelId;
    player.interactionToken = undefined;
    player.controllerUserId = interaction.user.id;

    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (node) backgroundResolveLibrary(library, player, node, interaction.user.id);

  } catch (err) {
    console.error("Library Play Error:", err);
  }
}

export async function executeLibraryRemove(interaction: ChatInputCommandInteraction, _context: any) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const index = interaction.options.getInteger("index", true);

  try {
    const library = await getUserLibrary(interaction.user.id);

    const track = resolveTrackByIndex(library, index);
    if (!track) {
      return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 找不到編號為 ${index} 的歌曲！`);
    }

    await db.deleteFrom("music_library").where("id", "=", track.id).execute();
    await replyWithState(interaction, "success", `${EMOJIS.fileshredline} | 已從音樂庫移除：**${track.title}**`);
  } catch (err) {
    console.error("Library Remove Error:", err);
  }
}