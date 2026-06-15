// Shared ending/break copy. The outro ALWAYS uses "how-many"; "think-you-know" is
// the MID-QUIZ BREAK (after 50% of the levels) — there is no ending choice anymore.

export type EndingKey = "think-you-know" | "how-many";

/** Display label used by Outro title lines. */
export type EndingLabel = "Think you know the answer?" | "How many did you get?";

export function endingLabelForKey(key: EndingKey): EndingLabel {
  return key === "how-many" ? "How many did you get?" : "Think you know the answer?";
}

/** Bonus-level index (1-based). `floor(n/2)` levels play+reveal FIRST, then the
 *  bonus level (this index) + break. n=4→3, 5→3, 6→4, 7→4, 8→5, 9→5, 20→11, 21→11.
 *  0 = no bonus (n<2). */
export function breakAfterLevels(n: number): number {
  return n >= 2 ? Math.floor(n / 2) + 1 : 0;
}

export const BONUS_VOICE_VARIANTS = 5;

/** Random-but-deterministic bonus-voice variant (0..4) per save — preview and
 * render must compute the same duration, so it hashes the save name. */
export function bonusVariantForSave(save: string): number {
  const seed = `bonus::${save}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % BONUS_VOICE_VARIANTS;
}
