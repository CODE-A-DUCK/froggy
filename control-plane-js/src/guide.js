/**
 * @file guide.js
 * @description A living code template demonstrating the ESM and Bun standards used in this project.
 * Use this as a reference when creating new commands or modules.
 */

// 1. IMPORT STANDARDS
// - We use ESM 'import' syntax.
// - Use 'node:' prefix for built-in modules.
// - Always include '.js' extension for local imports.
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { join, dirname } from "node:fs"; // node: prefix preferred
import { fileURLToPath } from "node:url";
import { broker } from "./broker.js"; // Always use .js extension
import { validateVoiceState } from "./utilities/voiceGuard.js";

// 2. Path resolution
// In ESM, __dirname and __filename are not available. Use this pattern:
const __dirname = dirname(fileURLToPath(import.meta.url));

// 3. await at top level
// use 'await' at the top level without an async wrapper.
// const data = await someAsyncFunction();

/**
 * 4. Command structure template
 * Every command should export a single object.
 */
export const templateCommand = {
  name: "template", // Must match filename (excluding .js)

  // CATEGORY: Manual category names (supports Emojis)
  category: "🧪 | Template",

  // DATA: Slash Command Definition
  data: new SlashCommandBuilder()
    .setName("template")
    .setDescription("This is a guide template")
    .addStringOption((opt) =>
      opt.setName("input").setDescription("A sample input"),
    ),

  /**
   * EXECUTE: The main command logic.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {Object} context - Contains { client, config }
   */
  async execute(interaction, context) {
    // A. Always defer if the operation might take > 3 seconds
    await interaction.deferReply();

    // B. Voice Validation (Optional but standard for music)
    // Returns { guild, member, userVoiceChannel, botMember, botVoiceChannel, access }
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false, // Set to true if bot must already be in VC
      requireSameVC: true, // Set to true to ensure user is with the bot
      requireController: true, // Set to true to respect the "Controller Lock"
    });

    if (!validation) return; // validateVoiceState handles the error reply

    const { guild, userVoiceChannel } = validation;

    try {
      // C. Interacting with the Data Plane via Broker
      // For playing:
      // await broker.publishAudioTask(guild.id, userVoiceChannel.id, "URL", interaction.token, interaction.channelId, interaction.user.id);

      // For general commands (skip, stop, pause):
      // await broker.publishCommand(guild.id, "action_name", { optional_data: true });

      // D. UI Updates
      const embed = new EmbedBuilder()
        .setTitle("Guide Success")
        .setDescription(
          `You provided: ${interaction.options.getString("input") || "Nothing"}`,
        )
        .setColor(0x5865f2);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Command:Template] Error:", error);
      await interaction.editReply({ content: ":x: | An error occurred." });
    }
  },

  /**
   * AUTOCOMPLETE (Optional)
   * If a slash option has .setAutocomplete(true), define the handler here.
   */
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const choices = ["Option 1", "Option 2"];
    const filtered = choices.filter((choice) =>
      choice.startsWith(focusedValue),
    );
    await interaction.respond(
      filtered.map((choice) => ({ name: choice, value: choice })),
    );
  },
};

/**
 * 5. COMPONENT INTERACTION NAMING CONVENTION
 * When creating Buttons or Select Menus, use the pattern:
 * customId: "commandName:action:extraData"
 *
 * Example: "help:select_command" or "music:skip"
 * This allows handleInteraction to automatically route the event.
 */

/**
 * 6. EXPORTING
 * ------------
 * Always use named exports for commands so the loader can find them.
 * Also please put it in correct folder, such as `src/commands/fun/` for fun commands :D
 */
