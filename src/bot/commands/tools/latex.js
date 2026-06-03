import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import sharp from "sharp";

import { EMOJIS } from "../../../shared/emojis.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: "local" });
const html = mathjax.document("", { InputJax: tex, OutputJax: svg });

const MAX_LATEX_LENGTH = 1024;
const TIMEOUT = 5000;

function texToSvg(latex, userColor = null) {
  const node = html.convert(latex, { display: true });
  const svgNode =
    adaptor.kind(node) === "svg" ? node : adaptor.firstChild(node);
  if (!svgNode) throw new Error("SVG generation failed");

  const finalColor =
    userColor ||
    (adaptor.innerHTML(svgNode).includes('style="')
      ? "rgb(30, 110, 244)"
      : "rgb(0, 137, 50)");
  adaptor.setStyle(svgNode, "color", finalColor);
  return adaptor.outerHTML(svgNode);
}

export const latexCommand = {
  name: "latex",
  category: `${EMOJIS.informationline} | 工具`,
  data: new SlashCommandBuilder()
    .setName("latex")
    .setDescription("渲染 LaTeX 方程式為圖片")
    .addStringOption((o) =>
      o.setName("公式").setDescription("LaTeX 公式").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("顏色").setDescription("可自訂顏色（選項）"),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const latex = interaction.options.getString("公式");
    let color = interaction.options.getString("顏色");

    if (color && /^[0-9a-fA-F]{3,6}$/.test(color)) color = `#${color}`;
    if (latex.length > MAX_LATEX_LENGTH)
      return interaction.editReply(`${EMOJIS.errorwarningline} | 表達式過長。`);

    try {
      const finalInput = latex.includes("\\\\")
        ? `\\begin{gather}${latex}\\end{gather}`
        : latex;

      const svgString = texToSvg(finalInput, color);
      const buffer = await Promise.race([
        sharp(Buffer.from(svgString), { density: 300 }).png().toBuffer(),
        new Promise((_, r) =>
          setTimeout(() => r(new Error("Timeout")), TIMEOUT),
        ),
      ]);

      await interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "latex.png" })],
      });
    } catch (error) {
      await interaction.editReply(
        `${EMOJIS.errorwarningline} | 失敗: \`${error.message}\``,
      );
    }
  },
};
