import "dotenv/config";
import { registerCommands } from "./index.js";

const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error("TOKEN is not set."); process.exit(1); }

async function getAppId(token) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get app ID: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

try {
  const applicationId = await getAppId(TOKEN);
  console.info(`[Deploy] Deploying global commands for app ${applicationId}...`);
  await registerCommands({ token: TOKEN, applicationId });
  console.info("[Deploy] Done!");
  process.exit(0);
} catch (err) {
  console.error("[Deploy] Failed:", err);
  process.exit(1);
}
