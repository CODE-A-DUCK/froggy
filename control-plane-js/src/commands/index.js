import { REST, Routes, Collection } from "discord.js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsPath = __dirname;

async function loadCommands(dir = commandsPath) {
  const files = readdirSync(dir, { withFileTypes: true });
  const loadedCommands = [];

  for (const file of files) {
    const filePath = join(dir, file.name);

    if (file.isDirectory()) {
      loadedCommands.push(...(await loadCommands(filePath)));
    } else if (file.name.endsWith(".js") && file.name !== "index.js") {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);

      const command = Object.values(module).find(
        (val) =>
          val && typeof val === "object" && "name" in val && "data" in val,
      );

      if (command) {
        if (!command.category) {
          const categoryName = dir.split(/[\\/]/).pop();
          command.category =
            categoryName === "commands" || categoryName === "general"
              ? "General"
              : categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
        }
        loadedCommands.push(command);
      } else {
        console.warn(
          `[Command] File ${file.name} in ${dir} does not export a valid command object.`,
        );
      }
    }
  }
  return loadedCommands;
}

export const commands = await loadCommands();

const commandsByName = new Map(
  commands.map((command) => [command.name, command]),
);

export async function registerCommands({
  token,
  applicationId,
  guildId,
  client,
}) {
  if (client) {
    client.commands = new Collection();
    for (const command of commands) {
      client.commands.set(command.name, command);
    }
  }

  const rest = new REST({ version: "10" }).setToken(token);

  const guildIds =
    typeof guildId === "string"
      ? guildId.split(",").map((id) => id.trim())
      : [guildId];

  for (const id of guildIds) {
    const body = commands
      .filter((command) => {
        if (!id) {
          return !command.allowedGuilds || command.allowedGuilds.length === 0;
        }
        return (
          !command.allowedGuilds ||
          command.allowedGuilds.length === 0 ||
          command.allowedGuilds.includes(id)
        );
      })
      .map((command) => command.data.toJSON());

    if (id) {
      await rest.put(Routes.applicationGuildCommands(applicationId, id), {
        body,
      });
      console.info(`[Command] Registered guild commands, Guild ID: ${id}`);
    } else {
      await rest.put(Routes.applicationCommands(applicationId), { body });
      console.info(`[Command] Registered global commands`);
    }
  }
}

export async function clearCommands({ token, applicationId, guildId }) {
  const rest = new REST({ version: "10" }).setToken(token);

  const guildIds =
    typeof guildId === "string"
      ? guildId.split(",").map((id) => id.trim())
      : [guildId];

  for (const id of guildIds) {
    if (id) {
      await rest.put(Routes.applicationGuildCommands(applicationId, id), {
        body: [],
      });
      console.info(`[Command] Cleared guild commands, Guild ID: ${id}`);
    } else {
      await rest.put(Routes.applicationCommands(applicationId), { body: [] });
      console.info(`[Command] Registered global commands`);
    }
  }
}

export async function handleInteraction(interaction, context) {
  let commandName = interaction.commandName;

  if (!commandName && (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())) {
    if (interaction.customId.includes(":")) {
      commandName = interaction.customId.split(":")[0];
    }
  }

  const command = commandsByName.get(commandName);

  if (!command) {
    return;
  }

  // Runtime check for guild-locked commands
  if (
    command.allowedGuilds &&
    command.allowedGuilds.length > 0 &&
    !command.allowedGuilds.includes(interaction.guildId)
  ) {
    return interaction.reply({
      content: ":x: | 此指令在此伺服器中不適用。",
      ephemeral: true,
    });
  }

  if (interaction.isChatInputCommand()) {
    await command.execute(interaction, context);
  } else if (interaction.isAutocomplete()) {
    if (typeof command.autocomplete === "function") {
      await command.autocomplete(interaction, context);
    } else if (
      typeof command[interaction.options.getFocused(true).name] === "function"
    ) {
      await command[interaction.options.getFocused(true).name](
        interaction,
        context,
      );
    }
  } else if (interaction.isStringSelectMenu()) {
    if (typeof command.handleSelectMenu === "function") {
      await command.handleSelectMenu(interaction, context);
    }
  }
}
