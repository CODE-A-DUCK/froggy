export const SessionState = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  BUFFERING: "buffering",
  PLAYING: "playing",
  PAUSED: "paused",
  STOPPING: "stopping",
  ERROR: "error",
});

export const LoopMode = Object.freeze({
  OFF: 0,
  REPLAY_ONCE: 1,
  TRACK: 2,
});

export const CURRENT_TRACK_TTL_SECONDS = 60 * 60 * 24; // 24 h
export const QUEUE_TTL_SECONDS = 60 * 60 * 6; // 6 h — prevents stale queues after crash
export const LOOP_TTL_SECONDS = 60 * 60 * 6; // 6 h — prevents orphaned loop state
