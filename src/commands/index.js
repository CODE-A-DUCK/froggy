import { REST, Routes, Collection } from "discord.js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCommands(dir = __dirname) {
  const files = readdirSync(dir, { withFileTypes: true });
  const loaded = [];
  for (const file of files) {
    const filePath = join(dir, file.name);
    if (file.isDirectory()) {
      loaded.push(...(await loadCommands(filePath)));
    } else if (
      file.name.endsWith(".js") &&
      !["index.js", "deploy.js", "clear.js"].includes(file.name)
    ) {
      const mod = await import(pathToFileURL(filePath).href);
      const command = Object.values(mod).find(
        (v) => v && typeof v === "object" && "name" in v && "data" in v,
      );
      if (command) {
        if (!command.category) {
          const cat = dir.split(/[\\/]/).pop();
          command.category = cat === "commands" || cat === "general" ? "General" : cat.charAt(0).toUpperCase() + cat.slice(1);
        }
        loaded.push(command);
      }
    }
  }
  return loaded;
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
  
  // Clear global commands
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  console.info(`[Deploy] Cleared all global commands.`);

  // Clear guild commands for all guilds the bot is in
  try {
    const guilds = await rest.get(Routes.userGuilds());
    for (const guild of guilds) {
      await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), { body: [] });
      console.info(`[Deploy] Cleared commands for guild: ${guild.name} (${guild.id})`);
    }
  } catch (err) {
    console.warn("[Deploy] Failed to fetch or clear guild commands:", err.message);
  }
}

export async function handleInteraction(interaction, context) {
  let commandName = interaction.commandName;
  if (!commandName && (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())) {
    if (interaction.customId.includes(":")) commandName = interaction.customId.split(":")[0];
  }

  const command = commandsByName.get(commandName);
  if (!command) return;

  if (interaction.isChatInputCommand()) {
    if (!interaction.client.commands) {
      interaction.client.commands = new Collection(commands.map((c) => [c.name, c]));
    }
    await command.execute(interaction, context);
  } else if (interaction.isAutocomplete()) {
    if (typeof command.autocomplete === "function") {
      await command.autocomplete(interaction, context);
    }
  } else if (interaction.isStringSelectMenu()) {
    if (typeof command.handleSelectMenu === "function") {
      await command.handleSelectMenu(interaction, context);
    }
  }
}
