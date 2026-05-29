import dotenv from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GatewayIntentBits } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  testGuildId: process.env.TEST_GUILD_ID || undefined,
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
};

export function assertConfig() {
  if (!config.discordToken) {
    throw new Error("DISCORD_TOKEN is not set.");
  }
}
