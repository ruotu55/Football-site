import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";
import { assetUrl } from "../assets";
import { SafeImg } from "../SafeImg";

// Same font the app uses for the .slot-name badge. loadFont dedupes across components; we use
// the returned (resolved) family so the weight-800 face actually renders (not a fallback).
const { fontFamily: barlowFamily } = loadFont("normal", { weights: ["800"], subsets: ["latin"] });

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
 * .slot-mount (child of outer) gets the bob animation:
 *   @keyframes float-up-down { 0%,100%{translate3d(0,0,0)} 50%{translate3d(0,-12px,0)} }
 *   4s ease-in-out infinite, no stagger — all 11 bob in unison.
 *   In Remotion this is driven per-frame using cosine with BOB=18px (1.5x the app's
 *   12px to account for the canvas being ~1.5x the app viewport).
 *
 * The flip card (.slot-inner rotateY) stays INSIDE the slot-mount.
 * Front face: flag/crest badge.  Back face: player photo.
 * Name badge fades in after reveal, also upright (outside flip, inherits counter-rotation).
 */

const CANVAS_W = 2560;

// Bob animation constants — matches app's float-up-down keyframes
// App: 12px amplitude, 4s period. Canvas is ~1.5x app viewport → 18px.
const BOB_PX = 18;
const BOB_PERIOD_S = 4;

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
  const { fps, height } = useVideoConfig();
  // Lift toward the viewer must scale with resolution (same basis as the pitch perspective,
  // 1440px design height) so the 3D look is identical at any render size / in Studio.
  const zLiftPx = 60 * (height / 1440);

  // ── Bob animation (mirrors app's float-up-down 4s ease-in-out infinite) ──
  // t: seconds within the 4s period, cosine gives ease-in-out shape
  const t = (frame / fps) % BOB_PERIOD_S;
  const bobY = -BOB_PX * 0.5 * (1 - Math.cos((t / BOB_PERIOD_S) * 2 * Math.PI)); // 0 -> -18 -> 0

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
    transform: `translate(-50%, -50%) translateZ(${zLiftPx}px) rotateX(-38deg) scale(1)`,
    // FLAT (matches the app's .player-slot, which has no transform-style → default flat).
    // The counter-rotation still composes with the pitch's +38° (pitch-slots is preserve-3d),
    // so the slot faces the viewer; but children (the name badge especially) are FLATTENED
    // into that upright plane instead of receding in 3D — which previously clipped the badge
    // text. The flip card re-establishes its own preserve-3d below for the rotateY flip.
    transformStyle: "flat",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  /**
   * .slot-mount — child of the counter-rotated wrapper.
   * Carries the bob animation (translate Y). Since the parent is already
   * counter-rotated, this Y movement translates cleanly up/down on screen.
   * All slots share the same `frame` so they bob in unison (0 stagger).
   */
  const slotMountStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transform: `translate3d(0, ${bobY}px, 0)`,
    willChange: "transform",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    transformStyle: "preserve-3d",
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
   * The ::before gloss (linear-gradient overlay) is reproduced as an
   * absolutely-positioned div inside the avatar, above the image.
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

  /**
   * Scale-wrap for front flag: overflow:hidden + borderRadius so the scaled
   * image (1.15x) is clipped to the circle. Fills the padded inner area.
   * Mirrors the app's default flag badge zoom of scale(1.15).
   */
  const flagScaleWrapStyle: React.CSSProperties = {
    position: "absolute",
    inset: "1.7%", // same as avatar padding — the inner area after the white ring
    borderRadius: "50%",
    overflow: "hidden",
  };

  const flagImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    // frontScale from props (1.0 for club-by-nat flags) combined with the app's
    // default 1.15 badge zoom.
    transform: `scale(${frontScale * 1.15})`,
    transformOrigin: "center center",
    display: "block",
  };

  /**
   * Gloss overlay — mirrors .slot-avatar::before
   * linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 55%)
   * Absolutely positioned on top of the image, inside the avatar.
   */
  const glossStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 55%)",
    pointerEvents: "none",
    zIndex: 1,
  };

  const photoImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: "1.7%", // inner area after white ring
    borderRadius: "50%",
    width: "calc(100% - 3.4%)",
    height: "calc(100% - 3.4%)",
    objectFit: "cover",
    objectPosition: "top center",
    // WHITE — matches the app's .slot-avatar > * { background:#fff }. The player photos are
    // transparent cutouts, so their transparent areas must show white (bright circle), not a
    // dark fill (which read as "black/blurry" circles).
    backgroundColor: "#ffffff",
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
  // Name badge: SVG so the caps can be centred precisely via the text's `y` (HTML child
  // transform/position were dropped in this flattened-3D flex context; only SVG geometry moves
  // reliably). CONSTANT readable font for every name; rem scales with the render height (24px at
  // the 1440 design basis) → identical at any resolution / in Studio. Box WIDTH is derived from
  // the surname length with a generous per-char advance so the rounded red box always wraps the
  // text with even side space; box HEIGHT is generous so the text always sits inside.
  const remPx = 24 * (height / 1440);
  const badgeFontPx = 1.0 * remPx; // constant — same size for every name
  const sidePadPx = 0.5 * badgeFontPx; // side space
  const CHAR_ADV = 0.56; // Barlow Condensed 800 caps advance (em); generous so text never spills
  const labelLen = Math.max(1, nameLabel.length);
  const badgeWidthPx = labelLen * CHAR_ADV * badgeFontPx + 2 * sidePadPx;
  const badgeHeightPx = 1.4 * badgeFontPx; // room above/below so caps never touch the edges
  const radiusPx = 0.26 * badgeFontPx; // rounded, clean edges
  const strokePx = Math.max(0.6, badgeFontPx * 0.05);
  // dominant-baseline:central aligns the font em-centre to y; with this font the caps sit a bit
  // below the em-centre, so lift y to optically centre the caps in the box. Tuned against the
  // real render (0.378 sat the text a touch high → more red below than above).
  const baselineY = badgeHeightPx / 2 - 0.20 * badgeFontPx;

  const badgeWrapStyle: React.CSSProperties = {
    position: "absolute",
    top: `calc(100% + ${5 * (height / 1440)}px)`,
    left: "50%",
    transform: "translateX(-50%)",
    opacity: nameOpacity,
    pointerEvents: "none",
    filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4))",
    overflow: "visible",
    lineHeight: 0,
  };

  void CANVAS_W;

  return (
    <div style={wrapperStyle}>
      {/* .slot-mount — bob animation wrapper (child of counter-rotated outer) */}
      <div style={slotMountStyle}>
        <div style={innerStyle}>
          {/* Front face: flag / crest badge */}
          <div style={frontFaceStyle}>
            <div style={avatarStyle}>
              {/* Scale-wrap clips the 1.15x-zoomed flag to the circle */}
              <div style={flagScaleWrapStyle}>
                <SafeImg
                  src={frontUrl}
                  style={flagImgStyle}
                  fallback={<div style={{ ...flagImgStyle, backgroundColor: "rgba(255,255,255,0.15)" }} />}
                />
              </div>
              {/* Gloss overlay (mirrors ::before gradient) */}
              <div style={glossStyle} />
            </div>
          </div>

          {/* Back face: player photo */}
          <div style={backFaceStyle}>
            <div style={avatarStyle}>
              <SafeImg
                src={backUrl}
                style={photoImgStyle}
                fallback={
                  <div
                    style={{
                      ...photoImgStyle,
                      // App's no-photo look: light grey, not black.
                      background: "linear-gradient(165deg, #e8ecf0 0%, #cfd6de 55%, #c5ccd5 100%)",
                    }}
                  />
                }
              />
              {/* Gloss overlay on back face too */}
              <div style={glossStyle} />
            </div>
          </div>
        </div>
      </div>

      {/* Name badge (outside slot-mount; inherits counter-rotation from wrapper — stays upright) */}
      <svg
        style={badgeWrapStyle}
        width={badgeWidthPx}
        height={badgeHeightPx}
        viewBox={`0 0 ${badgeWidthPx} ${badgeHeightPx}`}
      >
        <rect x={0} y={0} width={badgeWidthPx} height={badgeHeightPx} rx={radiusPx} fill="#ef5350" />
        <text
          x={badgeWidthPx / 2}
          y={baselineY}
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily={`${barlowFamily}, "Barlow Condensed", "Arial Narrow", Arial, sans-serif`}
          fontWeight={800}
          fontSize={badgeFontPx}
          fill="#ffffff"
          stroke="#000000"
          strokeWidth={strokePx}
          paintOrder="stroke"
          style={{ letterSpacing: "0.05em" }}
        >
          {nameLabel}
        </text>
      </svg>
    </div>
  );
};
