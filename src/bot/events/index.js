import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function registerEvents(client, context) {
  const files = readdirSync(__dirname).filter(
    (f) => f.endsWith(".js") && f !== "index.js",
  );

  for (const file of files) {
    const fullPath = join(__dirname, file);
    const module = await import(pathToFileURL(fullPath).href);
    const event = Object.values(module).find(
      (val) => val && typeof val === "object" && val.name && val.execute,
    );

    if (event) {
      const listener = (...args) => {
        // Execute the event handler, passing any provided context
        Promise.resolve(event.execute(...args, context)).catch((err) => {
          console.error(`[Events] Failed to execute ${event.name}:`, err);
        });
      };

      if (event.once) {
        client.once(event.name, listener);
      } else {
        client.on(event.name, listener);
      }
    }
  }
}
