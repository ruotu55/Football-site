import React from "react";
import { Img, interpolate } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { EASE_FLIP, FLIP_DURATION } from "./PlayerSlot";

const PANEL_WIDTH = 380;

// Parse a #rrggbb (or #rgb) hex into channels; falls back to a neutral slate.
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return { r: 36, g: 48, b: 62 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

// Frosted-glass answer panel, tinted with the level's own colour. Shows the three
// answer facts cleanly: LOGO (crest) → TEAM NAME → COUNTRY (flag + name).
export const RevealPanel: React.FC<{
  frame: number;
  startFrame: number;
  colorTop: string; // vivid background tone (top of the panel)
  colorBottom: string; // dark background base (bottom of the panel)
  teamName: string;
  crestSrc: string | null;
  flagSrc: string | null;
}> = ({ frame, startFrame, colorTop, colorBottom, teamName, crestSrc, flagSrc }) => {
  const local = frame - startFrame;

  // Slide in over the SAME duration + easing as the player flip → they finish together.
  const slide = interpolate(local, [0, FLIP_DURATION], [0, 1], {
    easing: EASE_FLIP,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(slide, [0, 1], [-PANEL_WIDTH - 60, 0]);

  // Content is fully visible from the very start — it slides IN with the panel
  // (no fade-in), so the crest/name/flag are already there as it moves across.
  const fade = 1;

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
        // Translucent frosted glass that mirrors the background gradient: vivid brand
        // tone at the top → dark base at the bottom (re-colours with the background).
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

      {/* 1 — LOGO (crest) */}
      {crestSrc ? (
        <Img
          src={crestSrc}
          style={{
            width: 296,
            height: 296,
            objectFit: "contain",
            opacity: fade,
            filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.55))",
            zIndex: 2,
          }}
        />
      ) : null}

      {/* 2 — TEAM NAME */}
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
          opacity: fade,
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
          opacity: fade,
          zIndex: 2,
        }}
      />

      {/* 3 — COUNTRY (flag, larger; no name) */}
      {flagSrc ? (
        <div
          style={{
            width: 232,
            height: 188,
            borderRadius: 18,
            overflow: "hidden",
            border: "3px solid rgba(255,255,255,0.88)",
            boxShadow: "0 12px 26px rgba(0,0,0,0.5)",
            opacity: fade,
            zIndex: 2,
          }}
        >
          <Img src={flagSrc} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      ) : null}
    </div>
  );
};
