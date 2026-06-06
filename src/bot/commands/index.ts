import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { REST, Routes, Interaction, MessageFlags } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCommands(dir = __dirname): Promise<any[]> {
  const commands: any[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      commands.push(...(await loadCommands(fullPath)));
    } else if (entry.name.match(/\.(js|ts)$/) && !entry.name.startsWith("index")) {
      const module = await import(pathToFileURL(fullPath).href);
      const command: any = Object.values(module).find(
        (val: any) => val && typeof val === "object" && val.data && val.execute,
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

const commandsByName = new Map<string, any>(commands.map((c: any) => [c.name, c]));

export async function registerCommands({ token, applicationId }: { token: string; applicationId: string }) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map((c: any) => c.data.toJSON());
  await rest.put(Routes.applicationCommands(applicationId), { body });
  console.info(`[Deploy] Registered ${body.length} global commands.`);
}

export async function clearCommands({ token, applicationId }: { token: string; applicationId: string }) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  console.info("[Deploy] Cleared all global commands.");
}

export async function handleInteraction(interaction: any, context: any) {
  const start = Date.now();
  let commandName = interaction.commandName;

  // 如果是組件交互，則嘗試從 customId 中解析指令名稱 (格式: "command:action")
  if (!commandName && interaction.customId) {
    commandName = interaction.customId.split(":")[0];
  }

  const command = commandsByName.get(commandName);
  if (!command) return;

  if (interaction.isChatInputCommand()) {
    if (command.defer !== false) {
      const deferOptions = command.ephemeral ? { flags: [MessageFlags.Ephemeral] } : {};
      try {
        await interaction.deferReply(deferOptions);
      } catch (err) {
        console.warn(`[Interaction] Failed to defer reply for /${commandName}. Aborting execution.`, err);
        return;
      }
    }
    const mid = Date.now();
    await command.execute(interaction, context);
    const end = Date.now();
    if (end - start > 2500) {
      console.warn(`[Interaction] Slow command execution: /${commandName} took ${end - start}ms (defer took ${mid - start}ms)`);
    }
  } else if (interaction.isAutocomplete() && typeof command.autocomplete === "function") {
    await command.autocomplete(interaction, context);
  } else if (typeof command.handleSelectMenu === "function" && (interaction.isStringSelectMenu() || interaction.values)) {
    await command.handleSelectMenu(interaction, context);
  } else if (interaction.isButton() && typeof command.handleButton === "function") {
    await command.handleButton(interaction, context);
  }
}
