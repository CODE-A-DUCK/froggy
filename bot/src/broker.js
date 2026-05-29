import Redis from "ioredis";
import { config } from "./config.js";

const REDIS_OPTIONS = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 5000),
};

const STREAM_MAXLEN = 5000;

class Broker {
  constructor() {
    this.publisher = new Redis(config.redisUrl, REDIS_OPTIONS);
    this.controllerTtlSeconds = 60 * 60 * 6;
    this.voiceSnapshotTtlSeconds = 60 * 30;
    this.publisher.on("error", (err) =>
      console.error("[Broker] Redis Error:", err.message),
    );
  }

  getControllerKey(guildId) {
    return `music:controller:${guildId}`;
  }

  getControllerMessageKey(guildId) {
    return `music:controller_msg:${guildId}`;
  }

  getCurrentTrackKey(guildId) {
    return `music:current:${guildId}`;
  }

  getQueueKey(guildId) {
    return `music:queue:${guildId}`;
  }

  getVoiceStateKey(guildId) {
    return `music:voice_state:${guildId}`;
  }

  getVoiceServerKey(guildId) {
    return `music:voice_server:${guildId}`;
  }

  async getActiveControllerOwner(guildId) {
    return this.publisher.get(this.getControllerKey(guildId));
  }

  async setControllerOwner(guildId, userId) {
    await this.publisher.set(
      this.getControllerKey(guildId),
      userId,
      "EX",
      this.controllerTtlSeconds,
    );
  }

  async claimControllerOwner(guildId, userId) {
    const result = await this.publisher.set(
      this.getControllerKey(guildId),
      userId,
      "EX",
      this.controllerTtlSeconds,
      "NX",
    );
    return result === "OK";
  }

  async clearControllerOwner(guildId) {
    await this.publisher.del(this.getControllerKey(guildId));
  }

  async setControllerMessageId(guildId, messageId) {
    await this.publisher.set(
      this.getControllerMessageKey(guildId),
      messageId,
      "EX",
      this.controllerTtlSeconds,
    );
  }

  async getControllerMessageId(guildId) {
    return this.publisher.get(this.getControllerMessageKey(guildId));
  }

  async clearControllerMessageId(guildId) {
    await this.publisher.del(this.getControllerMessageKey(guildId));
  }

  async getCurrentTrack(guildId) {
    const raw = await this.publisher.get(this.getCurrentTrackKey(guildId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      console.warn(
        `[Broker] Failed to parse current track for Guild ${guildId}`,
      );
      return null;
    }
  }

  async getQueue(guildId, limit = 10) {
    const [items, total] = await Promise.all([
      this.publisher.lrange(this.getQueueKey(guildId), 0, limit - 1),
      this.publisher.llen(this.getQueueKey(guildId)),
    ]);

    return {
      items: items
        .map((raw) => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })
        .filter(Boolean),
      total,
    };
  }

  async publishAudioTask(
    guildId,
    channelId,
    trackUrl,
    interactionToken,
    textChannelId,
    controllerUserId,
  ) {
    const task = {
      guild_id: guildId,
      channel_id: channelId,
      track_url: trackUrl,
      interaction_token: interactionToken,
      text_channel_id: textChannelId,
      controller_user_id: controllerUserId,
      action: "play",
    };
    await this.publisher.xadd(
      "audio-events",
      "MAXLEN",
      "~",
      STREAM_MAXLEN,
      "*",
      "task",
      JSON.stringify(task),
    );
    console.info(`[Broker] Published audio task (play) for Guild ${guildId}`);
  }

  async publishCommand(guildId, action, data = {}) {
    const payload = { guild_id: guildId, action, ...data };
    await this.publisher.xadd(
      "audio-events",
      "MAXLEN",
      "~",
      STREAM_MAXLEN,
      "*",
      "task",
      JSON.stringify(payload),
    );
    console.info(`[Broker] Published command (${action}) for Guild ${guildId}`);
  }

  async publishVoiceStateUpdate(data) {
    if (!data?.guild_id) return;
    const payload = JSON.stringify(data);
    await this.publisher
      .multi()
      .set(
        this.getVoiceStateKey(data.guild_id),
        payload,
        "EX",
        this.voiceSnapshotTtlSeconds,
      )
      .xadd(
        "audio-events",
        "MAXLEN",
        "~",
        STREAM_MAXLEN,
        "*",
        "voice_state",
        payload,
      )
      .exec();
  }

  async publishVoiceServerUpdate(data) {
    if (!data?.guild_id) return;
    const payload = JSON.stringify(data);
    await this.publisher
      .multi()
      .set(
        this.getVoiceServerKey(data.guild_id),
        payload,
        "EX",
        this.voiceSnapshotTtlSeconds,
      )
      .xadd(
        "audio-events",
        "MAXLEN",
        "~",
        STREAM_MAXLEN,
        "*",
        "voice_server",
        payload,
      )
      .exec();
  }

  async close() {
    await this.publisher.quit();
  }
}

export const broker = new Broker();
