import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { DESIGN_FPS, useDesignFrame } from "../timing";

const BADGE_GREEN = "#37a84d"; // green "+" circle + "BONUS" in the ticket badge
const NOTCH_COLOR = "#33564a"; // approximates the page bg behind the badge

export const Intro: React.FC = () => {
  const frame = useDesignFrame();

  // The quiz type is ALREADY fully present — the opening ball (iris transition)
  // reveals the finished title, exactly like the runner's "Play video" landing.
  // So everything renders at its final state; no per-element entrance.
  const logoScale = 1;
  const watermarkOpacity = 0.13;
  const title1 = { opacity: 1, y: 0 };
  const title2 = { opacity: 1, y: 0 };
  const subtitle = { opacity: 1, y: 0 };
  const chip = { opacity: 1, y: 0 };

  // Whole title block breathes gently (continuous, present in the runner too).
  const float = Math.sin((frame / DESIGN_FPS) * 1.4) * 8;

  return (
    <AbsoluteFill>
      {/* Logo — top right */}
      <Img
        src={staticFile("brand/logo.png")}
        style={{
          position: "absolute",
          top: 36,
          right: 56,
          width: 230,
          height: 230,
          objectFit: "contain",
          transform: `scale(${logoScale})`,
          transformOrigin: "top right",
          filter: "drop-shadow(0 12px 26px rgba(0,0,0,0.5))",
        }}
      />

      {/* Vertical "ULTIMATE FOOTBALL QUIZ" watermark — left middle */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            transform: "rotate(-90deg)",
            fontFamily,
            fontWeight: 800,
            fontSize: 52,
            letterSpacing: 12,
            color: COLORS.white,
            opacity: watermarkOpacity,
            whiteSpace: "nowrap",
            textTransform: "uppercase",
          }}
        >
          Ultimate Football Quiz
        </div>
      </div>

      {/* Center title block */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${float}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {/* Title — all white, bigger */}
          <h1
            style={{
              margin: 0,
              fontFamily,
              fontWeight: 800,
              textAlign: "center",
              lineHeight: 0.92,
              letterSpacing: 1,
              color: COLORS.white,
              textShadow: "0 8px 26px rgba(0,0,0,0.8)",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 132,
                opacity: title1.opacity,
                transform: `translateY(${title1.y}px)`,
              }}
            >
              Guess The Football
            </span>
            <span
              style={{
                display: "block",
                fontSize: 168,
                opacity: title2.opacity,
                transform: `translateY(${title2.y}px)`,
              }}
            >
              Team Name
            </span>
          </h1>

          {/* Subtitle — red */}
          <div
            style={{
              fontFamily,
              fontWeight: 800,
              fontSize: 66,
              letterSpacing: 6,
              color: COLORS.red,
              textShadow: "0 5px 16px rgba(0,0,0,0.6)",
              opacity: subtitle.opacity,
              transform: `translateY(${subtitle.y}px)`,
              marginTop: 22,
            }}
          >
            2025/6 SEASON
          </div>

          {/* Questions ticket badge */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 26,
              marginTop: 40,
              padding: "20px 44px",
              borderRadius: 22,
              background: "#161d18",
              boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
              opacity: chip.opacity,
              transform: `translateY(${chip.y}px)`,
              fontFamily,
            }}
          >
            <span style={{ fontSize: 92, fontWeight: 800, color: COLORS.white }}>
              30
            </span>

            {/* Perforated ticket divider */}
            <div style={{ position: "relative", alignSelf: "stretch", width: 2 }}>
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  bottom: 6,
                  left: 0,
                  borderLeft: "3px dashed rgba(255,255,255,0.45)",
                }}
              />
              {/* top + bottom notches cut out of the badge edge */}
              <div
                style={{
                  position: "absolute",
                  top: -34,
                  left: -13,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: NOTCH_COLOR,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -34,
                  left: -13,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: NOTCH_COLOR,
                }}
              />
            </div>

            <span style={{ fontSize: 58, fontWeight: 800, color: COLORS.white }}>
              QUESTIONS
            </span>

            {/* Green "+" circle */}
            <span
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: BADGE_GREEN,
                color: COLORS.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 52,
                fontWeight: 800,
                lineHeight: 1,
                paddingBottom: 4,
                boxSizing: "border-box",
              }}
            >
              +
            </span>

            <span
              style={{ fontSize: 58, fontWeight: 800, color: BADGE_GREEN }}
            >
              BONUS
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
