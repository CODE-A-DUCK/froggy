import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SlashCommandBuilder,
  EmbedBuilder,
  version as djsVersion,
  ChatInputCommandInteraction,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";


const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = join(__dirname, "../../../../package.json");
const { version, description } = JSON.parse(readFileSync(packagePath, "utf8"));

function getReadableTime(ms: number) {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor((ms / (1000 * 60)) % 60);
  const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const d = Math.floor(ms / (1000 * 60 * 60 * 24));
  const parts = [];
  if (d > 0) parts.push(`${d} 天`);
  if (h > 0) parts.push(`${h} 小時`);
  if (m > 0) parts.push(`${m} 分鐘`);
  if (s > 0) parts.push(`${s} 秒`);
  return parts.join(" ") || "0 秒";
}

export const botinfoCommand = {
  name: "botinfo",
  category: `${EMOJIS.homeline} | 基本`,
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("查看我的信息"),
  async execute(interaction: ChatInputCommandInteraction) {
    const { client } = interaction;
    if (!client.user || !interaction.guild || !interaction.guild.members.me) {
      await interaction.editReply("無法取得機器人資訊。");
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${client.user.username} 的資訊`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .setDescription(description ?? "")
      .setColor(0xd98d30)
      .addFields(
        {
          name: "伺服器暱稱",
          value: `${interaction.guild.members.me.nickname || "無"}`,
          inline: true,
        },
        {
          name: "使用者數量",
          value: `${(client.users.cache.size - client.users.cache.filter((u) => u.bot).size).toLocaleString()}`,
          inline: true,
        },
        {
          name: "頻道",
          value: `${client.channels.cache.size.toLocaleString()}`,
          inline: true,
        },
        {
          name: "伺服器",
          value: `${client.guilds.cache.size.toLocaleString()}`,
          inline: true,
        },
        {
          name: "上線時長",
          value: getReadableTime(client.uptime),
          inline: true,
        },
        {
          name: "版本",
          value: `${version} (D.JS v${djsVersion})`,
          inline: true,
        },
        {
          name: `加入 ${interaction.guild.name} 時間`,
          value: interaction.guild.joinedAt ? `<t:${Math.floor(interaction.guild.joinedAt.getTime() / 1000)}:F>` : "未知",
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: `${interaction.user.tag}` });
    await interaction.editReply({ embeds: [embed] });
  },
};
