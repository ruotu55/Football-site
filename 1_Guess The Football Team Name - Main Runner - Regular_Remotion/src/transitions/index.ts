import type { TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fog } from "./fog";

// Common presentation type so a single helper can return any effect.
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;
const anyOf = (p: unknown) => p as AnyPresentation;

// Effects offered in the "Transition Effect" control. "Fog" is the default
// (between the intro and the first level); the rest are Remotion built-ins.
export const TRANSITION_EFFECTS = [
  "Fog",
  "Fade",
  "Slide",
  "Wipe",
  "Flip",
  "Clock Wipe",
] as const;

export type TransitionEffect = (typeof TRANSITION_EFFECTS)[number];

export const getPresentation = (
  name: TransitionEffect,
  dims: { width: number; height: number },
): AnyPresentation => {
  switch (name) {
    case "Fade":
      return anyOf(fade());
    case "Slide":
      return anyOf(slide());
    case "Wipe":
      return anyOf(wipe());
    case "Flip":
      return anyOf(flip());
    case "Clock Wipe":
      return anyOf(clockWipe({ width: dims.width, height: dims.height }));
    case "Fog":
    default:
      return anyOf(fog());
  }
};
