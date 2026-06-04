import {
  ModalBuilder,
  LabelBuilder,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
} from "discord.js";

import { EMOJIS } from "../../shared/emojis.js";
import { formatDuration } from "../utils/format-duration.js";

const LOOP_CONFIG = [
  { label: "關閉", emoji: "1510533896960479266" },
  { label: "重播一次", emoji: "1510533898872946809" },
  { label: "單曲循環", emoji: "1510533874059444326" },
];

export class ContainerFactory {
  /**
   * 正在播放的 Container
   */
  static buildNowPlaying(event, requester) {
    const titleLink = event.source_url
      ? `[${event.title ?? "未知標題"}](${event.source_url})`
      : (event.title ?? "未知標題");

    const textContent = [
      `### ${EMOJIS.music2line} 正在播放：${titleLink}`,
      // 可能是 Discord 的渲染處理的問題，所以當有
      // 膚色修飾符的 emoji（如 🧔🏿 = 🧔 + 🏿 兩個 Unicode 碼位組合）放在 [文字](url) 的文字部分裡，
      // Discord 的 Markdown parser 會在那個組合 emoji 的地方斷掉，導致整個連結語法解析失敗。
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
    const timestamp = Math.floor(Date.now() / 1000);
    const requesterName = requester ? (requester.tag || requester.username) : "";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 由 ${requesterName} 指定 • <t:${timestamp}:R>`,
      ),
    );

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

  static buildSearchSelection(results, user) {
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
      .setCustomId("search:select")
      .addOptions(...options)
      .setMinValues(1)
      .setMaxValues(options.length)
      .setRequired(true);

    const timestamp = Math.floor(Date.now() / 1000);
    const requesterName = user ? (user.tag || user.username || "未知") : "系統";

    const container = new ContainerBuilder({
      components: [
        new TextDisplayBuilder().setContent(`### ${EMOJIS.searchline} 搜尋結果\n請選擇要加入隊列的歌曲（可多選）`),
        checkboxGroup,
        new SeparatorBuilder().setSpacing(1),
        new TextDisplayBuilder().setContent(`-# 由 ${requesterName} 指定 • <t:${timestamp}:R>`)
      ]
    });

    return container;
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

  static buildReply(type, description, user = null) {
    const headers = {
      success: `${EMOJIS.LingLong} 音樂中心`,
      error: `${EMOJIS.LingLong} 音樂中心`,
      info: `${EMOJIS.LingLong} 音樂中心`,
      warning: `${EMOJIS.LingLong} 音樂中心`,
    };

    return this.buildSimpleMessage(
      headers[type] ?? `${EMOJIS.LingLong} 音樂中心`,
      description,
      user
    );
  }

  static buildSimpleMessage(title, description, requester = null) {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`),
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1));
    const timestamp = Math.floor(Date.now() / 1000);
    const requesterName = requester ? (requester.tag || requester.username || "未知") : "系統";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 由 ${requesterName} 指定 • <t:${timestamp}:R>`,
      ),
    );

    return container;
  }
}
