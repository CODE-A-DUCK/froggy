import { RedisPlaybackStore } from "../queue/RedisPlaybackStore.js";
import { TrackResolver } from "../resolver/TrackResolver.js";
import { YoutubeTrackSource } from "../resolver/sources/YoutubeTrackSource.js";
import { PlayerSession } from "../session/PlayerSession.js";
import { SessionState } from "../core/playbackConstants.js";

const SESSION_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

export class GuildPlayerManager {
  constructor({ consumer, redisClient }) {
    this.consumer = consumer;
    this.redisClient = redisClient;
    this.sessions = new Map();
    this.resolver = new TrackResolver([new YoutubeTrackSource()]);
  }

  getOrCreateSession(guildId) {
    if (this.sessions.has(guildId)) {
      return this.sessions.get(guildId);
    }

    const session = new PlayerSession({
      guildId,
      consumer: this.consumer,
      store: new RedisPlaybackStore(this.redisClient, guildId),
      resolver: this.resolver,
    });

    this.#bindSessionEvents(session);
    this.sessions.set(guildId, session);
    console.info(
      `[GuildPlayerManager] Created session for guild ${guildId}. Active sessions: ${this.sessions.size}`,
    );
    return session;
  }

  async dispatch(task) {
    const session = this.getOrCreateSession(task.guild_id);

    switch (task.action) {
      case "play":
        await session.play({
          query: task.track_url,
          channelId: task.channel_id,
          textChannelId: task.text_channel_id,
          interactionToken: task.interaction_token,
          controllerUserId: task.controller_user_id,
        });
        return;
      case "stop":
        await session.stop({ textChannelId: task.text_channel_id });
        return;
      case "skip":
        await session.skip();
        return;
      case "pause":
        await session.pause();
        return;
      case "resume":
        await session.resume();
        return;
      case "loop":
        await session.toggleLoop();
        return;
      case 'resend_ui':
        await session.resendController({ textChannelId: task.text_channel_id });
        return;
      case 'rejoin':
        await session.reconnect({
          channelId: task.channel_id,
          textChannelId: task.text_channel_id,
        });
        return;
      case 'disconnect_vc':
        // Pre-emptive disconnect: destroys the old VoiceConnection and its adapter's
        // event listeners BEFORE new voice credentials arrive in the stream.
        await session.disconnectVoice();
        return;
      default:
        console.warn(`[GuildPlayerManager] Unknown action: ${task.action}`);
    }
  }

  #scheduleSessionCleanup(guildId) {
    setTimeout(() => {
      const session = this.sessions.get(guildId);
      if (!session) return;
      if (session.state === SessionState.IDLE) {
        session.destroy();
        this.sessions.delete(guildId);
        console.info(
          `[GuildPlayerManager] Destroyed idle session for guild ${guildId}. ` +
            `Active sessions: ${this.sessions.size}`,
        );
      }
    }, SESSION_CLEANUP_DELAY_MS);
  }

  #bindSessionEvents(session) {
    session.on("stateChanged", ({ guild_id, previous_state, state }) => {
      console.info(
        `[GuildPlayerManager] Guild ${guild_id} state: ${previous_state} -> ${state}`,
      );
    });

    session.on("trackStarted", async (event) => {
      try {
        await this.consumer.publishUiEvent(event);
      } catch (err) {
        console.error(
          `[GuildPlayerManager] Failed to publish trackStarted for guild ${event.guild_id}:`,
          err.message,
        );
      }
    });

    session.on("sessionUpdated", async (event) => {
      try {
        await this.consumer.publishUiEvent(event);
      } catch (err) {
        console.error(
          `[GuildPlayerManager] Failed to publish sessionUpdated for guild ${event.guild_id}:`,
          err.message,
        );
      }
    });

    session.on("trackQueued", async (event) => {
      try {
        await this.consumer.publishAddedEvent(event);
      } catch (err) {
        console.error(
          `[GuildPlayerManager] Failed to publish trackQueued for guild ${event.guild_id}:`,
          err.message,
        );
      }
    });

    session.on("queueFinished", async (event) => {
      try {
        await this.consumer.publishFinishedEvent(event);
      } catch (err) {
        console.error(
          `[GuildPlayerManager] Failed to publish queueFinished for guild ${event.guild_id}:`,
          err.message,
        );
      }
      this.#scheduleSessionCleanup(event.guild_id);
    });

    session.on("trackStopped", async (event) => {
      try {
        await this.consumer.publishStoppedEvent(event);
      } catch (err) {
        console.error(
          `[GuildPlayerManager] Failed to publish trackStopped for guild ${event.guild_id}:`,
          err.message,
        );
      }
      this.#scheduleSessionCleanup(event.guild_id);
    });

    session.on("trackError", async (event) => {
      try {
        await this.consumer.publishErrorEvent(event);
      } catch (err) {
        console.error(
          `[GuildPlayerManager] Failed to publish trackError for guild ${event.guild_id}:`,
          err.message,
        );
      }
    });
  }
}
