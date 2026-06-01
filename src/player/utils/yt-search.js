import { validateSearchQuery } from "../../bot/security/sanitize-query.js";
import { spawnProcess } from "../adapters/spawn-process.js";

export async function ytSearch(query, count = 5) {
  const check = validateSearchQuery(query);
  if (!check.ok) throw new Error(`Invalid search query: ${check.reason}`);
  const safeCount = Math.max(1, Math.min(25, parseInt(count, 10) || 5));

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--dump-json",
    "--flat-playlist",
    `ytsearch${safeCount}:${check.query}`,
  ];

  const stdout = await spawnProcess("yt-dlp", args);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => {
      try {
        const d = JSON.parse(line);
        return {
          title: d.title ?? "Unknown",
          url: d.url || d.webpage_url || d.original_url,
          duration: d.duration ?? null,
          thumbnail: d.thumbnail ?? null,
          uploader: d.uploader || d.channel || d.artist || null,
          view_count: d.view_count ?? null,
        };
      } catch {
        return null;
      }
    })
    .filter((r) => r?.url);
}
