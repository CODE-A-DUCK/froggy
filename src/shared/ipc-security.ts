import { createHmac, timingSafeEqual } from "node:crypto";
import { IPCMessage } from "./ipc-types.js";

// 確保這個密鑰在生產環境中設置在 .env 文件裡！
const SECRET = process.env.IPC_SECRET || "FROGGY_DEV_SECRET_DO_NOT_USE_IN_PROD";

/**
 * 移除任何現有的簽名，將消息體轉換為字符串，然後對其進行簽名。
 */
export function signMessage<T>(message: IPCMessage<T>): IPCMessage<T> {
  const { signature, ...payload } = message;
  const payloadString = JSON.stringify(payload);

  const hmac = createHmac("sha256", SECRET);
  hmac.update(payloadString);

  return {
    ...payload,
    signature: hmac.digest("hex"),
  } as IPCMessage<T>;
}

/**
 * 驗證簽名
 */
export function verifySignature<T>(message: IPCMessage<T>): boolean {
  if (!message.signature) return false;

  const { signature, ...payload } = message;
  const payloadString = JSON.stringify(payload);

  const hmac = createHmac("sha256", SECRET);
  hmac.update(payloadString);
  const expectedSignature = hmac.digest("hex");

  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expectedSignature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
