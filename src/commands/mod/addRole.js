import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from "discord.js";

export const addroleCommand = {
  name: "addrole",
  category: "<:adminline:1510555676378796093> | 版主",
  data: new SlashCommandBuilder()
    .setName("addrole")
    .setDescription("為指定成員添加指定身份組")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("要添加身份組的成員")
        .setRequired(true),
    )
    .addRoleOption((opt) =>
      opt
        .setName("role")
        .setDescription("要添加的身份組")
        .setRequired(true),
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 你沒有管理身份組的權限",
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 我沒有管理身份組的權限",
        });
      }

      const targetUser = interaction.options.getUser("user");
      const targetRole = interaction.options.getRole("role");

      if (!targetUser || !targetRole) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 請提供有效的成員和身份組" });
      }

      const targetMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      if (!targetMember) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 找不到該成員" });
      }


      if (targetRole.position >= botMember.roles.highest.position) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 該身份組的權限高於或等於我，無法添加",
        });
      }

      if (targetMember.roles.cache.has(targetRole.id)) {
        return interaction.editReply({
          content: `<:errorwarningline:1510529314515320944> | ${targetUser.tag} 已經擁有 **${targetRole.name}** 身份組`,
        });
      }

      await targetMember.roles.add(targetRole);

      const embed = new EmbedBuilder()
        .setTitle("身份組添加成功")
        .setDescription(
          `已為 ${targetUser.tag} 添加身份組 **${targetRole.name}**`,
        )
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: `由 ${interaction.user.tag} 執行` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:addrole] Error:", error);
      await interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 添加身份組時發生錯誤" });
    }
  },
};