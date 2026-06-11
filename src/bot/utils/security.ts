import NodeCache from "node-cache";

export const securityCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * 頻率限制
 * @returns true, false
 */
export function checkRateLimit(userId: string, action: string, ttlSeconds: number = 15): boolean {
  const key = `ratelimit:${userId}:${action}`;
  if (securityCache.has(key)) {
    return false;
  }
  securityCache.set(key, true, ttlSeconds);
  return true;
}
