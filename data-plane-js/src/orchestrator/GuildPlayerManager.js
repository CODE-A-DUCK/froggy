import { RedisPlaybackStore } from '../queue/RedisPlaybackStore.js';
import { TrackResolver } from '../resolver/TrackResolver.js';
import { YoutubeTrackSource } from '../resolver/sources/YoutubeTrackSource.js';
import { PlayerSession } from '../session/PlayerSession.js';

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
    return session;
  }

  async dispatch(task) {
    const session = this.getOrCreateSession(task.guild_id);

    switch (task.action) {
      case 'play':
        await session.play({
          query: task.track_url,
          channelId: task.channel_id,
          textChannelId: task.text_channel_id,
          interactionToken: task.interaction_token,
          controllerUserId: task.controller_user_id,
        });
        return;
      case 'stop':
        await session.stop({
          textChannelId: task.text_channel_id,
        });
        return;
      case 'skip':
        await session.skip();
        return;
      case 'pause':
        await session.pause();
        return;
      case 'resume':
        await session.resume();
        return;
      case 'loop':
        await session.toggleLoop();
        return;
      default:
        console.warn(`[GuildPlayerManager] Unknown action: ${task.action}`);
    }
  }

  #bindSessionEvents(session) {
    session.on('stateChanged', ({ guild_id, previous_state, state }) => {
      console.info(
        `[GuildPlayerManager] Guild ${guild_id} state: ${previous_state} -> ${state}`,
      );
    });

    session.on('trackStarted', (event) => {
      void this.consumer.publishUiEvent(event);
    });

    session.on('sessionUpdated', (event) => {
      void this.consumer.publishUiEvent(event);
    });

    session.on('trackQueued', (event) => {
      void this.consumer.publishAddedEvent(event);
    });

    session.on('queueFinished', (event) => {
      void this.consumer.publishFinishedEvent(event);
    });

    session.on('trackStopped', (event) => {
      void this.consumer.publishStoppedEvent(event);
    });

    session.on('trackError', (event) => {
      void this.consumer.publishErrorEvent(event);
    });
  }
}
