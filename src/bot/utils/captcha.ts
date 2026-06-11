import { exec } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execAsync = promisify(exec);

const WIDTH = 128;
const HEIGHT = 48;

import crypto from "node:crypto";

function randomInt(min: number, max: number) {
  return crypto.randomInt(min, max + 1);
}

export async function generateStaticCaptcha(): Promise<{ text: string, buffer: Buffer }> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let text = "";
  for (let i = 0; i < 6; i++) text += chars.charAt(randomInt(0, chars.length - 1));

  const noiseLines = Array.from({ length: 5 }).map(() => {
    const x1 = randomInt(0, WIDTH);
    const y1 = randomInt(0, HEIGHT);
    const x2 = randomInt(0, WIDTH);
    const y2 = randomInt(0, HEIGHT);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#${randomInt(100, 200).toString(16)}" stroke-width="${randomInt(1, 3)}" opacity="0.6"/>`;
  }).join("");

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="distort">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f0f4f8" />
          <stop offset="100%" stop-color="#d9e2ec" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      ${noiseLines}
      <text x="${WIDTH / 2}" y="${HEIGHT / 2 + 10}" font-family="monospace" font-size="30" font-weight="bolder" fill="#102a43" text-anchor="middle" letter-spacing="6" filter="url(#distort)">${text}</text>
    </svg>
  `;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { text, buffer };
}

export async function generateAnimatedCaptcha(): Promise<{ duplicateGroup: string, options: string[], buffer: Buffer }> {
  const groups: string[] = ["開始"];
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  while (groups.length < 5) { // 1 起始頁 + 5 碼
    let str = "";
    for (let i = 0; i < 5; i++) str += chars.charAt(randomInt(0, chars.length - 1));
    if (!groups.includes(str)) groups.push(str);
  }
  const duplicateGroup = groups[randomInt(1, groups.length - 1)];
  groups.push(duplicateGroup);

  for (let i = groups.length - 1; i > 1; i--) {
    const j = randomInt(1, i);
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }

  const options = Array.from(new Set(groups.slice(1)));
  for (let i = options.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [options[i], options[j]] = [options[j], options[i]];
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "captcha-"));

  try {
    for (let i = 0; i < groups.length; i++) {
      const text = groups[i];
      const jitterX = randomInt(-3, 3);

      const noiseLines = Array.from({ length: 4 }).map(() => {
        const x1 = randomInt(0, WIDTH);
        const y1 = randomInt(0, HEIGHT);
        const x2 = randomInt(0, WIDTH);
        const y2 = randomInt(0, HEIGHT);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888" stroke-width="2" opacity="0.4"/>`;
      }).join("");

      const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="distort">
              <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="1" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="${randomInt(2, 4)}" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#23272a" />
              <stop offset="100%" stop-color="#2c2f33" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)" />
          ${noiseLines}
          <text x="${(WIDTH / 2) + jitterX}" y="${HEIGHT / 2 + 10}" font-family="monospace" font-size="26" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="4" filter="url(#distort)">${text}</text>
        </svg>
      `;
      const frameBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      await fs.writeFile(path.join(tmpDir, `frame_${i.toString().padStart(3, "0")}.png`), frameBuffer);
    }

    const outputWebp = path.join(tmpDir, "output.webp");
    // 1000ms / 400ms = 2.5 fps
    await execAsync(`"${ffmpegPath}" -framerate 1000/400 -i "${tmpDir}/frame_%03d.png" -vcodec libwebp -lossless 0 -qscale 75 -loop 0 "${outputWebp}"`);

    const buffer = await fs.readFile(outputWebp);
    return { duplicateGroup, options, buffer };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }
}
