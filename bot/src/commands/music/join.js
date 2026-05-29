import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const joinCommand = {
  name: "join",
  category: ":notes: | 音乐",
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("讓 Froggy 加入你的語音頻道"),
  async execute(interaction) {
    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

    await interaction.deferReply();

    const { guild, userVoiceChannel } = validation;

    try {
      const hasActiveSession = !!(await broker.getCurrentTrack(guild.id));

      if (hasActiveSession) {
        // ── Step 1: Disconnect old VoiceConnection FIRST ──────────────────────
        // Publishing disconnect_vc before op:4 is critical.
        //
        // Without this, the race condition is:
        //   op:4 sent → Discord fires VOICE_STATE + VOICE_SERVER into the stream
        //   → old VoiceConnection's adapter receives them, starts IP discovery
        //   → rejoin task arrives, destroys old connection mid-discovery
        //   → "Cannot perform IP discovery - socket closed" error
        //
        // With this ordering:
        //   disconnect_vc processed → old adapter listeners removed
        //   → op:4 sent → voice events arrive but no adapter is listening
        //   → events are cached in Redis by the bot
        //   → rejoin processed → new connection's adapter replays from Redis cache ✓
        await broker.publishCommand(guild.id, "disconnect_vc", {});
      }

      // ── Step 2: Tell Discord gateway to join the new voice channel ────────
      guild.shard.send({
        op: 4,
        d: {
          guild_id: guild.id,
          channel_id: userVoiceChannel.id,
          self_mute: false,
          self_deaf: false,
        },
      });

      if (hasActiveSession) {
        // ── Step 3: Tell player to reconnect with new voice credentials ───────
        // By the time the player processes this, the voice events from op:4
        // are already cached in Redis. replayCachedVoiceHandshake will pick them up.
        await broker.publishCommand(guild.id, "rejoin", {
          channel_id: userVoiceChannel.id,
          text_channel_id: interaction.channelId,
        });
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `:white_check_mark: | 我已加入語音頻道：\`${userVoiceChannel.name}\``,
            )
            .setColor(0x5865f2),
        ],
      });
    } catch (error) {
      console.error("[Command] Join error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(":x: | 執行時發生錯誤，請稍後再試。")
            .setColor(0xed4245),
        ],
      });
    }
  },
};
