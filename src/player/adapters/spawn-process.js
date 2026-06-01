import { spawn } from "node:child_process";

let activeProcesses = 0;
const MAX_CONCURRENT = 10;

export async function spawnProcess(command, args) {
  if (activeProcesses >= MAX_CONCURRENT) {
    throw new Error("Too many concurrent requests. Please wait.");
  }
  activeProcesses++;
  try {
    return await _spawn(command, args);
  } finally {
    activeProcesses--;
  }
}

function _spawn(command, args) {
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
        child.kill("SIGKILL");
        reject(new Error(`${command} timed out after 60 seconds.`));
      }
    }, 60_000);

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) stderrLines.push(text);
      if (stderrLines.length > 10) stderrLines.shift();
    });

    child.on("error", (error) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      reject(new Error(`${command} failed to start: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf-8"));
      } else {
        reject(new Error(formatFailure(command, code, signal, stderrLines)));
      }
    });
  });
}

function formatFailure(name, code, signal, lines) {
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
