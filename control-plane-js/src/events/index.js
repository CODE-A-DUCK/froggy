import { interactionCreateEvent } from "./interactionCreate.js";
import { readyEvent } from "./ready.js";

const clientEvents = [readyEvent, interactionCreateEvent];

export function registerEvents(client, context) {
  for (const event of clientEvents) {
    const listener = (...args) => {
      Promise.resolve(event.execute(...args, context)).catch((error) => {
        console.error(`[Events] ${event.name} failed:`, error);
      });
    };

    if (event.once) {
      client.once(event.name, listener);
    } else {
      client.on(event.name, listener);
    }
  }
}
