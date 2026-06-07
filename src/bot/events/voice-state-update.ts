import { Events, VoiceState } from "discord.js";

const emptyChannelTimeouts = new Map<string, NodeJS.Timeout>();

export const voiceStateUpdateEvent = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState, context: any) {
    const { lavalink, voiceGateway, nodeStateStore } = context;
    const guildId = newState.guild.id || oldState.guild.id;

    if (!nodeStateStore.isConnected(guildId)) return;

    const botMember =
      newState.guild.members.me ||
      (await newState.guild.members
        .fetch(newState.client.user.id)
        .catch(() => null));
    const botChannelId = botMember?.voice.channelId;

    if (!botChannelId) return;

    if (oldState.channelId === botChannelId || newState.channelId === botChannelId) {
      const channel = await newState.guild.channels.fetch(botChannelId).catch(() => null);
      if (channel && channel.isVoiceBased()) {
        const humanMembers = channel.members.filter(m => !m.user.bot);

        if (humanMembers.size === 0) {
          if (!emptyChannelTimeouts.has(guildId)) {
            console.log(`[AutoLeave] No one in channel, 3 minute leave countdown started (Guild: ${guildId})`);
            const timeout = setTimeout(async () => {
              emptyChannelTimeouts.delete(guildId);
              const latestChannel = await newState.guild.channels.fetch(botChannelId).catch(() => null);
              if (latestChannel && latestChannel.isVoiceBased() && latestChannel.members.filter(m => !m.user.bot).size === 0) {
                console.log(`[AutoLeave] No one in channel for 3 minutes, automatically leaving (Guild: ${guildId})`);
                const player = lavalink.getPlayer(guildId);
                if (player) {
                  await player.stopPlaying(true).catch(() => null);
                  await player.destroy("Disconnected").catch(() => null);
                }
                voiceGateway.disconnectFromChannel(guildId);
                context.controllerStore?.clearOwner(guildId);
              }
            }, 3 * 60 * 1000);
            emptyChannelTimeouts.set(guildId, timeout);
          }
        } else {
          const existingTimeout = emptyChannelTimeouts.get(guildId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            emptyChannelTimeouts.delete(guildId);
            console.log(`[AutoLeave] Someone joined the channel, cancelled the leave countdown (Guild: ${guildId})`);
          }
        }
      }
    }
  },
};
