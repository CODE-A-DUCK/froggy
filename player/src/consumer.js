import Redis from "ioredis";
import { EventEmitter } from "events";

const REDIS_OPTIONS = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 5000),
};

export class StreamConsumer extends EventEmitter {
  constructor(redisUrl, groupName, consumerName) {
    super();
    this.groupName = groupName;
    this.consumerName = consumerName;
    this.isClosing = false;
    this.STREAM_MAXLEN = 5000;

    this.client = this.#createClient(redisUrl, "Stream");
    this.cacheClient = this.#createClient(redisUrl, "Cache");

    // Map<type, Map<guildId, data>>
    this.voiceCache = {
      voice_state: new Map(),
      voice_server: new Map(),
    };
  }

  async initGroup() {
    try {
      await this.client.xgroup(
        "CREATE",
        "audio-events",
        this.groupName,
        "$",
        "MKSTREAM",
      );
      console.info(`Consumer group '${this.groupName}' initialized.`);
    } catch (err) {
      if (!err.message.includes("BUSYGROUP")) throw err;
      console.info(`Consumer group '${this.groupName}' already exists.`);
    }
  }

  async start() {
    console.info(`Audio Worker '${this.consumerName}' listening for tasks...`);
    while (!this.isClosing) {
      try {
        const result = await this.client.xreadgroup(
          "GROUP",
          this.groupName,
          this.consumerName,
          "BLOCK",
          5000,
          "COUNT",
          1,
          "STREAMS",
          "audio-events",
          ">",
        );
        if (result) {
          const [, messages] = result[0];
          for (const [messageId, fields] of messages) {
            await this.handleMessage(messageId, fields);
          }
        }
      } catch (err) {
        if (!this.isClosing) {
          console.error("[Consumer] Redis Stream error:", err);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  async close() {
    this.isClosing = true;
    await this.cacheClient.quit();
    await this.client.quit();
  }

  async handleMessage(messageId, fields) {
    for (let i = 0; i < fields.length; i += 2) {
      const type = fields[i];
      const data = JSON.parse(fields[i + 1]);

      // voice_state / voice_server 先緩存再 emit
      if (type === "voice_state" || type === "voice_server") {
        if (data.guild_id) this.voiceCache[type].set(data.guild_id, data);
      }

      this.emit(type, { messageId, ...data });
    }
  }

  async ackTask(messageId) {
    await this.client.xack("audio-events", this.groupName, messageId);
  }

  publishUiEvent(event) {
    return this.#publish("track_playing", event);
  }
  publishFinishedEvent(event) {
    return this.#publish("track_finished", event);
  }
  publishStoppedEvent(event) {
    return this.#publish("track_stopped", event);
  }
  publishAddedEvent(event) {
    return this.#publish("track_added", event);
  }
  publishErrorEvent(event) {
    return this.#publish("track_error", event);
  }

  getCachedVoiceState(guildId) {
    return this.#getCachedVoice("voice_state", guildId);
  }
  getCachedVoiceServer(guildId) {
    return this.#getCachedVoice("voice_server", guildId);
  }

  #createClient(redisUrl, label) {
    const client = new Redis(redisUrl, REDIS_OPTIONS);
    client.on("error", (err) =>
      console.error(`[Consumer] Redis ${label} client error:`, err),
    );
    return client;
  }

  async #publish(eventType, event) {
    await this.client.xadd(
      "ui-events",
      "MAXLEN",
      "~",
      this.STREAM_MAXLEN,
      "*",
      eventType,
      JSON.stringify(event),
    );
  }

  async #getCachedVoice(type, guildId) {
    if (this.voiceCache[type].has(guildId))
      return this.voiceCache[type].get(guildId);
    return this.#readCachedJson(`music:${type}:${guildId}`);
  }

  async #readCachedJson(key) {
    const raw = await this.cacheClient.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn(
        `[Consumer] Failed to parse cached payload for key ${key}:`,
        err,
      );
      return null;
    }
  }
}
