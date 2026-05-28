import Redis from 'ioredis';
import { EventEmitter } from 'events';

export class StreamConsumer extends EventEmitter {
  constructor(redisUrl, groupName, consumerName) {
    super();
    const redisOptions = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    };
    this.client = new Redis(redisUrl, redisOptions);
    this.cacheClient = new Redis(redisUrl, redisOptions);
    this.STREAM_MAXLEN = 5000;
    this.client.on('error', (err) => {
      console.error('[Consumer] Redis Stream client error:', err);
    });
    this.cacheClient.on('error', (err) => {
      console.error('[Consumer] Redis Cache client error:', err);
    });
    this.groupName = groupName;
    this.consumerName = consumerName;
    this.isClosing = false;
    this.lastVoiceStateByGuild = new Map();
    this.lastVoiceServerByGuild = new Map();
  }

  async initGroup() {
    try {
      await this.client.xgroup('CREATE', 'audio-events', this.groupName, '$', 'MKSTREAM');
      console.info(`Consumer group '${this.groupName}' initialized.`);
    } catch (err) {
      if (!err.message.includes('BUSYGROUP')) {
        throw err;
      }
      console.info(`Consumer group '${this.groupName}' already exists.`);
    }
  }

  async start() {
    console.info(`Audio Worker '${this.consumerName}' listening for tasks...`);
    while (!this.isClosing) {
      try {
        const result = await this.client.xreadgroup(
          'GROUP', this.groupName, this.consumerName,
          'BLOCK', 5000,
          'COUNT', 1,
          'STREAMS', 'audio-events', '>'
        );

        if (result) {
          const [stream, messages] = result[0];
          for (const [messageId, fields] of messages) {
            await this.handleMessage(messageId, fields);
          }
        }
      } catch (err) {
        if (!this.isClosing) {
          console.error('[Consumer] Redis Stream error:', err);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  async handleMessage(messageId, fields) {
    for (let i = 0; i < fields.length; i += 2) {
      const type = fields[i];
      const data = JSON.parse(fields[i + 1]);

      if (type === 'task') {
        this.emit('task', { messageId, ...data });
      } else if (type === 'voice_state') {
        if (data.guild_id) {
          this.lastVoiceStateByGuild.set(data.guild_id, data);
        }
        this.emit('voice_state', { messageId, ...data });
      } else if (type === 'voice_server') {
        if (data.guild_id) {
          this.lastVoiceServerByGuild.set(data.guild_id, data);
        }
        this.emit('voice_server', { messageId, ...data });
      }
    }
  }

  getVoiceStateKey(guildId) {
    return `music:voice_state:${guildId}`;
  }

  getVoiceServerKey(guildId) {
    return `music:voice_server:${guildId}`;
  }

  async getCachedVoiceState(guildId) {
    if (this.lastVoiceStateByGuild.has(guildId)) {
      return this.lastVoiceStateByGuild.get(guildId);
    }

    return this.#readCachedJson(this.getVoiceStateKey(guildId));
  }

  async getCachedVoiceServer(guildId) {
    if (this.lastVoiceServerByGuild.has(guildId)) {
      return this.lastVoiceServerByGuild.get(guildId);
    }

    return this.#readCachedJson(this.getVoiceServerKey(guildId));
  }

  async ackTask(messageId) {
    await this.client.xack('audio-events', this.groupName, messageId);
  }

  async publishUiEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', 'MAXLEN', '~', this.STREAM_MAXLEN, '*', 'track_playing', payload);
  }

  async publishFinishedEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', 'MAXLEN', '~', this.STREAM_MAXLEN, '*', 'track_finished', payload);
  }

  async publishStoppedEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', 'MAXLEN', '~', this.STREAM_MAXLEN, '*', 'track_stopped', payload);
  }

  async publishAddedEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', 'MAXLEN', '~', this.STREAM_MAXLEN, '*', 'track_added', payload);
  }

  async publishErrorEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', 'MAXLEN', '~', this.STREAM_MAXLEN, '*', 'track_error', payload);
  }

  async close() {
    this.isClosing = true;
    await this.cacheClient.quit();
    await this.client.quit();
  }

  async #readCachedJson(key) {
    const raw = await this.cacheClient.get(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`[Consumer] Failed to parse cached voice payload for key ${key}:`, error);
      return null;
    }
  }
}
