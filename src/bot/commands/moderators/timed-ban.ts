import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";
import { scheduleUnban } from "../../utils/timed-ban-manager.js";

export const timedbanCommand = {
  name: "timedban",
  category: `${EMOJIS.shielduserline} | 版主`,

  data: new SlashCommandBuilder()
    .setName("timedban")
    .setDescription("暫時封鎖成員：指定天數後自動解除")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("指定暫時封鎖的成員")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("封鎖天數（1~365 天）")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(365),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("封鎖原因（可選）")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const member = interaction.member as GuildMember;
      if (!member || !member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 你沒有封鎖成員的權限`,
        });
      }

      const botMember = interaction.guild?.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.editReply({
          content: `${EMOJIS.errorwarningline} | 我沒有封鎖成員的權限`,
        });
      }

      const targetUser = interaction.options.getUser("user");
      if (!targetUser) return interaction.editReply("找不到該成員");
      const days = interaction.options.getInteger("days") || 1;
      const reason = interaction.options.getString("reason") || "暫時封鎖";

      const targetMember = await interaction.guild?.members
        .fetch(targetUser.id)
        .catch(() => null);
      if (targetMember) {
        if (
          targetMember.roles.highest.position >=
            member.roles.highest.position &&
          member.id !== interaction.guild?.ownerId
        ) {
          return interaction.editReply({
            content: `${EMOJIS.errorwarningline} | 目標成員的權限於你相同或高於你，無法執行封鎖程序`,
          });
        }
      }

      // calculating the banning itme, presented as Unix Timestamp in timeBans.json
      const unbanAt = Date.now() + days * 24 * 60 * 60 * 1000;
      const unbanDate = new Date(unbanAt).toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // ban
      await interaction.guild?.members.ban(targetUser.id, {
        reason: `${reason}（${days} 天後自動解除）`,
      });

      // auto unban
      if (interaction.guild) {
        await scheduleUnban(interaction.guild.id, targetUser.id, unbanAt, reason);
      }

      const embed = new EmbedBuilder()
        .setTitle("暫時封鎖成功")
        .setDescription(
          `已將 ${targetUser.tag} 封鎖 **${days} 天**\n` +
            `將於 **${unbanDate}** 自動解除封鎖`,
        )
        .setColor(0x57f287)
        .setFooter({
          text: `由 ${interaction.user.tag} 執行 | 原因：${reason}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:timedban] Error:", error);
      await interaction.editReply({
        content: `${EMOJIS.errorwarningline} | 程序執行時發生錯誤`,
      });
    }
  },
};
