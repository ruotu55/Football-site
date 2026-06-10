import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS, useDesignFrame } from "../timing";

const popIn = (frame: number, delay: number, fps: number) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, mass: 0.7, stiffness: 130 },
    durationInFrames: 28,
  });

const Emoji: React.FC<{ src: string; pop: number }> = ({ src, pop }) => (
  <Img
    src={staticFile(src)}
    style={{
      width: 150,
      height: 150,
      objectFit: "contain",
      transform: `scale(${interpolate(pop, [0, 1], [0, 1])}) rotate(${interpolate(
        pop,
        [0, 1],
        [-25, 0],
      )}deg)`,
      opacity: interpolate(pop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
      filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.45))",
    }}
  />
);

export const Outro: React.FC = () => {
  const frame = useDesignFrame();

  const logoPop = popIn(frame, 0, DESIGN_FPS);
  const logoScale = interpolate(logoPop, [0, 1], [0.5, 1]);

  const like = popIn(frame, 10, DESIGN_FPS);
  const sub = popIn(frame, 16, DESIGN_FPS);
  const likeB = popIn(frame, 22, DESIGN_FPS);
  const subB = popIn(frame, 28, DESIGN_FPS);

  const titlePop = popIn(frame, 18, DESIGN_FPS);
  const titleOpacity = interpolate(titlePop, [0, 0.7], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(titlePop, [0, 1], [40, 0]);

  const float = Math.sin((frame / DESIGN_FPS) * 1.6) * 7;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          padding: "80px 0 90px",
        }}
      >
        {/* Top row: like + logo + subscribe */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 60,
            transform: `translateY(${float}px)`,
          }}
        >
          <Emoji src="brand/like.png" pop={like} />
          <Img
            src={staticFile("brand/logo.png")}
            style={{
              width: 360,
              height: 360,
              objectFit: "contain",
              transform: `scale(${logoScale})`,
              filter: "drop-shadow(0 16px 34px rgba(0,0,0,0.55))",
            }}
          />
          <Emoji src="brand/subscribe.png" pop={sub} />
        </div>

        {/* Center text */}
        <div
          style={{
            textAlign: "center",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily,
              fontWeight: 800,
              fontSize: 100,
              letterSpacing: 1,
              color: COLORS.white,
              textTransform: "uppercase",
              textShadow: "0 6px 20px rgba(0,0,0,0.8)",
            }}
          >
            Think You Know
            <br />
            The Answer?
          </h1>
          <h2
            style={{
              margin: "22px 0 0",
              fontFamily,
              fontWeight: 700,
              fontSize: 56,
              letterSpacing: 4,
              color: COLORS.red,
              textTransform: "uppercase",
              textShadow: "0 4px 14px rgba(0,0,0,0.7)",
            }}
          >
            Let Us Know In The Comments!
          </h2>
        </div>

        {/* Bottom row of emojis */}
        <div style={{ display: "flex", alignItems: "center", gap: 90 }}>
          <Emoji src="brand/like.png" pop={likeB} />
          <Emoji src="brand/subscribe.png" pop={subB} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
