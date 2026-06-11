import type { TransitionPresentation } from "@remotion/transitions";
import { shineWipe } from "./shine-wipe";
import { softIris } from "./soft-iris";
import { depthIris } from "./reveals";
import { diagonalWipe } from "./plain-wipe";
import { glowIris, zoomIris, tallIris, cornerIris, squashIris } from "./variants";

// Common presentation type so a single helper can return any effect.
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;
const anyOf = (p: unknown) => p as AnyPresentation;

// Scene-switch transitions (intro→level and level→level→outro). The ball-reveal
// `iris` is NOT here — it's the intro's own opening animation.
export const TRANSITION_EFFECTS = [
  "Shine Wipe",
  "Diagonal Wipe",
  "Soft Iris",
  "Depth Iris",
  "Glow Iris",
  "Zoom Iris",
  "Tall Iris",
  "Corner Iris",
  "Squash Iris",
] as const;

export type TransitionEffect = (typeof TRANSITION_EFFECTS)[number];

const FRAMES: Record<TransitionEffect, number> = {
  "Shine Wipe": 28,
  "Diagonal Wipe": 28,
  "Soft Iris": 30,
  "Depth Iris": 30,
  "Glow Iris": 30,
  "Zoom Iris": 28,
  "Tall Iris": 30,
  "Corner Iris": 30,
  "Squash Iris": 30,
};
export const transitionFramesFor = (name: TransitionEffect, base: number): number =>
  FRAMES[name] ?? base;

const FACTORY: Record<TransitionEffect, () => AnyPresentation> = {
  "Shine Wipe": () => anyOf(shineWipe()),
  "Diagonal Wipe": () => anyOf(diagonalWipe()),
  "Soft Iris": () => anyOf(softIris()),
  "Depth Iris": () => anyOf(depthIris()),
  "Glow Iris": () => anyOf(glowIris()),
  "Zoom Iris": () => anyOf(zoomIris()),
  "Tall Iris": () => anyOf(tallIris()),
  "Corner Iris": () => anyOf(cornerIris()),
  "Squash Iris": () => anyOf(squashIris()),
};

export const getPresentation = (name: TransitionEffect): AnyPresentation =>
  (FACTORY[name] ?? FACTORY["Shine Wipe"])();
