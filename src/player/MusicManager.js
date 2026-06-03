import { EventEmitter } from "node:events";

import { MusicPlayer } from "./MusicPlayer.js";

export class MusicManager extends EventEmitter {
  constructor({ client }) {
    super();
    this.client = client;
    this.players = new Map();
  }

  getOrCreatePlayer(guildId) {
    if (this.players.has(guildId)) return this.players.get(guildId);

    const player = new MusicPlayer(guildId, this.client);
    this.#bindEvents(player);
    this.players.set(guildId, player);
    return player;
  }

  getPlayer(guildId) {
    return this.players.get(guildId) || null;
  }

  // Alias for backward compatibility with older event handlers
  getSession(guildId) {
    return this.getPlayer(guildId);
  }

  async getQueue(guildId) {
    const player = this.players.get(guildId);
    if (!player) return { current: null, queue: [], length: 0 };
    return {
      current: player.currentTrack,
      queue: player.queue.slice(0, 25),
      length: player.queue.length
    };
  }

  #bindEvents(player) {
    const events = ["trackStarted", "sessionUpdated", "trackQueued", "queueFinished", "trackStopped", "trackError"];
    for (const event of events) {
      player.on(event, (data) => this.emit(event, data));
    }
  }

  /**
   * 簡化的 dispatch 方法，相容舊有的呼叫方式
   */
  async dispatch(task) {
    const player = this.getOrCreatePlayer(task.guild_id);

    switch (task.action) {
    case "play":
      return player.play(task.track_url, {
        channelId: task.channel_id,
        textChannelId: task.text_channel_id,
        interactionToken: task.interaction_token,
        controllerUserId: task.controller_user_id,
        silent: task.silent
      });
    case "stop":
      return player.stop();
    case "skip":
      return player.skip();
    case "pause":
      return player.pause();
    case "resume":
      return player.resume();
    case "loop":
      return player.toggleLoop();
    default:
      console.warn(`[MusicManager] 未知的操作: ${task.action}`);
    }
  }
}
