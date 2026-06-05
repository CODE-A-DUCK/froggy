import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChatInputCommandInteraction,
  GuildMember,
  Role,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";

export const removeroleCommand = {
  name: "removerole",
  category: `${EMOJIS.admin} | 管理`,
  data: new SlashCommandBuilder()
    .setName("removerole")
    .setDescription("為指定成員移除身份組")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("要移除身分組的成員")
        .setRequired(true),
    )
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("要移除的身份組").setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {

    try {
      const member = interaction.member as GuildMember;
      if (
        !member ||
        !member.permissions.has(
          PermissionsBitField.Flags.ManageRoles,
        )
      ) {
        return interaction.editReply({
          content: "你沒有管理身份組的權限",
        });
      }

      const botMember = interaction.guild?.members.me;
      if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.editReply({
          content: "我沒有管理身份組的權限",
        });
      }

      const targetUser = interaction.options.getUser("user");
      const targetRole = interaction.options.getRole("role") as Role;

      if (!targetUser || !targetRole) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 請提供有效的成員和身份組`,
        });
      }

      const targetMember = await interaction.guild?.members
        .fetch(targetUser.id)
        .catch(() => null);

      if (!targetMember) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 找不到該成員`,
        });
      }

      if (targetRole.position >= botMember.roles.highest.position) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 該身份組的權限高於我，無法移除`,
        });
      }

      if (!targetMember.roles.cache.has(targetRole.id)) {
        return interaction.editReply({
          content: `${targetUser.tag} 並沒有 **${targetRole.name}** 身份組`,
        });
      }

      await targetMember.roles.remove(targetRole);

      const embed = new EmbedBuilder()
        .setTitle("身份組移除成功")
        .setDescription(`已為 ${targetUser} 移除身份組 **${targetRole.name}**`)
        .setColor(0xff6b6b)
        .setTimestamp()
        .setFooter({ text: `由 ${interaction.user.tag} 執行` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:removerole] Error:", error);
      await interaction.editReply({
        content: `${EMOJIS.errorwarningline} | 移除身份組時發生錯誤`,
      });
    }
  },
};
