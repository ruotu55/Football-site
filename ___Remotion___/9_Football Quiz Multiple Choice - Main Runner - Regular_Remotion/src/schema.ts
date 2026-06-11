import { z } from "zod";
import { TRANSITION_EFFECTS } from "@shared/transitions";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import {
  COLOR_LABELS,
  COMPETITION_LABELS,
  EFFECT_LABELS,
  colorHexByLabel,
  competitionByLabel,
  effectIdByLabel,
} from "@shared/effects/effects-data";
import { SAVE_NAMES } from "./level-data";

export const NONE_COMPETITION = "None — use Color + Effect";
export const LANGUAGES = ["English", "Spanish"] as const;
export const ENDINGS = [
  "Random",
  "Think you know the answer?",
  "How many did you get?",
] as const;

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

export const LEVEL_CHOICES = [
  "All", "1", "2", "3", "5", "10", "15", "20", "25", "30", "40", "50", "60",
] as const;

export const demoSchema = z.object({
  language: z.enum(LANGUAGES),

  save: z.enum(asEnum(SAVE_NAMES)),
  levels: z.enum(LEVEL_CHOICES),

  ending: z.enum(ENDINGS),

  competition: z.enum(asEnum([NONE_COMPETITION, ...COMPETITION_LABELS])),
  color: z.enum(asEnum(COLOR_LABELS)),
  effect: z.enum(asEnum(EFFECT_LABELS)),
  opacity: z.number().min(0).max(1),

  transition: z.enum(TRANSITION_EFFECTS),
});

export type DemoProps = z.infer<typeof demoSchema>;

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
