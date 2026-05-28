import {
  CURRENT_TRACK_TTL_SECONDS,
  QUEUE_TTL_SECONDS,
  LOOP_TTL_SECONDS,
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
    // Pipeline: push + refresh TTL atomically
    await this.redisClient
      .pipeline()
      .rpush(this.queueKey, JSON.stringify(track))
      .expire(this.queueKey, QUEUE_TTL_SECONDS)
      .exec();
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

  /**
   * Reset the TTL of the current track without a read-modify-write cycle.
   * Uses atomic EXPIRE so the key's data is never re-serialised.
   */
  async touchCurrentTrack() {
    const touched = await this.redisClient.expire(
      this.currentKey,
      CURRENT_TRACK_TTL_SECONDS,
    );
    if (!touched) return null;
    // Only read if the caller needs the value (most callers discard it)
    return this.getCurrentTrack();
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
    // Persist loop state with a TTL so stale state doesn't accumulate
    await this.redisClient.set(this.loopKey, `${loopMode}`, 'EX', LOOP_TTL_SECONDS);
    return loopMode;
  }

  async cycleLoopMode() {
    const currentMode = await this.getLoopMode();
    const nextMode = (currentMode + 1) % 3;
    await this.setLoopMode(nextMode);
    return nextMode;
  }

  #deserialize(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return { ...parsed, source: parsed.source ?? 'youtube' };
    } catch {
      console.warn(
        `[PlaybackStore] Failed to parse payload for guild ${this.guildId}`,
      );
      return null;
    }
  }
}
