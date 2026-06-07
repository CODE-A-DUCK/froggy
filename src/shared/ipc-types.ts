export type IPCOpCode =
  | "HEARTBEAT"
  | "HEARTBEAT_ACK"
  | "VOICE_CONNECT"
  | "VOICE_DISCONNECT"
  | "PLAY"
  | "STOP"
  | "PAUSE"
  | "RESUME"
  | "SKIP"
  | "SYNC_STATE"
  | "SEARCH"
  | "LOOP"
  | "REMOVE"
  | "ACK"
  | "NACK"
  | "TRACK_STARTED"
  | "TRACK_STOPPED"
  | "QUEUE_FINISHED"
  | "TRACK_QUEUED"
  | "LOOP_CHANGED"
  | "STATE_UPDATE"
  | "NEED_VOICE_CONNECT"
  | "ERROR";

export interface IPCMessage<T = any> {
  message_id: string; // 追蹤請求/回應對。
  op: IPCOpCode;
  timestamp: number;
  d: T;
  signature?: string; // 簽名
}

export interface VoiceConnectPayload {
  guild_id: string;
  channel_id: string;
  session_id: string;
  token: string;
  endpoint: string;
  bot_user_id: string;
}

export interface VoiceDisconnectPayload {
  guild_id: string;
}

export interface PlayPayload {
  guild_id: string;
  url: string;
  text_channel_id: string;
  controller_user_id?: string | null;
  interaction_token: string;
}

export interface GuildActionPayload {
  guild_id: string;
}

export interface SearchPayload {
  query: string;
  count?: number;
}

export interface SearchResultPayload {
  results: any[]; // TrackMetadata[]
}

export interface AckPayload {
  status: "SUCCESS" | "FAILED";
  reason?: string;
  data?: any;
}

export interface TrackEventPayload {
  guild_id: string;
  text_channel_id?: string | null;
  track?: any; // 會轉型成 TrackMetadata
  reason?: string;
}

export interface SyncStatePayload {
  guild_ids?: string[];
}

export interface GuildAudioState {
  guild_id: string;
  state: "OFFLINE" | "CONNECTING" | "IDLE" | "PLAYING" | "PAUSED";
  current_track: any | null;
  queue_length: number;
  loop_mode: number;
}
