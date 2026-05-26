export class PlaybackError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? 'PLAYBACK_ERROR';
    this.cause = options.cause;
  }
}

export class ResolverError extends PlaybackError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code ?? 'RESOLVER_ERROR',
      cause: options.cause,
    });
  }
}

export class VoiceConnectionError extends PlaybackError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code ?? 'VOICE_CONNECTION_ERROR',
      cause: options.cause,
    });
  }
}
