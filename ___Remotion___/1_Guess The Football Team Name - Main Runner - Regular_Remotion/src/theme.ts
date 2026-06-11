import { loadFont } from "@remotion/google-fonts/BarlowCondensed";

// Barlow Condensed — the runner's real title font (matches css/.../landing.css).
export const { fontFamily } = loadFont("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

// Brand palette pulled from the runner's css/base/variables.css.
export const COLORS = {
  stage: "#3c6553", // --bg-stage
  stageDeep: "#2c4a3d", // darker green for gradients
  stageDeepest: "#1d332a",
  accent: "#ffca28", // --accent (gold)
  accentSoft: "#ffe08a",
  white: "#f4fbff",
  ink: "#0e1a14",
  line: "rgba(255,255,255,0.28)", // pitch line color
  red: "#ff3b30", // outro subtitle red
} as const;

// Full-frame green stage background, used by every scene for continuity.
export const STAGE_BACKGROUND =
  `radial-gradient(120% 90% at 50% 8%, ${COLORS.stage} 0%, ${COLORS.stageDeep} 55%, ${COLORS.stageDeepest} 100%)`;
