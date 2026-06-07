import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { IPCMessage, IPCOpCode } from "../shared/ipc-types.js";
import { signMessage } from "../shared/ipc-security.js";

export class ControlPlaneClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  // 用來追蹤還在等 ACK/NACK 的請求
  private pendingRequests: Map<string, { resolve: (val: any) => void, reject: (err: any) => void, timeout: NodeJS.Timeout }> = new Map();

  constructor(url: string = "ws://localhost:8080") {
    super();
    this.url = url;
  }

  public connect() {
    if (this.ws) return;

    console.log(`[ControlPlane] Connecting to audio node at ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      console.log(`[ControlPlane] Connected to audio node!`);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

      // 每 15 秒 ping 一次，保持連線
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 15000);

      this.emit("connected");
      this.syncState();
    });

    this.ws.on("message", (data) => {
      try {
        const message: IPCMessage = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (err) {
        console.error(`[ControlPlane] Failed to parse message from audio node:`, err);
      }
    });

    this.ws.on("close", (code, reason) => {
      console.warn(`[ControlPlane] Disconnected from audio node (Code: ${code}, Reason: ${reason}). Reconnecting in 5s...`);
      this.cleanup();
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on("error", (err) => {
      console.error(`[ControlPlane] WebSocket Error:`, err);
      // The 'close' event will fire automatically after an error
    });
  }

  public cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    // 斷線了，立刻把所有待處理請求拒絕
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timeout);
      req.reject(new Error("Audio node disconnected"));
      this.pendingRequests.delete(id);
    }
  }

  private syncState() {
    console.log(`[ControlPlane] Requesting State Synchronization...`);
    this.send("SYNC_STATE", {});
  }

  private handleMessage(message: IPCMessage) {
    // 把 ACK/NACK 回傳給對應的 promise
    if (message.op === "ACK" || message.op === "NACK") {
      const req = this.pendingRequests.get(message.message_id);
      if (req) {
        clearTimeout(req.timeout);
        this.pendingRequests.delete(message.message_id);

        if (message.op === "ACK") {
          req.resolve(message.d);
        } else {
          req.reject(new Error(message.d?.reason || "Request failed"));
        }
      }
      return;
    }

    // 觸發事件
    this.emit(message.op, message.d);
  }

  /**
   * 只發送一次，不理回應
   */
  public send(op: IPCOpCode, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[ControlPlane] Cannot send ${op}, Audio Node is disconnected.`);
      return;
    }

    const message: IPCMessage = {
      message_id: randomUUID(),
      op,
      timestamp: Date.now(),
      d: data
    };

    const signedMessage = signMessage(message);
    this.ws.send(JSON.stringify(signedMessage));
  }

  /**
   * 等待回應的請求
   */
  public async sendRequest<T = any>(op: IPCOpCode, data: any, timeoutMs: number = 5000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Cannot send ${op}, Audio Node is offline.`);
    }

    const message_id = randomUUID();
    const message: IPCMessage = {
      message_id,
      op,
      timestamp: Date.now(),
      d: data
    };

    const signedMessage = signMessage(message);

    return new Promise((resolve, reject) => {
      // Setup timeout watchdog
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message_id);
        reject(new Error(`Request ${op} timed out after ${timeoutMs}ms (Audio Node unresponsive)`));
      }, timeoutMs);

      this.pendingRequests.set(message_id, { resolve, reject, timeout });

      // Dispatch payload
      this.ws!.send(JSON.stringify(signedMessage));
    });
  }
}
