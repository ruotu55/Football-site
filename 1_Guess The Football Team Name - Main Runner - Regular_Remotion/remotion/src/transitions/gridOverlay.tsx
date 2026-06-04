/**
 * gridOverlay.tsx
 *
 * Frame-driven reproduction of the "grid-overlay" transition from js/transitions.js.
 *
 * Source reference (transitions.js):
 *   - GridOverlay: rows=8, columns=14 (112 cells total)
 *   - Cell color: color-mix(in srgb, var(--bg-stage, #3c6553) 70%, white 30%) ≈ #6b9080
 *   - SHOW phase: cells scale 0→1.05, GSAP grid-stagger from index 0 (top-left radial),
 *     each=0.03s, ease power3.inOut, dur=0.4s, total wall-clock ≈ PHASE_DUR=0.84s
 *   - HIDE phase: cells scale 1.05→0, stagger from index 0 (top-left),
 *     each=0.03s, ease power2 (in), dur=0.4s, total ≈ 0.84s
 *   - transformOrigin show: "50% 0%" (scale from top edge)
 *   - transformOrigin hide: "50% 100%" (scale to bottom edge)
 *
 * In Remotion the content "swap" is implicit — the next Sequence is already mounted
 * underneath. The overlay just needs to fully cover the screen at the midpoint.
 *
 * NOTE: Exact transition duration will be reconciled against a real __audioTap manifest
 * in Phase 6.2; 820ms is the verified fallback used today.
 */

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Easing } from "remotion";

const ROWS = 8;
const COLS = 14;
const TOTAL_CELLS = ROWS * COLS; // 112

// GSAP grid-stagger "from: 0" (index 0 = top-left) radiates outward using
// Euclidean distance in grid-units. We pre-compute a normalised delay per cell
// so that the farthest cell has delay=1.0 (which maps to the stagger spread).
function buildStaggerDelays(): Float32Array {
  const delays = new Float32Array(TOTAL_CELLS);
  let maxDist = 0;
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // Euclidean distance from top-left (0,0)
    const d = Math.sqrt(row * row + col * col);
    delays[i] = d;
    if (d > maxDist) maxDist = d;
  }
  // Normalise to [0, 1]
  if (maxDist > 0) {
    for (let i = 0; i < TOTAL_CELLS; i++) delays[i] /= maxDist;
  }
  return delays;
}

const STAGGER_DELAYS = buildStaggerDelays();

// The stagger spreads over the animation: each=0.03s over 112 cells.
// Max stagger offset = (maxDistance / maxDistance) * 0.03 * (maxDistance in grid steps).
// In GSAP: stagger.each=0.03 means each "wave step" is 0.03s. With grid stagger the
// "steps" are the distinct distance bands. Max Euclidean dist from (0,0) in 8×14 grid
// is sqrt(7²+13²) ≈ 14.76 — so max delay ≈ 14.76 * 0.03 = 0.443s.
// We replicate by mapping normalised delay → 0..0.443s.
const EACH_S = 0.03; // source: staggerEach
const MAX_DIST_GRID = Math.sqrt((ROWS - 1) ** 2 + (COLS - 1) ** 2); // ≈ 14.76
const MAX_STAGGER_S = MAX_DIST_GRID * EACH_S; // ≈ 0.443s

// Phase timing (in seconds, matching GSAP source):
const ANIM_DUR_S = 0.4;   // source: duration: 0.4
const PHASE_DUR_S = 0.84; // source: PHASE_DUR = 0.84 (wall-clock per phase)

// Cell color matching CSS (.grid-transition-overlay > div):
//   color-mix(in srgb, var(--bg-stage) 70%, white 30%)
// Default falls back to the #3c6553 blend (≈ #6b9080) when no theme color is threaded.
const DEFAULT_CELL_COLOR = "color-mix(in srgb, #3c6553 70%, white 30%)";

interface GridOverlayProps {
  durationInFrames: number;
  fps: number;
  /** color-mix string built from the live theme's --bg-stage (matches the app cells). */
  fxColor?: string;
}

export const GridOverlay: React.FC<GridOverlayProps> = ({ durationInFrames, fps, fxColor }) => {
  const CELL_COLOR = fxColor || DEFAULT_CELL_COLOR;
  const frame = useCurrentFrame();
  const totalSecs = durationInFrames / fps;
  const currentSecs = frame / fps;

  // Split into show (first half) and hide (second half)
  const halfSecs = totalSecs / 2;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          gap: 0,
          overflow: "hidden",
        }}
      >
        {Array.from(STAGGER_DELAYS).map((normDelay, i) => {
          // Absolute stagger delay for this cell (seconds)
          const cellDelayS = normDelay * MAX_STAGGER_S;

          let scale: number;
          let transformOrigin: string;

          if (currentSecs <= halfSecs) {
            // ── SHOW PHASE: scale 0 → 1.05 ──
            // Cell animation starts at cellDelayS, runs for ANIM_DUR_S
            transformOrigin = "50% 0%"; // source: transformOrigin: "50% 0%"
            const localStart = cellDelayS;
            const localEnd = cellDelayS + ANIM_DUR_S;
            const t = Math.max(0, Math.min(1,
              (currentSecs - localStart) / (localEnd - localStart || 0.001)
            ));
            // power3.inOut ≈ Easing.inOut(Easing.cubic)
            const eased = Easing.inOut(Easing.cubic)(t);
            scale = interpolate(eased, [0, 1], [0, 1.05]);
          } else {
            // ── HIDE PHASE: scale 1.05 → 0 ──
            // Mirror timing relative to the start of the hide half
            transformOrigin = "50% 100%"; // source: transformOrigin: "50% 100%"
            const hideStart = halfSecs;
            const localStart = hideStart + cellDelayS;
            const localEnd = localStart + ANIM_DUR_S;
            const t = Math.max(0, Math.min(1,
              (currentSecs - localStart) / (localEnd - localStart || 0.001)
            ));
            // power2 (ease-in) ≈ Easing.in(Easing.quad)
            const eased = Easing.in(Easing.quad)(t);
            scale = interpolate(eased, [0, 1], [1.05, 0]);
          }

          return (
            <div
              key={i}
              style={{
                backgroundColor: CELL_COLOR,
                transform: `scale(${scale})`,
                transformOrigin,
                willChange: "transform",
                backfaceVisibility: "hidden",
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
