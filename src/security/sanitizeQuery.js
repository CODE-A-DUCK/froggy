
const MAX_URL_LENGTH = 2048;
const MAX_QUERY_LENGTH = 200;
const BLOCKED_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|::ffff:|0\.0\.0\.0|169\.254\.|fd[0-9a-f]{2}:)/i;

/**
 * 在將 URL 傳遞給 yt-dlp（/play 指令使用）之前對其進行驗證。
 * @param {string} input
 * @returns {{ ok: true, url: string } | { ok: false, reason: string }}
 */
export function validatePlayUrl(input) {
  if (typeof input !== "string")
    return { ok: false, reason: "Input must be a string" };

  if (input.includes("\0"))
    return { ok: false, reason: "Null bytes are not allowed" };

  if (input.length > MAX_URL_LENGTH)
    return { ok: false, reason: `URL exceeds max length (${MAX_URL_LENGTH})` };

  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "Only http/https URLs are permitted" };

  const rawHost = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOST.test(rawHost) || /^\d+$/.test(rawHost))
    return {
      ok: false,
      reason: "Access to internal or decimal addresses is not permitted",
    };
  if (url.hostname.startsWith("-") || url.pathname.startsWith("/-"))
    return { ok: false, reason: "Suspicious URL structure rejected" };

  return { ok: true, url: url.href };
}

/**
 * 在將搜尋關鍵字傳遞給 yt-dlp（由 /search 指令使用）之前，先對其進行驗證。
 * @param {string} input
 * @returns {{ ok: true, query: string } | { ok: false, reason: string }}
 */
export function validateSearchQuery(input) {
  if (typeof input !== "string")
    return { ok: false, reason: "Query must be a string" };

  const trimmed = input.replace(/\0/g, "").trim();

  if (trimmed.length === 0)
    return { ok: false, reason: "Query cannot be empty" };

  if (trimmed.length > MAX_QUERY_LENGTH)
    return {
      ok: false,
      reason: `Query too long (max ${MAX_QUERY_LENGTH} chars)`,
    };

  return { ok: true, query: trimmed };
}
