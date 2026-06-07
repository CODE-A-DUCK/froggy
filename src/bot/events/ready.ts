import { Events, Client } from "discord.js";

export const readyEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(readyClient: Client) {
  },
};
