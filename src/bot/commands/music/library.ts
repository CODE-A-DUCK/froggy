import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { db } from "../../../db/index.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { resolveAndQueue } from "./play.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { validatePlayUrl } from "../../security/sanitize.js";
import { replyWithState } from "../../utils/reply.js";
import { ContainerFactory } from "../../../player/ui/container-factory.js";

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

    const count = Number(countRes?.count || 0);
    if (count >= 1000) {
      return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 你的音樂庫已達上限 (1000 首)，請先移除一些歌曲！`);
    }

    await db.insertInto("music_library").values({
      user_id: interaction.user.id,
      url: url as string,
      title: title,
    }).execute();

    await replyWithState(interaction, "success", `${EMOJIS.heartaddfill} | 已將 **${title}** 加入你的專屬音樂庫！`);
  } catch (err) {
    console.error("Library Add Error:", err);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 儲存失敗。`);
  }
}

export async function executeLibraryList(interaction: ChatInputCommandInteraction, context: any) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const library = await db.selectFrom("music_library")
      .selectAll()
      .where("user_id", "=", interaction.user.id)
      .orderBy("id", "asc")
      .execute();

    if (library.length === 0) {
      return replyWithState(interaction, "info", `${EMOJIS.foldermusicline} | 你的音樂庫是空的！`);
    }

    const lines = library.map((row, index) => `${index + 1}. **${row.title}**`);
    const chunks = [];
    for (let i = 0; i < lines.length; i += 10) {
      chunks.push(lines.slice(i, i + 10).join("\n"));
    }

    await interaction.editReply({
      components: [ContainerFactory.buildSimpleMessage("你的專屬音樂庫", chunks[0], interaction.user as any).toJSON() as any],
      flags: [MessageFlags.IsComponentsV2 as any]
    });
  } catch (err) {
    console.error("Library List Error:", err);
  }
}

export async function executeLibraryPlay(interaction: ChatInputCommandInteraction, context: any) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const index = interaction.options.getInteger("index");

  const validation = await validateVoiceState(interaction, { requireBotInVC: false, requireController: false });
  if (!validation) return;

  try {
    const library = await db.selectFrom("music_library")
      .selectAll()
      .where("user_id", "=", interaction.user.id)
      .orderBy("id", "asc")
      .execute();

    if (library.length === 0) {
      return replyWithState(interaction, "info", `${EMOJIS.foldermusicline} | 你的音樂庫是空的！`);
    }

    if (index !== null) {
      const track = library[index - 1];
      if (!track) {
        return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 找不到編號為 ${index} 的歌曲！`);
      }
      await resolveAndQueue(interaction, track.url, interaction.user.id, context, false);
    } else {
      // Play entire library
      for (const track of library) {
        await resolveAndQueue(interaction, track.url, interaction.user.id, context, false);
      }
      if (library.length > 1) {
        await replyWithState(interaction, "success", `${EMOJIS.playlistaddline} | 已將你的音樂庫 (${library.length} 首歌曲) 加入播放隊列！`);
      }
    }
  } catch (err) {
    console.error("Library Play Error:", err);
  }
}

export async function executeLibraryRemove(interaction: ChatInputCommandInteraction, context: any) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const index = interaction.options.getInteger("index", true);

  try {
    const library = await db.selectFrom("music_library")
      .selectAll()
      .where("user_id", "=", interaction.user.id)
      .orderBy("id", "asc")
      .execute();

    const track = library[index - 1];
    if (!track) {
      return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 找不到編號為 ${index} 的歌曲！`);
    }

    await db.deleteFrom("music_library").where("id", "=", track.id).execute();

    await replyWithState(interaction, "success", `${EMOJIS.fileshredline} | 已從音樂庫移除：**${track.title}**`);
  } catch (err) {
    console.error("Library Remove Error:", err);
  }
}
