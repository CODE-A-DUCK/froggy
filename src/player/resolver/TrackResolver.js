import { ResolverError } from "../core/errors.js";

export class TrackResolver {
  constructor(sources = []) {
    this.sources = sources;
  }

  async resolve(query, context = {}) {
    const source = this.sources.find((s) => s.supports(query));
    if (!source)
      throw new ResolverError("No available source can resolve this query.", {
        code: "UNSUPPORTED_SOURCE",
      });

    try {
      return await source.resolve(query, context);
    } catch (error) {
      throw new ResolverError(
        `Failed to resolve playback metadata: ${error.message}`,
        {
          code: "RESOLVE_FAILED",
          cause: error,
        },
      );
    }
  }

  async createStream(track) {
    const source = this.sources.find((s) => s.key === track.source);
    if (!source)
      throw new ResolverError(`Unknown track source: ${track.source}`, {
        code: "UNKNOWN_SOURCE",
      });

    try {
      return await source.createStream(track);
    } catch (error) {
      throw new ResolverError(
        `Failed to prepare playback stream: ${error.message}`,
        {
          code: "STREAM_CREATE_FAILED",
          cause: error,
        },
      );
    }
  }
}
