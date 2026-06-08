import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction, ButtonInteraction, GuildMember } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { checkCooldown, getRemainingCooldown } from "../../../player/utils/cooldown.js";
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
      option.setName("鏈接").setDescription("YouTube 影片或播放清單連結").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, context: any) {
    if (!checkCooldown(interaction.user.id, "play", PLAY_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "play");
      return interaction.editReply({
        components: [ContainerFactory.buildReply("warning", `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`, interaction.user as any).toJSON() as any],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }

    const query = interaction.options.getString("鏈接", true).trim();
    const urlValidation = validatePlayUrl(query);
    if (!urlValidation.ok) {
      return interaction.editReply({
        components: [ContainerFactory.buildReply("warning", `${EMOJIS.errorwarningline} | 請提供有效的 YouTube 連結。搜尋歌曲請使用 \`/search\` 指令。`, interaction.user as any).toJSON() as any],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireController: false,
    });
    if (!validation) return;

    const { guild, botVoiceChannel } = validation;
    const { controllerStore: cs } = context;

    if (!botVoiceChannel) cs.clearOwner(guild.id);
    if (!cs.getOwner(guild.id)) cs.setOwner(guild.id, interaction.user.id);

    let finalUrl = urlValidation.url;
    try {
      const parsedUrl = new URL(finalUrl);
      parsedUrl.searchParams.delete("list");
      parsedUrl.searchParams.delete("index");
      parsedUrl.searchParams.delete("start_radio");
      finalUrl = parsedUrl.href;
    } catch { }

    await resolveAndQueue(interaction, finalUrl, interaction.user.id, context, false);
  },
};

export async function resolveAndQueue(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  url: string,
  userId: string,
  context: any,
  isPlaylist: boolean
) {
  const { controllerStore: cs, shoukaku, voiceGateway } = context;
  const guild = interaction.guild!;
  const member = interaction.member as GuildMember;
  const userVoiceChannel = member.voice.channel!;

  try {
    let currentPlayer = voiceGateway.getPlayer(guild.id);
    if (!currentPlayer) {
      currentPlayer = await voiceGateway.connectToChannel(guild.id, userVoiceChannel.id);
    }

    currentPlayer.textChannelId = interaction.channelId;
    currentPlayer.interactionToken = interaction.token;
    currentPlayer.controllerUserId = userId;

    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (!node) throw new Error("No available Lavalink nodes");

    const result = await node.rest.resolve(url);
    if (!result || result.loadType === "empty" || result.loadType === "error") {
      throw new Error("No tracks found or error occurred");
    }

    if (result.loadType === "playlist") {
      for (const track of result.data.tracks) {
        track.pluginInfo = track.pluginInfo || {};
        track.pluginInfo.requesterId = userId;
        currentPlayer.queue.push(track);
      }
      if (!currentPlayer.currentTrack && !currentPlayer.paused) {
        await currentPlayer.play();
      }
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.playlistaddline} | 已將播放清單加入隊列！`,
            interaction.user as any
          ).toJSON() as any
        ],
      });
    } else if (result.loadType === "track" || result.loadType === "search") {
      const track = result.loadType === "search" ? result.data[0] : result.data;
      track.pluginInfo = track.pluginInfo || {};
      track.pluginInfo.requesterId = userId;
      currentPlayer.queue.push(track);
      if (!currentPlayer.currentTrack && !currentPlayer.paused) {
        await currentPlayer.play();
      }

      const trackInfo = track.info || track;
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2 as any],
        components: [
          ContainerFactory.buildReply(
            "success",
            `${EMOJIS.playlistaddline} | 已將 **${trackInfo.title || "歌曲"}** 加入隊列！`,
            interaction.user as any
          ).toJSON() as any
        ],
      });
    }
  } catch (err: any) {
    console.error("[Command:Play] resolveAndQueue error:", err);
    cs.clearOwner(guild.id);

    const payload = {
      components: [
        ContainerFactory.buildSimpleMessage(
          "播放錯誤",
          `${EMOJIS.errorwarningline} | ${formatUserFacingError(err?.message)}`,
          interaction.user as any
        ).toJSON() as any
      ],
      flags: [MessageFlags.IsComponentsV2 as any]
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}
