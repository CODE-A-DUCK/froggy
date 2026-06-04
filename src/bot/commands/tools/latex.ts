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
const DEFAULT_COLOR = "rgb(92, 184, 255)";
const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

function normalizeColor(input) {
  if (!input) return null;
  if (!HEX_COLOR_REGEX.test(input)) return false; // invalid
  return input.startsWith("#") ? input : `#${input}`;
}

function stripDelimiters(latex) {
  const s = latex.trim();
  if (s.startsWith("\\[") && s.endsWith("\\]")) return s.slice(2, -2).trim();
  if (s.startsWith("$$") && s.endsWith("$$")) return s.slice(2, -2).trim();
  return s;
}

function texToSvg(latex, color) {
  const node = html.convert(latex, { display: true });
  const svgNode =
    adaptor.kind(node) === "svg" ? node : adaptor.firstChild(node);
  if (!svgNode) throw new Error("SVG generation failed");
  adaptor.setStyle(svgNode, "color", color ?? DEFAULT_COLOR);
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
      o
        .setName("顏色")
        .setDescription("自訂顏色，支援 Hex（如 #ff0000 或 ff0000）"),
    ),

  async execute(interaction) {
    const rawLatex = interaction.options.getString("公式");
    const rawColor = interaction.options.getString("顏色");

    const latex = stripDelimiters(rawLatex);

    if (latex.length > MAX_LATEX_LENGTH) {
      return interaction.editReply(`${EMOJIS.errorwarningline} | 表達式過長。`);
    }

    const color = normalizeColor(rawColor);
    if (color === false) {
      return interaction.editReply(
        `${EMOJIS.errorwarningline} | 顏色格式無效，請使用 Hex 格式（如 #ff0000 或 ff0000）。`,
      );
    }

    try {
      const hasEnvironment = /\\begin\{/.test(latex);
      const finalInput =
        latex.includes("\\\\") && !hasEnvironment
          ? `\\begin{gather}${latex}\\end{gather}`
          : latex;

      const buffer = await Promise.race([
        (async () => {
          const svgString = texToSvg(finalInput, color);
          return sharp(Buffer.from(svgString), { density: 300 })
            .png()
            .toBuffer();
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TIMEOUT),
        ),
      ]);

      await interaction.editReply({
        files: [new AttachmentBuilder(buffer, { name: "latex.png" })],
      });
    } catch (error) {
      console.error("[Command:Latex] Error:", error);
      await interaction.editReply(
        `${EMOJIS.errorwarningline} | 渲染失敗，請檢查 LaTeX 語法是否正確。`,
      );
    }
  },
};
