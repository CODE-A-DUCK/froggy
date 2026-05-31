import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { validateVoiceState } from "../../utils/voiceGuard.js";
import {
  checkCooldown,
  getRemainingCooldown,
} from "../../utils/cooldown.js";
import { ContainerFactory } from "../../ui/music/ContainerFactory.js";

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
    .setDescription("透過 YouTube 連結直接播放歌曲（搜尋歌曲請用 /search）"),

  async execute(interaction, context) {
    if (!checkCooldown(interaction.user.id, "play", PLAY_COOLDOWN_MS)) {
      const ms = getRemainingCooldown(interaction.user.id, "play");
      return interaction.reply({
        components: [
          ContainerFactory.buildReply(
            "warning",
            `<:hourglassline:1510533872285253662> | 請等待 ${(ms / 1000).toFixed(1)} 秒後再使用。`,
            interaction.user,
          ),
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      });
    }

    await interaction.showModal(ContainerFactory.buildPlayModal());
  },
};

export async function handleMusicPlayModal(interaction, context) {
  const query = interaction.fields.getTextInputValue("MusicPlayUrlInput").trim();

  if (!isUrl(query)) {
    return interaction.reply({
      components: [
        ContainerFactory.buildReply(
          "error",
          "<:errorwarningline:1510533865805058188> | `/play` 只接受 YouTube 連結。\n若要搜尋歌曲，請使用 `/search`。",
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
      components: [
        ContainerFactory.buildReply(
          "error",
          "<:errorwarningline:1510533865805058188> | 執行時發生錯誤，請稍後再試。",
          interaction.user,
        ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }
}
