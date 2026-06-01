import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

export const softbanCommand = {
  name: "softban",
  category: "<:adminline:1510555676378796093> | 版主",

  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("軟封鎖目標成員：封鎖並立即解除，且清除最近7天訊息")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("要軟封鎖的成員").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("原因（可選）").setRequired(false),
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    try {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 你沒有封鎖成員的權限" });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 我沒有封鎖成員的權限" });
      }

      const targetUser = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "軟封鎖（清除訊息）";

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (targetMember) {
        if (
          targetMember.roles.highest.position >= member.roles.highest.position &&
          member.id !== interaction.guild.ownerId
        ) {
          return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 該成員的權限與你相同或高於你，無法執行軟封鎖" });
        }
      }

      await interaction.guild.members.ban(targetUser.id, {
        deleteMessageSeconds: 604800,
        reason: reason,
      });

      await interaction.guild.members.unban(targetUser.id, reason);

      const embed = new EmbedBuilder()
        .setTitle("軟封鎖成功")
        .setDescription(`已對 ${targetUser.tag} 執行軟封鎖：已清除最近7天訊息並解除封鎖`)
        .setColor(0x57f287)
        .setFooter({ text: `由 ${interaction.user.tag} 執行 | 原因：${reason}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:softban] Error:", error);
      await interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 執行軟封鎖時發生錯誤" });
    }
  },
};