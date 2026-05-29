import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { formatDuration } from "../../utilities/formatDuration.js";

export const queueCommand = {
  name: "queue",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("查看當前播放隊列"),
  async execute(interaction, context) {
    await interaction.deferReply();
    try {
      const { current, queue, length } =
        await context.guildPlayerManager.getQueue(interaction.guildId);

      if (!current && length === 0) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription(":notepad_spiral: | 隊列是空的。")
              .setColor(0x5865f2),
          ],
        });
      }

      const lines = [];
      if (current) {
        lines.push(
          `**▶ 正在播放：** [${current.title}](${current.url}) \`${current.duration ? formatDuration(current.duration) : "LIVE"}\``,
        );
      }
      if (queue.length > 0) {
        lines.push("", "**接下來：**");
        queue.forEach((t, i) => {
          lines.push(
            `\`${i + 1}.\` [${t.title}](${t.url}) \`${t.duration ? formatDuration(t.duration) : "LIVE"}\``,
          );
        });
      }
      if (length > queue.length) {
        lines.push(`\n*...還有 ${length - queue.length} 首歌曲*`);
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(":notepad_spiral: | 播放隊列")
            .setDescription(lines.join("\n"))
            .setColor(0x5865f2)
            .setFooter({ text: `共 ${length} 首歌曲在隊列中` }),
        ],
      });
    } catch (err) {
      console.error("[Command] Queue error:", err);
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
