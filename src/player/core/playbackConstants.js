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
