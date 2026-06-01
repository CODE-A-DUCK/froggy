import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { validateVoiceState } from "../../utils/voiceGuard.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";

const __dirname = dirname(fileURLToPath(import.meta.url));
const soundsDir = join(__dirname, "../sounds");

const soundList = [
  "你是臭企鵝", "愛音唐哭", "愛音唐笑", "賽馬娘私人笑聲", "賽馬娘曼波",
  "賽馬娘噢耶", "67", "uhhhhhhh", "ciallo", "啊 前辈 ciallo",
  "get out", "ko", "nigga move", "oi oi oe oi a eye eye", "裝逼讓你飛起來",
  "蜘蛛人登場", "環太平洋", "巴巴博一", "你好", "fuck you",
  "nice兄弟", "小妹妹", "不知火舞-放馬過來", "不要上一起慫", "女聲撒嬌版操你媽",
  "關注塔菲喵", "好了雪豹閉嘴", "雜魚 雜魚", "江南style", "科比 man!",
  "科比 manba out", "鋼管落地", "金正恩演講", "私人笑聲", "復活吧我愛人", "餓啊",
];

export const soundboardCommand = {
  name: "soundboard",
  category: "<:game2line:1510524992155025478> | 娛樂",

  data: new SlashCommandBuilder()
    .setName("soundboard")
    .setDescription("打開我的音效面板，在語音頻道播放私人音效"),

  async execute(interaction, context) {
    await interaction.deferReply();

    const validation = await validateVoiceState(interaction, {
      requireBotInVC: false,
      requireSameVC: false,
      requireController: false,
    });
    if (!validation) return;

    const { userVoiceChannel } = validation;
    if (!userVoiceChannel) {
      return interaction.editReply("<:errorwarningline:1510529314515320944> | 你必須先加入一個語音頻道");
    }

    const embed = new EmbedBuilder()
      .setTitle("Froggy Soundboard")
      .setDescription("下方有兩個音效選單 + 一個控制項選單")
      .setColor(0x9ec27f)
      .setFooter({ text: `由 ${interaction.user.tag} 發起` });

    const selectMenu1 = new StringSelectMenuBuilder()
      .setCustomId("soundboard:select1")
      .setPlaceholder("音效選單 1（1~18）")
      .addOptions(
        soundList.slice(0, 18).map((sound) =>
          new StringSelectMenuOptionBuilder().setLabel(sound).setValue(sound),
        ),
      );

    const selectMenu2 = new StringSelectMenuBuilder()
      .setCustomId("soundboard:select2")
      .setPlaceholder("音效選單 2（19~36）")
      .addOptions(
        soundList.slice(18, 36).map((sound) =>
          new StringSelectMenuOptionBuilder().setLabel(sound).setValue(sound),
        ),
      );

    const controlMenu = new StringSelectMenuBuilder()
      .setCustomId("soundboard:control")
      .setPlaceholder("控制項")
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel("隨機播放").setValue("random"),
        new StringSelectMenuOptionBuilder().setLabel("離開語音頻道").setValue("leave"),
      ]);

    const row1 = new ActionRowBuilder().addComponents(selectMenu1);
    const row2 = new ActionRowBuilder().addComponents(selectMenu2);
    const row3 = new ActionRowBuilder().addComponents(controlMenu);

    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2, row3],
    });
  },

  async handleSelectMenu(interaction) {
    await interaction.deferUpdate();

    const customId = interaction.customId;
    const value = interaction.values[0];

    if (customId === "soundboard:control") {
      const embed = interaction.message.embeds[0];

      if (value === "random") {
        const randomSound = soundList[Math.floor(Math.random() * soundList.length)];
        await this.playSound(interaction, randomSound, embed);
      }

      else if (value === "leave") {
        const connection = getVoiceConnection(interaction.guild.id);
        if (connection) {
          connection.destroy();
          const newEmbed = EmbedBuilder.from(embed).setDescription("已離開語音頻道");
          await interaction.editReply({ embeds: [newEmbed], components: [] });
        }
      }
    } else {
      const soundName = interaction.values[0];
      await this.playSound(interaction, soundName);
    }
  },

  async playSound(interaction, soundName, currentEmbed = null) {
    const soundPath = join(soundsDir, `${soundName}.mp3`);

    try {
      let connection = getVoiceConnection(interaction.guild.id);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: interaction.member.voice.channel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });
      }

      const player = createAudioPlayer();
      const resource = createAudioResource(soundPath);
      connection.subscribe(player);
      player.play(resource);

      const embed = currentEmbed
        ? EmbedBuilder.from(currentEmbed)
        : new EmbedBuilder().setTitle("Froggy soundboard").setColor(0x9ec27f);

      embed.setDescription(`正在播放：**${soundName}**`);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Soundboard] Error:", error);
      await interaction.followUp({
        content: "<:errorwarningline:1510529314515320944> | 播放失敗",
        ephemeral: true,
      });
    }
  },
};