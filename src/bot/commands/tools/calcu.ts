import { SlashCommandBuilder } from "discord.js";
import { create, all } from "mathjs";

import { EMOJIS } from "../../../shared/emojis.js";

const math = create(all);
const MAX_EXPR_LENGTH = 512;
const MAX_RESULT_LENGTH = 1024;

export const calcuCommand = {
  name: "calcu",
  category: `${EMOJIS.informationline} | 工具`,
  data: new SlashCommandBuilder()
    .setName("calcu")
    .setDescription("簡單的數學計算")
    .addStringOption((o) =>
      o.setName("公式").setDescription("數學公式").setRequired(true),
    ),

  async execute(interaction) {
    const input = interaction.options.getString("公式");

    if (!input || input.length > MAX_EXPR_LENGTH) {
      return interaction.editReply(
        `${EMOJIS.errorwarningline} | 公式無效或過長。`,
      );
    }

    let result;
    try {
      result = math.evaluate(input);
    } catch (error) {
      console.error("[Command:Calcu] Evaluation error:", error);
      return interaction.editReply(
        `${EMOJIS.errorwarningline} | 計算失敗，請檢查格式。`,
      );
    }

    const formatted = math.format(result, { precision: 10 });

    if (formatted.length > MAX_RESULT_LENGTH) {
      return interaction.editReply(
        `${EMOJIS.errorwarningline} | 計算結果過長，無法顯示。`,
      );
    }

    await interaction.editReply(
      `${EMOJIS.formula} | 公式：\`\`\`${input}\`\`\`\n${EMOJIS.calculatorline} | 計算結果：\`\`\`${formatted}\`\`\``,
    );
  },
};
