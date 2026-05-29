import { broker } from "../broker.js";

/**
 * Check if a user is allowed to run a command.
 * @param {string} userId
 * @param {string} commandName
 * @param {number} cooldownMs
 * @returns {Promise<boolean>} true = allowed, false = on cooldown
 */
export async function checkCooldown(userId, commandName, cooldownMs) {
  const key = `cd:${commandName}:${userId}`;
  const result = await broker.publisher.set(key, "1", "PX", cooldownMs, "NX");
  return result === "OK";
}

/**
 * Get the remaining cooldown time in milliseconds.
 * @returns {Promise<number>} ms remaining, or 0 if not on cooldown
 */
export async function getRemainingCooldown(userId, commandName) {
  const key = `cd:${commandName}:${userId}`;
  const ms = await broker.publisher.pttl(key);
  return ms > 0 ? ms : 0;
}
