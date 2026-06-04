/**
 * cloudDrift.tsx
 *
 * Frame-driven reproduction of the "new-1" Cloud Drift transition from js/transitions.js.
 * The app FORCES this effect on the landing→first-question transition (levels.js:378
 * `forceEffectId = isLandingToFirstQuiz ? "new-1" : null`), so it must render there to
 * match the play video — every other transition uses the user-selected effect (grid-overlay).
 *
 * Source (transitions.js new-1 + css .new1-*):
 *   - 14 clouds: 38vw square radial-gradient(circle, fx 0%→35%, transparent 70%), blur(14px),
 *     centred on screen. 1 back panel: full-screen fx color.
 *   - fx color = color-mix(in srgb, var(--bg-stage) 70%, white 30%)  (--new-fx-color)
 *   - NEW_DUR = 0.84s.
 *   - SHOW: clouds from { scale .35, x (i%2?-1:1)*(60+(i%7)*6)vw, y ((i*53)%90-45)vh, opacity 0 }
 *           to   { scale 1.7,  x (i%2?-1:1)*(22+(i%7)*4)vw, y ((i*19)%80-40)vh, opacity 1 }
 *           over NEW_DUR*0.5, stagger 0.025, ease power2.out.
 *           back: opacity 0→1 over NEW_DUR*0.35, ease power1.in, start NEW_DUR*0.45.
 *   - HIDE: whole overlay opacity 1→0 over NEW_DUR (power1.out).
 *
 * Timing model (matches the rest of the pipeline): the passed `durationInFrames` is the
 * overlay's cover+reveal window (TRANSITION_ANIM_MS). SHOW occupies the first half, HIDE the
 * second. The content swap happens at the midpoint (handled by QuizComposition freezing the
 * previous level under the cover and the next level under the reveal).
 */

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

const CANVAS_W = 2560;
const CANVAS_H = 1440;
const CLOUD_COUNT = 14;
const NEW_DUR = 0.84;

const vw = (v: number) => (v / 100) * CANVAS_W;
const vh = (v: number) => (v / 100) * CANVAS_H;

const CLOUD_SIZE = vw(38); // 38vw square

const DEFAULT_FX = "color-mix(in srgb, #3c6553 70%, white 30%)";

interface CloudDriftProps {
  /** Cover+reveal window in frames (TRANSITION_ANIM_MS). */
  durationInFrames: number;
  fps: number;
  /** color-mix string from the live theme's --bg-stage. */
  fxColor?: string;
}

export const CloudDrift: React.FC<CloudDriftProps> = ({ durationInFrames, fps, fxColor }) => {
  const frame = useCurrentFrame();
  const fx = fxColor || DEFAULT_FX;

  const totalSecs = durationInFrames / fps;
  const halfSecs = totalSecs / 2;
  const t = frame / fps;
  const inShow = t <= halfSecs;

  // ── HIDE: whole overlay fades out over NEW_DUR, starting at the midpoint ──
  const hideT = inShow
    ? 0
    : Math.max(0, Math.min(1, (t - halfSecs) / NEW_DUR));
  const overlayOpacity = inShow
    ? 1
    : interpolate(Easing.out(Easing.quad)(hideT), [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: overlayOpacity, overflow: "hidden" }}>
      {/* Back panel — solid fx, fades in during SHOW so the screen is fully covered at swap. */}
      <BackPanel fx={fx} show={inShow} showT={t} />

      {Array.from({ length: CLOUD_COUNT }).map((_, i) => {
        const sign = i % 2 ? -1 : 1;
        // SHOW start/end positions (vw / vh), per the GSAP fromTo.
        const xFrom = sign * (60 + (i % 7) * 6);
        const xTo = sign * (22 + (i % 7) * 4);
        const yFrom = ((i * 53) % 90) - 45;
        const yTo = ((i * 19) % 80) - 40;

        // Per-cloud staggered window inside SHOW: start i*0.025s, duration NEW_DUR*0.5.
        const start = i * 0.025;
        const dur = NEW_DUR * 0.5;
        const local = Math.max(0, Math.min(1, (t - start) / dur));
        const e = Easing.out(Easing.cubic)(local); // power2.out

        const x = interpolate(e, [0, 1], [vw(xFrom), vw(xTo)]);
        const y = interpolate(e, [0, 1], [vh(yFrom), vh(yTo)]);
        const scale = interpolate(e, [0, 1], [0.35, 1.7]);
        const opacity = interpolate(e, [0, 1], [0, 1]);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: CLOUD_SIZE,
              height: CLOUD_SIZE,
              marginLeft: -CLOUD_SIZE / 2,
              marginTop: -CLOUD_SIZE / 2,
              background: `radial-gradient(circle at 50% 50%, ${fx} 0%, ${fx} 35%, transparent 70%)`,
              filter: "blur(14px)",
              transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
              opacity,
              willChange: "transform, opacity",
              backfaceVisibility: "hidden",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const BackPanel: React.FC<{ fx: string; show: boolean; showT: number }> = ({ fx, show, showT }) => {
  // back: opacity 0→1 over NEW_DUR*0.35, ease power1.in, start NEW_DUR*0.45 (SHOW only).
  const start = NEW_DUR * 0.45;
  const dur = NEW_DUR * 0.35;
  const local = show ? Math.max(0, Math.min(1, (showT - start) / dur)) : 1;
  const opacity = show ? interpolate(Easing.in(Easing.quad)(local), [0, 1], [0, 1]) : 1;
  return (
    <AbsoluteFill style={{ background: fx, opacity }} />
  );
};
