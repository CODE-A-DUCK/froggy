import {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";

/**
 * 将选项类型映射为易读的中文
 * @param {number} type
 * @returns {string}
 */
function getOptionTypeName(type) {
  const types = {
    [ApplicationCommandOptionType.String]: "文字",
    [ApplicationCommandOptionType.Integer]: "整数",
    [ApplicationCommandOptionType.Boolean]: "布尔值",
    [ApplicationCommandOptionType.User]: "用户",
    [ApplicationCommandOptionType.Channel]: "频道",
    [ApplicationCommandOptionType.Role]: "身份组",
    [ApplicationCommandOptionType.Mentionable]: "可提及对象",
    [ApplicationCommandOptionType.Number]: "数字",
    [ApplicationCommandOptionType.Attachment]: "附件",
  };
  return types[type] || "未知";
}

/**
 * 格式化单个选项的详细说明
 * @param {Object} option
 * @returns {string}
 */
function formatOptionDetail(option) {
  const wrap = option.required ? ["<", ">"] : ["[", "]"];
  let detail = `**${wrap[0]}${option.name}${wrap[1]}**：${option.description || "无描述"}`;
  detail += ` (${option.required ? "必填" : "可选"}, 类型: ${getOptionTypeName(option.type)})`;

  if (option.choices?.length) {
    const choices = option.choices.map((c) => `\`${c.name}\``).join("、");
    detail += `\n  可选值：${choices}`;
  }

  if (option.minValue !== undefined || option.maxValue !== undefined) {
    const min = option.minValue ?? "-∞";
    const max = option.maxValue ?? "+∞";
    detail += `\n  数值范围：[${min}, ${max}]`;
  }

  if (option.minLength !== undefined || option.maxLength !== undefined) {
    const min = option.minLength ?? 0;
    const max = option.maxLength ?? "无上限";
    detail += `\n  长度范围：${min} ~ ${max}`;
  }

  return detail;
}

/**
 * 递归处理子命令
 * @param {Array} options
 * @param {number} indent
 * @returns {string}
 */
function formatOptionsRecursively(options, indent = 0) {
  if (!options || options.length === 0) return "无参数";
  const lines = [];
  for (const opt of options) {
    const indentation = "  ".repeat(indent);
    if (opt.type === ApplicationCommandOptionType.Subcommand) {
      lines.push(
        `${indentation}子指令：**${opt.name}** – ${opt.description || "无描述"}`,
      );
      if (opt.options?.length) {
        lines.push(formatOptionsRecursively(opt.options, indent + 1));
      }
    } else if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
      lines.push(
        `${indentation}指令组：**${opt.name}** – ${opt.description || "无描述"}`,
      );
      if (opt.options?.length) {
        lines.push(formatOptionsRecursively(opt.options, indent + 1));
      }
    } else {
      lines.push(`${indentation}• ${formatOptionDetail(opt)}`);
    }
  }
  return lines.join("\n");
}

const CATEGORY_DESCRIPTIONS = {
  基本: "爛 bot 該有的。",
  音樂: "爛音樂功能。",
  管理: "誰敢臭你！",
  版主: "愛 beef 誰就 beef 誰。",
  主頁查詢: "三更半夜的時候突然想偷窺女神主頁。",
  工具: "非常不實用的工具指令。",
  娛樂: "沒什麼用的功能。",
  未分类: "懶惰分類。",
};

export const helpCommand = {
  name: "help",
  category: `${EMOJIS.homeline} | 基本`,
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("這應該是說明書")
    .addStringOption((option) =>
      option
        .setName("指令名稱")
        .setDescription("要查詢的指令名稱")
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const commands = interaction.client.commands;
    if (!commands) {
      return interaction.respond([]).catch(() => {});
    }

    const choices = commands
      .filter((cmd) => cmd.name.toLowerCase().includes(focusedValue))
      .map((cmd) => ({ name: cmd.name, value: cmd.name }))
      .slice(0, 25);

    await interaction.respond(choices).catch(() => {});
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId !== "help:category_select") return;

    const categoryValue = interaction.values[0];

    // 精準比對前 100 個字元 (因為選單的 value 最多只能存 100 字)
    const commands = Array.from(interaction.client.commands.values()).filter(
      (cmd) => cmd.category && cmd.category.substring(0, 100) === categoryValue,
    );

    const parts = categoryValue.split("|");
    const label = parts[1]?.trim() || categoryValue;

    let description = CATEGORY_DESCRIPTIONS[label]
      ? `*${CATEGORY_DESCRIPTIONS[label]}*\n\n`
      : "";

    if (commands.length === 0) {
      description += "此類別下目前沒有指令。";
    } else {
      description += commands
        .map(
          (cmd) =>
            `**/${cmd.name}**\n${cmd.data.description || "此指令無描述。"}`,
        )
        .join("\n\n");
    }

    if (description.length > 4096) {
      description = description.substring(0, 4093) + "...";
    }

    const embed = new EmbedBuilder()
      .setTitle(`指令類別：${label}`)
      .setDescription(description)
      .setColor(0x9ec27f)
      .setFooter({ text: "輸入 `/help [指令名稱]` 以取得參數詳情" });

    // 按照要求：發送一個新的 Ephemeral 消息，而不是 update
    await interaction
      .reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] })
      .catch(console.error);
  },

  async execute(interaction) {
    // 設置為 ephemeral，這樣 editReply 也會是僅個人可見
    await interaction.deferReply().catch(() => {});
    const commandName = interaction.options.getString("指令名稱");

    // 无参数：显示分类列表并提供下拉菜单
    if (!commandName) {
      const commands = Array.from(interaction.client.commands.values());
      const categories = [
        ...new Set(commands.map((cmd) => cmd.category || "未分類")),
      ];

      const embed = new EmbedBuilder()
        .setTitle("指令分類列表")
        .setDescription("請從下方選單選擇一個類別以查看其下的所有指令。")
        .setColor(0xd98d30)
        .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }));

      categories.forEach((cat, index) => {
        const label = cat.split("|")[1]?.trim() || cat;
        embed.addFields({
          name: cat,
          value: CATEGORY_DESCRIPTIONS[label] || "查無類別描述。",
          inline: true,
        });

        // 每兩個 Field 後插入一個非 inline 的空 Field 來強制換行
        if ((index + 1) % 2 === 0) {
          embed.addFields({ name: "\u200B", value: "\u200B", inline: false });
        }
      });

      const selectOptions = categories.map((cat) => {
        const parts = cat.split("|");
        const label = parts[1]?.trim() || cat;
        const emojiMatch = parts[0]
          ?.trim()
          .match(/<a?:\w+:(\d+)>|(\p{Emoji})/u);

        const option = {
          label: label.substring(0, 100),
          value: cat.substring(0, 100),
          description: (
            CATEGORY_DESCRIPTIONS[label] || `查看「${label}」下的指令`
          ).substring(0, 100),
        };

        const parsedEmoji = emojiMatch ? emojiMatch[1] || emojiMatch[2] : null;
        if (parsedEmoji) {
          option.emoji = parsedEmoji;
        }

        return option;
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help:category_select")
        .setPlaceholder("選擇一個指令類別...")
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return interaction
        .editReply({ embeds: [embed], components: [row] })
        .catch(() => {});
    }

    // 有参数：显示具体命令详情
    const command = interaction.client.commands.get(commandName);
    if (!command) {
      const errorMsg = `${EMOJIS.errorwarningline} | 我找不到名為 \`${commandName}\` 的指令。`;
      return interaction
        .editReply({
          content: errorMsg,
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }

    const dataJSON = command.data.toJSON();

    const embed = new EmbedBuilder()
      .setTitle(`:pencil: | 指令說明：/${command.name}`)
      .setDescription(dataJSON.description || "此指令無描述。")
      .setColor(0x9ec27f);

    let usageOptions = "";
    if (dataJSON.options) {
      usageOptions = dataJSON.options
        .map((opt) => {
          if (
            opt.type === ApplicationCommandOptionType.Subcommand ||
            opt.type === ApplicationCommandOptionType.SubcommandGroup
          ) {
            return `(${opt.name})`;
          }
          return opt.required ? `<${opt.name}>` : `[${opt.name}]`;
        })
        .join(" ");
    }
    const usage = `/${command.name} ${usageOptions}`.trim();
    embed.addFields({ name: "用法", value: `\`${usage}\``, inline: false });

    if (dataJSON.options && dataJSON.options.length > 0) {
      let optionsDetail = formatOptionsRecursively(dataJSON.options);

      if (optionsDetail.length > 1024) {
        optionsDetail = optionsDetail.substring(0, 1021) + "...";
      }

      embed.addFields({
        name: "參數詳情",
        value: optionsDetail,
        inline: false,
      });
    }

    await interaction
      .editReply({ embeds: [embed], components: [] })
      .catch(() => {});
  },
};
