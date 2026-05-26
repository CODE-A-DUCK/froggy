import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Redis from "ioredis";
import { config } from "../../config.js";
import { formatDuration } from "../../utilities/formatDuration.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

const redis = new Redis(config.redisUrl);

export const queueCommand = {
  name: "queue",
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("顯示目前的播放隊列"),
  async execute(interaction) {
    await interaction.deferReply();
    const validation = await validateVoiceState(interaction, {
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

    const guildId = interaction.guildId;
    const queueKey = `music:queue:${guildId}`;
    const currentKey = `music:current:${guildId}`;

    try {
      const [currentData, queueData, totalItems] = await Promise.all([
        redis.get(currentKey),
        redis.lrange(queueKey, 0, 9),
        redis.llen(queueKey),
      ]);

      const nowPlaying = currentData ? JSON.parse(currentData) : null;
      const upcoming = queueData.map((item) => JSON.parse(item));

      if (!nowPlaying && upcoming.length === 0) {
        return interaction.editReply({
          content: ":page_facing_up: | 目前隊列是空的！",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(":notes: | 當前播放隊列")
        .setColor(0x5865f2)
        .setThumbnail(nowPlaying?.thumbnail || upcoming[0]?.thumbnail || null);

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

      if (totalItems > 10) {
        embed.setFooter({ text: `還有其餘 ${totalItems - 10} 首歌曲...` });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command] Queue error:", error);
      return interaction.editReply({
        content: ":x: | 無法獲取隊列資訊。",
      });
    }
  },
};
