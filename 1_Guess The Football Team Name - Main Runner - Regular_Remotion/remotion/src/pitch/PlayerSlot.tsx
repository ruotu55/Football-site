import React from "react";
import { useCurrentFrame, interpolate, Easing, Img } from "remotion";
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
  /** Formation x percentage (0–100), left% within pitch surface */
  xPct: number;
  /** Formation y percentage (0–100), top% within pitch surface (y=100 = GK end) */
  yPct: number;
  /** Slot circle diameter in vh units (absolute on the rendered canvas) */
  slotDiameterVh: number;
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
 * A single player slot rendered as a perspective-3D flip card on the tilted pitch.
 *
 * Matches the app's .player-slot CSS:
 *   position: absolute
 *   left: <x>%; top: <y>%   — percentage within .pitch-surface
 *   width: calc(9.11% * 1.02 * 1.1); aspect-ratio: 1/1
 *   transform: translate(-50%,-50%) translateZ(60px) rotateX(-38deg) scale(1)
 *   transform-style: preserve-3d; backface-visibility: hidden
 *
 * The outer slot div uses left/top % (relative to pitch surface) + the
 * counter-rotation so circles stay round and upright despite the 38deg tilt.
 *
 * The flip card (.slot-inner) rotates Y 0→180 at reveal.
 * Front face: flag/crest badge.  Back face: player photo.
 * Name badge fades in after reveal, also upright (outside flip, inherits counter-rotation).
 */

const REM = 16; // 1rem in px (for font/badge sizing at 2560-wide canvas)
const CANVAS_W = 2560;

export const PlayerSlot: React.FC<PlayerSlotProps> = ({
  slot,
  xPct,
  yPct,
  slotDiameterVh,
  frontScale,
  flipStartFrame,
  flipDurationFrames,
  assetBase,
}) => {
  const frame = useCurrentFrame();

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

  const frontUrl = slot.frontRel ? assetUrl(slot.frontRel, assetBase) : "";
  const backUrl  = slot.photoRel ? assetUrl(slot.photoRel, assetBase) : "";

  /**
   * Outer slot wrapper:
   *   - position absolute within .pitch-slots (which fills .pitch-surface)
   *   - left/top = formation x%/y% → centred with translate(-50%,-50%)
   *   - counter-rotation: translateZ(60px) rotateX(-38deg) keeps the circle upright
   *   - transform-style preserve-3d propagates the flip card into 3D space
   *   - backface-visibility hidden prevents ghost frames
   *
   * Width/height expressed as a percentage of pitch-surface width
   * = slotDiameterVh / (surfaceHeightVh * pitchPlanRatio) × 100%
   * = 11.82 / (90.35 * 1.28) × 100% ≈ 10.22%
   * We keep this percentage so it scales naturally with the surface.
   */
  const slotWidthPct = (slotDiameterVh / (90.35 * 1.28)) * 100; // ≈ 10.22%

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: `${xPct}%`,
    top: `${yPct}%`,
    width: `${slotWidthPct}%`,
    aspectRatio: "1 / 1",
    // Centre the slot on its (x,y) position, lift off the surface, counter-rotate
    transform: "translate(-50%, -50%) translateZ(60px) rotateX(-38deg) scale(1)",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  // .slot-inner: flip card container
  const innerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    transform: `rotateY(${rot}deg)`,
    willChange: "transform",
  };

  // Shared face style — .slot-face
  const faceBase: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  // Front face (flag/badge)
  const frontFaceStyle: React.CSSProperties = { ...faceBase, transform: "translateZ(0)" };
  // Back face pre-rotated 180° — .slot-back
  const backFaceStyle: React.CSSProperties  = { ...faceBase, transform: "rotateY(180deg) translateZ(0)" };

  /**
   * Avatar circle (white ring + image inside) — mirrors .slot-avatar
   * --slot-ring: clamp(2px, 1.7%, 2.35px)
   * Ring is 1.7% of slot width; we use the same % on the padding.
   */
  const avatarStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    padding: "1.7%",
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

  // Name label fades in after the flip passes 90°
  const nameOpacity = interpolate(rot, [80, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const nameLabel = pitchLabelFromPlayerName(slot.name) || slot.name.toUpperCase();

  /**
   * Name badge — mirrors .slot-name
   * font-size: clamp(0.61rem, 0.92vw, 1.02rem) → max 1.02rem
   * We approximate at CANVAS_W=2560 basis; 0.92vw of 2560 = 23.6px vs max 1.02rem=16.3px
   * so at 2560 we hit the cap: 1.02rem = 16.32px.
   * But our slot is % of surface, not px, so we use % of slot size for the font too.
   * 1.02rem / BASE_SLOT (222px at CANVAS_W=2560, or ~10.22% of surface width of ~2174px)
   * = 16.32 / 222 ≈ 7.35% of slot size.
   * We express font-size as a % of the slot container via CSS calc trick:
   * Use the width % unit with vw scaling. Since slot size in px =
   * slotWidthPct% of surface width = ~10.22% × surfaceWidth, and
   * surfaceWidth ≈ 90.35vh × 1.28, font ~7.35% of slotSize = 7.35% × 10.22% × surfaceW.
   * SIMPLEST: use a clamped vw/vh value that matches at 2560×1440.
   * At 1440 canvas height: slotDiameterVh = 11.82vh = 170px → font = 7.35%×170 = 12.5px.
   * 12.5 / 1440 = 0.868vh. We use `0.87vh`.
   * Badge width mirrors .slot-name { width: 3.35rem } = 3.35×16 / 222 × slotSize ≈ 24.1%.
   * Badge height mirrors .slot-name { height: 1.05rem } = 1.05×16 / 222 × slotSize ≈ 7.57%.
   */
  const slotSizePx = (slotDiameterVh / 100) * 1440; // px at 1440 canvas height
  const baseFontPx = Math.round(1.02 * REM * (slotSizePx / (0.1022 * 2560 * (1440 / 1440))));
  // Simpler: font-size = 1.02rem relative to CANVAS_W=2560 design, scaled by slotSize/BASE_SLOT
  // BASE_SLOT at 2560 canvas = 0.1022 × (2560 - 366) * (2560/2560) ... let's just use vh directly.
  const fontPxAtCanvas = 0.87 * 14.4; // 0.87vh at 1440px canvas height = 12.5px
  const fittedFontPxVal = fittedFontPx(nameLabel, Math.round(fontPxAtCanvas));

  // Badge width: 3.35rem / 222px × slotSize = ~24.1% of slot width
  const badgeWidthPct = (3.35 * 16) / (0.1022 * 1440 * 1.28) * 100; // small enough

  const nameLabelStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    // Use vw-relative for width to stay consistent with app's rem sizing
    width: "24.1%",
    minWidth: "24.1%",
    maxWidth: "24.1%",
    height: "7.57%",
    minHeight: "7.57%",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    fontSize: `${fittedFontPxVal}px`,
    lineHeight: 1,
    fontWeight: 800,
    color: "#ffffff",
    backgroundColor: "#ef5350",
    borderRadius: "2px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
    fontFamily: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "0 4%",
    textShadow: "-0.05em -0.05em 0 #000, 0.05em -0.05em 0 #000, -0.05em 0.05em 0 #000, 0.05em 0.05em 0 #000",
    opacity: nameOpacity,
    pointerEvents: "none",
  };

  // Suppress TS warnings for unused variables from old API
  void CANVAS_W;
  void baseFontPx;
  void badgeWidthPct;
  void slotSizePx;

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        {/* Front face: flag / crest badge */}
        <div style={frontFaceStyle}>
          <div style={avatarStyle}>
            {frontUrl ? (
              <Img src={frontUrl} style={flagImgStyle} />
            ) : (
              <div style={{ ...flagImgStyle, backgroundColor: "rgba(255,255,255,0.15)" }} />
            )}
          </div>
        </div>

        {/* Back face: player photo */}
        <div style={backFaceStyle}>
          <div style={avatarStyle}>
            {backUrl ? (
              <Img src={backUrl} style={photoImgStyle} />
            ) : (
              <div style={{ ...photoImgStyle, backgroundColor: "#1a1a2e" }} />
            )}
          </div>
        </div>
      </div>

      {/* Name badge (outside flip card; inherits counter-rotation from wrapper — stays upright) */}
      <span style={nameLabelStyle}>{nameLabel}</span>
    </div>
  );
};
