import { MessageFlags } from "discord.js";

import { controllerStore } from "../../bot/store/controller-store.js";

const CONTROLLER_DENIED_MESSAGE = ":lock: | 你不能搶別人的遙控器";

export async function validateVoiceState(interaction, options = {}) {
  const {
    requireBotInVC = true,
    requireSameVC = true,
    requireController = false,
  } = options;

  const guild = interaction.guild;
  const reply = async (content) => {
    if (interaction.deferred || interaction.replied)
      return interaction
        .editReply({ content, flags: MessageFlags.Ephemeral })
        .catch(() => null);
    return interaction
      .reply({ content, flags: MessageFlags.Ephemeral })
      .catch(() => null);
  };

  if (!guild) {
    await reply(
      "<:errorwarningline:1510533865805058188> | 這個指令只能在伺服器中使用。",
    );
    return null;
  }

  const member = await guild.members.fetch(interaction.user.id);
  const userVoiceChannel = member.voice.channel;
  if (!userVoiceChannel) {
    await reply(
      "<:errorwarningline:1510533865805058188> | 你必須在語音頻道中才能使用這個指令。",
    );
    return null;
  }

  const botMember = await guild.members.fetch(interaction.client.user.id);
  const botVoiceChannel = botMember.voice.channel;

  if (requireBotInVC && !botVoiceChannel) {
    await reply(
      "<:errorwarningline:1510533865805058188> | 我目前不在語音頻道中。",
    );
    return null;
  }

  if (
    requireSameVC &&
    botVoiceChannel &&
    userVoiceChannel.id !== botVoiceChannel.id
  ) {
    await reply(
      `<:errorwarningline:1510533865805058188> | 你必須跟我在同一個頻道 <#${botVoiceChannel.id}> 才能使用音樂指令！`,
    );
    return null;
  }

  if (requireController) {
    const ownerId = controllerStore.getOwner(guild.id);
    if (ownerId && ownerId !== interaction.user.id) {
      await reply(CONTROLLER_DENIED_MESSAGE);
      return null;
    }
    return {
      guild,
      member,
      userVoiceChannel,
      botMember,
      botVoiceChannel,
      ownerId,
    };
  }

  return { guild, member, userVoiceChannel, botMember, botVoiceChannel };
}

export { CONTROLLER_DENIED_MESSAGE };
