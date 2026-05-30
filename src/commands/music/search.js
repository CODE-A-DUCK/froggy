import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  ComponentType,
} from "discord.js";
import { controllerStore } from "../../store/ControllerStore.js";
import { CONTROLLER_DENIED_MESSAGE } from "../../utilities/voiceGuard.js";
import { formatDuration } from "../../utilities/formatDuration.js";
import { ytSearch } from "../../utilities/ytSearch.js";
import {
  checkCooldown,
  getRemainingCooldown,
} from "../../utilities/cooldown.js";

const SEARCH_COOLDOWN_MS = 5000;
const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

export const searchCommand = {
  name: "search",
  category: ":notes: | 音乐",
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
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:hourglass: | 請等待 ${(ms / 1000).toFixed(1)} 秒後再搜尋。`,
            )
            .setColor(0xef4444)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let results;
    try {
      results = await ytSearch(query, 5);
    } catch (err) {
      console.error("[Command] Search error:", err.message);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 搜尋失敗，請稍後再試。")
            .setColor(0xef4444)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
      });
    }

    if (!results.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 找不到結果，請換個關鍵字試試。")
            .setColor(0xef4444)
            .setFooter({
              text: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp(),
        ],
      });
    }

    const options = results.map((t, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(t.title.slice(0, 99))
        .setValue(t.url.slice(0, 100))
        .setDescription(
          `${t.duration ? formatDuration(t.duration) : "LIVE"}${t.uploader ? ` · ${t.uploader}` : ""}`.slice(
            0,
            100,
          ),
        )
        .setEmoji(NUMBER_EMOJIS[i]),
    );

    const listText = results
      .map(
        (t, i) =>
          `${NUMBER_EMOJIS[i]} **${t.title}** \`${t.duration ? formatDuration(t.duration) : "LIVE"}\`${t.uploader ? ` · ${t.uploader}` : ""}`,
      )
      .join("\n");

    const response = await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(":mag: | 搜尋結果")
          .setDescription(listText)
          .setColor(0xa855f7)
          .setFooter({
            text: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("search:select")
            .setPlaceholder("選擇一首歌曲...")
            .addOptions(options),
        ),
      ],
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === "search:select",
      time: 60000,
      max: 1,
    });

    collector.on("collect", async (i) => {
      await handleSearchSelect(i, context);
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction
          .editReply({
            content: "閒置太久了，我先走了",
            embeds: [],
            components: [],
          })
          .catch(() => null);
      }
    });
  },
};

async function handleSearchSelect(interaction, context) {
  const url = interaction.values[0];
  await interaction.deferUpdate();

  const { guildId, channelId } = interaction;
  const guild = interaction.guild;
  const member = await guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  const userVoiceChannel = member?.voice?.channel;

  if (!userVoiceChannel) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setDescription(":x: | 你必須在語音頻道中才能播放音樂。")
          .setColor(0xef4444)
          .setFooter({
            text: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const botMember = await guild.members
    .fetch(interaction.client.user.id)
    .catch(() => null);
  const botVoiceChannel = botMember?.voice?.channel;

  if (botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
    return interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `:x: | 你必須跟我在同一個頻道 <#${botVoiceChannel.id}> 才能播放音樂！`,
          )
          .setColor(0xef4444)
          .setFooter({
            text: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
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
    await context.guildPlayerManager.dispatch({
      guild_id: guildId,
      action: "play",
      channel_id: userVoiceChannel.id,
      track_url: url,
      interaction_token: "",
      text_channel_id: channelId,
      controller_user_id: controllerUserId,
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(":outbox_tray: | 收到！正在為你加入歌曲...")
          .setColor(0xa855f7)
          .setFooter({
            text: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
      components: [],
    });
  } catch (err) {
    cs.clearOwner(guildId);
    console.error("[Command] Search select error:", err);
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setDescription(":x: | 處理請求時發生錯誤，請稍後再試。")
          .setColor(0xef4444)
          .setFooter({
            text: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}
