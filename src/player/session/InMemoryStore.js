import { LoopMode } from "../core/playbackConstants.js";
export class InMemoryStore {
  #queue = [];
  #currentTrack = null;
  #loopMode = LoopMode.OFF;

  async enqueue(track) {
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
