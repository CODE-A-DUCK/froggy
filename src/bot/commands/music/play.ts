import { ChatInputCommandInteraction, ButtonInteraction, GuildMember } from "discord.js";

import { checkCooldown, getRemainingCooldown } from "../../../player/utils/cooldown.js";
import { formatUserFacingError } from "../../../player/utils/error-formatter.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize.js";
import { replyWithState } from "../../utils/reply.js";

const PLAY_COOLDOWN_MS = 3000;

export async function executePlay(interaction: ChatInputCommandInteraction, context: any) {
  if (!checkCooldown(interaction.user.id, "play", PLAY_COOLDOWN_MS)) {
    const ms = getRemainingCooldown(interaction.user.id, "play");
    return replyWithState(interaction, "warning", `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`);
  }

  const query = interaction.options.getString("鏈接", true).trim();
  const urlValidation = validatePlayUrl(query);
  if (!urlValidation.ok) {
    return replyWithState(interaction, "warning", `${EMOJIS.errorwarningline} | 請提供有效的 YouTube 連結。搜尋歌曲請使用 \`/search\` 指令。`);
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
  } catch {
    // 忽略解析錯誤，使用原本的 url
  }

  await resolveAndQueue(interaction, finalUrl, interaction.user.id, context);
}

export async function resolveAndQueue(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  url: string,
  userId: string,
  context: any
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

    let result: any = null;
    let retries = 3;

    while (retries > 0) {
      try {
        result = await node.rest.resolve(url);
        if (result && result.loadType !== "empty" && result.loadType !== "error") {
          break; // 成功解析
        }
      } catch (e) {
        console.error(`[Play] Network error while resolving ${url}:`, e);
      }
      
      retries--;
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!result || result.loadType === "empty" || result.loadType === "error") {
      throw new Error("找不到歌曲，或發生網路錯誤 (已自動重試 3 次失敗)");
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
      await replyWithState(interaction, "success", `${EMOJIS.playlistaddline} | 已將播放清單加入隊列！`);
    } else if (result.loadType === "track" || result.loadType === "search") {
      const track = result.loadType === "search" ? result.data[0] : result.data;
      track.pluginInfo = track.pluginInfo || {};
      track.pluginInfo.requesterId = userId;
      currentPlayer.queue.push(track);
      if (!currentPlayer.currentTrack && !currentPlayer.paused) {
        await currentPlayer.play();
      }

      const trackInfo = track.info || track;
      await replyWithState(interaction, "success", `${EMOJIS.playlistaddline} | 已將 **${trackInfo.title || "歌曲"}** 加入隊列！`);
    }
  } catch (err: any) {
    cs.clearOwner(guild.id);
    await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | ${formatUserFacingError(err?.message)}`);
  }
}
