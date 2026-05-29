/** @type {Map<string, number>} */
const store = new Map();

/**
 * @returns {boolean} true = 允許, false = 冷靜一下
 */
export function checkCooldown(userId, commandName, cooldownMs) {
  const key = `${commandName}:${userId}`;
  const now = Date.now();
  const expires = store.get(key) ?? 0;
  if (expires > now) return false;
  store.set(key, now + cooldownMs);
  return true;
}

/**
 * 剩餘冷卻時間。
 * @returns {number}
 */
export function getRemainingCooldown(userId, commandName) {
  const key = `${commandName}:${userId}`;
  return Math.max(0, (store.get(key) ?? 0) - Date.now());
}
