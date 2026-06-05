import { SlashCommandBuilder, MessageFlags } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import {
  checkCooldown,
  getRemainingCooldown,
} from "../../../player/utils/cooldown.js";
import { formatUserFacingError } from "../../../player/utils/error-formatter.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize-query.js";

const PLAY_COOLDOWN_MS = 3000;

export const playCommand = {
  name: "play",
  category: `${EMOJIS.music2line} | 音樂`,
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
      return interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "warning",
            `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    const query = interaction.options.getString("鏈接", true).trim();

    const urlValidation = validatePlayUrl(query);
    if (!urlValidation.ok) {
      return interaction.editReply({
        components: [
          ContainerFactory.buildReply(
            "warning",
            `${EMOJIS.errorwarningline} | 請提供有效的 YouTube 連結。搜尋歌曲請使用 \`/search\` 指令。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: true,
      requireController: false,
    });
    if (!validation) return;

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
        track_url: urlValidation.url,
        interaction_token: interaction.token,
        text_channel_id: interaction.channelId,
        controller_user_id: interaction.user.id,
      });
    } catch (err) {
      console.error("[Command] Play error:", err);
      cs.clearOwner(guild.id);

      const safeError = formatUserFacingError(err.message);
      await interaction.editReply({
        components: [
          ContainerFactory.buildSimpleMessage(
            "播放錯誤",
            `${EMOJIS.errorwarningline} | ${safeError}`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  },
};
