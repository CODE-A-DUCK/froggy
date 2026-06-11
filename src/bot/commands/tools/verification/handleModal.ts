// 處理輸入靜態驗證碼彈出視窗的邏輯

import { ModalSubmitInteraction, MessageFlags } from "discord.js";

import { grantRole, validateVerificationPreconditions, handleVerificationFailure } from "../../../utils/interaction-helpers.js";
import { replyWithState } from "../../../utils/reply.js";

export async function handleVerificationModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":");
  if (parts[1] !== "modal") return;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const expectedAnswer = parts[2];
  const userAnswer = interaction.fields.getTextInputValue("captcha_input");

  if (userAnswer.trim().toUpperCase() !== expectedAnswer.toUpperCase()) {
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (member) {
      const kicked = await handleVerificationFailure(member);
      return replyWithState(interaction, "error", `驗證碼錯誤！生個叉燒包都好過你！${kicked ? "您將在 5 秒後被踢出伺服器。" : ""}`);
    }
    return replyWithState(interaction, "error", "驗證碼錯誤！生個叉燒包都好過你！");
  }

  const precondition = await validateVerificationPreconditions(interaction);
  if (!precondition) return;
  const { member, roleId } = precondition;

  await grantRole(member, roleId);
  return replyWithState(interaction, "success", "驗證成功！你簡直就是愛因斯坦！");
}
