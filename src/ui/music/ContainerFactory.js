import { formatDuration } from "../../utilities/formatDuration.js";

/**
 * 循環模式
 */
const LOOP_CONFIG = [
  { label: "關閉", emoji: "1510253183052677271" },
  { label: "重播一次", emoji: "1510222260647235604" },
  { label: "單曲循環", emoji: "1510222246285672588" },
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
      `### :notes: ${titleLink}`,
      `**發佈者**：${event.uploader ?? "未知"}`,
      `**時長**：${event.duration ? formatDuration(event.duration) : "LIVE"} | **循環**：${LOOP_CONFIG[event.loop_state]?.label ?? "關閉"}`,
      `**狀態**：${event.is_paused ? "暫停中" : "播放中"}`,
    ].join("\n");

    const components = [];

    // 歌曲資訊 (如果有縮圖就用 Section，其余直接用 TextDisplay)
    if (event.thumbnail) {
      components.push({
        type: 9,
        components: [{ type: 10, content: textContent }],
        accessory: {
          type: 11,
          media: { url: event.thumbnail },
        },
      });
    } else {
      components.push({
        type: 10,
        content: textContent,
      });
    }

    // 分隔線
    components.push({ type: 14 });

    // 按鈕 ActionRow
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          custom_id: event.is_paused
            ? "MusicButtonControlResume"
            : "MusicButtonControlPause",
          label: event.is_paused ? "| 繼續" : "| 暫停",
          style: 2,
          emoji: {
            id: event.is_paused ? "1510222252011163738" : "1510222247804014656",
          },
        },
        {
          type: 2,
          custom_id: "MusicButtonControlSkip",
          label: "| 跳過",
          style: 2,
          emoji: { id: "1510222269220126860" },
        },
        {
          type: 2,
          custom_id: "MusicButtonControlLoop",
          label: `| ${LOOP_CONFIG[event.loop_state]?.label ?? "關閉"}`,
          style: 2,
          emoji: {
            id: LOOP_CONFIG[event.loop_state]?.emoji ?? LOOP_CONFIG[0].emoji,
          },
        },
        {
          type: 2,
          custom_id: "MusicButtonControlDetails",
          label: "| 詳情",
          style: 2,
          emoji: { id: "1510253156771168337" },
        },
      ],
    });

    // Footer
    if (requester) {
      const timestamp = Math.floor(Date.now() / 1000);
      components.push({
        type: 10,
        content: `-# 由 ${requester.tag} 指定 • <t:${timestamp}:R>`,
      });
    }

    return { type: 17, components };
  }

  static buildSimpleMessage(title, description, requester = null) {
    const components = [
      {
        type: 10,
        content: `### ${title}\n${description}`,
      },
    ];

    if (requester) {
      components.push({ type: 14, spacing: 1 });
      const timestamp = Math.floor(Date.now() / 1000);
      components.push({
        type: 10,
        content: `-# 由 ${requester.tag} 指定 • <t:${timestamp}:R>`,
      });
    }

    return { type: 17, components };
  }
}
