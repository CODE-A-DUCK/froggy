import "dotenv/config";

const token = process.env.TOKEN;
if (!token) {
  console.error("[Config] TOKEN is not set. Exiting.");
  process.exit(1);
}

export const config = {
  token,
  lavalinkHost: process.env.LAVALINK_HOST || "127.0.0.1",
  lavalinkPort: parseInt(process.env.LAVALINK_PORT || "2333", 10),
  lavalinkPassword: process.env.LAVALINK_PASSWORD || "youshallnotpass",
  steamApiKey: process.env.STEAM_API_KEY || "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/froggy",
};
