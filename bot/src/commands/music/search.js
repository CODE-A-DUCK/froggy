import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from "discord.js";
import { broker } from "../../broker.js";
import { CONTROLLER_DENIED_MESSAGE } from "../../controllerAccess.js";
import { formatDuration } from "../../utilities/formatDuration.js";
import { ytSearch } from "../../utilities/ytSearch.js";
import { checkCooldown, getRemainingCooldown } from "../../utilities/cooldown.js";

const SEARCH_COOLDOWN_MS = 5000;

export const searchCommand = {
  name: "search",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("搜尋歌曲，從結果中選擇後播放")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("歌曲名稱或關鍵字")
        .setRequired(true),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("query", true).trim();

    if (query.length > 100) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 搜尋詞太長，請限制在 100 個字以內。")
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const allowed = await checkCooldown(
      interaction.user.id,
      "search",
      SEARCH_COOLDOWN_MS,
    );
    if (!allowed) {
      const remaining = await getRemainingCooldown(interaction.user.id, "search");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:hourglass: | 請等待 ${(remaining / 1000).toFixed(1)} 秒後再搜尋。`,
            )
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let results;
    try {
      results = await ytSearch(query, 5);
    } catch (err) {
      console.error("[Command] Search yt-dlp error:", err.message);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 搜尋失敗，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }

    if (!results.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 找不到結果，請換個關鍵字試試。")
            .setColor(0xed4245),
        ],
      });
    }

    const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
    const options = results.map((track, i) => {
      const label = track.title.slice(0, 100);
      const dur = track.duration ? formatDuration(track.duration) : "LIVE";
      const up = track.uploader ? ` · ${track.uploader}` : "";
      const description = `${dur}${up}`.slice(0, 100);

      return new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(track.url.slice(0, 100))
        .setDescription(description)
        .setEmoji(NUMBER_EMOJIS[i]);
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId("search:select")
      .setPlaceholder("選擇一首歌曲...")
      .addOptions(options);

    const listText = results
      .map((t, i) => {
        const dur = t.duration ? formatDuration(t.duration) : "LIVE";
        const up = t.uploader ? ` · ${t.uploader}` : "";
        return `${NUMBER_EMOJIS[i]} **${t.title}** \`${dur}\`${up}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`:mag: | 搜尋結果`)
      .setDescription(listText)
      .setColor(0x5865f2)
      .setFooter({ text: `關鍵字：${query} · 請在 60 秒內選擇` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  },

  async handleSelectMenu(interaction) {
    const url = interaction.values[0];
    const { guildId, channelId } = interaction;

    await interaction.deferUpdate();

    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const userVoiceChannel = member?.voice?.channel;

    if (!userVoiceChannel) {
      return interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 你必須在語音頻道中才能播放音樂。")
            .setColor(0xed4245),
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
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    let controllerOwnerId = await broker.getActiveControllerOwner(guildId);
    if (!botVoiceChannel && controllerOwnerId) {
      await broker.clearControllerOwner(guildId);
      controllerOwnerId = null;
    }

    if (controllerOwnerId && controllerOwnerId !== interaction.user.id) {
      return interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setDescription(CONTROLLER_DENIED_MESSAGE)
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const controllerUserId = controllerOwnerId ?? interaction.user.id;
    let claimedController = false;

    try {
      if (!controllerOwnerId) {
        claimedController = await broker.claimControllerOwner(
          guildId,
          interaction.user.id,
        );
        if (!claimedController) {
          return interaction.followUp({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  ":lock: | 遙控器已被其他使用者拿掉了，請稍後再操作！",
                )
                .setColor(0xed4245),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (!botVoiceChannel) {
        guild.shard.send({
          op: 4,
          d: {
            guild_id: guildId,
            channel_id: userVoiceChannel.id,
            self_mute: false,
            self_deaf: false,
          },
        });
      }

      await broker.publishAudioTask(
        guildId,
        userVoiceChannel.id,
        url,
        "",
        channelId,
        controllerUserId,
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":outbox_tray: | 收到！正在為你加入歌曲...")
            .setColor(0x5865f2),
        ],
        components: [],
      });
    } catch (err) {
      if (claimedController) {
        await broker.clearControllerOwner(guildId).catch(() => null);
      }
      console.error("[Command] Search select error:", err);
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 處理請求時發生錯誤，請稍後再試。")
            .setColor(0xed4245),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
