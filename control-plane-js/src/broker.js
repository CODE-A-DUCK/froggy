import Redis from "ioredis";
import { config } from "./config.js";

class Broker {
  constructor() {
    this.publisher = new Redis(config.redisUrl);
    this.controllerTtlSeconds = 60 * 60 * 6;
    this.publisher.on("error", (err) => console.error("[Broker] Redis Error:", err));
  }

  getControllerKey(guildId) {
    return `music:controller:${guildId}`;
  }

  getControllerMessageKey(guildId) {
    return `music:controller_msg:${guildId}`;
  }

  async getActiveControllerOwner(guildId) {
    return this.publisher.get(this.getControllerKey(guildId));
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
    await this.publisher.xadd("audio-events", "*", "task", JSON.stringify(task));
    console.info(`[Broker] Published audio task (play) for Guild ${guildId}`);
  }

  async publishCommand(guildId, action, data = {}) {
    const payload = {
      guild_id: guildId,
      action: action,
      ...data,
    };
    await this.publisher.xadd("audio-events", "*", "task", JSON.stringify(payload));
    console.info(`[Broker] Published command (${action}) for Guild ${guildId}`);
  }

  async publishVoiceStateUpdate(data) {
    await this.publisher.xadd("audio-events", "*", "voice_state", JSON.stringify(data));
  }

  async publishVoiceServerUpdate(data) {
    await this.publisher.xadd("audio-events", "*", "voice_server", JSON.stringify(data));
  }
}

export const broker = new Broker();
