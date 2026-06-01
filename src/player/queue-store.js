import { LoopMode } from "./core/playback-constants.js";
export class QueueStore {
  #queue = [];
  #currentTrack = null;
  #loopMode = LoopMode.OFF;

  async enqueue(track) {
    if (this.#queue.length >= 50) {
      throw new Error("隊列已滿（最多 50 首）");
    }
    this.#queue.push(track);
  }

  async dequeue() {
    return this.#queue.shift() ?? null;
  }

  async getQueue(limit = 25) {
    return this.#queue.slice(0, limit);
  }

  async getQueueLength() {
    return this.#queue.length;
  }

  async removeTracks(indices) {
    const sortedIndices = [...indices].sort((a, b) => b - a);
    const removed = [];
    for (const index of sortedIndices) {
      if (index >= 0 && index < this.#queue.length) {
        removed.push(this.#queue.splice(index, 1)[0]);
      }
    }
    return removed;
  }

  async clearQueue() {
    this.#queue = [];
  }

  async getCurrentTrack() {
    return this.#currentTrack;
  }

  async setCurrentTrack(track) {
    this.#currentTrack = track;
  }

  async touchCurrentTrack() {
    return this.#currentTrack;
  }

  async clearCurrentTrack() {
    this.#currentTrack = null;
  }

  async getLoopMode() {
    return this.#loopMode;
  }

  async setLoopMode(mode) {
    this.#loopMode = mode;
    return mode;
  }

  async cycleLoopMode() {
    this.#loopMode = (this.#loopMode + 1) % 3;
    return this.#loopMode;
  }
}
