// Ported, pure subset of ../../../.Storage/shared/backgrounds/background-theme.js
// (the app's live background engine). DOM/localStorage/server-sync parts are NOT ported.
// CSS strings are kept EXACT so Remotion output matches the app. Do NOT edit the source.
import type { BgTheme } from "../props";

export const ROOT_COLOR_ATTR = "data-shared-background-color";
export const ROOT_EFFECT_ATTR = "data-shared-background-effect";
export const WHITE_0 = "rgba(255, 255, 255, 0)";
export const DEFAULT_LINE_OPACITY_PERCENT = 3.5;

export interface ColorDef {
  id: string;
  label: string;
  hex: string;
}
export interface EffectDef {
  id: string;
  label: string;
}
export interface CompetitionRecipe {
  angle?: number;
  c1: string;
  c2: string;
  pattern: "stars" | "chevron" | "diagonal" | "rays";
  patternHex: string;
  patternAlpha: number;
  motion?: "drop";
}
export interface CompetitionTheme {
  id: string;
  label: string;
  aliases: string[];
  dominantHex: string;
  recipe: CompetitionRecipe;
}

export const COLORS: ColorDef[] = [
  { id: "quiz-career-path", label: "#0069EC - Career Path", hex: "#0069EC" },
  { id: "quiz-career-stats", label: "#AB47BC - Career Stats", hex: "#AB47BC" },
  { id: "quiz-four-params", label: "#5C6BC0 - Club + Position + Country + Age", hex: "#5C6BC0" },
  { id: "quiz-fake-info", label: "#E57373 - Fake Information", hex: "#E57373" },
  { id: "quiz-nat-by-club", label: "#1B5E20 - National Team by Club", hex: "#1B5E20" },
  { id: "quiz-club-by-nat", label: "#2E7D32 - Club by Nationality", hex: "#2E7D32" },
  { id: "quiz-football-mcq", label: "#C2185B - Football Quiz (Multiple Choice)", hex: "#C2185B" },
  { id: "extra-orange", label: "Extra 1", hex: "#FFB74D" },
  { id: "extra-slate", label: "Extra 2", hex: "#78909C" },
  { id: "extra-ocean-green", label: "Extra 3", hex: "#4DB6AC" },
  { id: "extra-deep-lavender", label: "#9575CD - Football Player Name", hex: "#9575CD" },
  { id: "extra-sky-indigo", label: "Extra 5", hex: "#7986CB" },
  { id: "extra-warm-slate", label: "Extra 6", hex: "#90A4AE" },
  { id: "extra-burnt-orange", label: "Extra 7", hex: "#FF8A65" },
  { id: "extra-soft-green", label: "#81C784 - Football Team Name", hex: "#81C784" },
  { id: "extra-cornflower-blue", label: "Extra 9", hex: "#64B5F6" },
];

export const EFFECTS: EffectDef[] = [
  { id: "sun-rays-center", label: "Sun effect middle" },
  { id: "sun-spiral-center", label: "Sun spiral middle" },
  { id: "sun-rays-top-right", label: "Sun effect top right" },
  { id: "sun-rays-top-left", label: "Sun effect top left" },
  { id: "center-rings", label: "Center circles" },
  { id: "floating-emojis", label: "Floating emojis" },
  { id: "rising-question-marks", label: "Rising question marks" },
  { id: "diagonal-flow", label: "Diagonal flow" },
  { id: "youtube-thumbnails", label: "YouTube thumbnails" },
  { id: "rising-soccer-balls", label: "Rising soccer balls" },
];

export function normalizeHex(hex: unknown): string | null {
  if (typeof hex !== "string") return null;
  const trimmed = hex.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(trimmed);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalizedHex = normalizeHex(hex);
  if (!normalizedHex) return { r: 10, g: 61, b: 184 };
  const value = parseInt(normalizedHex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function normalizeOpacityPercent(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LINE_OPACITY_PERCENT;
  return Math.min(10, Math.max(0, Math.round(numeric * 100) / 100));
}

export function whiteWithOpacity(opacityPercent: number): string {
  return `rgba(255, 255, 255, ${normalizeOpacityPercent(opacityPercent) / 100})`;
}

export function svgDataUri(svg: string): string {
  return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;
}

export function createSunSpiralSvgDataUri(opacityPercent: number): string {
  const whiteAlpha = normalizeOpacityPercent(opacityPercent) / 100;
  const cx = 500;
  const cy = 500;
  const numArms = 16;
  const maxR = 780;
  const twist = Math.PI * 1.55;
  const halfWidth = (Math.PI / numArms) * 0.5;
  const steps = 120;

  let paths = "";
  for (let arm = 0; arm < numArms; arm += 1) {
    const baseAngle = (arm / numArms) * 2 * Math.PI - Math.PI / 2;
    const outerEdge: { x: number; y: number }[] = [];
    const innerEdge: { x: number; y: number }[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const r = (s / steps) * maxR;
      const twistAngle = baseAngle + twist * (r / maxR);
      outerEdge.push({
        x: cx + r * Math.cos(twistAngle - halfWidth),
        y: cy + r * Math.sin(twistAngle - halfWidth),
      });
      innerEdge.push({
        x: cx + r * Math.cos(twistAngle + halfWidth),
        y: cy + r * Math.sin(twistAngle + halfWidth),
      });
    }
    let d = `M ${cx} ${cy}`;
    for (const pt of outerEdge) {
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    for (const pt of innerEdge.reverse()) {
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    d += " Z";
    paths += `<path d="${d}" fill="#ffffff" fill-opacity="${whiteAlpha}"/>`;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
      ${paths}
    </svg>
  `;
  return svgDataUri(svg);
}

export function getEffectBackground(
  effectId: string,
  colorHex: string,
  opacityPercent: number,
): string {
  const opacityFactor = normalizeOpacityPercent(opacityPercent) / 100;
  const whiteMid = `rgba(255, 255, 255, ${Math.min(0.12, opacityFactor * 6)})`;
  const whiteSoft = `rgba(255, 255, 255, ${Math.min(0.08, opacityFactor * 4)})`;
  const whiteStrong = `rgba(255, 255, 255, ${Math.min(0.2, opacityFactor * 12)})`;
  const blackSoft = `rgba(0, 0, 0, ${Math.min(0.08, opacityFactor * 4)})`;
  const blackMid = `rgba(0, 0, 0, ${Math.min(0.14, opacityFactor * 7)})`;
  switch (effectId) {
    case "sun-rays-center":
    case "sun-spiral-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
    case "floating-emojis":
    case "rising-question-marks":
    case "rising-soccer-balls":
    case "youtube-thumbnails":
      return `${colorHex}`;
    case "center-rings":
      return `${colorHex}`;
    case "football-pitch":
      return `
    radial-gradient(circle at 50% 50%, ${WHITE_0} 0 10%, ${whiteMid} 10% 10.4%, ${WHITE_0} 10.4% 100%),
    linear-gradient(to right, ${WHITE_0} 49.85%, ${whiteStrong} 49.85% 50.15%, ${WHITE_0} 50.15%),
    repeating-linear-gradient(to bottom, ${whiteSoft} 0 2px, ${WHITE_0} 2px 96px),
    repeating-linear-gradient(to right, rgba(255, 255, 255, 0.03) 0 120px, rgba(0, 0, 0, 0.04) 120px 240px),
    ${colorHex}`;
    case "diagonal-flow":
      return `${colorHex}`;
    case "wave-bands":
      return `
    radial-gradient(140% 80% at 0% 100%, ${whiteMid} 0 36%, ${WHITE_0} 62%),
    radial-gradient(140% 80% at 100% 0%, ${whiteSoft} 0 34%, ${WHITE_0} 60%),
    repeating-linear-gradient(0deg, ${blackSoft} 0 48px, ${WHITE_0} 48px 96px),
    ${colorHex}`;
    case "soft-vignette":
      return `
    radial-gradient(circle at 50% 50%, ${whiteMid} 0 18%, ${WHITE_0} 60%),
    radial-gradient(130% 95% at 50% 50%, ${WHITE_0} 0 40%, ${blackMid} 76%),
    ${colorHex}`;
    case "sun-rays":
    default:
      return `${colorHex}`;
  }
}

export function getEffectAnimation(effectId: string): string {
  switch (effectId) {
    case "sun-rays-center":
    case "sun-spiral-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
    case "floating-emojis":
    case "rising-question-marks":
    case "rising-soccer-balls":
    case "youtube-thumbnails":
      return "none";
    case "center-rings":
      return "none";
    case "football-pitch":
      return "shared-bg-football-pitch 200s linear infinite";
    case "diagonal-flow":
      return "none";
    case "wave-bands":
      return "shared-bg-wave-bands 170s linear infinite";
    case "soft-vignette":
      return "shared-bg-soft-vignette 220s linear infinite";
    case "sun-rays":
    default:
      return "none";
  }
}

export function getEffectBackgroundSize(effectId: string): string {
  switch (effectId) {
    case "sun-rays-center":
    case "sun-spiral-center":
    case "sun-rays-top-right":
    case "sun-rays-top-left":
    case "floating-emojis":
    case "rising-question-marks":
    case "rising-soccer-balls":
    case "youtube-thumbnails":
      return "100% 100%";
    case "center-rings":
      return "100% 100%";
    case "football-pitch":
      return "100% 100%, 100% 100%, 100% 100%, 240% 100%, 100% 100%";
    case "diagonal-flow":
      return "100% 100%";
    case "wave-bands":
      return "220% 220%, 220% 220%, 240% 240%, 100% 100%";
    case "soft-vignette":
      return "180% 180%, 100% 100%, 100% 100%";
    case "sun-rays":
    default:
      return "100% 100%";
  }
}

export function getEffectExtraCss(
  effectId: string,
  colorHex: string,
  opacityPercent: number,
): string {
  const whiteLine = whiteWithOpacity(opacityPercent);
  const color10 = rgbaFromHex(colorHex, 0.1 * opacityPercent);
  const color05 = rgbaFromHex(colorHex, 0.05 * opacityPercent);
  const spiralSvg = createSunSpiralSvgDataUri(opacityPercent);
  const vignetteOpaque = rgbaFromHex(colorHex, 1);
  const vignetteTransparent = rgbaFromHex(colorHex, 0);
  const vignetteCss = (attr: string) => `
:root[${ROOT_EFFECT_ATTR}="${attr}"] body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    ${vignetteTransparent} 0%,
    ${vignetteOpaque} 100%
  );
}
`;
  switch (effectId) {
    case "sun-rays-top-right":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-rays-top-right"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-top-right"] body::before {
  content: "";
  position: fixed;
  top: -320vmax;
  right: -320vmax;
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background: repeating-conic-gradient(
    from 10deg at calc(100% - 320vmax) 320vmax,
    ${whiteLine} 0deg 7deg,
    ${color10} 7deg 14deg
  );
  transform-origin: calc(100% - 320vmax) 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}
${vignetteCss("sun-rays-top-right")}
:root[${ROOT_EFFECT_ATTR}="sun-rays-top-right"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "sun-rays-center":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] body::before {
  content: "";
  position: fixed;
  top: calc(50vh - 320vmax);
  left: calc(50vw - 320vmax);
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background: repeating-conic-gradient(
    from 10deg at 320vmax 320vmax,
    ${whiteLine} 0deg 7deg,
    ${color10} 7deg 14deg
  );
  transform-origin: 320vmax 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}
${vignetteCss("sun-rays-center")}
:root[${ROOT_EFFECT_ATTR}="sun-rays-center"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "sun-spiral-center":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-spiral-center"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-spiral-center"] body::before {
  content: "";
  position: fixed;
  top: calc(50vh - 320vmax);
  left: calc(50vw - 320vmax);
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background-image: ${spiralSvg};
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
  transform-origin: 320vmax 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}
${vignetteCss("sun-spiral-center")}
:root[${ROOT_EFFECT_ATTR}="sun-spiral-center"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "sun-rays-top-left":
      return `
:root[${ROOT_EFFECT_ATTR}="sun-rays-top-left"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="sun-rays-top-left"] body::before {
  content: "";
  position: fixed;
  top: -320vmax;
  left: -320vmax;
  width: 640vmax;
  height: 640vmax;
  pointer-events: none;
  z-index: 0;
  background: repeating-conic-gradient(
    from 10deg at 320vmax 320vmax,
    ${whiteLine} 0deg 7deg,
    ${color10} 7deg 14deg
  );
  transform-origin: 320vmax 320vmax;
  animation: shared-bg-sun-rays 240s linear infinite;
}
${vignetteCss("sun-rays-top-left")}
:root[${ROOT_EFFECT_ATTR}="sun-rays-top-left"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "center-rings":
      return `
:root[${ROOT_EFFECT_ATTR}="center-rings"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="center-rings"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: repeating-radial-gradient(
    circle at 50% 50%,
    ${color05} 0 var(--center-rings-offset),
    ${whiteLine} var(--center-rings-offset) calc(var(--center-rings-offset) + 58px),
    ${color05} calc(var(--center-rings-offset) + 58px) calc(var(--center-rings-offset) + 116px)
  );
  -webkit-mask-image: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 100%
  );
  mask-image: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 100%
  );
  opacity: 1;
  animation: shared-bg-center-rings-offset 60s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="center-rings"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "floating-emojis":
      return `
:root[${ROOT_EFFECT_ATTR}="floating-emojis"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] .shared-bg-emojis {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.03) 50%,
    rgba(0, 0, 0, 0.3) 100%
  );
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.03) 50%,
    rgba(0, 0, 0, 0.3) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] .shared-bg-emoji {
  position: absolute;
  right: -250px;
  object-fit: contain;
  opacity: clamp(0.05, calc(var(--shared-line-opacity, 3.5) * 0.1), 1);
  filter: grayscale(100%);
  animation: shared-bg-emoji-float linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="floating-emojis"] .app {
  position: relative;
  z-index: 1;
}

/* Lift the emoji layer above the ball-preloader (z-index 9998) while it's active,
   so the effect is visible during the intro bounce. */
:root[${ROOT_EFFECT_ATTR}="floating-emojis"] body:has(.ball-preloader:not([hidden]):not(.revealing)) .shared-bg-emojis {
  z-index: 9999;
}
`;
    case "rising-question-marks":
      return `
:root[${ROOT_EFFECT_ATTR}="rising-question-marks"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="rising-question-marks"] .shared-bg-question-marks {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="rising-question-marks"] body.shorts-mode .shared-bg-question-marks {
  inset: auto;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(56.25vh, 100vw);
  height: 100vh;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="rising-question-marks"] .shared-bg-question {
  position: absolute;
  bottom: -12vh;
  line-height: 1;
  font-weight: 800;
  font-family: system-ui, "Segoe UI", sans-serif;
  color: rgba(255, 255, 255, 0.38);
  user-select: none;
  animation: shared-bg-question-rise linear infinite;
  will-change: transform, opacity;
}

:root[${ROOT_EFFECT_ATTR}="rising-question-marks"] .app {
  position: relative;
  z-index: 1;
}

/* Lift the question-marks layer above the ball-preloader (z-index 9998) while it's active. */
:root[${ROOT_EFFECT_ATTR}="rising-question-marks"] body:has(.ball-preloader:not([hidden]):not(.revealing)) .shared-bg-question-marks {
  z-index: 9999;
}
`;
    case "rising-soccer-balls":
      return `
:root[${ROOT_EFFECT_ATTR}="rising-soccer-balls"] body {
  position: relative;
}

:root[${ROOT_EFFECT_ATTR}="rising-soccer-balls"] .shared-bg-soccer-balls {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="rising-soccer-balls"] body.shorts-mode .shared-bg-soccer-balls {
  inset: auto;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(56.25vh, 100vw);
  height: 100vh;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.04) 50%,
    rgba(0, 0, 0, 0.28) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="rising-soccer-balls"] .shared-bg-soccer-ball {
  position: absolute;
  bottom: -12vh;
  line-height: 1;
  user-select: none;
  animation: shared-bg-soccer-ball-rise linear infinite;
  will-change: transform, opacity;
}

:root[${ROOT_EFFECT_ATTR}="rising-soccer-balls"] .app {
  position: relative;
  z-index: 1;
}

/* Lift the soccer-balls layer above the ball-preloader (z-index 9998) while it's active. */
:root[${ROOT_EFFECT_ATTR}="rising-soccer-balls"] body:has(.ball-preloader:not([hidden]):not(.revealing)) .shared-bg-soccer-balls {
  z-index: 9999;
}
`;
    case "youtube-thumbnails":
      return `
:root[${ROOT_EFFECT_ATTR}="youtube-thumbnails"] body {
  position: relative;
  overflow: hidden;
}

/* Same as legacy thumbnail-maker #pitch-wrap::before / ::after (360 rays around a clear center).
   Only the conic-gradient start angle is animated (via the --thumb-rays-angle custom property),
   so just the rays sweep around the center while the element/mask stay perfectly still. */
@property --thumb-rays-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes shared-bg-thumb-rays-spin {
  0% { --thumb-rays-angle: 0deg; }
  100% { --thumb-rays-angle: 360deg; }
}

:root[${ROOT_EFFECT_ATTR}="youtube-thumbnails"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  opacity: clamp(0.05, calc(var(--shared-line-opacity, 3.5) * 0.1), 1);
  background:
    repeating-conic-gradient(
      from var(--thumb-rays-angle, 0deg) at 50% 50%,
      rgba(255, 255, 255, 0.62) 0deg 1deg,
      rgba(255, 255, 255, 0.16) 1deg 3.4deg,
      rgba(255, 255, 255, 0) 3.4deg 8.4deg
    );
  /* Linear radial fade: 0% opacity at the very centre, ramping up evenly with
     distance so each 1% further out is 1% more visible, fully opaque at the
     corners. */
  -webkit-mask-image: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 100%
  );
  mask-image: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 100%
  );
  animation: shared-bg-thumb-rays-spin 240s linear infinite;
}

/* Shorts (portrait) override: confine the rays element to the visible 9:16 stage
   (centered, width = min(56.25vh, 100vw)) so it doesn't paint over the black
   letterbox bars on wide viewports. Mask radii rescaled to the stage box, with
   thresholds shifted outward by 20pp so rays sit at the very edges of the stage.
   z-index lifted above the .app stack (z 10 in shorts) so the side rays render
   over the pitch edges — transitions are appended to body in transitions.js so
   they still cover this layer. */
:root[${ROOT_EFFECT_ATTR}="youtube-thumbnails"] body.shorts-mode::before {
  inset: auto;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(56.25vh, 100vw);
  height: 100vh;
  -webkit-mask-image: radial-gradient(
    ellipse 44% 32% at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0) 108%,
    rgba(0, 0, 0, 1) 120%
  );
  mask-image: radial-gradient(
    ellipse 44% 32% at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0) 108%,
    rgba(0, 0, 0, 1) 120%
  );
  z-index: 11;
}

:root[${ROOT_EFFECT_ATTR}="youtube-thumbnails"] body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  opacity: clamp(0.03, calc(var(--shared-line-opacity, 3.5) * 0.07), 0.7);
  background:
    radial-gradient(
      ellipse at 50% 50%,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0) 40%,
      rgba(255, 255, 255, 0.12) 66%,
      rgba(255, 255, 255, 0.22) 100%
    );
  -webkit-mask-image: radial-gradient(
    ellipse at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0) 38%,
    rgba(0, 0, 0, 1) 56%,
    rgba(0, 0, 0, 1) 100%
  );
  mask-image: radial-gradient(
    ellipse at 50% 50%,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0) 38%,
    rgba(0, 0, 0, 1) 56%,
    rgba(0, 0, 0, 1) 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="youtube-thumbnails"] .app {
  position: relative;
  z-index: 1;
}
`;
    case "diagonal-flow":
      return `
:root[${ROOT_EFFECT_ATTR}="${effectId}"] body {
  position: relative;
  overflow: hidden;
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::before {
  content: "";
  position: fixed;
  top: -10vh;
  left: -100vw;
  width: 300vw;
  height: 120vh;
  pointer-events: none;
  z-index: 0;
  background: repeating-linear-gradient(-28deg, ${whiteLine} 0 66px, ${color10} 66px 132px);
  animation: shared-bg-diagonal-flow 20s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] body.shorts-mode::before {
  top: -100vh;
  left: -10vw;
  width: 120vw;
  height: 300vh;
  animation: shared-bg-diagonal-flow-shorts 20s linear infinite;
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse farthest-corner at 50% 50%,
    ${vignetteOpaque} 0%,
    ${vignetteTransparent} 100%
  );
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] .app {
  position: relative;
  z-index: 1;
}
`;
    default:
      return `
:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::before {
  content: none;
}

:root[${ROOT_EFFECT_ATTR}="${effectId}"] body::after {
  content: none;
}
`;
  }
}

export function getEffectKeyframesCss(): string {
  return `
@keyframes shared-bg-sun-rays {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes shared-bg-sun-spiral-center {
  0% { transform: rotate(0deg) scale(1.08); }
  100% { transform: rotate(360deg) scale(1.08); }
}

@keyframes shared-bg-center-rings {
  0% {
    background-position: 50% 50%, 50% 50%, center center;
    background-size: 120% 120%, 130% 130%, 100% 100%;
  }
  50% {
    background-position: 35% 65%, 65% 35%, center center;
    background-size: 190% 190%, 205% 205%, 100% 100%;
  }
  100% {
    background-position: 20% 80%, 80% 20%, center center;
    background-size: 270% 270%, 290% 290%, 100% 100%;
  }
}

@keyframes shared-bg-center-rings-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 1;
  }
}

@property --center-rings-offset {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@keyframes shared-bg-center-rings-offset {
  0% {
    --center-rings-offset: 0px;
  }
  100% {
    --center-rings-offset: 116px;
  }
}

@keyframes shared-bg-football-pitch {
  0% {
    background-position: center center, center center, center center, 0 0, center center;
  }
  100% {
    background-position: center center, center center, center center, -240px 0, center center;
  }
}

@keyframes shared-bg-emoji-float {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(-100vw - 420px));
  }
}

@keyframes shared-bg-emoji-float-down {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(calc(100vh + 420px));
  }
}

@keyframes shared-bg-question-rise {
  0% {
    transform: translateX(-50%) translate(0, 0) rotate(var(--q-rot, 0deg));
    opacity: 0;
  }
  7% {
    opacity: clamp(0.05, calc(var(--shared-line-opacity, 3.5) * 0.1), 1);
  }
  93% {
    opacity: clamp(0.05, calc(var(--shared-line-opacity, 3.5) * 0.1), 1);
  }
  100% {
    transform: translateX(-50%) translate(var(--q-drift, 0vw), -128vh) rotate(var(--q-rot, 0deg));
    opacity: 0;
  }
}

@keyframes shared-bg-soccer-ball-rise {
  0% {
    transform: translateX(-50%) translate(0, 0) rotate(var(--sb-rot, 0deg));
    opacity: 0;
  }
  7% {
    opacity: clamp(0.05, calc(var(--shared-line-opacity, 3.5) * 0.1), 1);
  }
  93% {
    opacity: clamp(0.05, calc(var(--shared-line-opacity, 3.5) * 0.1), 1);
  }
  100% {
    transform: translateX(-50%) translate(var(--sb-drift, 0vw), -128vh) rotate(var(--sb-rot, 0deg));
    opacity: 0;
  }
}

/* One loop = exactly one stripe repeat along the gradient (-28deg, 0–132px stops).
   Using 100vw/100vh caused a visible jump because that distance rarely matches the pattern period. */
@keyframes shared-bg-diagonal-flow {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(-132px / sin(28deg))); }
}

@keyframes shared-bg-diagonal-flow-shorts {
  0% { transform: translateY(0); }
  100% { transform: translateY(calc(-132px / cos(28deg))); }
}

@keyframes shared-bg-wave-bands {
  0% { background-position: 0% 100%, 100% 0%, 0% 0%, center center; }
  100% { background-position: -20% 100%, 120% 0%, -30% 0%, center center; }
}

@keyframes shared-bg-soft-vignette {
  0% { background-position: 50% 50%, 50% 50%, center center; }
  100% { background-position: 48% 52%, 52% 48%, center center; }
}
`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPETITION THEMES
   ──────────────────────────────────────────────────────────────────────────── */

function compGradient(angle: number, c1: string, c2: string): string {
  return `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
}

/** Tiled SVG of scattered 5-point stars (Champions-League look). */
export function starsTileDataUri(starHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(starHex);
  const fill = `rgb(${r}, ${g}, ${b})`;
  const star = (cx: number, cy: number, rad: number, rot: number, a: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const ang = (Math.PI / 5) * i - Math.PI / 2 + rot;
      const rr = i % 2 === 0 ? rad : rad * 0.42;
      pts.push(`${(cx + rr * Math.cos(ang)).toFixed(1)},${(cy + rr * Math.sin(ang)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(" ")}" fill="${fill}" fill-opacity="${a.toFixed(3)}"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    ${star(62, 70, 36, 0.1, alpha)}${star(212, 52, 22, 0.5, alpha * 0.8)}
    ${star(150, 168, 48, 0.2, alpha)}${star(252, 212, 26, 0.0, alpha * 0.75)}
    ${star(72, 244, 20, 0.4, alpha * 0.7)}</svg>`;
  return svgDataUri(svg);
}

/** Tiled SVG of bold chevrons / zigzags (Premier-League look). */
export function chevronTileDataUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const stroke = `rgb(${r}, ${g}, ${b})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="170" viewBox="0 0 170 170">
    <g fill="none" stroke="${stroke}" stroke-opacity="${alpha.toFixed(3)}" stroke-width="26">
      <path d="M-30,46 L85,-26 L200,46"/><path d="M-30,128 L85,56 L200,128"/>
      <path d="M-30,210 L85,138 L200,210"/></g></svg>`;
  return svgDataUri(svg);
}

/* Infinite downward drop for tiled patterns. */
export const COMP_DROP_KEYFRAMES = `
@keyframes comp-stars-drop {
  0%   { background-position: 0 0, center; }
  100% { background-position: 0 300px, center; }
}
@keyframes comp-chevron-drop {
  0%   { background-position: 0 0, center; }
  100% { background-position: 0 170px, center; }
}
`;

export interface CompetitionBackground {
  background: string;
  backgroundSize: string;
  backgroundRepeat: string;
  animation: string;
}

/** A competition recipe → the CSS the body background uses. */
export function buildCompetitionBackground({
  angle = 135,
  c1,
  c2,
  pattern,
  patternHex,
  patternAlpha,
  motion,
}: CompetitionRecipe): CompetitionBackground {
  const gradient = compGradient(angle, c1, c2);
  if (pattern === "stars") {
    return {
      background: `${starsTileDataUri(patternHex, patternAlpha)}, ${gradient}`,
      backgroundSize: "300px 300px, 100% 100%",
      backgroundRepeat: "repeat, no-repeat",
      animation: motion === "drop" ? "comp-stars-drop 34s linear infinite" : "none",
    };
  }
  if (pattern === "chevron") {
    return {
      background: `${chevronTileDataUri(patternHex, patternAlpha)}, ${gradient}`,
      backgroundSize: "170px 170px, 100% 100%",
      backgroundRepeat: "repeat, no-repeat",
      animation: motion === "drop" ? "comp-chevron-drop 24s linear infinite" : "none",
    };
  }
  if (pattern === "diagonal") {
    const stripe = rgbaFromHex(patternHex, patternAlpha);
    return {
      background: `repeating-linear-gradient(135deg, ${stripe} 0 64px, ${WHITE_0} 64px 128px), ${gradient}`,
      backgroundSize: "auto, 100% 100%",
      backgroundRepeat: "repeat, no-repeat",
      animation: "none",
    };
  }
  // rays
  const ray = rgbaFromHex(patternHex, patternAlpha);
  return {
    background: `repeating-conic-gradient(from 0deg at 50% 42%, ${ray} 0deg 5deg, ${WHITE_0} 5deg 13deg), ${gradient}`,
    backgroundSize: "100% 100%, 100% 100%",
    backgroundRepeat: "no-repeat, no-repeat",
    animation: "none",
  };
}

export const COMPETITION_THEMES_LIST: CompetitionTheme[] = [
  { id: "champions-league", label: "Champions League", aliases: ["champion league", "champions league", "ucl"], dominantHex: "#0a1a4a", recipe: { c1: "#06122e", c2: "#1e3fb0", pattern: "stars", patternHex: "#ffffff", patternAlpha: 0.045, motion: "drop" } },
  { id: "europa-league", label: "Europa League", aliases: ["europa league", "uel"], dominantHex: "#1a1a1a", recipe: { c1: "#141414", c2: "#ff7a00", pattern: "diagonal", patternHex: "#000000", patternAlpha: 0.18 } },
  { id: "conference-league", label: "Conference League", aliases: ["conference league", "uecl"], dominantHex: "#0a3d2e", recipe: { c1: "#07331f", c2: "#22c36a", pattern: "diagonal", patternHex: "#ffffff", patternAlpha: 0.12 } },
  { id: "premier-league", label: "Premier League", aliases: ["premier league", "epl", "premier"], dominantHex: "#2b0036", recipe: { c1: "#2b0036", c2: "#ff2d8b", pattern: "chevron", patternHex: "#04f5ff", patternAlpha: 0.16 } },
  { id: "la-liga", label: "La Liga", aliases: ["la liga", "laliga"], dominantHex: "#001433", recipe: { c1: "#001433", c2: "#ff5a5a", pattern: "chevron", patternHex: "#ffffff", patternAlpha: 0.12 } },
  { id: "bundesliga", label: "Bundesliga", aliases: ["bundesliga"], dominantHex: "#141414", recipe: { c1: "#141414", c2: "#d50a17", pattern: "diagonal", patternHex: "#ffffff", patternAlpha: 0.10 } },
  { id: "serie-a", label: "Serie A", aliases: ["serie a", "seria a"], dominantHex: "#021a3a", recipe: { c1: "#021a3a", c2: "#1e63b8", pattern: "diagonal", patternHex: "#ffffff", patternAlpha: 0.10 } },
  { id: "ligue-1", label: "Ligue 1", aliases: ["ligue 1", "ligue1"], dominantHex: "#07173a", recipe: { c1: "#07173a", c2: "#a6d400", pattern: "chevron", patternHex: "#ffffff", patternAlpha: 0.12 } },
  { id: "world-cup", label: "World Cup", aliases: ["world cup", "fifa world cup"], dominantHex: "#4a0a16", recipe: { c1: "#4a0a16", c2: "#c79a3a", pattern: "rays", patternHex: "#ffe9a8", patternAlpha: 0.10 } },
  { id: "euro", label: "Euro", aliases: ["euro", "european championship", "uefa euro"], dominantHex: "#07303a", recipe: { angle: 135, c1: "#07303a", c2: "#0d2a66", pattern: "chevron", patternHex: "#ffffff", patternAlpha: 0.05, motion: "drop" } },
];

export const COMPETITION_THEMES: Record<string, CompetitionTheme> = Object.fromEntries(
  COMPETITION_THEMES_LIST.map((t) => [t.id, t]),
);

/* ─────────────────────────────────────────────────────────────────────────────
   BgTheme builders (return the shape the renderer consumes)
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Retarget the app's `body`-anchored extra CSS onto a transparent `.bg-fx-host`
 * element so the pseudo-element overlay effects (rays/rings/diagonal) paint above
 * our opaque base color layer instead of on `body` (which our base would hide).
 */
function retargetExtraCss(css: string): string {
  return css
    .replace(/body::before/g, ".bg-fx-host::before")
    .replace(/body::after/g, ".bg-fx-host::after")
    .replace(/body\.shorts-mode/g, ".bg-fx-host")
    .replace(/body \{/g, ".bg-fx-host {");
}

/**
 * Split a `getEffectBackground` shorthand into a base layer that AbsoluteFill can
 * consume. For solid effects the shorthand is just the hex → backgroundColor.
 * For multi-layer shorthands (football-pitch/wave-bands/soft-vignette) we keep the
 * whole shorthand as the AbsoluteFill `background` via backgroundImage and let the
 * trailing hex inside it set the color.
 */
function backgroundToComputed(
  background: string,
  backgroundSize: string,
): NonNullable<BgTheme["computed"]> {
  const trimmed = background.trim();
  // A plain hex (solid effect) → flat color, no image.
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return {
      backgroundImage: "none",
      backgroundColor: trimmed,
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    };
  }
  // Multi-layer gradient shorthand: the last comma-separated layer is the base hex.
  // We render the FULL shorthand as backgroundImage so the gradients + base color
  // all paint (BackgroundTheme uses backgroundImage when it's not "none").
  return {
    backgroundImage: trimmed,
    backgroundColor: "transparent",
    backgroundSize: backgroundSize || "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
  };
}

/** Build a palette BgTheme (color + effect + opacity) matching the app. */
export function generateBgTheme(
  colorId: string,
  effectId: string,
  opacityPercent: number,
): BgTheme {
  const color = COLORS.find((c) => c.id === colorId) || COLORS[0];
  const colorHex = color.hex;
  const opacity = normalizeOpacityPercent(opacityPercent);

  const background = getEffectBackground(effectId, colorHex, opacity);
  const backgroundSize = getEffectBackgroundSize(effectId);
  const computed = backgroundToComputed(background, backgroundSize);

  const css =
    getEffectKeyframesCss() + "\n" + retargetExtraCss(getEffectExtraCss(effectId, colorHex, opacity));

  const effectOpacity = String(Math.max(0.08, Math.min(0.45, opacity / 10)));

  return {
    css,
    colorAttr: colorId,
    effectAttr: effectId,
    bgStage: colorHex,
    lineOpacity: String(opacity),
    effectOpacity,
    particlesHtml: [],
    computed,
  };
}

/** Build a competition BgTheme by id (e.g. "champions-league"). */
export function generateCompetitionBgTheme(compId: string): BgTheme {
  const theme = COMPETITION_THEMES[compId] || COMPETITION_THEMES_LIST[0];
  const recipe = buildCompetitionBackground(theme.recipe);
  const attr = `comp-${theme.id}`;
  return {
    css: COMP_DROP_KEYFRAMES,
    colorAttr: attr,
    effectAttr: attr,
    bgStage: theme.dominantHex,
    lineOpacity: "6",
    effectOpacity: "0.3",
    particlesHtml: [],
    computed: {
      backgroundImage: recipe.background,
      backgroundColor: theme.dominantHex,
      backgroundSize: recipe.backgroundSize,
      backgroundRepeat: recipe.backgroundRepeat,
      backgroundPosition: "center",
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Option arrays for the Studio schema (Zod enums)
   ──────────────────────────────────────────────────────────────────────────── */

export const COLOR_OPTIONS: { value: string; label: string }[] = COLORS.map((c) => ({
  value: c.id,
  label: c.label,
}));

export const EFFECT_OPTIONS: { value: string; label: string }[] = EFFECTS.map((e) => ({
  value: e.id,
  label: e.label,
}));

export const COMPETITION_OPTIONS: { value: string; label: string }[] =
  COMPETITION_THEMES_LIST.map((t) => ({ value: `comp-${t.id}`, label: `\u{1F3C6} ${t.label}` }));
