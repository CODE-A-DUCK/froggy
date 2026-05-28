import { SlashCommandBuilder } from "discord.js";
import { broker } from "../../broker.js";

export const pingCommand = {
  name: "ping",
  category: ":tools: | 基本",
  data: new SlashCommandBuilder().setName("ping").setDescription("乒乓"),
  async execute(interaction) {
    await interaction.deferReply();

    const res = await interaction.editReply("計算中...");
    await broker.publisher.ping();

    const content = `:information_source: | 機器人延遲: **${res.createdTimestamp - interaction.createdTimestamp}ms**, API 延遲: **${interaction.client.ws.ping}ms**`;
    await interaction.editReply(content);
  },
};
