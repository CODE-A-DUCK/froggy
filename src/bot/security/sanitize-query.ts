// 不消毒怎麼行？

const MAX_QUERY_LENGTH = 200;

// 允許清單
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
]);


export function validatePlayUrl(input: any): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof input !== "string")
    return { ok: false, reason: "Input must be a string" };

  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "Only http/https URLs are permitted" };

  if (!ALLOWED_HOSTS.has(url.hostname))
    return { ok: false, reason: "Only YouTube URLs are permitted" };

  return { ok: true, url: url.href };
}


export function validateSearchQuery(input: any): { ok: true; query: string } | { ok: false; reason: string } {
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
