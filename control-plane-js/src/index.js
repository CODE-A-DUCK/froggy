import { Client, Collection } from "discord.js";
import { assertConfig, config } from "./config.js";
import { registerEvents } from "./events/index.js";
import { commands } from "./commands/index.js";
import { broker } from "./broker.js";
import { UIConsumer } from "./uiConsumer.js";
import presence from "./features/presence.js";

assertConfig();

const client = new Client({ intents: config.intents });

client.commands = new Collection();
client.messagesSent = 0;
for (const command of commands) {
  client.commands.set(command.name, command);
}

const context = {
  client,
  config,
};

registerEvents(client, context);
presence(client);

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  client.messagesSent++;
});

client.on("shardReady", (id) => {
  console.info(`[Shard ${id}] Ready`);
});

client.on("shardReconnecting", (id) => {
  console.info(`[Shard ${id}] Reconnecting...`);
});

client.on("shardResume", (id, replayedEvents) => {
  console.info(`[Shard ${id}] Resumed (replayed ${replayedEvents} events)`);
});

client.on("shardDisconnect", (event, id) => {
  const reason = event.reason ? ` - ${event.reason}` : "";
  console.warn(`[Shard ${id}] Disconnected (code: ${event.code}${reason})`);
});

client.on("shardError", (error, id) => {
  console.error(`[Shard ${id}] Error:`, error.message || error);
});

client.on("raw", (packet) => {
  if (packet.t === "VOICE_STATE_UPDATE") {
    if (packet.d.user_id === client.user.id) {
      broker.publishVoiceStateUpdate(packet.d).catch(console.error);
    }
  } else if (packet.t === "VOICE_SERVER_UPDATE") {
    broker.publishVoiceServerUpdate(packet.d).catch(console.error);
  }
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`[Main] Received ${signal}, shutting down...`);

  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.info("[Main] Connecting to Discord Gateway...");
await client.login(config.discordToken);

const uiConsumer = new UIConsumer(client);
uiConsumer.start();
