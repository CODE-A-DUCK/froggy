export function createRedisVoiceAdapter(guildId, consumer) {
  return (methods) => {
    const onVoiceState = (data) => {
      if (data.guild_id === guildId) {
        methods.onVoiceStateUpdate(data);
      }
    };

    const onVoiceServer = (data) => {
      if (data.guild_id === guildId) {
        methods.onVoiceServerUpdate(data);
      }
    };

    consumer.on('voice_state', onVoiceState);
    consumer.on('voice_server', onVoiceServer);

    queueMicrotask(() => {
      void replayCachedVoiceHandshake(guildId, consumer, methods);
    });

    const adapter = {
      sendPayload(payload) {
        if (payload.op === 4) {
          console.debug(`[VoiceAdapter] Guild ${guildId} requested gateway op 4:`, payload.d);
        }
        return true;
      },
      destroy() {
        consumer.off('voice_state', onVoiceState);
        consumer.off('voice_server', onVoiceServer);
      },
    };

    return adapter;
  };
}

async function replayCachedVoiceHandshake(guildId, consumer, methods) {
  try {
    const [voiceState, voiceServer] = await Promise.all([
      consumer.getCachedVoiceState?.(guildId) ?? null,
      consumer.getCachedVoiceServer?.(guildId) ?? null,
    ]);

    if (voiceState) {
      methods.onVoiceStateUpdate(voiceState);
    }

    if (voiceServer) {
      methods.onVoiceServerUpdate(voiceServer);
    }

    if (voiceState || voiceServer) {
      console.info(
        `[VoiceAdapter] Replayed cached voice handshake for guild ${guildId}`,
      );
    }
  } catch (error) {
    console.warn(
      `[VoiceAdapter] Failed to replay cached voice handshake for guild ${guildId}:`,
      error,
    );
  }
}
