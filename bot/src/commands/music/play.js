import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { CONTROLLER_DENIED_MESSAGE } from "../../controllerAccess.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";
import { checkCooldown, getRemainingCooldown } from "../../utilities/cooldown.js";

const PLAY_COOLDOWN_MS = 2000;

export const playCommand = {
  name: "play",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("透過 YouTube 連結直接播放歌曲（搜尋歌曲請用 /search）")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("YouTube URL")
        .setRequired(true),
    ),
  async execute(interaction) {
    const query = interaction.options.getString("query", true).trim();

    // /play only accepts URLs — keyword searches go through /search
    if (!isYouTubeUrl(query)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              ":x: | `/play` 只接受 YouTube 連結。\n若要搜尋歌曲，請使用 `/search`。",
            )
            .setColor(0xed4245),
        ],
        ephemeral: true,
      });
    }

    // Per-user cooldown check
    const allowed = await checkCooldown(interaction.user.id, "play", PLAY_COOLDOWN_MS);
    if (!allowed) {
      const remaining = await getRemainingCooldown(interaction.user.id, "play");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`:hourglass: | 請等待 ${(remaining / 1000).toFixed(1)} 秒後再使用此指令。`)
            .setColor(0xed4245),
        ],
        ephemeral: true,
      });
    }

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

    const { guild, userVoiceChannel, botVoiceChannel } = validation;

    if (botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`:x: | 你必須跟我在同一個頻道 <#${botVoiceChannel.id}> 才能播放音樂！`)
            .setColor(0xed4245),
        ],
        ephemeral: true,
      });
    }

    // Defer early to avoid the 3-second interaction timeout
    await interaction.deferReply();

    let controllerOwnerId = await broker.getActiveControllerOwner(guild.id);
    if (!botVoiceChannel && controllerOwnerId) {
      await broker.clearControllerOwner(guild.id);
      controllerOwnerId = null;
    }

    if (controllerOwnerId && controllerOwnerId !== interaction.user.id) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(CONTROLLER_DENIED_MESSAGE)
            .setColor(0xed4245),
        ],
      });
    }

    const controllerUserId = controllerOwnerId ?? interaction.user.id;
    let claimedController = false;

    try {
      if (!controllerOwnerId) {
        claimedController = await broker.claimControllerOwner(
          guild.id,
          interaction.user.id,
        );

        if (!claimedController) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setDescription(":lock: | 遙控器已被其他使用者拿掉了，請稍後再操作！")
                .setColor(0xed4245),
            ],
          });
        }
      }

      if (!botVoiceChannel) {
        guild.shard.send({
          op: 4,
          d: {
            guild_id: guild.id,
            channel_id: userVoiceChannel.id,
            self_mute: false,
            self_deaf: false,
          },
        });
      }

      await broker.publishAudioTask(
        guild.id,
        userVoiceChannel.id,
        query,
        interaction.token,
        interaction.channelId,
        controllerUserId,
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`:outbox_tray: | 收到！正在爲你處理：\`${query}\``)
            .setColor(0x5865f2),
        ],
      });
    } catch (error) {
      if (claimedController) {
        await broker.clearControllerOwner(guild.id).catch(() => null);
      }
      console.error("[Command] Play error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 處理請求時發生錯誤，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }
  },
};

/**
 * Returns true if the input is a valid http/https URL.
 * /play accepts any URL (YouTube, YouTube Music, youtu.be, etc.).
 * Keyword searches must use /search.
 */
function isYouTubeUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
