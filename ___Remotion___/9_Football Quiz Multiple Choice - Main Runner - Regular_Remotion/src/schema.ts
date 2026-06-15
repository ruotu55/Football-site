import { z } from "zod";
import { TRANSITION_EFFECTS } from "@shared/transitions";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { COMPETITION_LABELS, competitionByLabel } from "@shared/effects/effects-data";
import { SAVE_NAMES } from "./level-data";

export const LANGUAGES = ["English", "Spanish"] as const;

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

export const LEVEL_CHOICES = [
  "All", "1", "2", "3", "5", "10", "15", "20", "25", "30", "40", "50", "60",
] as const;

export const demoSchema = z.object({
  language: z.enum(LANGUAGES),

  save: z.enum(asEnum(SAVE_NAMES)),
  levels: z.enum(LEVEL_CHOICES),

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
