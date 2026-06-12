import React from "react";
import { Img, interpolate } from "remotion";
import { COLORS, fontFamily } from "@shared/theme";
import { EASE_FLIP, FLIP_DURATION } from "@shared/components/PlayerSlot";

const PANEL_WIDTH = 380;

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return { r: 36, g: 48, b: 62 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

// Runner 2 answer panel — the revealed answer is the NATIONAL TEAM, laid out like
// runner 1's club reveal: TEAM LOGO (main) → NAME → divider → COUNTRY FLAG.
// Teams without a logo file fall back to the old look (large flag on top).
// Slides in from the left over the SAME time + easing as the player flip.
export const NationalRevealPanel: React.FC<{
  frame: number;
  startFrame: number;
  colorTop: string;
  colorBottom: string;
  teamName: string;
  flagSrc: string | null;
  logoSrc: string | null;
}> = ({ frame, startFrame, colorTop, colorBottom, teamName, flagSrc, logoSrc }) => {
  const local = frame - startFrame;
  const slide = interpolate(local, [0, FLIP_DURATION], [0, 1], {
    easing: EASE_FLIP,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(slide, [0, 1], [-PANEL_WIDTH - 60, 0]);

  const top = hexToRgb(colorTop);
  const bot = hexToRgb(colorBottom);
  const rgbaTop = (a: number) => `rgba(${top.r}, ${top.g}, ${top.b}, ${a})`;
  const rgbaBot = (a: number) => `rgba(${bot.r}, ${bot.g}, ${bot.b}, ${a})`;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: PANEL_WIDTH,
        transform: `translateX(${x}px)`,
        background: `linear-gradient(165deg, ${rgbaTop(0.44)} 0%, ${rgbaBot(0.46)} 62%, rgba(6,9,14,0.4) 100%)`,
        backdropFilter: "blur(24px) saturate(1.35)",
        WebkitBackdropFilter: "blur(24px) saturate(1.35)",
        borderRight: "1.5px solid rgba(255,255,255,0.22)",
        borderTopRightRadius: 36,
        borderBottomRightRadius: 36,
        boxShadow: "26px 0 70px rgba(0,0,0,0.5), inset 0 0 70px rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        overflow: "hidden",
      }}
    >
      {/* top sheen + faint colour glow for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 26%), radial-gradient(120% 50% at 50% 0%, rgba(255,255,255,0.10), transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {logoSrc ? (
        <>
          {/* 1 — NATIONAL TEAM LOGO (main) */}
          <Img
            src={logoSrc}
            style={{
              width: 296,
              height: 296,
              objectFit: "contain",
              filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.55))",
              zIndex: 2,
            }}
          />

          {/* 2 — NATIONAL TEAM NAME */}
          <div
            style={{
              fontFamily,
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 0.96,
              color: COLORS.white,
              textAlign: "center",
              letterSpacing: 1,
              textTransform: "uppercase",
              textShadow: "0 4px 16px rgba(0,0,0,0.7)",
              marginTop: 28,
              zIndex: 2,
            }}
          >
            {teamName}
          </div>

          {/* divider */}
          <div
            style={{
              width: "58%",
              height: 2,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
              margin: "30px 0 24px",
              zIndex: 2,
            }}
          />

          {/* 3 — COUNTRY (flag) */}
          {flagSrc ? (
            <div
              style={{
                width: 232,
                height: 188,
                borderRadius: 18,
                overflow: "hidden",
                border: "3px solid rgba(255,255,255,0.88)",
                boxShadow: "0 12px 26px rgba(0,0,0,0.5)",
                zIndex: 2,
              }}
            >
              <Img src={flagSrc} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* Fallback (no logo file): large flag on top + name below */}
          {flagSrc ? (
            <div
              style={{
                width: 296,
                height: 216,
                borderRadius: 20,
                overflow: "hidden",
                border: "4px solid rgba(255,255,255,0.9)",
                boxShadow: "0 16px 32px rgba(0,0,0,0.55)",
                zIndex: 2,
              }}
            >
              <Img src={flagSrc} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ) : null}

          <div
            style={{
              width: "58%",
              height: 2,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
              margin: "34px 0 26px",
              zIndex: 2,
            }}
          />

          <div
            style={{
              fontFamily,
              fontWeight: 800,
              fontSize: 58,
              lineHeight: 0.96,
              color: COLORS.white,
              textAlign: "center",
              letterSpacing: 1,
              textTransform: "uppercase",
              textShadow: "0 4px 16px rgba(0,0,0,0.7)",
              zIndex: 2,
            }}
          >
            {teamName}
          </div>
        </>
      )}
    </div>
  );
};
