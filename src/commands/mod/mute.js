import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from "discord.js";

export const muteCommand = {
  name: "mute",
  category: "<:adminline:1510555676378796093> | 版主",
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("禁言指定成員一段時間，期間無法發送消息")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("選擇要禁言的成員")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("minutes")
        .setDescription("禁言時長（分鐘，1~40320）")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("禁言原因（可選）")
        .setRequired(false),
    ),

  async execute(interaction, context) {
    await interaction.deferReply();

    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 你沒有禁言成員的權限" });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 我沒有禁言成員的權限" });
      }

      const targetUser = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");
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
          content: "<:errorwarningline:1510529314515320944> | 你無法禁言權限高於或等於你的成員",
        });
      }

      if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return interaction.editReply({
          content: "<:errorwarningline:1510529314515320944> | 我無法禁言該成員，該成員權限高於或等於我",
        });
      }

      const durationMs = minutes * 60 * 1000;

      await targetMember.timeout(durationMs, reason);

      const embed = new EmbedBuilder()
        .setTitle("成員已被禁言")
        .setDescription(
          `**${targetUser.tag}** 已被禁言 **${minutes} 分鐘**\n\n**原因：** ${reason}`,
        )
        .setColor(0x9b59b6)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `由 ${interaction.user.tag} 執行` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:mute] Error:", error);
      await interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 禁言目標成員時發生錯誤" });
    }
  },
};
