import { randomUUID } from "node:crypto";
import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { checkCooldown, getRemainingCooldown } from "../../../player/utils/cooldown.js";
import { formatUserFacingError } from "../../../player/utils/error-formatter.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize-query.js";
import { nodeStateStore } from "../../store/node-state-store.js";

const SEARCH_COOLDOWN_MS = 5000;
export const searchCache = new Map<string, any>();

export const searchCommand = {
  name: "search",
  category: `${EMOJIS.music2line} | 音樂`,
  ephemeral: true,
  defer: true,
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋歌曲，從結果中選擇後播放")
    .addStringOption((o) => o.setName("內容").setDescription("歌曲名稱或關鍵字").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction, context: any) {
    const validation = await validateVoiceState(interaction, { requireBotInVC: true, requireController: false });
    if (!validation) return;

    if (!checkCooldown(interaction.user.id, "search", SEARCH_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "search");
      return interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [ContainerFactory.buildReply("warning", `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再搜尋。`, interaction.user as any).toJSON() as any],
      });
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
        // limit to 10
        results = res.data.length ? res.data.slice(0, 10) : res.data.tracks.slice(0, 10);
      } else if (res.loadType === "track") {
        results = [res.data];
      }
    } catch (err: any) {
      console.error("[Command] Search error:", err.message);
      return interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [ContainerFactory.buildSimpleMessage("搜尋失敗", `${EMOJIS.errorwarningline} | ${formatUserFacingError(err.message)}`, interaction.user as any).toJSON() as any],
      });
    }

    if (!results || !results.length) {
      return interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [ContainerFactory.buildReply("error", `${EMOJIS.errorwarningline} | 找不到結果，請換個關鍵字試試。`, interaction.user as any).toJSON() as any],
      });
    }

    const searchId = randomUUID();
    searchCache.set(searchId, results);
    setTimeout(() => searchCache.delete(searchId), 15 * 60 * 1000);

    await interaction.editReply({
      flags: [MessageFlags.IsComponentsV2 as any],
      components: [ContainerFactory.buildSearchSelectMenu(results, searchId).toJSON() as any]
    });
  },

  handleSelectMenu: async (interaction: StringSelectMenuInteraction, context: any) => {
    if (!interaction.customId.startsWith("search:select:")) return;
    const selectedValues = interaction.values;

    if (!selectedValues || selectedValues.length === 0) {
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        components: [ContainerFactory.buildReply("error", `${EMOJIS.errorwarningline} | 你沒有選擇任何歌曲。`, interaction.user as any).toJSON() as any],
      });
    }

    const deferred = await interaction.deferReply().catch(() => null);
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
      let addedTitles: string[] = [];
      const searchId = interaction.customId.split(":")[2];
      const results = searchCache.get(searchId) || [];

      for (const url of selectedValues) {
        const urlCheck = validatePlayUrl(url);
        if (!urlCheck.ok) continue;

        const track = results.find((r: any) => (r.info?.uri || r.info?.identifier) === url || r.info?.uri === url);
        if (track) {
          addedTitles.push(`**[${track.info.title}](${url})**`);
          player.queue.push(track);
          count++;
        }
      }
      
      if (!player.currentTrack && !player.paused && count > 0) {
        await player.play();
      }

      const titleStr = addedTitles.length > 0 ? `\n\n${addedTitles.map(t => `• ${t}`).join("\n")}` : "";

      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [ContainerFactory.buildReply("success", `${EMOJIS.playlistaddline} | 已為你加入 ${count} 首歌曲！${titleStr}`, interaction.user as any).toJSON() as any],
      });
    } catch (err: any) {
      cs.clearOwner(guildId);
      console.error("[Command] Search select error:", err);
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [ContainerFactory.buildSimpleMessage("處理錯誤", `${EMOJIS.errorwarningline} | ${formatUserFacingError(err?.message)}`, interaction.user as any).toJSON() as any],
      });
    }
  },
};
