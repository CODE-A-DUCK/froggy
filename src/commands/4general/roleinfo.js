import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

export const roleinfoCommand = {
  name: "roleinfo",
  category: "<:homeline:1510525361702699048> | 基本",

  data: new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("查看指定身份組的詳細資訊")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("要查詢的身份組")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const role = interaction.options.getRole("role");

      if (!role) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 找不到該身份組",
        });
      }

      const memberCount = role.members.size;

      const createdAt = `<t:${Math.floor(
        role.createdTimestamp / 1000,
      )}:F>`;

      const colorText =
        role.color === 0
          ? "預設"
          : `${role.hexColor.toUpperCase()} (${role.color})`;

      const permissions =
        role.permissions.toArray().join(", ") || "無特殊權限";

      const embed = new EmbedBuilder()
        .setTitle(`${role.name} 身份組資訊`)
        .setColor(role.color || 0x5865f2)
        .setThumbnail(
          interaction.guild.iconURL({
            extension: "png",
            size: 1024,
          }) || interaction.client.user.displayAvatarURL(),
        )
        .addFields(
          {
            name: "身份組 ID",
            value: `\`${role.id}\``,
            inline: false,
          },
          {
            name: "顏色",
            value: colorText,
            inline: true,
          },
          {
            name: "位置",
            value: `${role.position}`,
            inline: true,
          },
          {
            name: "成員數",
            value: `${memberCount} 人`,
            inline: true,
          },
          {
            name: "建立時間",
            value: createdAt,
            inline: false,
          },
          {
            name: "是否置頂",
            value: role.hoist ? "是" : "否",
            inline: true,
          },
          {
            name: "可被提及",
            value: role.mentionable ? "是" : "否",
            inline: true,
          },
          {
            name: "權限",
            value:
              permissions.length > 1000
                ? permissions.slice(0, 1000) + "..."
                : permissions,
            inline: false,
          },
        )
        .setFooter({
          text: `由 ${interaction.user.tag} 查詢`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error("[roleinfo] Error:", error);

      await interaction.editReply({
        content: "<:errorwarningline:1510529314515320944> | 查詢身份組資訊時發生錯誤",
      });
    }
  },
};