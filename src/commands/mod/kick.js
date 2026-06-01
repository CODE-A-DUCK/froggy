import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from "discord.js";

export const kickCommand = {
  name: "kick",
  category: "<:adminline:1510555676378796093> | 版主",
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("將指定成員踢出伺服器")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("要踢出的成員")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("踢出原因")
        .setRequired(false),
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 你沒有踢出成員的權限" });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 我沒有踢出成員的權限" });
      }

      const targetUser = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "未提供原因";

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 找不到該成員" });
      }

      if (
        targetMember.roles.highest.position >= interaction.member.roles.highest.position &&
        interaction.user.id !== interaction.guild.ownerId
      ) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 你無法踢出權限高於或等於你的成員",
        });
      }

      if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 我無法踢出該成員，該成員權限高於或等於我",
        });
      }

      await targetMember.kick(reason);

      const embed = new EmbedBuilder()
        .setTitle("成員已被踢出")
        .setDescription(
          `**${targetUser.tag}** 已被踢出伺服器\n\n**原因：** ${reason}`,
        )
        .setColor(0xffa500)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `由 ${interaction.user.tag} 執行` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:kick] Error:", error);
      await interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 踢出目標成員時發生錯誤" });
    }
  },
};
