import { spawn } from "node:child_process";

import { StreamType, demuxProbe } from "@discordjs/voice";
import ffmpegPath from "ffmpeg-static";

import {
  validatePlayUrl,
  validateSearchQuery,
} from "../bot/security/sanitize-query.js";

const MAX_CONCURRENT = 10;
let activeProcesses = 0;

/**
 * 核心進程啟動器，處理併發限制與超時。
 */
async function spawnProcess(command, args) {
  if (activeProcesses >= MAX_CONCURRENT) {
    throw new Error("伺服器繁忙中，請稍後再試。");
  }
  activeProcesses++;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const stdoutChunks = [];
    const stderrLines = [];
    let isDone = false;

    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        activeProcesses--;
        child.kill("SIGKILL");
        reject(new Error(`${command} 執行逾時（60秒）`));
      }
    }, 60_000);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) stderrLines.push(text);
      if (stderrLines.length > 5) stderrLines.shift();
    });

    child.on("error", (err) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      activeProcesses--;
      reject(err);
    });

    child.on("close", (code, _signal) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      activeProcesses--;
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf-8"));
      } else {
        const errorMsg = stderrLines.join(" ") || `Exit code ${code}`;
        reject(new Error(`${command} 失敗: ${errorMsg}`));
      }
    });
  });
}

/**
 * 影片元數據
 */
export async function getTrackMetadata(query) {
  const trimmed = query.trim();
  const isUrl = (() => {
    try {
      const u = new URL(trimmed);
      return (
        (u.protocol === "http:" || u.protocol === "https:") &&
        u.hostname.includes(".")
      );
    } catch {
      return false;
    }
  })();

  let resolvedQuery;
  if (isUrl) {
    const check = validatePlayUrl(trimmed);
    if (!check.ok) throw new Error(check.reason);
    resolvedQuery = trimmed;
  } else {
    const check = validateSearchQuery(trimmed);
    if (!check.ok) throw new Error(check.reason);
    resolvedQuery = check.query;
  }

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--dump-json",
    "--flat-playlist",
    "--playlist-items",
    "1",
    isUrl ? resolvedQuery : `ytsearch1:${resolvedQuery}`,
  ];

  const stdout = await spawnProcess("yt-dlp", args);
  const line = stdout.split("\n").find((l) => l.startsWith("{"));
  if (!line) throw new Error("連結不支援或格式錯誤。\n若要搜尋，請使用 `/search`。");
  const data = JSON.parse(line);

  return {
    title: data.title,
    url: data.webpage_url || data.original_url || data.url,
    duration: data.duration,
    thumbnail: data.thumbnail,
    uploader: data.uploader || data.artist,
    view_count: data.view_count,
    like_count: data.like_count,
    upload_date: data.upload_date,
  };
}

/**
 * 搜尋歌曲。
 */
export async function searchTracks(query, count = 5) {
  const check = validateSearchQuery(query);
  if (!check.ok) throw new Error(check.reason);
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
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((d) => d !== null)
    .map((d) => {
      return {
        title: d.title,
        url: d.webpage_url || d.original_url || d.url,
        duration: d.duration,
        thumbnail: d.thumbnail,
        uploader: d.uploader || d.artist,
      };
    });
}

/**
 * 建立串流。
 */
export async function createAudioStream(url) {
  // stream 前驗證 URL
  const check = validatePlayUrl(url);
  if (!check.ok) throw new Error(check.reason);

  const ytDlp = spawn(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "-f",
      "bestaudio[ext=webm][acodec=opus]/bestaudio/best",
      "-o",
      "-",
      url,
    ],
    { stdio: ["ignore", "pipe", "pipe"], shell: false },
  );

  let producedAudio = false;
  let cleanedUp = false;
  let ffmpeg = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    ytDlp.kill("SIGKILL");
    if (ffmpeg) ffmpeg.kill("SIGKILL");
  };

  // 15秒無音訊自動超時
  const stallTimeout = setTimeout(() => {
    if (!producedAudio) cleanup();
  }, 15_000);

  ytDlp.on("close", () => clearTimeout(stallTimeout));

  try {
    const { stream: probedStream, type } = await demuxProbe(ytDlp.stdout);

    if (type === StreamType.WebmOpus || type === StreamType.OggOpus) {
      probedStream.on("data", () => { producedAudio = true; });
      return {
        stream: probedStream,
        inputType: type,
        cleanup,
      };
    }

    if (!ffmpegPath) throw new Error("找不到 ffmpeg 執行檔來進行轉碼");

    ffmpeg = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vn",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"], shell: false },
    );

    probedStream.pipe(ffmpeg.stdin);
    ffmpeg.stdin.on("error", (err) => {
      if (err.code !== "EPIPE")
        console.error("[createAudioStream] stdin error:", err);
    });

    ffmpeg.stdout.on("data", () => {
      producedAudio = true;
    });

    ffmpeg.on("close", () => clearTimeout(stallTimeout));

    return {
      stream: ffmpeg.stdout,
      inputType: StreamType.Raw,
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
