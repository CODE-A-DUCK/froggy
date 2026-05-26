import { Events } from "discord.js";
import { registerCommands } from "../commands/index.js";

export const readyEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(readyClient, context) {
    console.info(`[Main] Successfully logged in as: ${readyClient.user.tag}`);

    const applicationId = readyClient.application.id;

    await registerCommands({
      token: context.config.discordToken,
      applicationId,
      guildId: context.config.testGuildId,
    });
  },
};
