import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export const setnicknameCommand = {
  name: "setnickname",
  category: "<:adminline:1510555676378796093> | 版主",
  data: new SlashCommandBuilder()
    .setName("setnickname")
    .setDescription("設定或移除伺服器成員的暱稱")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("要設定暱稱的成員").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("nickname").setDescription("新的暱稱（最多32字元，不選擇則清除）").setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("原因（可選）").setRequired(false),
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    try {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 你沒有設定暱稱的權限" });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 我沒有權限設定暱稱" });
      }

      const targetUser = interaction.options.getUser("user");
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 找不到該成員" });
      }

      if (
        targetMember.roles.highest.position >= member.roles.highest.position &&
        member.id !== interaction.guild.ownerId
      ) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 該成員的權限高於或等於你，因此你無法修改其暱稱" });
      }

      const newNickname = interaction.options.getString("nickname") || null;
      const reason = interaction.options.getString("reason") || "無原因";

      await targetMember.setNickname(newNickname, reason);

      const embed = new EmbedBuilder()
        .setTitle("暱稱設定成功")
        .setDescription(
          `已將 ${targetUser.tag} 的暱稱設定為：\`${newNickname || "（已清除）"}\``,
        )
        .setColor(0x57f287)
        .setFooter({ text: `由 ${interaction.user.tag} 執行 | 原因：${reason}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:setnickname] Error:", error);
      await interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 設定暱稱時發生錯誤或你無法修改比你更高或同等權限的成員暱稱" });
    }
  },
};