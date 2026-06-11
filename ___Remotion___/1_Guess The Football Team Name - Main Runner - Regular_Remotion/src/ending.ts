import type { DemoProps } from "./schema";

export type EndingKey = "think-you-know" | "how-many";

/** Display label used by Outro title lines (matches schema ENDINGS, minus Random). */
export type EndingLabel = "Think you know the answer?" | "How many did you get?";

const ENDING_KEYS: EndingKey[] = ["think-you-know", "how-many"];

/** Resolve the ending voice + on-screen copy (mirrors Regular runner getSelectedEndingType). */
export function resolveEndingKey(
  ending: DemoProps["ending"],
  seed = "",
): EndingKey {
  if (ending === "How many did you get?") return "how-many";
  if (ending === "Think you know the answer?") return "think-you-know";
  // Random — one deterministic pick per save so preview/render stay in sync.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ENDING_KEYS[(h >>> 0) % ENDING_KEYS.length];
}

export function endingLabelForKey(key: EndingKey): EndingLabel {
  return key === "how-many" ? "How many did you get?" : "Think you know the answer?";
}
