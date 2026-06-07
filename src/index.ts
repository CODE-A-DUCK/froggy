import { Client, Collection, GatewayIntentBits, Options } from "discord.js";

import { commands } from "./bot/commands/index.js";
import { setupGoResponse } from "./bot/events/go-response.js";
import { registerEvents } from "./bot/events/index.js";
import presence from "./bot/features/presence.js";
import { controllerStore } from "./bot/store/controller-store.js";
import { startAutoUnban } from "./bot/utils/timed-ban-manager.js";
import { config } from "./config.js";
import { UIHandler } from "./player/ui/ui-handler.js";
import { ControlPlaneClient } from "./bot/ws-client.js";
import { VoiceGatewayManager } from "./bot/voice-gateway.js";
import { nodeStateStore } from "./bot/store/node-state-store.js";

declare module "discord.js" {
  interface Client {
    commands: Collection<string, any>;
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
  }),
});

client.commands = new Collection(commands.map((c: any) => [c.name, c]));

const ipcClient = new ControlPlaneClient(process.env.AUDIO_NODE_URL || "ws://127.0.0.1:8080");
ipcClient.connect();

const voiceGateway = new VoiceGatewayManager(client, ipcClient);
const uiHandler = new UIHandler({ client, controllerStore, voiceGateway });
uiHandler.attach(ipcClient);
ipcClient.on("STATE_UPDATE", (data: any) => {
  if (data?.guild_id && data?.state) {
    nodeStateStore.set(data.guild_id, data.state);
  }
});

ipcClient.on("NEED_VOICE_CONNECT", async (data: any) => {
  const { guild_id, url, options } = data;
  console.log(`[ControlPlane] Audio Node requested voice reconnect for Guild ${guild_id}`);
  try {
    const guild = client.guilds.cache.get(guild_id);
    const voiceState = guild?.voiceStates.cache.get(client.user!.id);
    if (!voiceState?.channelId) {
      console.warn(`[ControlPlane] Bot is not in a voice channel for guild ${guild_id}, cannot auto-reconnect.`);
      return;
    }
    await voiceGateway.connectToChannel(guild_id, voiceState.channelId);
    await ipcClient.sendRequest("PLAY", { guild_id, url, ...options });
    console.log(`[ControlPlane] Auto-reconnect + PLAY succeeded for Guild ${guild_id}`);
  } catch (err) {
    console.error(`[ControlPlane] Auto-reconnect failed for Guild ${guild_id}:`, err);
  }
});

const context = { controllerStore, ipcClient, voiceGateway, nodeStateStore };

registerEvents(client, context);
presence(client);
setupGoResponse(client);
startAutoUnban(client);

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


process.on("uncaughtException", (err) => {
  console.error("[Main] Uncaught exception (continuing):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Main] Unhandled rejection:", reason);
});

console.info("[Main] Connecting to Discord Gateway...");
await client.login(config.token);
