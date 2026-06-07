import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";

export const pingCommand = {
  name: "ping",
  category: `${EMOJIS.homeline} | 基本`,
  data: new SlashCommandBuilder().setName("ping").setDescription("乒乓"),
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.fetchReply();
    await interaction.editReply(
      `${EMOJIS.informationline} | 機器人延遲: **${sent.createdTimestamp - interaction.createdTimestamp}ms**, API 延遲: **${interaction.client.ws.ping}ms**`,
    );
  },
};
