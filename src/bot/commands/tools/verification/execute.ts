// 處理 /verify setup 的邏輯

import {
  ChatInputCommandInteraction,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";

import { db } from "../../../../db/index.js";
import { EMOJIS } from "../../../../shared/emojis.js";
import { replyWithState } from "../../../utils/reply.js";
import { VERIFICATION_METHODS } from "./constants.js";

export async function executeVerificationCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "setup") {
    const targetChannel = interaction.options.getChannel("channel", true) as import("discord.js").TextChannel;
    const method = interaction.options.getString("method", true);
    const guild = interaction.guild;

    if (!guild || targetChannel.type !== ChannelType.GuildText) return;

    try {
      const selectedRole = interaction.options.getRole("role", true);
      const verifyRoleId = selectedRole.id;
      const kickOnFail = interaction.options.getBoolean("kick") ?? false;

      await db
        .insertInto("guild_config")
        .values({ guild_id: guild.id, verify_role_id: verifyRoleId, kick_on_fail: kickOnFail })
        .onConflict(oc =>
          oc.column("guild_id").doUpdateSet({ verify_role_id: verifyRoleId, kick_on_fail: kickOnFail })
        )
        .execute();

      const btn = new ButtonBuilder()
        .setCustomId(`verify:${method}`)
        .setLabel("驗證")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

      const embed = new EmbedBuilder()
        .setTitle("伺服器驗證")
        .setDescription(`請點擊下方按鈕進行 **${VERIFICATION_METHODS[method]}**，完成後即可獲取訪問權限。`)
        .setColor(0x2ecc71);

      await targetChannel.send({
        embeds: [embed],
        components: [row as any]
      });

      await replyWithState(
        interaction,
        "success",
        `${EMOJIS.checkdoubleline} | 驗證按鈕已成功發送至 <#${targetChannel.id}>！\n驗證身份組：<@&${verifyRoleId}>`
      );
    } catch (err) {
      console.error("Verify setup error:", err);
      await replyWithState(interaction, "error", `${EMOJIS.errorwarningline} | 設定失敗，請確認我有足夠的權限。`);
    }
  }
}
