import {
  SlashCommandBuilder,
  EmbedBuilder,
  version as djsVersion,
  ChannelType,
} from "discord.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = join(__dirname, "../../../package.json");
const { version, description } = JSON.parse(readFileSync(packagePath, "utf8"));
/**
 * Converts milliseconds into a readable time string.
 * @param {number} timestamp - The duration in milliseconds.
 * @returns {string} - The formatted time string.
 */
function getReadableTime(timestamp) {
  const seconds = Math.floor((timestamp / 1000) % 60);
  const minutes = Math.floor((timestamp / (1000 * 60)) % 60);
  const hours = Math.floor((timestamp / (1000 * 60 * 60)) % 24);
  const days = Math.floor(timestamp / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小時`);
  if (minutes > 0) parts.push(`${minutes} 分鐘`);
  if (seconds > 0) parts.push(`${seconds} 秒`);

  return parts.join(" ") || "0 秒";
}

export const botinfoCommand = {
  name: "botinfo",
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("查看我的信息"),
  async execute(interaction) {
    await interaction.deferReply();
    const { client } = interaction;
    const totalUsers = client.users.cache.size;
    const botUsers = client.users.cache.filter((user) => user.bot).size;
    const humanUsers = totalUsers - botUsers;
    const totalChannels = client.channels.cache.size;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${client.user.username} 的資訊`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .setDescription(description)
      .setColor(0xd98d30)
      .setImage()
      .addFields(
        {
          name: "伺服器暱稱",
          value: `${interaction.guild.members.me.nickname || "無"}`,
          inline: true,
        },
        {
          name: "使用者數量",
          value: `${humanUsers.toLocaleString()}`,
          inline: true,
        },
        {
          name: "頻道",
          value: `${totalChannels.toLocaleString()}`,
          inline: true,
        },
        {
          name: "伺服器",
          value: `${client.guilds.cache.size.toLocaleString()}`,
          inline: true,
        },
        {
          name: "上線時長",
          value: `${getReadableTime(client.uptime)}`,
          inline: true,
        },
        {
          name: "版本",
          value: `${version}`,
          inline: true,
        },
        {
          name: `加入 ${interaction.guild.name} 時間`,
          value: `<t:${Math.floor(interaction.guild.joinedAt.getTime() / 1000)}:F>`,
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: `${interaction.client.user.username}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
