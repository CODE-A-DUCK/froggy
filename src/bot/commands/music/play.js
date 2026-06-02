import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import {
  checkCooldown,
  getRemainingCooldown,
} from "../../../player/utils/cooldown.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";

const PLAY_COOLDOWN_MS = 3000;

function isUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const playCommand = {
  name: "play",
  category: ":notes: | 音樂",
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("透過 YouTube 連結直接播放歌曲（搜尋歌曲請用 /search）")
    .addStringOption((option) =>
      option
        .setName("鏈接")
        .setDescription("YouTube 影片或播放清單連結")
        .setRequired(true),
    ),

  async execute(interaction, context) {
    if (!checkCooldown(interaction.user.id, "play", PLAY_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "play");
      return interaction.reply({
        components: [
          ContainerFactory.buildReply(
            "warning",
            `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      });
    }

    const query = interaction.options.getString("link", true).trim();

    if (!isUrl(query)) {
      return interaction.reply({
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | \`/play\` 只接受 YouTube 連結。\n若要搜尋歌曲，請使用 \`/search\`。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      });
    }

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireController: false,
    });
    if (!validation) return;

    await interaction.deferReply();

    const { guild, userVoiceChannel, botVoiceChannel } = validation;
    const { guildPlayerManager, controllerStore: cs } = context;

    let ownerId = cs.getOwner(guild.id);
    if (!botVoiceChannel && ownerId) {
      cs.clearOwner(guild.id);
      ownerId = null;
    }

    if (!ownerId) cs.setOwner(guild.id, interaction.user.id);

    try {
      await guildPlayerManager.dispatch({
        guild_id: guild.id,
        action: "play",
        channel_id: userVoiceChannel.id,
        track_url: query,
        interaction_token: interaction.token,
        text_channel_id: interaction.channelId,
        controller_user_id: interaction.user.id,
      });
    } catch (err) {
      console.error("[Command] Play error:", err);
      cs.clearOwner(guild.id);
      await interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "error",
            `${EMOJIS.errorwarningline} | 執行時發生錯誤，請稍後再試。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  },
};
