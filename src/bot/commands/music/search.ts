import { randomUUID } from "node:crypto";

import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import {
  checkCooldown,
  getRemainingCooldown,
} from "../../../player/utils/cooldown.js";
import { formatUserFacingError } from "../../../player/utils/error-formatter.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { searchTracks } from "../../../player/youtube.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize-query.js";

const SEARCH_COOLDOWN_MS = 5000;

export const searchCache = new Map<string, any>();

export const searchCommand = {
  name: "search",
  category: `${EMOJIS.music2line} | 音樂`,
  ephemeral: true,
  defer: false,
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋歌曲，從結果中選擇後播放")
    .addStringOption((o) =>
      o.setName("內容").setDescription("歌曲名稱或關鍵字").setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!checkCooldown(interaction.user.id, "search", SEARCH_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "search");
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildReply(
            "warning",
            `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再搜尋。`,
            interaction.user as any,
          ).toJSON() as any,
        ],
      });
    }

    const query = interaction.options.getString("內容", true).trim();

    let results: any[] | undefined;
    try {
      results = await searchTracks(query, 10);
    } catch (err: any) {
      console.error("[Command] Search error:", err.message);
      const safeError = formatUserFacingError(err.message);
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildSimpleMessage(
            "搜尋失敗",
            `${EMOJIS.errorwarningline} | ${safeError}`,
            interaction.user as any,
          ).toJSON() as any,
        ],
      });
    }

    if (!results || !results.length) {
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 找不到結果，請換個關鍵字試試。`,
            interaction.user as any,
          ).toJSON() as any,
        ],
      });
    }

    const searchId = randomUUID();
    searchCache.set(searchId, results);
    setTimeout(() => searchCache.delete(searchId), 15 * 60 * 1000);

    await interaction.showModal(ContainerFactory.buildSearchModal(results, searchId));
  },

  async handleSearchModalSubmit(interaction: ModalSubmitInteraction, context: any) {
    const selectedValues = (interaction.fields as any).getCheckboxGroup("MusicSearchCheckboxes");

    if (!selectedValues || selectedValues.length === 0) {
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 你沒有選擇任何歌曲。`,
            interaction.user as any,
          ).toJSON() as any,
        ],
      });
    }

    await interaction.deferReply();

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: true,
      requireController: false,
    });
    if (!validation) return;

    const { guildId, channelId } = interaction;
    if (!guildId || !channelId) return;
    const { userVoiceChannel, botVoiceChannel } = validation;

    const { controllerStore: cs } = context;
    let ownerId = cs.getOwner(guildId);
    if (!botVoiceChannel && ownerId) {
      cs.clearOwner(guildId);
      ownerId = null;
    }

    if (!ownerId) cs.setOwner(guildId, interaction.user.id);

    try {
      const addedTracks: any[] = [];
      for (const url of selectedValues) {
        const urlCheck = validatePlayUrl(url);
        if (!urlCheck.ok) continue;

        const track = await context.guildPlayerManager.dispatch({
          guild_id: guildId,
          action: "play",
          channel_id: userVoiceChannel.id,
          track_url: url,
          interaction_token: "",
          text_channel_id: channelId,
          controller_user_id: interaction.user.id,
          silent: true,
        });
        if (track) addedTracks.push(track);
      }

      const trackListText = addedTracks
        .map((t) => `- **[${t.title}](${t.url})**`)
        .join("\n");

      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.playlistaddline} | 已為你加入 ${addedTracks.length} 首歌曲：\n${trackListText}`,
            interaction.user as any,
          ).toJSON() as any,
        ],
      });
    } catch (err: any) {
      cs.clearOwner(guildId);
      console.error("[Command] Search select error:", err);
      const safeError = formatUserFacingError(err?.message);
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildSimpleMessage(
            "處理錯誤",
            `${EMOJIS.errorwarningline} | ${safeError}`,
            interaction.user as any,
          ).toJSON() as any,
        ],
      });
    }
  },
};
