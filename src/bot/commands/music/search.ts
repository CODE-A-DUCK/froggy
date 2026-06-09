import { randomUUID } from "node:crypto";

import { MessageFlags, ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { checkCooldown, getRemainingCooldown } from "../../../player/utils/cooldown.js";
import { formatUserFacingError } from "../../../player/utils/error-formatter.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize.js";
import { replyWithState } from "../../utils/reply.js";

const SEARCH_COOLDOWN_MS = 5000;
export const searchCache = new Map<string, any>();

export async function executeSearch(interaction: ChatInputCommandInteraction, context: any) {
  const validation = await validateVoiceState(interaction, { requireBotInVC: true, requireController: false });
  if (!validation) return;

  if (!checkCooldown(interaction.user.id, "search", SEARCH_COOLDOWN_MS)) {
    const ms = getRemainingCooldown(interaction.user.id, "search");
    return replyWithState(interaction, "warning", `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再搜尋。`);
  }

  const query = interaction.options.getString("內容", true).trim();

  let results: any[] | undefined;
  try {
    const node = context.shoukaku.options.nodeResolver(context.shoukaku.nodes);
    if (!node) throw new Error("No available Lavalink nodes");

    const res = await node.rest.resolve(`ytsearch:${query}`);
    if (!res || res.loadType === "empty" || res.loadType === "error") {
      throw new Error("No tracks found");
    }

    if (res.loadType === "search" || res.loadType === "playlist") {
      // max 10
      results = res.data.length ? res.data.slice(0, 10) : res.data.tracks.slice(0, 10);
    } else if (res.loadType === "track") {
      results = [res.data];
    }
  } catch (err: any) {
    console.error("[Command] Search error:", err.message);
    return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | ${formatUserFacingError(err.message)}`);
  }

  if (!results || !results.length) {
    return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 找不到結果，請換個關鍵字試試。`);
  }

  const searchId = randomUUID();
  searchCache.set(searchId, results);
  setTimeout(() => searchCache.delete(searchId), 15 * 60 * 1000);

  await interaction.editReply({
    flags: [MessageFlags.IsComponentsV2 as any],
    components: [ContainerFactory.buildSearchSelectMenu(results, searchId).toJSON() as any]
  });
}

export async function handleSearchSelectMenu(interaction: StringSelectMenuInteraction, context: any) {
  if (!interaction.customId.startsWith("search:select:")) return;
  const selectedValues = interaction.values;

  if (!selectedValues || selectedValues.length === 0) {
    return replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 你沒有選擇任何歌曲。`, { ephemeral: true });
  }

  const deferred = await interaction.deferReply().catch((err) => {
    console.error("deferReply error:", err);
    return null;
  });
  if (!deferred) return;

  const validation = await validateVoiceState(interaction, {
    requireBotInVC: false,
    requireController: false,
  });
  if (!validation) return;

  const { guildId, channelId } = interaction;
  if (!guildId || !channelId) return;
  const { userVoiceChannel, botVoiceChannel } = validation;
  const { controllerStore: cs, voiceGateway } = context;

  if (!botVoiceChannel) cs.clearOwner(guildId);
  if (!cs.getOwner(guildId)) cs.setOwner(guildId, interaction.user.id);

  try {
    let player = voiceGateway.getPlayer(guildId);
    if (!player) {
      player = await voiceGateway.connectToChannel(guildId, userVoiceChannel.id);
    }

    player.textChannelId = channelId;
    player.controllerUserId = interaction.user.id;
    player.interactionToken = "";

    let count = 0;
    const addedTitles: string[] = [];
    const searchId = interaction.customId.split(":")[2];
    const results = searchCache.get(searchId) || [];

    for (const url of selectedValues) {
      const urlCheck = validatePlayUrl(url);
      if (!urlCheck.ok) continue;

      const track = results.find((r: any) => (r.info?.uri || r.info?.identifier) === url || r.info?.uri === url);
      if (track) {
        track.pluginInfo = track.pluginInfo || {};
        track.pluginInfo.requesterId = interaction.user.id;
        addedTitles.push(`**[${track.info.title}](${url})**`);
        player.queue.push(track);
        count++;
      }
    }

    if (!player.currentTrack && !player.paused && count > 0) {
      await player.play();
    }

    const titleStr = addedTitles.length > 0 ? `\n\n${addedTitles.map(t => `• ${t}`).join("\n")}` : "";

    await replyWithState(interaction, "success", `${EMOJIS.playlistaddline} | 已為你加入 ${count} 首歌曲！${titleStr}`);
  } catch (err: any) {
    cs.clearOwner(guildId);
    console.error("[Command] Search select error:", err);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | ${formatUserFacingError(err?.message)}`);
  }
}
