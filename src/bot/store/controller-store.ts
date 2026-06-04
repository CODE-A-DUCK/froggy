class ControllerStore {
  /** @type {Map<string, Set<string>>} guildId -> Set of userIds */
  #owners = new Map();
  /** @type {Map<string, string>} guildId -> messageId */
  #messages = new Map();
  /** @type {Map<string, object>} guildId -> current track object */
  #tracks = new Map();

  getOwner(guildId) {
    const owners = this.#owners.get(guildId);
    if (!owners || owners.size === 0) return null;
    return Array.from(owners)[0];
  }

  getOwners(guildId) {
    return this.#owners.get(guildId) ?? new Set();
  }

  isOwner(guildId, userId) {
    const owners = this.#owners.get(guildId);
    return owners ? owners.has(userId) : false;
  }

  claimOwner(guildId, userId) {
    let owners = this.#owners.get(guildId);
    if (!owners) {
      owners = new Set();
      this.#owners.set(guildId, owners);
    }
    owners.add(userId);
    return true;
  }

  setOwner(guildId, userId) {
    let owners = this.#owners.get(guildId);
    if (!owners) {
      owners = new Set();
      this.#owners.set(guildId, owners);
    }
    owners.add(userId);
  }

  clearOwner(guildId) {
    this.#owners.delete(guildId);
  }

  getMessageId(guildId) {
    return this.#messages.get(guildId) ?? null;
  }

  setMessageId(guildId, id) {
    this.#messages.set(guildId, id);
  }

  clearMessageId(guildId) {
    this.#messages.delete(guildId);
  }

  getCurrentTrack(guildId) {
    return this.#tracks.get(guildId) ?? null;
  }

  setCurrentTrack(guildId, track) {
    this.#tracks.set(guildId, track);
  }

  clearCurrentTrack(guildId) {
    this.#tracks.delete(guildId);
  }
}

export const controllerStore = new ControllerStore();
export { ControllerStore };
