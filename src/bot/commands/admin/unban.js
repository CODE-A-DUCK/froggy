import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";


export const unbanCommand = {
  name: "unban",
  category: `${EMOJIS.adminline} | 版主`,

  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("解除指定成員的封鎖")
    .addStringOption((opt) =>
      opt
        .setName("user_id")
        .setDescription("要解除封鎖的成員 ID")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("原因（可選）").setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({
          content:
            `${EMOJIS.errorwarningline} | 你沒有封鎖成員權限`,
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({
          content:
            `${EMOJIS.errorwarningline} | 我沒有權限解除封鎖`,
        });
      }

      const userId = interaction.options.getString("user_id").trim();
      const reason = interaction.options.getString("reason") || "無原因";

      const banList = await interaction.guild.bans.fetch().catch(() => null);
      if (!banList || !banList.has(userId)) {
        return interaction.editReply({
          content: `成員 ID \`${userId}\` 並未被封鎖`,
        });
      }

      await interaction.guild.members.unban(userId, reason);

      const embed = new EmbedBuilder()
        .setTitle("解除封鎖成功")
        .setDescription(`已解除成員 ID \`${userId}\` 的封鎖`)
        .setColor(0x57f287)
        .setFooter({
          text: `由 ${interaction.user.tag} 執行 | 原因：${reason}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:unban] Error:", error);
      await interaction.editReply({
        content:
          `${EMOJIS.errorwarningline} | 解除封鎖時發生錯誤，請確認目標成員的 ID 是否正確，並且我是否有足夠的權限`,
      });
    }
  },
};
