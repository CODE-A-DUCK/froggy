import { CommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, GuildMember, VoiceBasedChannel, Guild } from "discord.js";
import { controllerStore } from "../../bot/store/controller-store.js";
import { EMOJIS } from "../../shared/emojis.js";
import { replyWithState } from "../../bot/utils/reply.js";

const CONTROLLER_DENIED_MESSAGE = ":lock: | 你不能搶別人的遙控器";

export interface VoiceStateValidationOptions {
  requireBotInVC?: boolean;
  requireSameVC?: boolean;
  requireController?: boolean;
}

export interface VoiceStateValidationResult {
  guild: Guild;
  member: GuildMember;
  userVoiceChannel: VoiceBasedChannel;
  botMember: GuildMember;
  botVoiceChannel: VoiceBasedChannel | null;
  ownerId?: string | null;
}

type SupportedInteraction = CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

export async function validateVoiceState(
  interaction: SupportedInteraction,
  options: VoiceStateValidationOptions = {},
): Promise<VoiceStateValidationResult | null> {
  const {
    requireBotInVC = true,
    requireSameVC = true,
    requireController = false,
  } = options;

  const guild = interaction.guild;
  const reply = async (content: string) => replyWithState(interaction as any, "error", content, { ephemeral: true });

  if (!guild) {
    await reply(
      `${EMOJIS.errorwarningline} | 這個指令只能在伺服器中使用。`,
    );
    return null;
  }

  let member = (interaction.member instanceof GuildMember
    ? interaction.member
    : guild.members.cache.get(interaction.user.id)) ?? null;
  if (!member?.voice) {
    member = await guild.members.fetch(interaction.user.id).catch(() => null);
  }
  const userVoiceChannel = member?.voice?.channel ?? null;

  if (!userVoiceChannel) {
    await reply(
      `${EMOJIS.errorwarningline} | 你必須在語音頻道中才能使用這個指令。`,
    );
    return null;
  }

  const botMember = guild.members.me ?? guild.members.cache.get(interaction.client.user!.id) ?? await guild.members.fetch(interaction.client.user!.id).catch(() => null);
  const botVoiceChannel = botMember?.voice?.channel ?? null;

  if (requireBotInVC && !botVoiceChannel) {
    await reply(
      `${EMOJIS.errorwarningline} | 我目前不在語音頻道中。請先使用 \`/join\` 指令讓我加入！`,
    );
    return null;
  }

  if (
    requireSameVC &&
    botVoiceChannel &&
    userVoiceChannel.id !== botVoiceChannel.id
  ) {
    await reply(
      `${EMOJIS.errorwarningline} | 你必須跟我在同一個頻道 <#${botVoiceChannel.id}> 才能使用音樂指令！`,
    );
    return null;
  }

  if (requireController) {
    const owners = controllerStore.getOwners(guild.id);
    const hasOwners = owners.size > 0;
    if (hasOwners && !owners.has(interaction.user.id)) {
      await reply(CONTROLLER_DENIED_MESSAGE);
      return null;
    }
    return {
      guild,
      member: member!,
      userVoiceChannel,
      botMember: botMember!,
      botVoiceChannel,
      ownerId: Array.from(owners)[0] ?? null,
    };
  }

  return { guild, member: member!, userVoiceChannel, botMember: botMember!, botVoiceChannel };
}

export { CONTROLLER_DENIED_MESSAGE };
