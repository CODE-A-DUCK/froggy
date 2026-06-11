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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

import { EMOJIS } from "../../shared/emojis.js";
import { TrackEvent } from "../../shared/types.js";
import { formatDuration } from "../utils/format-duration.js";

// 固定值

const LOOP_CONFIG = [
  { label: "關閉", emoji: "1510533896960479266" },
  { label: "循環一次", emoji: "1510533898872946809" },
  { label: "單曲循環", emoji: "1510533874059444326" },
] as const;

const MUSIC_CENTER_TITLE = `${EMOJIS.LingLong} 音樂中心`;

// 介面

interface Requester {
  tag?: string;
  username?: string;
}

interface TrackInfo {
  title?: string;
  author?: string;
  uploader?: string;
}

interface RemovableTrack {
  track: { info?: TrackInfo } & TrackInfo;
  index: number;
}

interface SearchTrackInfo {
  title?: string;
  length?: number;
  duration?: number;
  author?: string;
  uploader?: string;
  uri?: string;
  identifier?: string;
  url?: string;
}

interface SearchTrack {
  info?: SearchTrackInfo;
  [key: string]: unknown;
}

// 渲染

export class ContainerFactory {

  // Private helpers

  private static buildFooterText(requester?: Requester | null): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const name = requester?.tag ?? requester?.username;
    return name
      ? `-# 由 ${name} 指定 • <t:${timestamp}:R>`
      : `-# <t:${timestamp}:R>`;
  }

  private static appendFooter(
    container: ContainerBuilder,
    requester?: Requester | null,
  ): ContainerBuilder {
    return container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(this.buildFooterText(requester)),
      );
  }

  private static buildProgressBar(position: number, duration: number): string {
    const filled = Math.round(Math.min(Math.max(position / duration, 0), 1) * 10);
    const bar =
      "<:prog0:1513487953039458544>".repeat(filled) +
      "<:prog1:1513495241217282228>".repeat(10 - filled);
    return `[ ${bar} ] \`${formatDuration(position)} / ${formatDuration(duration)}\``;
  }

  // Public builders

  static buildNowPlaying(
    event: TrackEvent,
    requester?: Requester | null,
    _isSaved = false,
  ): ContainerBuilder {
    const loop = LOOP_CONFIG[event.loop_state ?? 0] ?? LOOP_CONFIG[0];
    const durationText = event.duration ? formatDuration(event.duration) : "LIVE";
    const progressStr =
      event.duration && event.duration > 0
        ? this.buildProgressBar(event.position ?? 0, event.duration)
        : durationText;

    const lines = [
      `### ${event.title ?? "未知標題"}`,
      `**${EMOJIS.userline} | 發佈者**：${event.uploader ?? "未知"}`,
      event.upload_date && `**${EMOJIS.calendarline} | 發佈日期**：${event.upload_date}`,
      event.views && `**${EMOJIS.eyeline} | 觀看次數**：${event.views}`,
      event.likes && `**${EMOJIS.thumbupline} | 喜歡次數**：${event.likes}`,
      `**${EMOJIS.informationline} | 狀態**：${event.is_paused ? "暫停中" : "播放中"}`,
      `**${EMOJIS.refreshline} | 循環**：${loop.label}`,
      `**${EMOJIS.timeline} | 時長**：${progressStr}`,
    ].filter(Boolean).join("\n");

    const textDisplay = new TextDisplayBuilder().setContent(lines);
    const container = new ContainerBuilder();

    if (event.thumbnail) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(textDisplay)
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(event.thumbnail)),
      );
    } else {
      container.addTextDisplayComponents(textDisplay);
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1));

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(event.is_paused ? "MusicButtonControlResume" : "MusicButtonControlPause")
        .setLabel(event.is_paused ? "| 繼續" : "| 暫停")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: event.is_paused ? "1510533886839488594" : "1510533885270691870" }),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlSkip")
        .setLabel("| 跳過")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: "1510533902119473232" }),
      new ButtonBuilder()
        .setCustomId("MusicButtonControlLoop")
        .setLabel(`| ${loop.label}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: loop.emoji }),
    );

    if (event.source_url) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setLabel("| 連結")
          .setStyle(ButtonStyle.Link)
          .setURL(event.source_url)
          .setEmoji({ id: "1511693322605826178" }),
        new ButtonBuilder()
          .setCustomId("MusicButtonLibraryToggle")
          .setLabel("| 收藏 / 移除")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji({ id: "1513539417846055022" }),
      );
    }

    container
      .addActionRowComponents(actionRow)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(this.buildFooterText(requester)),
      );

    return container;
  }

  static buildRemoveQueueModal(removableTracks: RemovableTrack[]): ModalBuilder {
    const options = removableTracks.slice(0, 10).map(({ track, index }) => {
      const info = track.info ?? track;
      return new CheckboxGroupOptionBuilder()
        .setLabel((info.title ?? "").slice(0, 100))
        .setValue(index.toString())
        .setDescription((info.author ?? info.uploader ?? "未知發佈者").slice(0, 100));
    });

    return new ModalBuilder()
      .setTitle("移除歌曲")
      .setCustomId("MusicQueueRemoveModal")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("隊列內的歌曲")
          .setDescription("請點選要從隊列中移除的歌曲，最多顯示前 10 首")
          .setCheckboxGroupComponent(
            new CheckboxGroupBuilder()
              .setCustomId("MusicQueueRemoveCheckboxes")
              .addOptions(...options)
              .setMinValues(1)
              .setMaxValues(options.length)
              .setRequired(true),
          ),
      );
  }

  static buildSearchSelectMenu(results: SearchTrack[], searchId: string): ContainerBuilder {
    const options = results.slice(0, 10).map((track, index) => {
      const info: SearchTrackInfo = track?.info ?? (track as SearchTrackInfo) ?? {};
      const duration = info.length
        ? formatDuration(Math.floor(info.length / 1000))
        : info.duration ? formatDuration(info.duration) : "LIVE";

      return new StringSelectMenuOptionBuilder()
        .setLabel(`${index + 1}. ${info.title ?? "未知歌曲"}`.slice(0, 100))
        .setValue((info.uri ?? info.identifier ?? info.url ?? "unknown").slice(0, 100))
        .setDescription(
          `${duration} · ${info.author ?? info.uploader ?? "未知發佈者"}`.slice(0, 100),
        );
    });

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${EMOJIS.search2line} 搜尋結果\n請從下方選單選擇要加入隊列的歌曲：`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`search:select:${searchId}`)
            .setPlaceholder("請點此選擇要加入隊列的歌曲 (可多選)")
            .addOptions(...options)
            .setMinValues(1)
            .setMaxValues(options.length),
        ),
      );
  }

  static buildLibraryPage(
    title: string,
    chunks: string[],
    page: number,
    requester?: Requester | null,
  ): ContainerBuilder {
    const description = chunks[page] ?? "沒有內容。";
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`)
    );
    
    if (chunks.length > 1) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`MusicLibraryPage_${page - 1}`)
          .setLabel("上一頁")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("MusicLibraryPage_Current")
          .setLabel(`第 ${page + 1} / ${chunks.length} 頁`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`MusicLibraryPage_${page + 1}`)
          .setLabel("下一頁")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === chunks.length - 1)
      );
      container.addActionRowComponents(row);
    }
    
    return this.appendFooter(container, requester);
  }

  static buildReply(
    _type: string,
    description: string,
    user?: Requester | null,
    title?: string
  ): ContainerBuilder {
    const content = title ? `### ${title}\n${description}` : description;
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    );
    return this.appendFooter(container, user);
  }

  static buildSimpleMessage(
    title: string,
    description: string,
    requester?: Requester | null,
  ): ContainerBuilder {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`),
    );
    return this.appendFooter(container, requester);
  }
}