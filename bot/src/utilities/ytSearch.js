/**
 * Searches YouTube via yt-dlp and returns up to `count` track metadata objects.
 * Only fetches metadata (no audio streaming) — fast, no ffmpeg needed.
 */
import { spawn } from 'node:child_process';

/**
 * @param {string} query  - Search keyword
 * @param {number} count  - Number of results (default 5)
 * @returns {Promise<Array<{title,url,duration,thumbnail,uploader,view_count}>>}
 */
export async function ytSearch(query, count = 5) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--dump-json',
    '--flat-playlist',
    `ytsearch${count}:${query}`,
  ];

  const stdout = await runYtDlp(args);

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        const d = JSON.parse(line);
        return {
          title: d.title ?? 'Unknown',
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

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    const errLines = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errLines.push(chunk.toString().trim()));
    child.on('error', (err) =>
      reject(new Error(`yt-dlp failed to start: ${err.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } else {
        reject(
          new Error(
            `yt-dlp exited with code ${code}: ${errLines.slice(-3).join(' | ')}`,
          ),
        );
      }
    });
  });
}
