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
