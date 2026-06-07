import { Client, Collection, GatewayIntentBits, Options } from "discord.js";
import { Shoukaku, Connectors } from "shoukaku";

import { commands } from "./bot/commands/index.js";
import { setupGoResponse } from "./bot/events/go-response.js";
import { registerEvents } from "./bot/events/index.js";
import presence from "./bot/features/presence.js";
import { controllerStore } from "./bot/store/controller-store.js";
import { startAutoUnban } from "./bot/utils/timed-ban-manager.js";
import { config } from "./config.js";
import { UIHandler } from "./player/ui/ui-handler.js";
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

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [{
  name: "main",
  url: `${config.lavalinkHost}:${config.lavalinkPort}`,
  auth: config.lavalinkPassword,
}], {
  reconnectTries: 100,
  reconnectInterval: 5000,
});

shoukaku.on("error", (_, error) => console.error("[Shoukaku] Error:", error));

const voiceGateway = new VoiceGatewayManager(client, shoukaku);
const uiHandler = new UIHandler({ client, controllerStore, voiceGateway });

voiceGateway.on("trackStart", async (player, track) => {
  if (!track) return;
  const guildId = player.guildId;
  const info = track.info || track;
  const identifier = info.identifier;

  let extraStats = { views: null as string | null, likes: null as string | null, date: null as string | null };
  if (identifier && (info.uri?.includes("youtube.com") || info.uri?.includes("youtu.be"))) {
    // 動態匯入以避免可能的頂層載入問題
    const { getYouTubeStats } = await import("./player/utils/youtube-stats.js");
    extraStats = await getYouTubeStats(identifier);
  }

  const requesterId = track.pluginInfo?.requesterId || player.controllerUserId;

  if (requesterId && requesterId !== player.controllerUserId) {
    player.controllerUserId = requesterId;
  }
  
  if (requesterId) {
    controllerStore.clearOwner(guildId);
    controllerStore.setOwner(guildId, requesterId);
  }

  const event = {
    guild_id: guildId,
    title: info.title,
    source_url: info.uri,
    uploader: info.author || info.uploader,
    duration: Math.floor((info.length || info.duration || 0) / 1000),
    thumbnail: info.artworkUrl,
    views: extraStats.views,
    likes: extraStats.likes,
    upload_date: extraStats.date,
    is_paused: player.paused,
    loop_state: player.repeatMode === "off" ? 0 : player.repeatMode === "track" ? 1 : 2,
    controller_user_id: requesterId,
    interaction_token: player.interactionToken,
    text_channel_id: player.textChannelId,
    is_update: false,
  };
  nodeStateStore.set(guildId, "PLAYING");
  uiHandler.onTrackPlaying(event);
});

voiceGateway.on("trackEnd", (player, track, payload) => {
  const guildId = player.guildId;
  const event = {
    guild_id: guildId,
    controller_user_id: player.controllerUserId,
    interaction_token: player.interactionToken,
    text_channel_id: player.textChannelId,
  };
  if (payload.reason === "replaced") return;
  if (payload.reason === "stopped") {
    uiHandler.onTrackEnded(event, true);
  }
});

voiceGateway.on("queueEnd", (player) => {
  const guildId = player.guildId;
  const event = {
    guild_id: guildId,
    controller_user_id: player.controllerUserId,
    interaction_token: player.interactionToken,
    text_channel_id: player.textChannelId,
  };
  nodeStateStore.set(guildId, "IDLE");
  uiHandler.onTrackEnded(event, false);
});

voiceGateway.on("trackError", (player, track, payload) => {
  const guildId = player.guildId;
  const event = {
    guild_id: guildId,
    error: payload.exception?.message || "Unknown error",
    controller_user_id: player.controllerUserId,
    interaction_token: player.interactionToken,
    text_channel_id: player.textChannelId,
  };
  uiHandler.onTrackError(event);
});

voiceGateway.on("playerDisconnect", (player) => {
  const guildId = player.guildId;
  const event = {
    guild_id: guildId,
    text_channel_id: player.textChannelId,
  };
  nodeStateStore.set(guildId, "OFFLINE");
  uiHandler.onBotDisconnect(event);
  controllerStore.clearOwner(guildId);
  controllerStore.clearMessageId(guildId);
  controllerStore.clearCurrentTrack(guildId);
});

const context = { controllerStore, shoukaku, voiceGateway, nodeStateStore };

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

