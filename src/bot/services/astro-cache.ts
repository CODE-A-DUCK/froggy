import NodeCache from "node-cache";

export const astroCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });

/**
 * 獲取緩存，如果未命中則執行 fetchFn，並將結果緩存。
 * fetchFn 返回 null 時也會被緩存（視為「已查詢，無結果」）。
 * @param key 緩存鍵
 * @param ttl 緩存時間（秒）
 * @param fetchFn 獲取數據的異步函數
 */
export async function getOrFetch<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = astroCache.get<T>(key);
  if (cached !== undefined) return cached;

  const value = await fetchFn();
  astroCache.set(key, value, ttl);
  return value;
}