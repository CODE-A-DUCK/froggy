import "dotenv/config";
import { registerCommands } from "../commands/index.js";

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error(
    "Error: DISCORD_TOKEN is not defined in environment variables.",
  );
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let guildId;

  if (args.includes("--global")) {
    guildId = null;
  } else if (args.includes("--guild")) {
    const index = args.indexOf("--guild");
    if (index + 1 < args.length) {
      guildId = args[index + 1];
    } else {
      console.error("Error: --guild option requires a guild ID.");
      process.exit(1);
    }
  } else {
    console.error("Error: You must provide either --global or --guild <id>.");
    console.info("Usage:");
    console.info("  node src/deploy/deploy.js --global");
    console.info("  node src/deploy/deploy.js --guild <guild_id>");
    process.exit(1);
  }

  return guildId;
}

const guildId = parseArgs();

/**
 * 使用 Discord 機器人的 Token 來獲取 Application ID
 * @param {string} token - Discord 機器人 Token
 * @returns {Promise<string>} Application ID
 */
async function getApplicationId(token) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bot ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to get Application ID (Status code: ${response.status}): ${errorBody}`,
    );
  }

  const data = await response.json();
  return data.id;
}

async function run() {
  try {
    console.info("Getting application information...");

    const applicationId = await getApplicationId(TOKEN);
    const scope = guildId ? `Guild ${guildId}` : "Global";

    console.info(
      `Deploying ${scope} commands for application ${applicationId}...`,
    );

    await registerCommands({
      token: TOKEN,
      applicationId,
      guildId,
    });

    console.info("Commands deployed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Command deployment failed:", error);
    process.exit(1);
  }
}

void run();
