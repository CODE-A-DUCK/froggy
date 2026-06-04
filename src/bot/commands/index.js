import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { REST, Routes } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCommands(dir = __dirname) {
  const commands = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      commands.push(...(await loadCommands(fullPath)));
    } else if (entry.name.endsWith(".js") && entry.name !== "index.js") {
      const module = await import(pathToFileURL(fullPath).href);
      // We look for exported objects that have 'data' and 'execute'
      const command = Object.values(module).find(
        (val) => val && typeof val === "object" && val.data && val.execute,
      );
      if (command) {
        // Fallback name if not set
        if (!command.name && command.data.name) command.name = command.data.name;
        commands.push(command);
      }
    }
  }
  return commands;
}

export const commands = await loadCommands();

const commandsByName = new Map(commands.map((c) => [c.name, c]));

export async function registerCommands({ token, applicationId }) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map((c) => c.data.toJSON());
  await rest.put(Routes.applicationCommands(applicationId), { body });
  console.info(`[Deploy] Registered ${body.length} global commands.`);
}

export async function clearCommands({ token, applicationId }) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  console.info("[Deploy] Cleared all global commands.");
}

export async function handleInteraction(interaction, context) {
  let commandName = interaction.commandName;

  // 如果是組件交互，則嘗試從 customId 中解析指令名稱 (格式: "command:action")
  if (!commandName && (interaction.isStringSelectMenu() || interaction.isButton())) {
    commandName = interaction.customId.split(":")[0];
  }

  const command = commandsByName.get(commandName);
  if (!command) return;

  if (interaction.isChatInputCommand()) {
    await command.execute(interaction, context);
  } else if (interaction.isAutocomplete() && typeof command.autocomplete === "function") {
    await command.autocomplete(interaction, context);
  } else if (interaction.isStringSelectMenu() && typeof command.handleSelectMenu === "function") {
    await command.handleSelectMenu(interaction, context);
  } else if (interaction.isButton() && typeof command.handleButton === "function") {
    await command.handleButton(interaction, context);
  }
}
