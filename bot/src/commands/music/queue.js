import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { formatDuration } from "../../utilities/formatDuration.js";

export const queueCommand = {
  name: "queue",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("顯示目前的播放隊列"),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 這個指令只能在伺服器中使用。")
            .setColor(0xed4245),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const guildId = interaction.guildId;

    try {
      const [nowPlaying, { items: upcoming, total }] = await Promise.all([
        broker.getCurrentTrack(guildId),
        broker.getQueue(guildId, 10),
      ]);

      if (!nowPlaying && upcoming.length === 0) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription(":page_facing_up: | 目前隊列是空的！")
              .setColor(0x5865f2),
          ],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(":notes: | 當前播放隊列")
        .setColor(0x5865f2)
        .setThumbnail(nowPlaying?.thumbnail ?? upcoming[0]?.thumbnail ?? null);

      if (nowPlaying) {
        embed.addFields({
          name: ":arrow_forward: | 正在播放",
          value: `[${nowPlaying.title}](${nowPlaying.url}) | \`${nowPlaying.duration ? formatDuration(nowPlaying.duration) : "LIVE"}\``,
        });
      }

      if (upcoming.length > 0) {
        const upcomingList = upcoming
          .map(
            (track, index) =>
              `${index + 1}. [${track.title}](${track.url}) | \`${track.duration ? formatDuration(track.duration) : "LIVE"}\``,
          )
          .join("\n");
        embed.addFields({
          name: ":hourglass: | 即將播放",
          value: upcomingList,
        });
      }

      if (total > 10) {
        embed.setFooter({ text: `還有其餘 ${total - 10} 首歌曲...` });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command] Queue error:", error);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 無法獲取隊列資訊，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }
  },
};
