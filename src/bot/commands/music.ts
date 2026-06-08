import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { EMOJIS } from "../../shared/emojis.js";
import { ContainerFactory } from "../../player/ui/container-factory.js";

import { executePlay } from "./music/play.js";
import { executeSearch, handleSearchSelectMenu } from "./music/search.js";
import { executeQueue } from "./music/queue.js";
import { executeSkip } from "./music/skip.js";
import { executeStop } from "./music/stop.js";
import { executeJoin } from "./music/join.js";
import { executeLeave } from "./music/leave.js";
import { executeController } from "./music/controller.js";
import { executeLibraryList, executeLibraryAdd, executeLibraryPlay, executeLibraryRemove } from "./music/library.js";

export const musicCommand = {
  name: "music",
  category: `${EMOJIS.music2line} | 音樂`,
  defer: false,
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("音樂播放與資料庫指令")
    .addSubcommand(sub =>
      sub.setName("play")
        .setDescription("透過 YouTube 連結直接播放歌曲")
        .addStringOption(o => o.setName("鏈接").setDescription("YouTube 影片或播放清單連結").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("search")
        .setDescription("搜尋歌曲，從結果中選擇後播放")
        .addStringOption(o => o.setName("內容").setDescription("歌曲名稱或關鍵字").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("queue").setDescription("查看當前播放隊列，移除歌曲"))
    .addSubcommand(sub => sub.setName("skip").setDescription("跳過當前播放的歌曲"))
    .addSubcommand(sub => sub.setName("stop").setDescription("停止播放並清空隊列"))
    .addSubcommand(sub => sub.setName("join").setDescription("呼叫機器人加入你所在的語音頻道"))
    .addSubcommand(sub => sub.setName("leave").setDescription("強制中斷並讓機器人離開語音頻道"))
    .addSubcommand(sub => sub.setName("controller").setDescription("把遙控器找回來"))
    .addSubcommandGroup(group => group
      .setName("library")
      .setDescription("你的專屬音樂庫")
      .addSubcommand(sub =>
        sub.setName("add")
          .setDescription("將目前播放的歌曲或指定網址加入音樂庫")
          .addStringOption(o => o.setName("url").setDescription("歌曲網址 (留空則加入目前播放的歌)").setRequired(false))
      )
      .addSubcommand(sub =>
        sub.setName("list")
          .setDescription("查看你的音樂庫")
      )
      .addSubcommand(sub =>
        sub.setName("play")
          .setDescription("從音樂庫播放指定編號的歌曲 (留空則播放整個音樂庫)")
          .addIntegerOption(o => o.setName("index").setDescription("歌曲編號").setRequired(false))
      )
      .addSubcommand(sub =>
        sub.setName("remove")
          .setDescription("從音樂庫中移除指定編號的歌曲")
          .addIntegerOption(o => o.setName("index").setDescription("歌曲編號").setRequired(true))
      )
    ),

  async execute(interaction: ChatInputCommandInteraction, context: any) {
    const group = interaction.options.getSubcommandGroup(false);
    const command = interaction.options.getSubcommand(false);

    try {
      if (group === "library") {
        if (command === "add") await executeLibraryAdd(interaction, context);
        else if (command === "list") await executeLibraryList(interaction, context);
        else if (command === "play") await executeLibraryPlay(interaction, context);
        else if (command === "remove") await executeLibraryRemove(interaction, context);
      } else {
        if (command === "play") {
          await interaction.deferReply();
          await executePlay(interaction, context);
        } else if (command === "search") {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
          await executeSearch(interaction, context);
        } else if (command === "queue") {
          await interaction.deferReply();
          await executeQueue(interaction, context);
        } else if (command === "skip") {
          await interaction.deferReply();
          await executeSkip(interaction, context);
        } else if (command === "stop") {
          await interaction.deferReply();
          await executeStop(interaction, context);
        } else if (command === "join") {
          await interaction.deferReply();
          await executeJoin(interaction, context);
        } else if (command === "leave") {
          await interaction.deferReply();
          await executeLeave(interaction, context);
        } else if (command === "controller") {
          await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
          await executeController(interaction, context);
        }
      }
    } catch (err: any) {
      console.error(`[Music Command Error] ${group ? group + " " : ""}${command}:`, err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          components: [ContainerFactory.buildReply("error", `${EMOJIS.errorwarningline} | 發生未知的錯誤。`, interaction.user as any).toJSON() as any],
          flags: [MessageFlags.IsComponentsV2 as any]
        }).catch(() => null);
      } else {
        await interaction.reply({
          components: [ContainerFactory.buildReply("error", `${EMOJIS.errorwarningline} | 發生未知的錯誤。`, interaction.user as any).toJSON() as any],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2 as any]
        }).catch(() => null);
      }
    }
  },

  handleSelectMenu: async (interaction: any, context: any) => {
    if (interaction.customId.startsWith("search:select:")) {
      await handleSearchSelectMenu(interaction, context);
    }
  }
};
