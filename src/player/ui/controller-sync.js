import { MessageFlags } from "discord.js";

import { EMOJIS } from "../../shared/emojis.js";

const LOOP_SEQUENCE = {
  關閉: "重播一次",
  重播一次: "單曲循環",
  單曲循環: "關閉",
};

export function shouldOptimisticallyUpdate(action) {
  return action === "pause" || action === "resume" || action === "loop";
}

export async function optimisticallyUpdateController(interaction, action) {
  const components = interaction.message?.components?.map((c) => c.toJSON());
  if (!components?.length) return;
  await interaction.message
    .edit({
      components: applyOptimisticState(components, action),
      flags: MessageFlags.IsComponentsV2,
    })
    .catch(() => null);
}

function applyOptimisticState(components, action) {
  const visit = (c) => {
    if (!c || typeof c !== "object") return c;
    if (Array.isArray(c.components)) c.components = c.components.map(visit);
    if (typeof c.content === "string")
      c.content = updateContent(c.content, action);
    const id = c.custom_id;
    if (id === "MusicButtonControlPause" && action === "pause")
      Object.assign(c, {
        custom_id: "MusicButtonControlResume",
        label: "繼續",
        style: 3,
      });
    else if (id === "MusicButtonControlResume" && action === "resume")
      Object.assign(c, {
        custom_id: "MusicButtonControlPause",
        label: "暫停",
        style: 1,
      });
    else if (id === "MusicButtonControlLoop" && action === "loop") {
      const current = `${c.label}`.split("：").pop()?.trim();
      c.label = `循環：${LOOP_SEQUENCE[current] ?? "關閉"}`;
    }
    return c;
  };
  return components.map(visit);
}

function updateContent(content, action) {
  if (action === "pause")
    return content
      .replace(
        `### ${EMOJIS.music2line} 正在播放：`,
        `### ${EMOJIS.pausecircleline} 目前暫停：`,
      )
      .replace("**狀態**：播放中", "**狀態**：暫停");
  if (action === "resume")
    return content
      .replace(
        `### ${EMOJIS.pausecircleline} 目前暫停：`,
        `### ${EMOJIS.music2line} 正在播放：`,
      )
      .replace("**狀態**：暫停", "**狀態**：播放中");
  if (action === "loop")
    return content.replace(/\*\*循環\*\*：[^・\n]+/, (m) => {
      const current = m.split("：").pop()?.trim();
      return `**循環**：${LOOP_SEQUENCE[current] ?? "關閉"}`;
    });
  return content;
}
