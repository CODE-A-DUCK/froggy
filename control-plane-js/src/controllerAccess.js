import { MessageFlags } from "discord.js";
import { broker } from "./broker.js";

const CONTROLLER_DENIED_MESSAGE = ":lock: | 你不能搶別人的遙控器";

export async function getActiveControllerOwner(guildId) {
  if (!guildId) return null;
  return broker.getActiveControllerOwner(guildId);
}

export async function requireControllerAccess(
  interaction,
  message = CONTROLLER_DENIED_MESSAGE,
) {
  const ownerId = await getActiveControllerOwner(interaction.guildId);
  if (!ownerId || ownerId === interaction.user.id) {
    return { allowed: true, ownerId };
  }

  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
  });
  return { allowed: false, ownerId };
}

export { CONTROLLER_DENIED_MESSAGE };
