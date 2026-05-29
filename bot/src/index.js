import { Client, Collection } from "discord.js";
import { assertConfig, config } from "./config.js";
import { registerEvents } from "./events/index.js";
import { commands } from "./commands/index.js";
import { broker } from "./broker.js";
import { UIConsumer } from "./uiConsumer.js";
import presence from "./features/presence.js";

assertConfig();

const client = new Client({
  intents: config.intents,
});

client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.name, command);
}

const context = { client, config };

registerEvents(client, context);
presence(client);

client.on("raw", (packet) => {
  if (packet.t === "VOICE_STATE_UPDATE") {
    if (packet.d?.user_id === client.user?.id) {
      broker
        .publishVoiceStateUpdate(packet.d)
        .catch((err) =>
          console.error(
            "[Main] Failed to publish voice state update:",
            err.message,
          ),
        );
    }
  } else if (packet.t === "VOICE_SERVER_UPDATE") {
    if (packet.d?.guild_id) {
      broker
        .publishVoiceServerUpdate(packet.d)
        .catch((err) =>
          console.error(
            "[Main] Failed to publish voice server update:",
            err.message,
          ),
        );
    }
  }
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

let isShuttingDown = false;
let uiConsumer;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`[Main] Received ${signal}, shutting down gracefully...`);

  try {
    uiConsumer?.stop();
    await broker.close();
    client.destroy();
    console.info("[Main] Shutdown complete.");
  } catch (err) {
    console.error("[Main] Error during shutdown:", err.message);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.info("[Main] Connecting to Discord Gateway...");
await client.login(config.discordToken);

uiConsumer = new UIConsumer(client);
uiConsumer.start();
