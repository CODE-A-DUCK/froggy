import { spawn } from "node:child_process";
import { join } from "node:path";

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(prefix, message, color = colors.reset) {
  const lines = message.toString().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.log(`${color}${prefix}${colors.reset} | ${line}`);
    }
  }
}

//Data Plane
console.log(`${colors.bright}正在啟動 Data Plane (Node.js)...${colors.reset}`);
const dataPlane = spawn("node", ["src/index.js"], {
  cwd: join(process.cwd(), "data-plane-js"),
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});

dataPlane.stdout.on("data", (data) => log("[Data Plane]", data, colors.blue));
dataPlane.stderr.on("data", (data) => log("[Data Plane]", data, colors.red));

//Control Plane
console.log(`${colors.bright}正在啟動 Control Plane (Bun)...${colors.reset}`);
const controlPlane = spawn("bun", ["src/index.js"], {
  cwd: join(process.cwd(), "control-plane-js"),
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});

controlPlane.stdout.on("data", (data) =>
  log("[Control Plane]", data, colors.green),
);
controlPlane.stderr.on("data", (data) =>
  log("[Control Plane]", data, colors.yellow),
);

const exitHandler = (signalOrCode) => {
  console.log(`\n${colors.bright}正在關閉所有程序...${colors.reset}`);
  dataPlane.kill();
  controlPlane.kill();
  const exitCode = typeof signalOrCode === "number" ? signalOrCode : 0;
  process.exit(exitCode);
};

process.on("SIGINT", exitHandler);
process.on("SIGTERM", exitHandler);

dataPlane.on("close", (code) => {
  console.log(`[Data Plane] 已退出，代碼：${code}`);
  if (code !== 0) exitHandler(code);
});

controlPlane.on("close", (code) => {
  console.log(`[Control Plane] 已退出，代碼：${code}`);
  if (code !== 0) exitHandler(code);
});
