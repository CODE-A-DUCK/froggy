import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";


export const slowmodeCommand = {
  name: "slowmode",
  category: `${EMOJIS.adminline} | 版主`,
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("於文字頻道設定或移除慢速模式")
    .addIntegerOption((opt) =>
      opt
        .setName("seconds")
        .setDescription("慢速模式持續秒數（0 = 關閉，最大 21600）")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("目標頻道（預設為當前頻道）")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("原因（可選）").setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({
          content:
            `${EMOJIS.errorwarningline} | 你沒有管理頻道的權限`,
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({
          content:
            `${EMOJIS.errorwarningline} | 我沒有管理頻道的權限`,
        });
      }

      const seconds = interaction.options.getInteger("seconds");
      const targetChannel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (targetChannel.type !== ChannelType.GuildText) {
        return interaction.editReply({
          content:
            `${EMOJIS.errorwarningline} | 只能在文字頻道設定慢速模式`,
        });
      }

      const reason = interaction.options.getString("reason") || "無原因";

      await targetChannel.setRateLimitPerUser(seconds, reason);

      const embed = new EmbedBuilder()
        .setTitle("慢速模式設定成功")
        .setDescription(
          seconds === 0
            ? `已關閉 ${targetChannel} 的慢速模式`
            : `已將 ${targetChannel} 的慢速模式設定為 **${seconds} 秒**`,
        )
        .setColor(0x57f287)
        .setFooter({
          text: `由 ${interaction.user.tag} 執行 | 原因：${reason}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:slowmode] Error:", error);
      await interaction.editReply({
        content:
          `${EMOJIS.errorwarningline} | 設定慢速模式時發生錯誤。`,
      });
    }
  },
};
