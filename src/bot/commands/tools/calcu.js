import { SlashCommandBuilder } from "discord.js";
import { create, all } from "mathjs";

import { EMOJIS } from "../../../shared/emojis.js";

const math = create(all);
const MAX_EXPR_LENGTH = 512;

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
    await interaction.deferReply();
    const input = interaction.options.getString("expression");

    if (input.length > MAX_EXPR_LENGTH) {
      return interaction.editReply(`${EMOJIS.errorwarningline} | 公式過長。`);
    }

    try {
      const result = math.evaluate(input);
      const formatted = math.format(result, { precision: 10 });

      const response = [
        `${EMOJIS.formula} | 公式：\`\`\`${input}\`\`\``,
        `${EMOJIS.calculatorline} | 計算結果：\`\`\`${formatted}\`\`\``,
      ].join("\n");

      await interaction.editReply(response);
    } catch (error) {
      console.error("[Command:Calcu] Evaluation error:", error);
      await interaction.editReply(
        `${EMOJIS.errorwarningline} | 計算失敗，請檢查格式。\n錯誤訊息: \`${error.message}\``,
      );
    }
  },
};
