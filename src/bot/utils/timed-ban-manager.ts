import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "discord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../../../db/timedBans.json");

if (!existsSync(dataPath)) writeFileSync(dataPath, "[]", "utf8");

interface TimedBan {
  guildId: string;
  userId: string;
  unbanAt: number;
  reason?: string;
}

let timedBans: TimedBan[] = JSON.parse(readFileSync(dataPath, "utf8"));

function save() {
  writeFileSync(dataPath, JSON.stringify(timedBans, null, 2), "utf8");
}

export function scheduleUnban(guildId: string, userId: string, unbanAt: number, reason: string = "") {
  timedBans.push({ guildId, userId, unbanAt, reason });
  save();
}

export function startAutoUnban(client: Client) {
  setInterval(async () => {
    const now = Date.now();
    const toUnban = timedBans.filter((b) => b.unbanAt <= now);

    for (const ban of toUnban) {
      try {
        const guild = client.guilds.cache.get(ban.guildId);
        if (!guild) continue;

        await guild.members.unban(ban.userId, ban.reason || "auto unbanned");

        timedBans = timedBans.filter(
          (b) => !(b.guildId === ban.guildId && b.userId === ban.userId),
        );
        save();
      } catch (err) {
        console.error(err);
      }
    }
  }, 60 * 1000); // check every 60 seconds
}
