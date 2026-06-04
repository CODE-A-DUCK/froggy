import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";

export const banCommand = {
  name: "ban",
  category: `${EMOJIS.admin} | 管理`,
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription(
      "將指定成員封鎖，除非管理員手動解除或使用/unban指令，否則將無法從新加入伺服器",
    )
    .addUserOption((opt) =>
      opt.setName("user").setDescription("要封鎖的成員").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("封鎖原因（可選）")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const member = interaction.member as GuildMember;
      if (
        !member ||
        !member.permissions.has(
          PermissionsBitField.Flags.BanMembers,
        )
      ) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 你沒有封鎖成員的權限`,
        });
      }

      const botMember = interaction.guild?.members.me;
      if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 我沒有封鎖成員的權限`,
        });
      }

      const targetUser = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "未提供原因";

      if (!targetUser) return interaction.editReply("找不到該成員");
      const targetMember = await interaction.guild?.members
        .fetch(targetUser.id)
        .catch(() => null);

      if (targetMember) {
        if (
          targetMember.roles.highest.position >=
            member.roles.highest.position &&
          interaction.user.id !== interaction.guild.ownerId
        ) {
          return interaction.editReply({
            content: `${EMOJIS.errorwarningline} | 你無法封鎖權限高於或等於你的成員`,
          });
        }

        if (
          targetMember.roles.highest.position >=
          botMember.roles.highest.position
        ) {
          return interaction.editReply({
            content: `${EMOJIS.errorwarningline} | 我無法封鎖該成員，該成員的權限高於或等於我`,
          });
        }
      }

      await interaction.guild?.members.ban(targetUser.id, { reason });

      const embed = new EmbedBuilder()
        .setTitle("成員已被封鎖")
        .setDescription(
          `**${targetUser.tag}** 已被永久封鎖\n\n**原因：** ${reason}`,
        )
        .setColor(0xff0000)
        .setThumbnail(targetUser.displayAvatarURL())
        .setFooter({ text: `由 ${interaction.user.tag} 執行` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:ban] Error:", error);
      await interaction.editReply({
        content: `${EMOJIS.errorwarningline} | 封鎖目標成員時發生錯誤`,
      });
    }
  },
};
