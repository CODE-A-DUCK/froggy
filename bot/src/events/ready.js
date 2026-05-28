import { Events } from "discord.js";

export const readyEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(readyClient) {
    console.info(`[Main] Logged in as: ${readyClient.user.tag}`);
    console.info(
      `[Main] Serving ${readyClient.guilds.cache.size} guilds. ` +
      `Run "node src/deploy/deploy.js" to register slash commands.`
    );
  },
};
