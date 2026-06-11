// 處理點擊驗證按鈕、動態驗證碼按鈕的邏輯
import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder
} from "discord.js";

import { config } from "../../../../config.js";
import { generateVerifyToken } from "../../../../server/turnstile.js";
import { generateStaticCaptcha, generateAnimatedCaptcha } from "../../../utils/captcha.js";
import { grantRole, validateVerificationPreconditions, handleVerificationFailure } from "../../../utils/interaction-helpers.js";
import { replyWithState } from "../../../utils/reply.js";

export async function handleVerificationButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;
  if (!guildId) return;

  if (action === "entercaptcha") {
    const answer = parts[2];
    const modal = new ModalBuilder()
      .setCustomId(`verify:modal:${answer}`)
      .setTitle("靜態驗證碼");
    const input = new TextInputBuilder()
      .setCustomId("captcha_input")
      .setLabel("請輸入圖片中的文字")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return await interaction.showModal(modal);
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const precondition = await validateVerificationPreconditions(interaction);
  if (!precondition) return;
  const { member, roleId } = precondition;

  switch (action) {
    case "fast":
      await grantRole(member, roleId);
      return replyWithState(interaction, "success", "快速驗證成功！已發放身份組。");

    case "animated_ans": {
      const expectedAnswer = parts[2];
      const userAnswer = parts[3];

      if (userAnswer !== expectedAnswer) {
        const kicked = await handleVerificationFailure(member);
        return replyWithState(interaction, "error", `選擇錯誤！生個叉燒包都好過你！${kicked ? "您將在 5 秒後被踢出伺服器。" : "請重新點擊驗證按鈕。"}`);
      }

      await grantRole(member, roleId);
      return replyWithState(interaction, "success", "驗證成功！已發放身份組。");
    }

    case "captcha": {
      const captcha = await generateStaticCaptcha();
      const attachment = new AttachmentBuilder(captcha.buffer, { name: "captcha.png" });

      const btn = new ButtonBuilder()
        .setCustomId(`verify:entercaptcha:${captcha.text}`)
        .setLabel("輸入驗證碼")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

      const embed = new EmbedBuilder()
        .setTitle("靜態驗證碼")
        .setDescription("請點擊下方按鈕並輸入圖片中的文字：")
        .setImage("attachment://captcha.png")
        .setColor(0x2ecc71);

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [row as any]
      });
      return;
    }

    case "animated": {
      const captcha = await generateAnimatedCaptcha();
      const attachment = new AttachmentBuilder(captcha.buffer, { name: "captcha.webp" });

      const buttons = captcha.options.map(opt =>
        new ButtonBuilder()
          .setCustomId(`verify:animated_ans:${captcha.duplicateGroup}:${opt}`)
          .setLabel(opt)
          .setStyle(ButtonStyle.Secondary)
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      const embed = new EmbedBuilder()
        .setTitle("動態驗證碼")
        .setDescription("請仔細觀察動畫，並從下方按鈕中選擇**重複出現**的那一組數字：")
        .setImage("attachment://captcha.webp")
        .setColor(0x2ecc71);

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [row as any]
      });
      return;
    }

    case "turnstile": {
      if (!config.domain) {
        return replyWithState(interaction, "error", "系統尚未設定公開網域 (DOMAIN)，無法使用 Cloudflare Turnstile 驗證。");
      }

      const token = generateVerifyToken({ guildId, userId: interaction.user.id, roleId });
      const domainStr = config.domain.startsWith("http") ? config.domain : `https://${config.domain}`;
      const verifyUrl = `${domainStr}/verify?token=${token}`;

      const btn = new ButtonBuilder()
        .setLabel("前往驗證")
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

      const embed = new EmbedBuilder()
        .setTitle("網站安全驗證")
        .setDescription("請點擊下方連結前往網頁完成安全驗證，如有問題請向[技術人員](https://discord.gg/NIGGAS)回報：")
        .setColor(0x2ecc71);

      await interaction.editReply({
        embeds: [embed],
        components: [row as any]
      });
      return;
    }
  }

}
