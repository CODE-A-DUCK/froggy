export type AudioNodeState = "OFFLINE" | "CONNECTING" | "IDLE" | "PLAYING" | "PAUSED";

class NodeStateStore {
  private states: Map<string, AudioNodeState> = new Map();

  set(guildId: string, state: AudioNodeState) {
    this.states.set(guildId, state);
  }

  get(guildId: string): AudioNodeState {
    return this.states.get(guildId) ?? "OFFLINE";
  }

  isConnected(guildId: string): boolean {
    const s = this.get(guildId);
    return s === "IDLE" || s === "PLAYING" || s === "PAUSED";
  }

  clear(guildId: string) {
    this.states.delete(guildId);
  }
}

export const nodeStateStore = new NodeStateStore();
