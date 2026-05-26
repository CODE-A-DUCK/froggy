import { MessageFlags } from "discord.js";
import { requireControllerAccess } from "../controllerAccess.js";

export async function validateVoiceState(interaction, options = {}) {
  const {
    requireBotInVC = true,
    requireSameVC = true,
    requireController = true,
  } = options;

  const guild = interaction.guild;

  const reply = async (content) => {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
  };

  if (!guild) {
    await reply(":x: | 這個指令只能在伺服器中使用。");
    return null;
  }

  const member = await guild.members.fetch(interaction.user.id);
  const userVoiceChannel = member.voice.channel;

  if (!userVoiceChannel) {
    await reply(":x: | 你必須在語音頻道中才能使用這個指令。");
    return null;
  }

  const botMember = await guild.members.fetch(interaction.client.user.id);
  const botVoiceChannel = botMember.voice.channel;

  if (requireBotInVC && !botVoiceChannel) {
    await reply(":x: | 我目前不在語音頻道中。");
    return null;
  }

  if (
    requireSameVC &&
    botVoiceChannel &&
    userVoiceChannel.id !== botVoiceChannel.id
  ) {
    await reply(`:x: | 你必須跟我在同一個頻道 <#${botVoiceChannel.id}> 才能使用音樂指令！`);
    return null;
  }

  if (requireController) {
    const access = await requireControllerAccess(interaction);
    if (!access.allowed) return null;
    return {
      guild,
      member,
      userVoiceChannel,
      botMember,
      botVoiceChannel,
      access,
    };
  }

  return { guild, member, userVoiceChannel, botMember, botVoiceChannel };
}
