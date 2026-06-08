import { TrackEvent } from "../../shared/types.js";

class ControllerStore {
  #owners = new Map<string, Set<string>>();
  #messages = new Map<string, string>();
  #tracks = new Map<string, TrackEvent>();

  getOwner(guildId: string): string | null {
    const owners = this.#owners.get(guildId);
    if (!owners || owners.size === 0) return null;
    return Array.from(owners)[0];
  }

  getOwners(guildId: string): Set<string> {
    return this.#owners.get(guildId) ?? new Set();
  }

  isOwner(guildId: string, userId: string): boolean {
    const owners = this.#owners.get(guildId);
    return owners ? owners.has(userId) : false;
  }

  claimOwner(guildId: string, userId: string): boolean {
    let owners = this.#owners.get(guildId);
    if (!owners) {
      owners = new Set();
      this.#owners.set(guildId, owners);
    }
    owners.add(userId);
    return true;
  }

  setOwner(guildId: string, userId: string): void {
    let owners = this.#owners.get(guildId);
    if (!owners) {
      owners = new Set();
      this.#owners.set(guildId, owners);
    }
    owners.add(userId);
  }

  clearOwner(guildId: string): void {
    this.#owners.delete(guildId);
  }

  getMessageId(guildId: string): string | null {
    return this.#messages.get(guildId) ?? null;
  }

  setMessageId(guildId: string, id: string): void {
    this.#messages.set(guildId, id);
  }

  clearMessageId(guildId: string): void {
    this.#messages.delete(guildId);
  }

  getCurrentTrack(guildId: string): TrackEvent | null {
    return this.#tracks.get(guildId) ?? null;
  }

  setCurrentTrack(guildId: string, track: TrackEvent): void {
    this.#tracks.set(guildId, track);
  }

  clearCurrentTrack(guildId: string): void {
    this.#tracks.delete(guildId);
  }
}

export const controllerStore = new ControllerStore();
export { ControllerStore };
