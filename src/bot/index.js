import { GatewayIntentBits } from "discord.js";
import { Client, Collection } from "discord.js";
import { config } from "./config.js";
import { GuildPlayerManager } from "../player/GuildPlayerManager.js";
import { UIHandler } from "../ui/music/UIHandler.js";
import { controllerStore } from "../store/ControllerStore.js";
import { registerEvents } from "./events/index.js";
import { commands } from "../commands/index.js";
import presence from "./features/presence.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection(commands.map((c) => [c.name, c]));

const guildPlayerManager = new GuildPlayerManager({ client });

const uiHandler = new UIHandler({ client, controllerStore });
uiHandler.attach(guildPlayerManager);

const context = { guildPlayerManager, controllerStore };

registerEvents(client, context);
presence(client);

client.on("shardReady", (id) => console.info(`[Shard ${id}] Ready`));
client.on("shardReconnecting", (id) =>
  console.info(`[Shard ${id}] Reconnecting...`),
);
client.on("shardDisconnect", (event, id) =>
  console.warn(`[Shard ${id}] Disconnected (code: ${event.code})`),
);
client.on("shardError", (error, id) =>
  console.error(`[Shard ${id}] Error:`, error.message),
);

let isShuttingDown = false;
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`[Main] Received ${signal}, shutting down...`);
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[Main] Uncaught exception (continuing):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Main] Unhandled rejection:", reason);
});

console.info("[Main] Connecting to Discord Gateway...");
await client.login(config.token);
