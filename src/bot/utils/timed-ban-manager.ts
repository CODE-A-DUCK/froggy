import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../../../db/timedBans.json");

interface TimedBan {
  guildId: string;
  userId: string;
  unbanAt: number;
  reason?: string;
}

let timedBans: TimedBan[] | null = null;

async function loadBans(): Promise<TimedBan[]> {
  if (!timedBans) {
    try {
      await access(dataPath, constants.F_OK);
      timedBans = JSON.parse(await readFile(dataPath, "utf8"));
    } catch {
      timedBans = [];
      await writeFile(dataPath, "[]", "utf8");
    }
  }
  return timedBans!;
}

async function save() {
  if (timedBans) {
    await writeFile(dataPath, JSON.stringify(timedBans, null, 2), "utf8");
  }
}

export async function scheduleUnban(guildId: string, userId: string, unbanAt: number, reason: string = "") {
  await loadBans();
  timedBans!.push({ guildId, userId, unbanAt, reason });
  await save();
}

export function startAutoUnban(client: Client) {
  setInterval(async () => {
    try {
      const bans = await loadBans();
      const now = Date.now();
      const toUnban = bans.filter((b) => b.unbanAt <= now);

      if (toUnban.length === 0) return;

      for (const ban of toUnban) {
        try {
          const guild = client.guilds.cache.get(ban.guildId);
          if (!guild) continue;

          await guild.members.unban(ban.userId, ban.reason || "auto unbanned");
        } catch (err) {
          console.error(`Failed to unban ${ban.userId} in ${ban.guildId}:`, err);
        }
      }

      timedBans = bans.filter(
        (b) => !toUnban.some((u) => u.guildId === b.guildId && u.userId === b.userId)
      );
      await save();
    } catch (err) {
      console.error("Error in startAutoUnban interval:", err);
    }
  }, 60 * 1000); // check every 60 seconds
}
