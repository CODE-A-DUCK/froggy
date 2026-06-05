const store = new Map<string, number>();

export function checkCooldown(userId: string, commandName: string, cooldownMs: number): boolean {
  const key = `${commandName}:${userId}`;
  const now = Date.now();
  const expires = store.get(key) ?? 0;
  if (expires > now) return false;

  const expireTime = now + cooldownMs;
  store.set(key, expireTime);

  // 確保 setTimeout 觸發時，只刪除「沒有被更新過」的過期資料，避免誤刪新產生的冷卻時間
  setTimeout(() => {
    if (store.get(key) === expireTime) {
      store.delete(key);
    }
  }, cooldownMs);

  return true;
}

export function getRemainingCooldown(userId: string, commandName: string): number {
  const key = `${commandName}:${userId}`;
  return Math.max(0, (store.get(key) ?? 0) - Date.now());
}
