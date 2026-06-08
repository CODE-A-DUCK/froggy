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
import { formatDuration } from "../utils/format-duration.js";

const LOOP_CONFIG = [
  { label: "關閉", emoji: "1510533896960479266" },
  { label: "循環一次", emoji: "1510533898872946809" },
  { label: "單曲循環", emoji: "1510533874059444326" },
];

export class ContainerFactory {
  /**
   * 正在播放的 Container
   */
  static buildNowPlaying(event: any, requester: any): ContainerBuilder {
    const titleText = event.title ?? "未知標題";

    const durationText = event.duration ? formatDuration(event.duration) : "LIVE";
    let progressStr = durationText;
    if (event.duration > 0) {
      const p = Math.round(Math.min(Math.max((event.position || 0) / event.duration, 0), 1) * 10);
      progressStr = `[ ${"<:prog0:1513487953039458544>".repeat(p)}${"<:prog1:1513495241217282228>".repeat(10 - p)} ] \`${formatDuration(event.position || 0)} / ${durationText}\``;
    }

    const textContent = [
      `### ${titleText}`,
      `**${EMOJIS.userline} | 發佈者**：${event.uploader ?? "未知"}`,
      ...(event.upload_date ? [`**${EMOJIS.calendarline} | 發佈日期**：${event.upload_date}`] : []),
      ...(event.views ? [`**${EMOJIS.eyeline} | 觀看次數**：${event.views}`] : []),
      ...(event.likes ? [`**${EMOJIS.thumbupline} | 喜歡次數**：${event.likes}`] : []),
      `**${EMOJIS.informationline} | 狀態**：${event.is_paused ? "暫停中" : "播放中"}`,
      `**${EMOJIS.refreshline} | 循環**：${LOOP_CONFIG[event.loop_state]?.label ?? "關閉"}`,
      `**${EMOJIS.timeline} | 時長**：${progressStr}`
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
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
    );

    if (event.source_url) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setLabel("| 連結")
          .setStyle(ButtonStyle.Link)
          .setURL(event.source_url)
          .setEmoji({ id: "1511693322605826178" })
      );
    }

    container.addActionRowComponents(actionRow);

    // Footer
    const timestamp = Math.floor(Date.now() / 1000);
    const requesterName = requester?.tag || requester?.username || "";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        requesterName ? `-# 由 ${requesterName} 指定 • <t:${timestamp}:R>` : `-# <t:${timestamp}:R>`
      ),
    );

    return container;
  }

  static buildRemoveQueueModal(removableTracks: { track: any, index: number }[]): ModalBuilder {
    const options = removableTracks.slice(0, 10).map(({ track, index }) => {
      const info = track.info || track;
      return new CheckboxGroupOptionBuilder()
        .setLabel(info.title.slice(0, 100))
        .setValue(index.toString())
        .setDescription((info.author ?? info.uploader ?? "未知發佈者").slice(0, 100));
    });

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

  static buildSearchSelectMenu(results: any[], searchId: string): ContainerBuilder {
    const options = results.slice(0, 10).map((track, index) => {
      const info = track?.info || track || {};
      const durationStr = info.length ? formatDuration(Math.floor(info.length / 1000)) : (info.duration ? formatDuration(info.duration) : "LIVE");
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${index + 1}. ${info.title || "未知歌曲"}`.slice(0, 100))
        .setValue((info.uri || info.identifier || info.url || "unknown").slice(0, 100))
        .setDescription(
          `${durationStr} · ${info.author ?? info.uploader ?? "未知發佈者"}`.slice(
            0,
            100,
          ),
        );
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`search:select:${searchId}`)
      .setPlaceholder("請點此選擇要加入隊列的歌曲 (可多選)")
      .addOptions(...options)
      .setMinValues(1)
      .setMaxValues(options.length);

    const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${EMOJIS.search2line} 搜尋結果\n請從下方選單選擇要加入隊列的歌曲：`)
      )
      .addActionRowComponents(actionRow);

    return container;
  }

  static buildReply(type: string, description: string, user: any = null): ContainerBuilder {
    const headers: Record<string, string> = {
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

  static buildSimpleMessage(title: string, description: string, requester: any = null): ContainerBuilder {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n${description}`),
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1));
    const timestamp = Math.floor(Date.now() / 1000);
    const requesterName = requester?.tag || requester?.username || "";

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        requesterName ? `-# 由 ${requesterName} 指定 • <t:${timestamp}:R>` : `-# <t:${timestamp}:R>`
      ),
    );

    return container;
  }

}
