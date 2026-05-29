class ControllerStore {
  /** @type {Map<string, string>} guildId -> userId */
  #owners = new Map();
  /** @type {Map<string, string>} guildId -> messageId */
  #messages = new Map();
  /** @type {Map<string, object>} guildId -> current track object */
  #tracks = new Map();

  getOwner(guildId) {
    return this.#owners.get(guildId) ?? null;
  }

  claimOwner(guildId, userId) {
    const existing = this.#owners.get(guildId);
    if (existing && existing !== userId) return false;
    this.#owners.set(guildId, userId);
    return true;
  }

  setOwner(guildId, userId) {
    this.#owners.set(guildId, userId);
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
