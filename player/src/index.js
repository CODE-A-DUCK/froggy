import "dotenv/config";
import { StreamConsumer } from "./consumer.js";
import { GuildPlayerManager } from "./orchestrator/GuildPlayerManager.js";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const workerId = `worker-js-${uuidv4()}`;
const groupName = "audio-workers";

const redisClient = new Redis(redisUrl);
const consumer = new StreamConsumer(redisUrl, groupName, workerId);
const manager = new GuildPlayerManager({ consumer, redisClient });

consumer.on("task", async (task) => {
  const { guild_id, action, messageId } = task;
  console.info(`[Task] Received action ${action} for Guild ${guild_id}`);

  try {
    await manager.dispatch(task);
  } catch (err) {
    console.error(`[Task] Error executing ${action}:`, err);
  } finally {
    await consumer.ackTask(messageId);
  }
});

async function main() {
  await consumer.initGroup();
  await consumer.start();
}

main().catch((err) => {
  console.error("[Main] Fatal error:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.info("[Main] Shutting down...");
  await consumer.close();
  await redisClient.quit();
  process.exit(0);
});
