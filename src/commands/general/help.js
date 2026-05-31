import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

export const helpCommand = {
  name: "help",
  category: ":tools: | 基本",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("這應該是百科全書")
    .addStringOption((option) =>
      option
        .setName("command_name")
        .setDescription("要查詢的指令名稱")
        .setAutocomplete(true),
    ),

  async command_name(interaction) {
    const focusedValue = interaction.options.getFocused();
    const fuzzyPattern = focusedValue.split("").join(".*");
    const regex = new RegExp(fuzzyPattern, "i");

    const commands = interaction.client.commands;
    if (!commands) {
      return interaction.respond([]).catch(() => {});
    }

    const choices = commands
      .filter((cmd) => regex.test(cmd.name))
      .map((cmd) => ({ name: cmd.name, value: cmd.name }))
      .slice(0, 25);

    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    await interaction.deferReply();
    const commandName = interaction.options.getString("command_name");

    if (!commandName) {
      const commands = Array.from(interaction.client.commands.values());
      const embed = new EmbedBuilder()
        .setTitle(":notebook_with_decorative_cover: | 指令列表")
        .setColor(0xc55300)
        .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
        .setFooter({
          text: "輸入 /help [指令名稱] 取得詳細資訊，或從下方選單選取",
        });

      const categories = [...new Set(commands.map((cmd) => cmd.category))];

      for (const cat of categories) {
        const catCommands = commands
          .filter((cmd) => cmd.category === cat)
          .map((cmd) => `${cmd.name}`)
          .join(", ");

        embed.addFields({ name: cat, value: catCommands || "無可用指令" });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help:select_command")
        .setPlaceholder("選取一個指令以查看詳情...")
        .addOptions(
          commands
            .map((cmd) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`/${cmd.name}`)
                .setDescription(cmd.data.description || "無描述")
                .setValue(cmd.name),
            )
            .slice(0, 25),
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    await this.showCommandDetails(interaction, commandName);
  },

  async handleSelectMenu(interaction) {
    const commandName = interaction.values[0];
    await interaction.deferUpdate();
    await this.showCommandDetails(interaction, commandName);
  },

  async showCommandDetails(interaction, commandName) {
    const command = interaction.client.commands.get(commandName);
    if (!command) {
      const errorContent = `<:errorwarningline:1510533865805058188> | 我找不到名為 \`${commandName}\` 的指令。`;
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: errorContent,
          embeds: [],
          components: [],
        });
      }
      return interaction.reply({ content: errorContent, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`:pencil: | 指令說明：/${command.name}`)
      .setDescription(command.data.description || "此指令無描述。")
      .setColor(0x008575);

    if (command.data.options && command.data.options.length > 0) {
      const optionsText = command.data.options
        .map(
          (opt) =>
            `**${opt.name}**: ${opt.description}${
              opt.required ? " (必填)" : ""
            }`,
        )
        .join("\n");
      embed.addFields({ name: "選項", value: optionsText });
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  },
};
