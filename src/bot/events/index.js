import { interactionCreateEvent } from "./interaction-create.js";
import { readyEvent } from "./ready.js";
import { voiceStateUpdateEvent } from "./voice-state-update.js";

const clientEvents = [readyEvent, interactionCreateEvent, voiceStateUpdateEvent];

export function registerEvents(client, context) {
  for (const event of clientEvents) {
    const listener = (...args) => {
      Promise.resolve(event.execute(...args, context)).catch((error) => {
        console.error(`[Events] ${event.name} failed:`, error);
      });
    };
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }
}
