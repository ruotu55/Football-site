import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { SoccerBall } from "../components/SoccerBall";
import {
  AnimatedBackground,
  type ResolvedBackground,
} from "../effects/AnimatedBackground";
import { DESIGN_HEIGHT, DESIGN_WIDTH, useDesignFrame } from "../timing";

const CX = DESIGN_WIDTH / 2;
const CY = DESIGN_HEIGHT / 2;

const MERGE_D = 150; // diameter of each merging ball at scale 1.0
const HANDOFF_SCALE = 1.6; // matches the runner: merge ends at 1.6x, ball continues
const START_R = 240; // start offset of the 4 balls from center

// Timeline (design frames @30fps) — mapped 1:1 from the runner's GSAP timings:
//  scale-up 0-0.42s, orbit 0-1.05s, move-to-center 0.45-0.97s, final-scale 0.63-0.97s.
const ORBIT_END = 31; // 1.05s
const MOVE_START = 13; // 0.45s
const MERGE_DONE = 29; // 0.97s
const FINAL_START = 19; // 0.63s
const EXPAND_END = 46; // ball has grown to fully cover the screen by here
// Diameter that more than covers a 1920x1080 frame (half-diagonal ≈ 1101 -> r ≥ 1101).
const FULL_COVER_D = 2900;

export const BALL_INTRO_FRAMES = 78;

// Each ball starts at top / right / bottom / left (runner: starts = [0,-R],[R,0],[0,R],[-R,0]).
const BASE_ANGLES = [-90, 0, 90, 180];

const backOut = Easing.bezier(0.34, 1.56, 0.64, 1); // ≈ gsap back.out(1.7)

export const BallIntro: React.FC<{ bg: ResolvedBackground }> = ({ bg }) => {
  const f = useDesignFrame();

  // Whole cluster orbits once (goo rotation 0 -> 360, power1.inOut).
  const orbit = interpolate(f, [0, ORBIT_END], [0, 360], {
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

  // The merged ball grows until it FILLS the whole screen (the ball itself is the
  // cover). Only after it covers everything does the iris open a hole through it,
  // so the ball opens all the way — no background visible around it.
  const single = interpolate(f, [MERGE_DONE, EXPAND_END], [MERGE_D * HANDOFF_SCALE, FULL_COVER_D], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Themed background behind the merging balls (visible only until the ball fills). */}
      <AnimatedBackground bg={bg} />

      {/* 4 crisp soccer balls orbit inward and merge (NO blur — matches the runner) */}
      {clusterOpacity > 0 && (
        <AbsoluteFill style={{ opacity: clusterOpacity }}>
          {BASE_ANGLES.map((base, i) => {
            // scale-up with overshoot, then grow to HANDOFF_SCALE as it reaches center
            const appear = interpolate(
              f,
              [i * 1.5, i * 1.5 + 13],
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
