import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { StreamType } from "@discordjs/voice";
import { validatePlayUrl, validateSearchQuery } from "../../security/sanitizeQuery.js";
import { spawnProcess } from "./spawnProcess.js";

export class YoutubeAdapter {
  getCommonArgs() {
    return ["--no-playlist", "--no-warnings"];
  }

  async getMetadata(query) {
    const isUrl = (() => {
      try {
        const u = new URL(query);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    })();

    if (isUrl) {
      const check = validatePlayUrl(query);
      if (!check.ok) throw new Error(`Rejected URL: ${check.reason}`);
    } else {
      const check = validateSearchQuery(query);
      if (!check.ok) throw new Error(`Rejected Search Query: ${check.reason}`);
    }

    const args = [
      ...this.getCommonArgs(),
      "--dump-json",
      "--flat-playlist",
      "--playlist-items",
      "1",
      isUrl ? query : `ytsearch1:${query}`,
    ];

    try {
      const stdout = await spawnProcess("yt-dlp", args);
      const jsonLine = stdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("{"));

      if (!jsonLine) {
        throw new Error("Unknown track or unsupported URL.");
      }

      const data = JSON.parse(jsonLine);

      return {
        title: data.title,
        url: data.webpage_url || data.original_url || data.url,
        duration: data.duration,
        thumbnail: data.thumbnail,
        uploader: data.uploader || data.artist,
        view_count: data.view_count,
        like_count: data.like_count,
        upload_date: data.upload_date,
        description: data.description,
      };
    } catch (err) {
      this.#handleYtDlpError(err);
    }
  }

  async getStreamUrl(url) {
    const check = validatePlayUrl(url);
    if (!check.ok) throw new Error(`Rejected URL: ${check.reason}`);
    try {
      const stdout = await spawnProcess("yt-dlp", [
        ...this.getCommonArgs(),
        "-g",
        "-f",
        "bestaudio/best",
        url,
      ]);
      return stdout.trim();
    } catch (err) {
      this.#handleYtDlpError(err);
    }
  }

  #handleYtDlpError(err) {
    const message = err.message || "";
    if (
      message.includes("confirm your age") ||
      message.includes("age-restricted")
    ) {
      throw new Error("This song is age-restricted and cannot be played.");
    }

    if (message.includes("Unknown track")) {
      throw err;
    }

    console.error("[YoutubeAdapter] yt-dlp error:", err);
    throw err;
  }

  createAudioStream(url) {
    const check = validatePlayUrl(url);
    if (!check.ok) throw new Error(`Rejected stream URL: ${check.reason}`);

    if (!ffmpegPath) {
      throw new Error("ffmpeg-static binary is not available.");
    }

    const ytDlp = spawn(
      "yt-dlp",
      [
        ...this.getCommonArgs(),
        "--no-progress",
        "-f",
        "bestaudio/best",
        "-o",
        "-",
        url,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );

    const ffmpeg = spawn(
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
      {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      },
    );

    ytDlp.stdout.pipe(ffmpeg.stdin);

    const ytDlpErrors = [];
    const ffmpegErrors = [];
    let cleanedUp = false;
    let producedAudio = false;
    
    let stallTimeout = null;
    const resetStallTimeout = () => {
      if (stallTimeout) clearTimeout(stallTimeout);
      stallTimeout = setTimeout(() => {
        if (!cleanedUp) {
          ffmpeg.stdout.destroy(new Error("FFMPEG_STALLED: ffmpeg stopped producing audio data"));
        }
      }, 15000);
    };

    ffmpeg.stdout.on("data", () => {
      producedAudio = true;
      resetStallTimeout();
    });
    
    resetStallTimeout();

    ytDlp.stderr.on("data", (chunk) => {
      pushProcessLog(ytDlpErrors, chunk);
    });

    ffmpeg.stderr.on("data", (chunk) => {
      pushProcessLog(ffmpegErrors, chunk);
    });

    ffmpeg.stdin.on("error", (error) => {
      if (cleanedUp || isIgnorablePipeError(error)) {
        ytDlp.stdout.unpipe(ffmpeg.stdin);
        return;
      }

      ffmpeg.stdout.destroy(new Error(`ffmpeg stdin error: ${error.message}`));
    });

    ytDlp.stdout.on("error", (error) => {
      if (cleanedUp || isIgnorablePipeError(error)) {
        return;
      }

      ffmpeg.stdout.destroy(new Error(`yt-dlp stdout error: ${error.message}`));
    });

    ytDlp.on("error", (error) => {
      ffmpeg.stdout.destroy(
        new Error(`yt-dlp failed to start: ${error.message}`),
      );
    });

    ffmpeg.on("error", (error) => {
      ffmpeg.stdout.destroy(
        new Error(`ffmpeg failed to start: ${error.message}`),
      );
    });

    ytDlp.on("close", (code, signal) => {
      if (cleanedUp) {
        return;
      }

      if (code !== 0) {
        ffmpeg.stdout.destroy(
          new Error(formatProcessFailure("yt-dlp", code, signal, ytDlpErrors)),
        );
      }
    });

    ffmpeg.on("close", (code, signal) => {
      if (cleanedUp) {
        return;
      }

      if (code !== 0) {
        ffmpeg.stdout.destroy(
          new Error(formatProcessFailure("ffmpeg", code, signal, ffmpegErrors)),
        );
        return;
      }

      if (!producedAudio) {
        ffmpeg.stdout.destroy(
          new Error("ffmpeg exited without producing audio output."),
        );
      }
    });

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      if (stallTimeout) clearTimeout(stallTimeout);
      ytDlp.stdout.unpipe(ffmpeg.stdin);
      ffmpeg.stdin.destroy();
      ytDlp.kill("SIGKILL");
      ffmpeg.kill("SIGKILL");
    };

    ffmpeg.stdout.once("close", cleanup);
    ffmpeg.stdout.once("error", cleanup);

    return {
      stream: ffmpeg.stdout,
      inputType: StreamType.Raw,
      cleanup,
    };
  }
}

function isIgnorablePipeError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED";
}
