import {
  ModalBuilder,
  LabelBuilder,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputStyle,
  TextInputBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
} from "discord.js";
import { formatDuration } from "../../utils/formatDuration.js";

const LOOP_CONFIG = [
  { label: "關閉", emoji: "1510533896960479266" },
  { label: "重播一次", emoji: "1510533898872946809" },
  { label: "單曲循環", emoji: "1510533874059444326" },
];

export class ContainerFactory {
  /**
   * 正在播放的 Container
   */
  static buildNowPlaying(event, requester, client) {
    const titleLink = event.source_url
      ? `[${event.title ?? "未知標題"}](${event.source_url})`
      : (event.title ?? "未知標題");

    const textContent = [
      `### <:music2line:1510533879390277732> 正在播放：${titleLink}`,
      `**發佈者**：${event.uploader ?? "未知"}`,
      `**時長**：${event.duration ? formatDuration(event.duration) : "LIVE"}`,
      `**狀態**：${event.is_paused ? "暫停中" : "播放中"}`,
      `**循環**：${LOOP_CONFIG[event.loop_state]?.label ?? "關閉"}`,
    ].join("\n");

    const container = new ContainerBuilder();

    // 歌曲資訊
    if (event.thumbnail) {
      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(textContent),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(event.thumbnail));
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(textContent),
      );
    }

    // 分隔線
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1));

    // 按鈕 ActionRow
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          event.is_paused
            ? "MusicButtonControlResume"
            : "MusicButtonControlPause",
        )
        .setLabel(event.is_paused ? "| 繼續" : "| 暫停")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({
          id: event.is_paused ? "1510533886839488594" : "1510533885270691870",
        }),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlSkip")
        .setLabel("| 跳過")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: "1510533902119473232" }),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoop")
        .setLabel(`| ${LOOP_CONFIG[event.loop_state]?.label ?? "關閉"}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({
          id: LOOP_CONFIG[event.loop_state]?.emoji ?? LOOP_CONFIG[0].emoji,
        }),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlDetails")
        .setLabel("| 詳情")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: "1510539692716855326" }),
    );

    container.addActionRowComponents(actionRow);

    // Footer（脚？
    if (requester) {
      const timestamp = Math.floor(Date.now() / 1000);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 由 ${requester.tag} 指定 • <t:${timestamp}:R>`,
        ),
      );
    }

    return container;
  }

  static buildRemoveQueueModal(queue) {
    const options = queue.slice(0, 10).map((track, index) =>
      new CheckboxGroupOptionBuilder()
        .setLabel(track.title.slice(0, 100))
        .setValue(index.toString())
        .setDescription((track.uploader ?? "未知發佈者").slice(0, 100)),
    );

    const checkboxGroup = new CheckboxGroupBuilder()
      .setCustomId("MusicQueueRemoveCheckboxes")
      .addOptions(...options)
      .setMinValues(1)
      .setMaxValues(options.length)
      .setRequired(true);

    const queueLabel = new LabelBuilder()
      .setLabel("隊列內的歌曲")
      .setDescription("請點選要從隊列中移除的歌曲，最多顯示前 10 首")
      .setCheckboxGroupComponent(checkboxGroup);

    const modal = new ModalBuilder()
      .setTitle("移除歌曲")
      .setCustomId("MusicQueueRemoveModal")
      .addLabelComponents(queueLabel);

    return modal;
  }

  static buildSearchModal(results) {
    const options = results.slice(0, 10).map((track, index) =>
      new CheckboxGroupOptionBuilder()
        .setLabel(`${index + 1}. ${track.title}`.slice(0, 100))
        .setValue(track.url.slice(0, 100))
        .setDescription(
          `${track.duration ? formatDuration(track.duration) : "LIVE"} · ${track.uploader ?? "未知發佈者"}`.slice(
            0,
            100,
          ),
        ),
    );

    const checkboxGroup = new CheckboxGroupBuilder()
      .setCustomId("MusicSearchCheckboxes")
      .addOptions(...options)
      .setMinValues(1)
      .setMaxValues(options.length)
      .setRequired(true);

    const searchLabel = new LabelBuilder()
      .setLabel("搜尋結果")
      .setDescription("請選擇要加入隊列的歌曲")
      .setCheckboxGroupComponent(checkboxGroup);

    const modal = new ModalBuilder()
      .setTitle("搜尋結果")
      .setCustomId("MusicSearchModal")
      .addLabelComponents(searchLabel);

    return modal;
  }

  static buildPlayModal() {
    const textInput = new TextInputBuilder()
      .setCustomId("MusicPlayUrlInput")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("請貼上 YouTube 連結...")
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(200);

    const label = new LabelBuilder()
      .setLabel("輸入播放網址")
      .setDescription("輸入你要播放的 YouTube 歌曲或清單連結")
      .setTextInputComponent(textInput);

    const modal = new ModalBuilder()
      .setTitle("播放音樂")
      .setCustomId("MusicPlayModal")
      .addLabelComponents(label);

    return modal;
  }

  /**
   * 指令回覆用的 Container（取代單次回覆的 EmbedBuilder）
   * @param {"success"|"error"|"info"|"warning"} type
   * @param {string} description  custom emoji + markdown
   * @param {import("discord.js").User} [user]  顯示於 footer
   */
  static buildReply(type, description, user = null) {
    const headers = {
      success: "<:LingLong:1510515456321261699> 音樂中心",
      error: "<:LingLong:1510515456321261699> 音樂中心",
      info: "<:LingLong:1510515456321261699> 音樂中心",
      warning: "<:LingLong:1510515456321261699> 音樂中心",
    };

    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${headers[type] ?? "<:LingLong:1510515456321261699> 音樂中心"}\n${description}`,
      ),
    );

    if (user) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1));
      const timestamp = Math.floor(Date.now() / 1000);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 由 ${user.tag} 指定 • <t:${timestamp}:R>`,
        ),
      );
    }

    return container;
  }

  static buildSimpleMessage(title, description, requester = null) {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`),
    );

    if (requester) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1));
      const timestamp = Math.floor(Date.now() / 1000);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 由 ${requester.tag} 指定 • <t:${timestamp}:R>`,
        ),
      );
    }

    return container;
  }
}
