import { Events, VoiceState } from "discord.js";

export const voiceStateUpdateEvent = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState, context: any) {
    const { guildPlayerManager } = context;
    const guildId = newState.guild.id || oldState.guild.id;
    const session = guildPlayerManager.getSession(guildId);
    if (!session) return;

    const botMember =
      newState.guild.members.me ||
      (await newState.guild.members
        .fetch(newState.client.user.id)
        .catch(() => null));
    const botChannelId = botMember?.voice.channelId;

    if (!botChannelId) return;

    if (
      oldState.channelId === botChannelId ||
      newState.channelId === botChannelId
    ) {
      await session.updateVoicePresence();
    }
  },
};
