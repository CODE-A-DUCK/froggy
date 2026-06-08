import { MessageFlags, CommandInteraction, ButtonInteraction, AnySelectMenuInteraction, ModalSubmitInteraction } from "discord.js";
import { ContainerFactory } from "../../player/ui/container-factory.js";

type InteractionType = CommandInteraction | ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/**
 * 統一回覆帶有特定狀態 (success/error/info/warning) 的訊息。
 */
export async function replyWithState(
  interaction: InteractionType,
  state: "success" | "error" | "info" | "warning",
  message: string,
  options?: {
    ephemeral?: boolean;
    reply?: boolean; // 如果是 true，就強制用 reply()，而不是 editReply()
  }
) {
  const isErrorOrWarning = state === "error" || state === "warning";
  const ephemeral = options?.ephemeral ?? isErrorOrWarning;

  const flags = [MessageFlags.IsComponentsV2 as any];
  if (ephemeral) flags.push(MessageFlags.Ephemeral as any);

  const payload = {
    components: [ContainerFactory.buildReply(state, message, interaction.user as any).toJSON() as any],
    flags
  };

  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    } else if (options?.reply) {
      return await interaction.reply(payload);
    } else {
      // 預設為 editReply (通常應該這類訊息都已經過defer處理了)
      return await interaction.editReply(payload);
    }
  } catch (err) {
    console.error("[Reply Helper] Failed to reply:", err);
  }
}
