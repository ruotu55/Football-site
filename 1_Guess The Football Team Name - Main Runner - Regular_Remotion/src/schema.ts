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

export const NONE_COMPETITION = "None — use Color + Effect";

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

export const demoSchema = z.object({
  competitionBackground: z.enum(asEnum([NONE_COMPETITION, ...COMPETITION_LABELS])),
  backgroundColor: z.enum(asEnum(COLOR_LABELS)),
  backgroundEffect: z.enum(asEnum(EFFECT_LABELS)),
  opacity: z.number().min(0).max(1),
  transitionEffect: z.enum(TRANSITION_EFFECTS),
});

export type DemoProps = z.infer<typeof demoSchema>;

// Picking a competition overrides Color + Effect (like the runner).
export const resolveBackground = (p: DemoProps): ResolvedBackground => {
  const comp = competitionByLabel(p.competitionBackground);
  return {
    competition: comp ? comp.recipe : null,
    colorHex: colorHexByLabel(p.backgroundColor),
    effectId: effectIdByLabel(p.backgroundEffect),
    opacity: p.opacity,
  };
};
