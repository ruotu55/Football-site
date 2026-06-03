import React from "react";
import { useCurrentFrame, interpolate, Easing, Img, useVideoConfig } from "remotion";
import { assetUrl } from "../assets";

export interface SlotData {
  name: string;
  frontRel: string;
  photoRel: string;
}

/**
 * Mirrors pitch-render.js `pitchLabelFromPlayerName`.
 * Returns the surname (or suffix including any lowercase prefix like "de", "van")
 * in upper-case. Single-part names are returned as-is (uppercased).
 */
function pitchLabelFromPlayerName(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return parts[0].toUpperCase();

  const prefixes = new Set([
    "van", "de", "der", "da", "di", "del", "la", "le",
    "von", "ten", "ter", "mac", "mc", "dos", "das", "do", "du", "el", "al",
  ]);

  let startIndex = parts.length - 1;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (prefixes.has(parts[i].toLowerCase())) {
      startIndex = i;
    } else {
      break;
    }
  }

  return parts.slice(startIndex).join(" ").toUpperCase();
}

/**
 * Mirrors pitch-render.js `fitSlotNameEl`.
 * Returns a font-size override (in px) for long labels, or null to use the base size.
 */
function fittedFontPx(label: string, baseFontPx: number): number {
  const len = label.trim().length;
  if (len >= 15) return Math.round(baseFontPx * (0.4 / 1.02));
  if (len >= 13) return Math.round(baseFontPx * (0.49 / 1.02));
  if (len >= 11) return Math.round(baseFontPx * (0.54 / 1.02));
  if (len >= 9)  return Math.round(baseFontPx * (0.64 / 1.02));
  return baseFontPx;
}

interface PlayerSlotProps {
  slot: SlotData;
  /** Absolute pixel x (centre of slot, already scaled to render resolution) */
  xPx: number;
  /** Absolute pixel y (centre of slot, already scaled to render resolution) */
  yPx: number;
  /** Scale multiplier for the front badge (flag/crest) */
  frontScale: number;
  /** Global frame at which the flip begins */
  flipStartFrame: number;
  /** Number of frames the flip animation takes */
  flipDurationFrames: number;
  assetBase: string;
  displayMode?: string;
}

/**
 * A single player slot rendered as an absolutely-positioned flip card.
 *
 * FIX 2+3 — Slot sizing:
 *   CSS source: .player-slot { width: calc(9.11% * 1.02 * 1.1) } = ~10.22% of pitch surface.
 *   The app's pitch surface fills most of the stage; slot diameter in the app
 *   ≈ 10.22% of pitch width. The Remotion pitch rect spans PITCH_W ≈ 2174px at 2560px wide.
 *   So slot diameter ≈ 0.1022 × 2174 ≈ 222px at full resolution.
 *   We scale proportionally: BASE_SLOT_PX = 222 at CANVAS_W=2560.
 *
 * The wrapper is centred at (xPx, yPx) via translate(-50%,-50%).
 * The .slot-inner div rotates Y from 0→180° at reveal.
 * Front face: nationality flag (circular badge).
 * Back face: player photo + name label.
 */

const CANVAS_W = 2560;
// Pitch rect (must match Pitch.tsx)
const REM = 16;
const PANEL_LEFT  = Math.round(0.053 * CANVAS_W);
const PANEL_WIDTH = Math.min(Math.round(0.1635 * CANVAS_W), Math.round(14.4 * REM));
const PITCH_LEFT  = PANEL_LEFT + PANEL_WIDTH;
const PITCH_RIGHT = CANVAS_W - 20;
const PITCH_W     = PITCH_RIGHT - PITCH_LEFT; // ~2174px at 2560

// slot diameter ≈ 10.22% of pitch width (matches CSS calc(9.11%*1.02*1.1))
const BASE_SLOT_PX = Math.round(0.1022 * PITCH_W); // ~222px at 2560

export const PlayerSlot: React.FC<PlayerSlotProps> = ({
  slot,
  xPx,
  yPx,
  frontScale,
  flipStartFrame,
  flipDurationFrames,
  assetBase,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  // Scale slot to current render resolution
  const scaleRatio = width / CANVAS_W;
  const slotSize = Math.round(BASE_SLOT_PX * scaleRatio);

  // Frame-driven rotateY: 0→180 over the flip window
  const rot = interpolate(
    frame,
    [flipStartFrame, flipStartFrame + flipDurationFrames],
    [0, 180],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    }
  );

  const frontUrl = assetUrl(slot.frontRel, assetBase);
  const backUrl  = assetUrl(slot.photoRel, assetBase);

  // Outer wrapper: centred at absolute pixel position (xPx, yPx)
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: xPx,
    top:  yPx,
    width:  slotSize,
    height: slotSize,
    transform: "translate(-50%, -50%)",
    perspective: 600,
  };

  // Inner rotating container — mirrors .slot-inner
  const innerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transform: `rotateY(${rot}deg)`,
    willChange: "transform",
  };

  // Shared face style — mirrors .slot-face
  const faceBase: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  // Front face
  const frontFaceStyle: React.CSSProperties = { ...faceBase, transform: "translateZ(0)" };
  // Back face pre-rotated 180° — mirrors .slot-back
  const backFaceStyle: React.CSSProperties  = { ...faceBase, transform: "rotateY(180deg) translateZ(0)" };

  // Badge circle (white disc + flag image inside) — mirrors .slot-avatar
  // --slot-ring: clamp(2px, 1.7%, 2.35px)
  const ringPx = Math.max(2, Math.min(slotSize * 0.017, 2.35));
  const avatarStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    padding: `${ringPx}px`,
    boxSizing: "border-box",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.28)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const flagImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    transform: `scale(${frontScale})`,
    transformOrigin: "center center",
  };

  // Photo frame
  const photoImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    objectPosition: "top center",
    backgroundColor: "#1a1a2e",
  };

  // Name label — fades in after reveal (rot > 90°)
  const nameOpacity = interpolate(rot, [80, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Derive the display label (surname / suffix), matching pitchLabelFromPlayerName
  const nameLabel = pitchLabelFromPlayerName(slot.name) || slot.name.toUpperCase();

  // Name badge — mirrors .slot-name
  // CSS: font-size: clamp(0.61rem, 0.92vw, 1.02rem) → max 1.02rem = 16.32px at design width.
  // Scale proportionally to render resolution (scaleRatio = width / CANVAS_W).
  const baseFontPx = Math.round(1.02 * REM * scaleRatio);
  const nameFontPx = fittedFontPx(nameLabel, baseFontPx);

  // CSS: width: 3.35rem; scale with render resolution.
  const nameBadgeW = Math.round(3.35 * REM * scaleRatio);

  const nameLabelStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    width: nameBadgeW,
    minWidth: nameBadgeW,
    maxWidth: nameBadgeW,
    height: Math.round(1.05 * REM * scaleRatio),
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    fontSize: nameFontPx,
    lineHeight: 1,
    fontWeight: 800,
    color: "#ffffff",
    backgroundColor: "#ef5350",
    borderRadius: 2,
    boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
    fontFamily: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: `0 ${Math.round(0.3 * REM * scaleRatio)}px`,
    textShadow: "-0.05em -0.05em 0 #000, 0.05em -0.05em 0 #000, -0.05em 0.05em 0 #000, 0.05em 0.05em 0 #000",
    opacity: nameOpacity,
    pointerEvents: "none",
  };

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        {/* Front face: flag badge */}
        <div style={frontFaceStyle}>
          <div style={avatarStyle}>
            <Img src={frontUrl} style={flagImgStyle} />
          </div>
        </div>

        {/* Back face: player photo */}
        <div style={backFaceStyle}>
          <div style={avatarStyle}>
            <Img src={backUrl} style={photoImgStyle} />
          </div>
        </div>
      </div>

      {/* Name label (outside flip card, fades in after reveal) */}
      <span style={nameLabelStyle}>{nameLabel}</span>
    </div>
  );
};
