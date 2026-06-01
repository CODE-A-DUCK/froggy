import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../data");
const dataPath = join(dataDir, "timedBans.json");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(dataPath)) writeFileSync(dataPath, "[]", "utf8");

let timedBans = JSON.parse(readFileSync(dataPath, "utf8"));

function save() {
  writeFileSync(dataPath, JSON.stringify(timedBans, null, 2), "utf8");
}

export function scheduleUnban(guildId, userId, unbanAt, reason = "") {
  timedBans.push({ guildId, userId, unbanAt, reason });
  save();
}

export function startAutoUnban(client) {
  console.log("[TimedBan] Started timed ban manager");

  setInterval(async () => {
    const now = Date.now();
    const toUnban = timedBans.filter((b) => b.unbanAt <= now);

    for (const ban of toUnban) {
      try {
        const guild = client.guilds.cache.get(ban.guildId);
        if (!guild) continue;

        await guild.members.unban(ban.userId, ban.reason || "auto unbanned");

        timedBans = timedBans.filter(
          (b) => !(b.guildId === ban.guildId && b.userId === ban.userId)
        );
        save();

        console.log(`[TimedBan] auto unbanned：${ban.userId}（server ${ban.guildId}）`);
      } catch (err) {
        console.error("[TimedBan] autounban failed", err);
      }
    }
  }, 60 * 1000); // check every 60 seconds
}