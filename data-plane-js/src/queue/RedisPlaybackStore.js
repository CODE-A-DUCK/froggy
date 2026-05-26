import {
  CURRENT_TRACK_TTL_SECONDS,
  LoopMode,
} from '../core/playbackConstants.js';

export class RedisPlaybackStore {
  constructor(redisClient, guildId) {
    this.redisClient = redisClient;
    this.guildId = guildId;
  }

  get queueKey() {
    return `music:queue:${this.guildId}`;
  }

  get currentKey() {
    return `music:current:${this.guildId}`;
  }

  get loopKey() {
    return `music:loop:${this.guildId}`;
  }

  async enqueue(track) {
    await this.redisClient.rpush(this.queueKey, JSON.stringify(track));
  }

  async dequeue() {
    const raw = await this.redisClient.lpop(this.queueKey);
    return this.#deserialize(raw);
  }

  async getQueue(limit = 25) {
    const items = await this.redisClient.lrange(this.queueKey, 0, limit - 1);
    return items
      .map((item) => this.#deserialize(item))
      .filter((item) => item !== null);
  }

  async getQueueLength() {
    return this.redisClient.llen(this.queueKey);
  }

  async clearQueue() {
    await this.redisClient.del(this.queueKey);
  }

  async getCurrentTrack() {
    const raw = await this.redisClient.get(this.currentKey);
    return this.#deserialize(raw);
  }

  async setCurrentTrack(track) {
    await this.redisClient.setex(
      this.currentKey,
      CURRENT_TRACK_TTL_SECONDS,
      JSON.stringify(track),
    );
  }

  async touchCurrentTrack() {
    const track = await this.getCurrentTrack();
    if (!track) {
      return null;
    }

    await this.setCurrentTrack(track);
    return track;
  }

  async clearCurrentTrack() {
    await this.redisClient.del(this.currentKey);
  }

  async getLoopMode() {
    const raw = await this.redisClient.get(this.loopKey);
    const parsed = Number.parseInt(raw ?? `${LoopMode.OFF}`, 10);
    return Number.isNaN(parsed) ? LoopMode.OFF : parsed;
  }

  async setLoopMode(loopMode) {
    await this.redisClient.set(this.loopKey, `${loopMode}`);
    return loopMode;
  }

  async cycleLoopMode() {
    const currentMode = await this.getLoopMode();
    const nextMode = (currentMode + 1) % 3;
    await this.setLoopMode(nextMode);
    return nextMode;
  }

  #deserialize(raw) {
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(
        `[PlaybackStore] Failed to parse payload for guild ${this.guildId}:`,
        error,
      );
      return null;
    }
  }
}
