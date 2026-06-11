import { Events, Interaction } from "discord.js";

import { handleInteraction } from "../commands/index.js";
import { handleButtonInteraction } from "../handlers/button-handler.js";
import { handleModalInteraction } from "../handlers/modal-handler.js";

export const interactionCreateEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, context: any) {
    if (Date.now() - interaction.createdTimestamp > 2000) return;

    try {
      if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
        await handleInteraction(interaction, context);
      } else if (interaction.isButton()) {
        const handled = await handleButtonInteraction(interaction, context);
        if (!handled) await handleInteraction(interaction, context);
      } else if (
        interaction.isStringSelectMenu() ||
        (interaction as any).values
      ) {
        await handleInteraction(interaction, context);
      } else if (interaction.isModalSubmit()) {
        const handled = await handleModalInteraction(interaction, context);
        if (!handled) await handleInteraction(interaction, context);
      }
    } catch (error) {
      console.error("[Interaction] Unhandled error:", error);
    }
  },
};
