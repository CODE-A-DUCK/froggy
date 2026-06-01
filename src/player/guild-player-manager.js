import { EventEmitter } from "node:events";

import { YoutubeTrackSource } from "./adapters/youtube-track-source.js";
import { PlayerSession } from "./player-session.js";
import { QueueStore } from "./queue-store.js";
import { TrackResolver } from "./track-resolver.js";

const SESSION_CLEANUP_DELAY_MS = 5 * 60 * 1_000;

export class GuildPlayerManager extends EventEmitter {
  constructor({ client }) {
    super();
    this.client = client;
    this.sessions = new Map();
    this.cleanupTimers = new Map();
    this.resolver = new TrackResolver([new YoutubeTrackSource()]);
  }

  getOrCreateSession(guildId) {
    if (this.sessions.has(guildId)) return this.sessions.get(guildId);

    const session = new PlayerSession({
      guildId,
      client: this.client,
      store: new QueueStore(),
      resolver: this.resolver,
    });

    this.#bindSessionEvents(session);
    this.sessions.set(guildId, session);
    console.info(
      `[GuildPlayerManager] Created session for guild ${guildId}. Active: ${this.sessions.size}`,
    );
    return session;
  }

  getSession(guildId) {
    return this.sessions.get(guildId) ?? null;
  }

  async getQueue(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return { current: null, queue: [], length: 0 };
    const [current, queue, length] = await Promise.all([
      session.store.getCurrentTrack(),
      session.store.getQueue(25),
      session.store.getQueueLength(),
    ]);
    return { current, queue, length };
  }

  async dispatch(task) {
    const session = this.getOrCreateSession(task.guild_id);

    switch (task.action) {
    case "play":
      return session.play({
        query: task.track_url,
        channelId: task.channel_id,
        textChannelId: task.text_channel_id,
        interactionToken: task.interaction_token,
        controllerUserId: task.controller_user_id,
        silent: task.silent,
      });

    case "stop":
      return session.stop({
        textChannelId: task.text_channel_id,
        controllerUserId: task.controller_user_id,
        interactionToken: task.interaction_token,
      });

    case "skip":
      return session.skip();

    case "pause":
      return session.pause();

    case "resume":
      return session.resume();

    case "loop":
      return session.toggleLoop();

    case "remove":
      return session.removeTracks(task.indices);

    case "resend_ui":
      return session.resendController({
        textChannelId: task.text_channel_id,
      });

    case "join":
      return session.ensureConnected(task.channel_id);

    case "leave":
      return session.disconnectVoice();

    default:
      console.warn(`[GuildPlayerManager] Unknown action: ${task.action}`);
    }
  }

  #scheduleSessionCleanup(guildId) {
    clearTimeout(this.cleanupTimers.get(guildId));
    const timer = setTimeout(async () => {
      const session = this.sessions.get(guildId);
      if (!session) return;
      if (!session.currentTrack) {
        // 檢查機器人是否還在語音頻道中
        const guild = this.client.guilds.cache.get(guildId);
        const me =
          guild?.members.me ||
          (await guild?.members.fetch(this.client.user.id).catch(() => null));
        if (me?.voice.channel) {
          console.info(
            `[GuildPlayerManager] Session for guild ${guildId} is idle but bot is in VC. Skipping cleanup.`,
          );
          return;
        }

        session.destroy();
        this.sessions.delete(guildId);
        console.info(
          `[GuildPlayerManager] Destroyed idle session for guild ${guildId}. Active: ${this.sessions.size}`,
        );
      }
      this.cleanupTimers.delete(guildId);
    }, SESSION_CLEANUP_DELAY_MS);
    this.cleanupTimers.set(guildId, timer);
  }

  #bindSessionEvents(session) {
    const { guildId } = session;

    session.on("trackStarted", (event) => {
      this.emit("trackStarted", event);
    });

    session.on("sessionUpdated", (event) => {
      this.emit("sessionUpdated", event);
    });

    session.on("trackQueued", (event) => {
      this.emit("trackQueued", event);
    });

    session.on("queueFinished", (event) => {
      this.emit("queueFinished", event);
      this.#scheduleSessionCleanup(guildId);
    });

    session.on("trackStopped", (event) => {
      this.emit("trackStopped", event);
      this.#scheduleSessionCleanup(guildId);
    });

    session.on("trackError", (event) => {
      this.emit("trackError", event);
    });
  }
}
