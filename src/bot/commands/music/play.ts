import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from "discord.js";

import { ContainerFactory } from "../../../player/ui/container-factory.js";
import { checkCooldown, getRemainingCooldown } from "../../../player/utils/cooldown.js";
import { formatUserFacingError } from "../../../player/utils/error-formatter.js";
import { validateVoiceState } from "../../../player/utils/voice-guard.js";
import { EMOJIS } from "../../../shared/emojis.js";
import { validatePlayUrl } from "../../security/sanitize-query.js";
import { nodeStateStore } from "../../store/node-state-store.js";

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
        components: [ContainerFactory.buildReply("warning", `${EMOJIS.hourglassline} | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`, interaction.user as any)],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }

    const query = interaction.options.getString("鏈接", true).trim();
    const urlValidation = validatePlayUrl(query);
    if (!urlValidation.ok) {
      return interaction.editReply({
        components: [ContainerFactory.buildReply("warning", `${EMOJIS.errorwarningline} | 請提供有效的 YouTube 連結。搜尋歌曲請使用 \`/search\` 指令。`, interaction.user as any)],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireController: false,
    });
    if (!validation) return;

    const { guild, userVoiceChannel, botVoiceChannel } = validation;
    const { controllerStore: cs, ipcClient, voiceGateway } = context;

    if (!botVoiceChannel) cs.clearOwner(guild.id);
    if (!cs.getOwner(guild.id)) cs.setOwner(guild.id, interaction.user.id);

    try {
      if (!nodeStateStore.isConnected(guild.id)) {
        await voiceGateway.connectToChannel(guild.id, userVoiceChannel.id);
      }

      await ipcClient.sendRequest("PLAY", {
        guild_id: guild.id,
        url: urlValidation.url,
        text_channel_id: interaction.channelId,
        controller_user_id: interaction.user.id,
        interaction_token: interaction.token,
      });
    } catch (err: any) {
      console.error("[Command] Play error:", err);
      cs.clearOwner(guild.id);

      await interaction.editReply({
        components: [ContainerFactory.buildSimpleMessage("播放錯誤", `${EMOJIS.errorwarningline} | ${formatUserFacingError(err?.message)}`, interaction.user as any)],
        flags: [MessageFlags.IsComponentsV2 as any],
      });
    }
  },
};
