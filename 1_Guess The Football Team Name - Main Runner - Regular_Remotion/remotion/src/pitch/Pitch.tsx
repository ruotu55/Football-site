import React from "react";
import { useVideoConfig } from "remotion";
import type { RemotionLevel } from "../props";
import type { QuestionCues } from "../timeline";
import { msToFrames } from "../timeline";
import { getFormation } from "./formations";
import { PlayerSlot } from "./PlayerSlot";

interface PitchProps {
  level: RemotionLevel;
  cues?: QuestionCues;
  assetBase: string;
}

/**
 * Renders the 11-player pitch for a question level.
 * Absolutely fills its parent (the Sequence frame).
 *
 * FIX 2 — GK clip + pitch inset:
 *   The app uses .pitch-surface with transform: rotateX(38deg) translateY(-11%) scale(1.0925)
 *   on a pitch-wrap of ~65vh height. The slot coordinates y=0..100 map to top..GK.
 *   In Remotion's flat layout we use a pitch rect that is inset from the canvas
 *   so GK at y=100 never clips off-screen:
 *     pitchTop    = 8% of canvas height  (80px at 1440px)
 *     pitchBottom = 92% of canvas height (no clip for GK badge)
 *     pitchLeft   = left edge of content area (right of team header panel)
 *     pitchRight  = right edge
 *
 * FIX 4 — Pitch art:
 *   The app's .pitch-surface uses a CSS box with a green background and SVG
 *   pitch markings (via pitch.svg or inline SVG drawn in js/pitch.js).
 *   We replicate a convincing football-pitch look using SVG:
 *   - Dark-to-mid green grass gradient
 *   - Alternating horizontal mow stripes
 *   - Full pitch markings: outer boundary, halfway line, centre circle+spot,
 *     penalty boxes, goal boxes, penalty spots, corner arcs
 *   The pitch is oriented with attack end at top (y=0) and GK at bottom (y=100).
 */

// Canvas dimensions (pixels at 2560×1440)
const CANVAS_W = 2560;
const CANVAS_H = 1440;

// Panel geometry (must match TeamHeader.tsx)
const PANEL_LEFT = Math.round(0.053 * CANVAS_W);   // 136px
const PANEL_WIDTH = Math.min(Math.round(0.1635 * CANVAS_W), Math.round(14.4 * 16)); // 230px

// Pitch drawing rect — inset from canvas edges to prevent slot clipping
// Left side: leave room for the team header panel + a small gutter
// Top/bottom: pad so GK slot badge (diameter ~110px) doesn't clip
const PITCH_LEFT   = PANEL_LEFT + PANEL_WIDTH;     // ~366px (right of header band)
const PITCH_RIGHT  = CANVAS_W - 20;                // 2540px
// Top/bottom inset: slot badge at y=100 has diameter ~222px (half=111px).
// Below the badge, the name label adds ~55px (font~37px × 1.4 + 4px gap).
// So total reach below GK centre: 111 + 55 = 166px.
// PITCH_BOTTOM + 166 must be ≤ CANVAS_H (1440) → PITCH_BOTTOM ≤ 1274.
// Use 83% = 1195px: GK badge bottom = 1195+111=1306; label bottom = 1306+55=1361 < 1440. ✓
// Also top: y=0 (fwd) slot top edge = PITCH_TOP - 111. Use 9% = 130px → 130-111=19px ≥ 0. ✓
const PITCH_TOP    = Math.round(0.09 * CANVAS_H);  // 130px top inset
const PITCH_BOTTOM = Math.round(0.83 * CANVAS_H);  // 1195px bottom inset (GK + label fully visible)

const PITCH_W = PITCH_RIGHT - PITCH_LEFT;
const PITCH_H = PITCH_BOTTOM - PITCH_TOP;

/**
 * Map a formation x% (0–100) to canvas pixel x, within the pitch rect.
 * x=0 is left edge, x=100 is right edge.
 */
function slotX(x: number): number {
  return PITCH_LEFT + (x / 100) * PITCH_W;
}

/**
 * Map a formation y% (0–100) to canvas pixel y, within the pitch rect.
 * y=0 = attack end (top), y=100 = GK end (bottom).
 */
function slotY(y: number): number {
  return PITCH_TOP + (y / 100) * PITCH_H;
}

export const Pitch: React.FC<PitchProps> = ({ level, cues, assetBase }) => {
  const { fps, width, height } = useVideoConfig();

  const slots = level.slots;
  if (!slots || slots.length === 0) return null;

  const formation = getFormation(level.formationId);

  const flipStartFrame = cues ? msToFrames(cues.flipStartMs, fps) : 999999;
  const flipDurationFrames = cues ? msToFrames(cues.flipDurationMs, fps) : 47;

  const isNational = level.squadType === "national";

  // Scale the slot size to the current render resolution
  const scaleRatio = width / CANVAS_W;
  const pitchTopPx   = PITCH_TOP   * scaleRatio;
  const pitchLeftPx  = PITCH_LEFT  * scaleRatio;
  const pitchWidthPx = PITCH_W     * scaleRatio;
  const pitchHeightPx = PITCH_H    * scaleRatio;

  // SVG viewport: the pitch fills the area from PITCH_LEFT..PITCH_RIGHT, PITCH_TOP..PITCH_BOTTOM
  // We draw the SVG in a normalised 100×100 viewBox for clarity.
  // Penalty box: FIFA standard ~16.5m of 105m = 15.7% of length, width 40.3m of 68m = 59.3%
  const PB_W = 59.3; // percent of pitch width
  const PB_H = 15.7; // percent of pitch height
  const PB_LEFT  = (100 - PB_W) / 2;
  const PB_RIGHT = PB_LEFT + PB_W;
  // Goal area: ~5.5m of 105m = 5.2% length, width 18.3m of 68m = 26.9%
  const GA_W = 26.9;
  const GA_H = 5.2;
  const GA_LEFT  = (100 - GA_W) / 2;
  const GA_RIGHT = GA_LEFT + GA_W;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
      }}
    >
      {/* ── Pitch surface (SVG) ───────────────────────────────────────────── */}
      <svg
        style={{
          position: "absolute",
          left:   pitchLeftPx,
          top:    pitchTopPx,
          width:  pitchWidthPx,
          height: pitchHeightPx,
          overflow: "visible",
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Grass base gradient: slightly lighter at centre, darker near edges */}
          <linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#2d6a42" />
            <stop offset="50%"  stopColor="#347a4c" />
            <stop offset="100%" stopColor="#2a5e3c" />
          </linearGradient>

          {/* Mow-stripe pattern: alternating light/dark bands (horizontal) */}
          <pattern id="mowStripe" x="0" y="0" width="100" height="10" patternUnits="userSpaceOnUse">
            <rect x="0" y="0"  width="100" height="5"  fill="rgba(255,255,255,0.04)" />
            <rect x="0" y="5"  width="100" height="5"  fill="rgba(0,0,0,0.04)" />
          </pattern>

          {/* Drop shadow for the pitch rectangle */}
          <filter id="pitchShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="rgba(0,0,0,0.55)" />
          </filter>
        </defs>

        {/* Grass fill */}
        <rect x="0" y="0" width="100" height="100" fill="url(#grassGrad)" rx="0.5" filter="url(#pitchShadow)" />
        {/* Mow stripes overlay */}
        <rect x="0" y="0" width="100" height="100" fill="url(#mowStripe)" />

        {/* ── Pitch markings (white, semi-transparent so grass shows through) ── */}
        {/* Outer boundary */}
        <rect x="1.5" y="1.5" width="97" height="97" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.7" />

        {/* Halfway line */}
        <line x1="1.5" y1="50" x2="98.5" y2="50" stroke="rgba(255,255,255,0.85)" strokeWidth="0.55" />

        {/* Centre circle (r=9.15m / 34m half = 26.9% half-width, or ~9.15/52.5*50=8.7 radius) */}
        <circle cx="50" cy="50" r="9.15" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.55" />
        {/* Centre spot */}
        <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.9)" />

        {/* Penalty area — attack end (TOP, y=0..PB_H) */}
        <rect
          x={PB_LEFT} y={1.5}
          width={PB_W} height={PB_H}
          fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5"
        />
        {/* Goal area — attack end */}
        <rect
          x={GA_LEFT} y={1.5}
          width={GA_W} height={GA_H}
          fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.45"
        />
        {/* Penalty spot — attack end */}
        <circle cx="50" cy="11.5" r="0.7" fill="rgba(255,255,255,0.85)" />
        {/* Penalty arc — attack end (D mark) */}
        <path
          d={`M ${50 - 9.15 * Math.cos(Math.asin((PB_H - 11.5) / 9.15))} ${PB_H + 1.5}
              A 9.15 9.15 0 0 1 ${50 + 9.15 * Math.cos(Math.asin((PB_H - 11.5) / 9.15))} ${PB_H + 1.5}`}
          fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.45"
        />

        {/* Penalty area — GK end (BOTTOM, y=100-PB_H..100) */}
        <rect
          x={PB_LEFT} y={100 - 1.5 - PB_H}
          width={PB_W} height={PB_H}
          fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5"
        />
        {/* Goal area — GK end */}
        <rect
          x={GA_LEFT} y={100 - 1.5 - GA_H}
          width={GA_W} height={GA_H}
          fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.45"
        />
        {/* Penalty spot — GK end */}
        <circle cx="50" cy={100 - 11.5} r="0.7" fill="rgba(255,255,255,0.85)" />
        {/* Penalty arc — GK end */}
        <path
          d={`M ${50 - 9.15 * Math.cos(Math.asin((11.5 - (100 - PB_H - 1.5)) / 9.15))} ${100 - PB_H - 1.5}
              A 9.15 9.15 0 0 0 ${50 + 9.15 * Math.cos(Math.asin((11.5 - (100 - PB_H - 1.5)) / 9.15))} ${100 - PB_H - 1.5}`}
          fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.45"
        />

        {/* Corner arcs — 4 corners (r=1m / 105m * 100 ≈ 0.95) */}
        <path d="M 1.5 3.5 A 2 2 0 0 1 3.5 1.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.45" />
        <path d="M 96.5 1.5 A 2 2 0 0 1 98.5 3.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.45" />
        <path d="M 98.5 96.5 A 2 2 0 0 1 96.5 98.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.45" />
        <path d="M 3.5 98.5 A 2 2 0 0 1 1.5 96.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.45" />

        {/* Goal posts (top and bottom) */}
        <rect x="45" y="0"   width="10" height="1.5" fill="rgba(255,255,255,0.5)" />
        <rect x="45" y="98.5" width="10" height="1.5" fill="rgba(255,255,255,0.5)" />
      </svg>

      {/* ── Player slots ──────────────────────────────────────────────────── */}
      {/*
        Slots are absolutely placed at their pixel coordinates (already computed via
        slotX/slotY which map the formation's 0-100 percent coords into the pitch rect).
        We pass pixel x/y directly as left/top px to avoid double-scaling.
      */}
      {slots.map((slot, i) => {
        const formationSlot = formation.slots[i];
        if (!formationSlot) return null;

        const frontScale = isNational
          ? (level.slotTeamLogoScales?.[i] ?? 1)
          : (level.slotFlagScales?.[i] ?? 1);

        const pxX = slotX(formationSlot.x) * scaleRatio;
        const pxY = slotY(formationSlot.y) * scaleRatio;

        return (
          <PlayerSlot
            key={i}
            slot={slot}
            xPx={pxX}
            yPx={pxY}
            frontScale={frontScale}
            flipStartFrame={flipStartFrame}
            flipDurationFrames={flipDurationFrames}
            assetBase={assetBase}
            displayMode={level.displayMode}
          />
        );
      })}
    </div>
  );
};
