import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

export const unmuteCommand = {
  name: "unmute",
  category: "<:adminline:1510555676378796093> | 版主",

  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("解除目標成員的禁言")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("要解除禁言的成員").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("原因（可選）").setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.editReply({
          content:
            "<:errorwarningline:1510529314515320944> | 你沒有管理成員的權限",
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.editReply({
          content:
            "<:errorwarningline:1510529314515320944> | 我沒有管理成員的權限",
        });
      }

      const targetUser = interaction.options.getUser("user");
      const targetMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);
      if (!targetMember) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 找不到該成員",
        });
      }

      if (!targetMember.isCommunicationDisabled()) {
        return interaction.editReply({
          content:
            "<:errorwarningline:1510529314515320944> | 該成員目前並沒有被禁言",
        });
      }

      if (
        targetMember.roles.highest.position >= member.roles.highest.position &&
        member.id !== interaction.guild.ownerId
      ) {
        return interaction.editReply({
          content:
            "<:errorwarningline:1510529314515320944> | 該成員的權限高於或等於你，無法解除其禁言",
        });
      }

      const reason = interaction.options.getString("reason") || "無原因";

      await targetMember.timeout(null, reason);

      const embed = new EmbedBuilder()
        .setTitle("禁言解除成功")
        .setDescription(`已解除 ${targetUser.tag} 的禁言`)
        .setColor(0x57f287)
        .setFooter({
          text: `由 ${interaction.user.tag} 執行 | 原因：${reason}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:unmute] Error:", error);
      await interaction.editReply({
        content: "<:errorwarningline:1510529314515320944> | 解除禁言時發生錯誤",
      });
    }
  },
};
