import { SlashCommandBuilder } from "discord.js";
import { broker } from "../../broker.js";
import { validateVoiceState } from "../../utilities/voiceGuard.js";

export const playCommand = {
  name: "play",
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("讓我來爲你播放歌曲")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("歌曲 URL 或名稱")
        .setRequired(true),
    ),
  async execute(interaction) {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
    });
    if (!validation) return;

    const { guild, userVoiceChannel, access } = validation;

    const botMember = await guild.members.fetch(interaction.client.user.id);
    if (!botMember.voice.channel) {
      await broker.clearControllerOwner(guild.id);
      return interaction.editReply({
        content: ":x: | 我目前不在語音頻道中，請先使用 `/join` 指令！",
      });
    }

    const controllerUserId = access.ownerId ?? interaction.user.id;
    let claimedController = false;

    try {
      if (!access.ownerId) {
        claimedController = await broker.claimControllerOwner(
          guild.id,
          interaction.user.id,
        );

        if (!claimedController) {
          await interaction.editReply({
            content: ":lock: | 遙控器已被其他使用者拿掉了，請稍後再操作！",
          });
          return;
        }
      }

      await broker.publishAudioTask(
        guild.id,
        userVoiceChannel.id,
        query,
        interaction.token,
        interaction.channelId,
        controllerUserId,
      );

      await interaction.editReply({
        content: `:outbox_tray: | 收到！正在爲你處理：\`${query}\``,
      });
    } catch (error) {
      if (claimedController) {
        await broker.clearControllerOwner(guild.id);
      }
      console.error("[Command] Play sending error:", error);
      await interaction.editReply({
        content: `:x: | 發生錯誤：${error.message}`,
      });
    }
  },
};
