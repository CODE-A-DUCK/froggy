import Redis from 'ioredis';
import { EventEmitter } from 'events';

export class StreamConsumer extends EventEmitter {
  constructor(redisUrl, groupName, consumerName) {
    super();
    this.client = new Redis(redisUrl);
    this.groupName = groupName;
    this.consumerName = consumerName;
    this.isClosing = false;
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
        this.emit('voice_state', { messageId, ...data });
      } else if (type === 'voice_server') {
        this.emit('voice_server', { messageId, ...data });
      }
    }
  }

  async ackTask(messageId) {
    await this.client.xack('audio-events', this.groupName, messageId);
  }

  async publishUiEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', '*', 'track_playing', payload);
  }

  async publishFinishedEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', '*', 'track_finished', payload);
  }

  async publishStoppedEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', '*', 'track_stopped', payload);
  }

  async publishAddedEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', '*', 'track_added', payload);
  }

  async publishErrorEvent(event) {
    const payload = JSON.stringify(event);
    await this.client.xadd('ui-events', '*', 'track_error', payload);
  }

  async close() {
    this.isClosing = true;
    await this.client.quit();
  }
}
