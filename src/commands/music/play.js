import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { controllerStore } from "../../store/ControllerStore.js";
import {
  validateVoiceState,
  CONTROLLER_DENIED_MESSAGE,
} from "../../utilities/voiceGuard.js";
import {
  checkCooldown,
  getRemainingCooldown,
} from "../../utilities/cooldown.js";

const PLAY_COOLDOWN_MS = 2000;

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
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("透過 YouTube 連結直接播放歌曲（搜尋歌曲請用 /search）")
    .addStringOption((o) =>
      o.setName("query").setDescription("YouTube URL").setRequired(true),
    ),

  async execute(interaction, context) {
    const query = interaction.options.getString("query", true).trim();

    if (!isUrl(query)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              ":x: | `/play` 只接受 YouTube 連結。\n若要搜尋歌曲，請使用 `/search`。",
            )
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!checkCooldown(interaction.user.id, "play", PLAY_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "play");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:hourglass: | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`,
            )
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
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

    if (ownerId && ownerId !== interaction.user.id) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(CONTROLLER_DENIED_MESSAGE)
            .setColor(0xed4245),
        ],
      });
    }

    const controllerUserId = ownerId ?? interaction.user.id;
    if (!ownerId) cs.setOwner(guild.id, interaction.user.id);

    try {
      await guildPlayerManager.dispatch({
        guild_id: guild.id,
        action: "play",
        channel_id: userVoiceChannel.id,
        track_url: query,
        interaction_token: interaction.token,
        text_channel_id: interaction.channelId,
        controller_user_id: controllerUserId,
      });
    } catch (err) {
      console.error("[Command] Play error:", err);
      cs.clearOwner(guild.id);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }
  },
};
