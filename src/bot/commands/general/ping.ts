import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";

export const pingCommand = {
  name: "ping",
  category: `${EMOJIS.homeline} | 基本`,
  defer: false,
  data: new SlashCommandBuilder().setName("ping").setDescription("查看延遲"),
  async execute(interaction: ChatInputCommandInteraction) {
    const t0 = performance.now();

    await interaction.reply({ content: `${EMOJIS.informationline} | 測試中…` });
    const reply = await interaction.fetchReply();

    const t1 = performance.now();

    const gateway = Math.round(interaction.client.ws.ping);
    const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;
    const processing = Math.round(t1 - t0);

    await interaction.editReply(
      `${EMOJIS.informationline} | **完成！**\n` +
      `> 閘道: **${gateway}ms**\n` +
      `> 往返延遲: **${roundTrip}ms**\n` +
      `> 處理時間: **${processing}ms**`,
    );
  },
};
