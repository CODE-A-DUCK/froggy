import { SlashCommandBuilder, MessageFlags } from "discord.js";

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

export const searchCommand = {
  name: "search",
  category: `${EMOJIS.music2line} | 音樂`,
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋歌曲，從結果中選擇後播放")
    .addStringOption((o) =>
      o.setName("內容").setDescription("歌曲名稱或關鍵字").setRequired(true),
    ),

  async execute(interaction) {
    if (!checkCooldown(interaction.user.id, "search", SEARCH_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "search");
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        components: [
          ContainerFactory.buildReply(
            "warning",
            `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再搜尋。`,
            interaction.user,
          ).toJSON(),
        ],
      });
    }

    const query = interaction.options.getString("內容", true).trim();

    // Note: Do not deferReply here because we want to show a Modal afterwards
    let results;
    try {
      results = await searchTracks(query, 10);
    } catch (err) {
      console.error("[Command] Search error:", err.message);
      const safeError = formatUserFacingError(err.message);
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        components: [
          ContainerFactory.buildSimpleMessage(
            "搜尋失敗",
            `${EMOJIS.errorwarningline} | ${safeError}`,
            interaction.user,
          ).toJSON(),
        ],
      });
    }

    if (!results.length) {
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 找不到結果，請換個關鍵字試試。`,
            interaction.user,
          ).toJSON(),
        ],
      });
    }

    await interaction.showModal(ContainerFactory.buildSearchModal(results));
  },
};

export async function handleMusicSearchModal(interaction, context) {
  const selectedValues = interaction.fields.getCheckboxGroup(
    "MusicSearchCheckboxes",
  );

  if (!selectedValues || selectedValues.length === 0) {
    return interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [
        ContainerFactory.buildReply(
          "error",
          `${EMOJIS.errorwarningline} | 你沒有選擇任何歌曲。`,
          interaction.user,
        ).toJSON(),
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
  const { userVoiceChannel, botVoiceChannel } = validation;

  const { controllerStore: cs } = context;
  let ownerId = cs.getOwner(guildId);
  if (!botVoiceChannel && ownerId) {
    cs.clearOwner(guildId);
    ownerId = null;
  }

  if (!ownerId) cs.setOwner(guildId, interaction.user.id);

  try {
    const addedTracks = [];
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
      flags: [MessageFlags.IsComponentsV2],
      components: [
        ContainerFactory.buildReply(
          "success",
          `${EMOJIS.playlistaddline} | 已為你加入 ${addedTracks.length} 首歌曲：\n${trackListText}`,
          interaction.user,
        ).toJSON(),
      ],
    });
  } catch (err) {
    cs.clearOwner(guildId);
    console.error("[Command] Search select error:", err);
    const safeError = formatUserFacingError(err.message);
    await interaction.followUp({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [
        ContainerFactory.buildSimpleMessage(
          "處理錯誤",
          `${EMOJIS.errorwarningline} | ${safeError}`,
          interaction.user,
        ).toJSON(),
      ],
    });
  }
}
