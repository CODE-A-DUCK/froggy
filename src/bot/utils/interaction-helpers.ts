import { GuildMember, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";

import { db } from "../../db/index.js";
import { replyWithState } from "./reply.js";

export async function getVerifyRoleId(guildId: string): Promise<string | null> {
  const row = await db
    .selectFrom("guild_config")
    .select("verify_role_id")
    .where("guild_id", "=", guildId)
    .executeTakeFirst();
  return row?.verify_role_id ?? null;
}

export async function getVerifiedMember(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
): Promise<GuildMember | null> {
  return interaction.guild?.members.fetch(interaction.user.id).catch(() => null) ?? null;
}

export async function grantRole(member: GuildMember, roleId: string): Promise<void> {
  await member.roles.add(roleId).catch((err) => {
    console.warn(`[Verify] Failed to add role ${roleId} to ${member.id}:`, err);
  });
}

export async function handleVerificationFailure(member: GuildMember): Promise<boolean> {
  const config = await db.selectFrom("guild_config").select("kick_on_fail").where("guild_id", "=", member.guild.id).executeTakeFirst();
  if (config?.kick_on_fail) {
    if (member.kickable) {
      setTimeout(() => {
        member.kick("驗證失敗").catch(() => null); // 我要給他們看叉燒信息 :D
      }, 5000);
      return true;
    }
  }
  return false;
}

const ERR_NO_ROLE = "伺服器未設置驗證身份組。";
const ERR_ALREADY_VERIFIED = "您已經通過驗證了！";

export async function validateVerificationPreconditions(interaction: ButtonInteraction | ModalSubmitInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return null;

  const roleId = await getVerifyRoleId(guildId);
  if (!roleId) {
    await replyWithState(interaction, "error", ERR_NO_ROLE);
    return null;
  }

  const member = await getVerifiedMember(interaction);
  if (!member) return null;

  if (member.roles.cache.has(roleId)) {
    await replyWithState(interaction, "info", ERR_ALREADY_VERIFIED);
    return null;
  }

  return { member, roleId };
}
