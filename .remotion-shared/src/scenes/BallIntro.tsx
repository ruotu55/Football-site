import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { SoccerBall } from "../components/SoccerBall";
import { type ResolvedBackground } from "../effects/AnimatedBackground";
import { DESIGN_HEIGHT, DESIGN_WIDTH, useDesignFrame } from "../timing";

const CX = DESIGN_WIDTH / 2;
const CY = DESIGN_HEIGHT / 2;

const MERGE_D = 150; // diameter of each merging ball at scale 1.0
const HANDOFF_SCALE = 1.6; // matches the runner: merge ends at 1.6x, ball continues
// Start offset of the 4 balls from center. Matched to the runner's ratio: it uses
// R=116 against a ~139px ball (radius/ball ≈ 0.83). With our 150px ball that's ~125,
// so the orbit sweeps at the same (slower) speed as the play video — not 2× faster.
const START_R = 125;
// Runner expands the ball to 3× the screen diagonal (diag*3) so it more than fills
// the frame at the end of the open.
const EXPAND_TARGET = Math.ceil(Math.hypot(DESIGN_WIDTH, DESIGN_HEIGHT) * 3);

// Timeline (design frames @30fps) — mapped from the runner's GSAP timings, shifted
// by HOLD so the balls appear 0.5s into the video (not at frame 0).
const HOLD = 15; // 0.5s @30fps before the 4 balls appear
const ORBIT_END = HOLD + 31;
const MOVE_START = HOLD + 13;
const MERGE_DONE = HOLD + 29;
const FINAL_START = HOLD + 19;

// Single merged ball then expands LINEARLY for 1.6s (matches the runner's GSAP
// `ease:"none"` expand). The reveal (iris) starts 0.3s into that expand and runs
// 1.3s — both end together at BALL_INTRO_FRAMES. See FootballQuizDemo IRIS_FRAMES.
const EXPAND_FRAMES = 48; // 1.6s @30fps
export const BALL_INTRO_FRAMES = MERGE_DONE + EXPAND_FRAMES;

// Each ball starts at top / right / bottom / left (runner: starts = [0,-R],[R,0],[0,R],[-R,0]).
const BASE_ANGLES = [-90, 0, 90, 180];

const backOut = Easing.bezier(0.34, 1.56, 0.64, 1); // ≈ gsap back.out(1.7)

export const BallIntro: React.FC<{ bg: ResolvedBackground }> = ({ bg }) => {
  const f = useDesignFrame();

  // Whole cluster orbits once (goo rotation 0 -> 360, power1.inOut).
  const orbit = interpolate(f, [HOLD, ORBIT_END], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  // Offset shrinks to 0 (power2.inOut).
  const radius = interpolate(f, [MOVE_START, MERGE_DONE], [START_R, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const clusterOpacity = interpolate(f, [MERGE_DONE - 1, MERGE_DONE + 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // The merged ball expands LINEARLY (ease "none") to 3× the screen diagonal, exactly
  // like the runner (ball._expandScale = diag*3 / width). No easing → constant speed.
  const single = interpolate(f, [MERGE_DONE, BALL_INTRO_FRAMES], [MERGE_D * HANDOFF_SCALE, EXPAND_TARGET], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* No cover here — the composition-level AnimatedBackground shows through,
          so the ball intro sits on the SAME continuous themed background as the
          levels (it never restarts). */}

      {/* 4 crisp soccer balls orbit inward and merge (NO blur — matches the runner) */}
      {f >= HOLD && clusterOpacity > 0 && (
        <AbsoluteFill style={{ opacity: clusterOpacity }}>
          {BASE_ANGLES.map((base, i) => {
            // scale-up with overshoot, then grow to HANDOFF_SCALE as it reaches center
            const appear = interpolate(
              f,
              [HOLD + i * 1.5, HOLD + i * 1.5 + 13],
              [0.2, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: backOut },
            );
            const finalScale = interpolate(f, [FINAL_START, MERGE_DONE], [1, HANDOFF_SCALE], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.in(Easing.cubic),
            });
            const scale = appear * finalScale;
            const a = ((base + orbit) * Math.PI) / 180;
            const x = CX + radius * Math.cos(a);
            const y = CY + radius * Math.sin(a);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                }}
              >
                <SoccerBall diameter={MERGE_D} />
              </div>
            );
          })}
        </AbsoluteFill>
      )}

      {/* Single ball that forms at the handoff, then expands to fill the screen */}
      {f >= MERGE_DONE - 1 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            transform: "translate(-50%, -50%)",
          }}
        >
          <SoccerBall diameter={single} />
        </div>
      )}
    </AbsoluteFill>
  );
};
