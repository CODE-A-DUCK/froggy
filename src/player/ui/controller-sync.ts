import { MessageFlags, ButtonInteraction } from "discord.js";

const LOOP_SEQUENCE = {
  關閉: "重播一次",
  重播一次: "單曲循環",
  單曲循環: "關閉",
} as const;

const LOOP_EMOJIS = {
  關閉: "1510533896960479266",
  重播一次: "1510533898872946809",
  單曲循環: "1510533874059444326",
} as const;

export function shouldOptimisticallyUpdate(action: string): boolean {
  return action === "pause" || action === "resume" || action === "loop";
}

export async function optimisticallyUpdateController(interaction: ButtonInteraction, action: string): Promise<void> {
  const components = interaction.message?.components?.map((c) => c.toJSON());
  if (!components?.length) return;
  await interaction.message
    .edit({
      components: applyOptimisticState(components, action),
      flags: MessageFlags.IsComponentsV2 as any,
    })
    .catch(() => null);
}

function applyOptimisticState(components: any[], action: string): any[] {
  const visit = (c: any): any => {
    if (!c || typeof c !== "object") return c;
    if (Array.isArray(c.components)) c.components = c.components.map(visit);
    if (typeof c.content === "string")
      c.content = updateContent(c.content, action);
    const id = c.custom_id;
    if (id === "MusicButtonControlPause" && action === "pause")
      Object.assign(c, {
        custom_id: "MusicButtonControlResume",
        label: "| 繼續",
        style: 2,
        emoji: { id: "1510533886839488594" },
      });
    else if (id === "MusicButtonControlResume" && action === "resume")
      Object.assign(c, {
        custom_id: "MusicButtonControlPause",
        label: "| 暫停",
        style: 2,
        emoji: { id: "1510533885270691870" },
      });
    else if (id === "MusicButtonControlLoop" && action === "loop") {
      const current = `${c.label}`.replace("| ", "").trim() as keyof typeof LOOP_SEQUENCE;
      const nextLoop = LOOP_SEQUENCE[current] ?? "關閉";
      c.label = `| ${nextLoop}`;
      c.emoji = { id: LOOP_EMOJIS[nextLoop] };
    }
    return c;
  };
  return components.map(visit);
}

function updateContent(content: string, action: string): string {
  if (action === "pause")
    return content.replace("**狀態**：播放中", "**狀態**：暫停中");
  if (action === "resume")
    return content.replace("**狀態**：暫停中", "**狀態**：播放中");
  if (action === "loop")
    return content.replace(/\*\*循環\*\*：[^\n]+/, (m) => {
      const current = m.split("：").pop()?.trim() as keyof typeof LOOP_SEQUENCE;
      const nextLoop = LOOP_SEQUENCE[current] ?? "關閉";
      return `**循環**：${nextLoop}`;
    });
  return content;
}
