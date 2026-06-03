import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";

export const setnicknameCommand = {
  name: "setnickname",
  category: `${EMOJIS.shielduserline} | 版主`,
  data: new SlashCommandBuilder()
    .setName("setnickname")
    .setDescription("設定或移除伺服器成員的暱稱")
    .addUserOption((opt) =>
      opt.setName("成員").setDescription("要設定暱稱的成員").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("暱稱")
        .setDescription("新的暱稱（最多32字元，不選擇則清除）")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName("原因").setDescription("原因（可選）").setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 你沒有設定暱稱的權限`,
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 我沒有權限設定暱稱`,
        });
      }

      const targetUser = interaction.options.getUser("成員");
      const targetMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);
      if (!targetMember) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 找不到該成員`,
        });
      }

      if (
        targetMember.roles.highest.position >= member.roles.highest.position &&
        member.id !== interaction.guild.ownerId
      ) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 該成員的權限高於或等於你，因此你無法修改其暱稱`,
        });
      }

      const newNickname = interaction.options.getString("暱稱") || null;
      const reason = interaction.options.getString("原因") || "無原因";

      await targetMember.setNickname(newNickname, reason);

      const embed = new EmbedBuilder()
        .setTitle("暱稱設定成功")
        .setDescription(
          `已將 ${targetUser.tag} 的暱稱設定為：\`${newNickname || "（已清除）"}\``,
        )
        .setColor(0x57f287)
        .setFooter({
          text: `由 ${interaction.user.tag} 執行 | 原因：${reason}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:setnickname] Error:", error);
      await interaction.editReply({
        content: `${EMOJIS.errorwarningline} | 設定暱稱時發生錯誤或你無法修改比你更高或同等權限的成員暱稱`,
      });
    }
  },
};
