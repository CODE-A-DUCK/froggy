import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const serverinfo = {
  name: "serverinfo",
  category: ":tools: | 基本",
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("查看當前伺服器資訊"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const guild = interaction.guild;

      if (!guild) {
        return interaction.editReply({
          content: ":x: | 這個指令只能在伺服器中使用",
        });
      }

      const owner = await guild.fetchOwner();

      const embed = new EmbedBuilder()
        .setTitle(`:bar_chart: | ${guild.name} 伺服器資訊`)
        .setDescription(guild.description || "這個伺服器沒有設定描述")
        .setColor(0xd98d30)
        .setThumbnail(
          guild.iconURL({ dynamic: true }) ||
            interaction.client.user.displayAvatarURL({ dynamic: true }),
        )
        .addFields(
          { name: ":id: | 伺服器 ID", value: guild.id, inline: true },
          {
            name: ":crown: | 擁有者",
            value: `${owner.user.tag}`,
            inline: false,
          },
          {
            name: ":busts_in_silhouette: | 成員數",
            value: `${guild.memberCount} 人`,
            inline: false,
          },
          {
            name: ":calendar: | 建立時間",
            value: `${new Date(guild.createdTimestamp).toLocaleDateString("zh-TW")}`,
            inline: true,
          },
          {
            name: ":rocket: | 伺服器加成等級",
            value: `Level ${guild.premiumTier}`,
            inline: false,
          },
          {
            name: ":speech_balloon: | 文字頻道",
            value: `${guild.channels.cache.filter((c) => c.type === 0).size} 個`,
            inline: false,
          },
          {
            name: ":microphone: | 語音頻道",
            value: `${guild.channels.cache.filter((c) => c.type === 2).size} 個`,
            inline: false,
          },
        )
        .setFooter({ text: `${interaction.user.tag}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:serverinfo] Error:", error);
      await interaction.editReply({
        content: ":x: | 查詢伺服器資訊時發生錯誤。",
      });
    }
  },
};
