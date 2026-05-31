import { v4 as uuidv4 } from "uuid";
import { YoutubeAdapter } from "./YoutubeAdapter.js";

export class YoutubeTrackSource {
  constructor(adapter = new YoutubeAdapter()) {
    this.adapter = adapter;
    this.key = "youtube";
  }

  supports(query) {
    return typeof query === "string" && query.trim().length > 0;
  }

  async resolve(query, context = {}) {
    const metadata = await this.adapter.getMetadata(query);
    return {
      id: uuidv4(),
      source: this.key,
      title: metadata.title,
      url: metadata.url,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      uploader: metadata.uploader,
      view_count: metadata.view_count,
      like_count: metadata.like_count,
      upload_date: metadata.upload_date,
      description: metadata.description,
      text_channel_id: context.textChannelId ?? null,
      interaction_token: context.interactionToken ?? "",
      controller_user_id: context.controllerUserId ?? null,
      requested_at: new Date().toISOString(),
    };
  }

  async createStream(track) {
    return this.adapter.createAudioStream(track.url);
  }
}
