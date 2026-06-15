import { z } from "zod";
import { TRANSITION_EFFECTS } from "./transitions";
import type { ResolvedBackground } from "./effects/AnimatedBackground";
import { COMPETITION_LABELS, competitionByLabel } from "./effects/effects-data";
import { SAVE_NAMES } from "./level-data";
import { FORMATION_LABELS } from "./formations";

export const AUTO_FORMATION = "Auto (from save)";
export const LANGUAGES = ["English", "Spanish"] as const;

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

  competition: z.enum(asEnum(COMPETITION_LABELS)),

  transition: z.enum(TRANSITION_EFFECTS),
});

export type DemoProps = z.infer<typeof demoSchema>;

// Background effect intensity is fixed (no per-render Opacity control).
export const FIXED_EFFECT_OPACITY = 0.5;

// The competition theme IS the whole background: gradient + pattern (real competitions)
// or gradient + animated effect via recipe.effectId (Generic 1..10 themes).
export const resolveBackground = (
  p: Pick<DemoProps, "competition">,
): ResolvedBackground => {
  const comp = competitionByLabel(p.competition);
  return {
    competition: comp ? comp.recipe : null,
    colorHex: comp ? comp.recipe.c2 : "#0a1f33",
    effectId: null, // generic themes carry their effect inside the recipe
    opacity: FIXED_EFFECT_OPACITY,
  };
};
