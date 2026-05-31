import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { StreamType } from "@discordjs/voice";
import { validatePlayUrl } from "../security/sanitizeQuery.js";

export class YoutubeAdapter {
  getCommonArgs() {
    return ["--no-playlist", "--no-warnings"];
  }

  async getMetadata(query) {
    const isUrl = query.startsWith("http");

    if (isUrl) {
      const check = validatePlayUrl(query);
      if (!check.ok) throw new Error(`Rejected URL: ${check.reason}`);
    }

    const args = [
      ...this.getCommonArgs(),
      "--dump-json",
      "--flat-playlist",
      isUrl ? query : `ytsearch1:${query}`,
    ];

    try {
      const stdout = await runProcess("yt-dlp", args);
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
    try {
      const stdout = await runProcess("yt-dlp", [
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

    ffmpeg.stdout.on("data", () => {
      producedAudio = true;
    });

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

function pushProcessLog(buffer, chunk) {
  const text = chunk.toString().trim();
  if (!text) {
    return;
  }

  buffer.push(text);
  if (buffer.length > 10) {
    buffer.shift();
  }
}

function formatProcessFailure(name, code, signal, lines) {
  const fullMessage = lines.join(" ");
  if (
    fullMessage.includes("confirm your age") ||
    fullMessage.includes("age-restricted")
  ) {
    return "This song is age-restricted and cannot be played.";
  }

  const suffix = lines.length > 0 ? `: ${lines.join(" | ")}` : "";
  const exitReason =
    code !== null
      ? `code ${code}`
      : signal
        ? `signal ${signal}`
        : "unknown reason";
  return `${name} exited with ${exitReason}${suffix}`;
}

function isIgnorablePipeError(error) {
  return error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED";
}

async function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    const stdoutChunks = [];
    const stderrLines = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      pushProcessLog(stderrLines, chunk);
    });

    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf8"));
        return;
      }

      reject(
        new Error(formatProcessFailure(command, code, signal, stderrLines)),
      );
    });
  });
}
