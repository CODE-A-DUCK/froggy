import crypto from "node:crypto";
import http from "node:http";

import NodeCache from "node-cache";

import { grantRole } from "../bot/utils/interaction-helpers.js";

interface VerifySession {
  guildId: string;
  userId: string;
  roleId: string;
}

// 儲存驗證碼 15 分鐘
export const verifyCache = new NodeCache({ stdTTL: 900 });

export function generateVerifyToken(session: VerifySession): string {
  const token = crypto.randomBytes(16).toString("hex");
  verifyCache.set(token, session);
  return token;
}

export function startTurnstileServer(client: any) {
  const PORT = process.env.PORT || 3000;
  const SITE_KEY = process.env.TURNSTILE_SITE_KEY;
  const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

  if (!SITE_KEY || !SECRET_KEY) {
    console.warn("[Server] Missing TURNSTILE_SITE_KEY or TURNSTILE_SECRET_KEY in .env, Turnstile verification will not work.");
  }

  function sendHtml(res: http.ServerResponse, status: number, body: string): void {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Froggy 驗證</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
        <style>
          :root {
            --bg: #ffffff;
            --text: #000000;
            --border: #000000;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #000000;
              --text: #ffffff;
              --border: #ffffff;
            }
          }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
          }
          .container {
            background: var(--bg);
            padding: 2rem;
            border: 1px solid var(--border);
            text-align: center;
            max-width: 400px;
            width: 90%;
            box-sizing: border-box;
          }
          h1, h2 { margin-top: 0; font-size: 1.5rem; }
          p { margin-bottom: 1.5rem; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          ${body}
        </div>
      </body>
      </html>
    `);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/verify") {
      const token = url.searchParams.get("token");

      if (!token || !verifyCache.has(token)) {
        return sendHtml(res, 400, "<h1>無效或已過期的驗證連結。</h1>");
      }

      sendHtml(res, 200, `
        <h2>驗證中...</h2>
        <p>請等待安全驗證完成，Froggy 會自動為您獲取伺服器身份組。</p>
        <form id="verify-form" action="/verify/submit" method="POST">
          <input type="hidden" name="token" value="${token}" />
          <div class="cf-turnstile" data-sitekey="${SITE_KEY}" data-theme="auto" data-callback="onTurnstileSuccess"></div>
        </form>
        <script>
          function onTurnstileSuccess() {
            document.getElementById('verify-form').submit();
          }
        </script>
      `);
    } else if (req.method === "POST" && req.url === "/verify/submit") {
      let body = "";
      req.on("data", chunk => body += chunk.toString());
      req.on("end", async () => {
        const params = new URLSearchParams(body);
        const token = params.get("token");
        const turnstileResponse = params.get("cf-turnstile-response");

        if (!token || !turnstileResponse) {
          return sendHtml(res, 400, "<h1>無效的請求。</h1>");
        }

        const session = verifyCache.get<VerifySession>(token);
        if (!session) {
          return sendHtml(res, 400, "<h1>驗證會話已過期。請重新獲取連結。</h1>");
        }

        try {
          const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ secret: SECRET_KEY || "", response: turnstileResponse }).toString()
          });

          const verifyData = await verifyRes.json() as any;

          if (verifyData.success) {
            // Success! Give the role
            const guild = await client.guilds.fetch(session.guildId).catch(() => null);
            if (guild) {
              const member = await guild.members.fetch(session.userId).catch(() => null);
              if (member) {
                await grantRole(member, session.roleId);
              }
            }

            verifyCache.del(token);
            sendHtml(res, 200, "<h1>你是愛因斯坦嗎？ 驗證成功！您現在可以關閉此網頁並返回 Discord。</h1>");
          } else {
            sendHtml(res, 400, "<h1>生個叉燒包都好過你。你驗證失敗了，請重新嘗試。</h1>");
          }
        } catch (err: any) {
          console.error("[Turnstile] Verification error:", err);
          sendHtml(res, 500, "<h1>伺服器內部錯誤。</h1>");
        }
      });
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.error(`[Server] Port ${PORT} is already in use! The Turnstile server cannot start. If you have another bot instance running, please kill it.`);
    } else {
      console.error("[Server] Turnstile server error:", e);
    }
  });

  server.listen(PORT, () => {
    console.log(`[Server] Verification web server listening on port ${PORT}`);
  });
}
