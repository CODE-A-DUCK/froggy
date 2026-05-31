import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { ytSearch } from "../../utils/ytSearch.js";
import { validatePlayUrl } from "../../security/sanitizeQuery.js";
import {
  checkCooldown,
  getCooldownRemaining,
} from "../../utils/cooldown.js";
import { ContainerFactory } from "../../ui/music/ContainerFactory.js";

const SEARCH_COOLDOWN_MS = 5000;

export const searchCommand = {
  name: "search",
  category: ":notes: | 音樂",
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋歌曲，從結果中選擇後播放")
    .addStringOption((o) =>
      o.setName("query").setDescription("歌曲名稱或關鍵字").setRequired(true),
    ),

  async execute(interaction, context) {
    const query = interaction.options.getString("query", true).trim();

    if (!checkCooldown(interaction.user.id, "search", SEARCH_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "search");
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        components: [
          ContainerFactory.buildReply(
            "warning",
            `<:hourglassline:1510533872285253662> | 請等待 ${(ms / 1000).toFixed(1)} 秒後再搜尋。`,
            interaction.user,
          ).toJSON(),
        ],
      });
    }

    // Note: Do not deferReply here because we want to show a Modal afterwards
    let results;
    try {
      results = await ytSearch(query, 10);
    } catch (err) {
      console.error("[Command] Search error:", err.message);
      return interaction.reply({
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        components: [
          ContainerFactory.buildReply(
            "error",
            "<:errorwarningline:1510533865805058188> | 搜尋失敗，請稍後再試。",
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
            "<:errorwarningline:1510533865805058188> | 找不到結果，請換個關鍵字試試。",
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
          "<:errorwarningline:1510533865805058188> | 你沒有選擇任何歌曲。",
          interaction.user,
        ).toJSON(),
      ],
    });
  }

  await interaction.deferReply();

  const { guildId, channelId } = interaction;
  const guild = interaction.guild;
  const member = await guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  const userVoiceChannel = member?.voice?.channel;

  if (!userVoiceChannel) {
    return interaction.followUp({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [
        ContainerFactory.buildReply(
          "error",
          "<:errorwarningline:1510533865805058188> | 你必須在語音頻道中才能播放音樂。",
          interaction.user,
        ).toJSON(),
      ],
    });
  }

  const botMember = await guild.members
    .fetch(interaction.client.user.id)
    .catch(() => null);
  const botVoiceChannel = botMember?.voice?.channel;

  if (botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
    return interaction.followUp({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [
        ContainerFactory.buildReply(
          "error",
          `<:errorwarningline:1510533865805058188> | 你必須跟我在同一個頻道 <#${botVoiceChannel.id}> 才能播放音樂！`,
          interaction.user,
        ).toJSON(),
      ],
    });
  }

  const { controllerStore: cs } = context;
  let ownerId = cs.getOwner(guildId);
  if (!botVoiceChannel && ownerId) {
    cs.clearOwner(guildId);
    ownerId = null;
  }

  const controllerUserId = ownerId ?? interaction.user.id;
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
        controller_user_id: controllerUserId,
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
          `<:playlistaddline:1510533888630329455> | 已為你加入 ${addedTracks.length} 首歌曲：\n${trackListText}`,
          interaction.user,
        ).toJSON(),
      ],
    });
  } catch (err) {
    cs.clearOwner(guildId);
    console.error("[Command] Search select error:", err);
    await interaction.followUp({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [
        ContainerFactory.buildReply(
          "error",
          "<:errorwarningline:1510533865805058188> | 處理請求時發生錯誤，請稍後再試。",
          interaction.user,
        ).toJSON(),
      ],
    });
  }
}
