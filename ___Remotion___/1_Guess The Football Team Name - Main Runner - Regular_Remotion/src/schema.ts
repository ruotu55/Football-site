import { z } from "zod";
import { TRANSITION_EFFECTS } from "./transitions";
import type { ResolvedBackground } from "./effects/AnimatedBackground";
import {
  COLOR_LABELS,
  COMPETITION_LABELS,
  EFFECT_LABELS,
  colorHexByLabel,
  competitionByLabel,
  effectIdByLabel,
} from "./effects/effects-data";
import { SAVE_NAMES } from "./level-data";
import { FORMATION_LABELS } from "./formations";

export const NONE_COMPETITION = "None — use Color + Effect";
export const AUTO_FORMATION = "Auto (from save)";
export const LANGUAGES = ["English", "Spanish"] as const;
export const ENDINGS = [
  "Random",
  "Think you know the answer?",
  "How many did you get?",
] as const;

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

// Flat list (no nested objects → no { } in the Studio Schema panel). Ordered by
// group: save/level/formation, then language/ending/questions, then background,
// then transition.
// "All" = every level of the loaded save (any count, e.g. 36 or 60). The presets
// limit it. Shown as a dropdown so the box reads "All" instead of an arbitrary cap.
export const LEVEL_CHOICES = [
  "All", "1", "2", "3", "5", "10", "15", "20", "25", "30", "40", "50", "60",
] as const;

export const demoSchema = z.object({
  // LANGUAGE first so it's the top control in the Studio Props panel — switch it
  // between English / Spanish and ALL on-screen text + the logo flip accordingly.
  language: z.enum(LANGUAGES),

  save: z.enum(asEnum(SAVE_NAMES)),
  levels: z.enum(LEVEL_CHOICES),
  formation: z.enum(asEnum([AUTO_FORMATION, ...FORMATION_LABELS])),

  ending: z.enum(ENDINGS),

  competition: z.enum(asEnum([NONE_COMPETITION, ...COMPETITION_LABELS])),
  color: z.enum(asEnum(COLOR_LABELS)),
  effect: z.enum(asEnum(EFFECT_LABELS)),
  opacity: z.number().min(0).max(1),

  transition: z.enum(TRANSITION_EFFECTS),
});

export type DemoProps = z.infer<typeof demoSchema>;

// Picking a competition overrides Color + Effect (like the runner).
export const resolveBackground = (
  p: Pick<DemoProps, "competition" | "color" | "effect" | "opacity">,
): ResolvedBackground => {
  const comp = competitionByLabel(p.competition);
  return {
    competition: comp ? comp.recipe : null,
    colorHex: colorHexByLabel(p.color),
    effectId: effectIdByLabel(p.effect),
    opacity: p.opacity,
  };
};
