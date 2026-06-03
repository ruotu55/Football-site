import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
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
 * Renders the 11-player pitch with the EXACT CSS structure of the live app:
 *
 *  .pitch-wrap   — full-bleed flex centering with perspective:1200px
 *  .pitch-surface — the tilted green field:
 *      transform: rotateX(38deg) translateY(-11%) scale(1.0925)
 *      --pitch-plan-ratio: 1.28  (width/height)
 *      height: calc(118% * 1.5 / 1.28) of pitch-wrap's 65.34vh = ~90.4vh
 *  .pitch-svg    — SVG markings (viewBox "0 0 160 100", fill transparent,
 *                   stroke rgba(255,255,255,0.28) width 0.42) filling the surface
 *  .pitch-slots  — absolute-inset layer, preserve-3d
 *  .player-slot  — counter-rotated: translateZ(60px) rotateX(-38deg)
 *                   positioned by formation x%/y%
 *
 * Field background:
 *   In the app, .pitch-surface has NO background; the green comes from
 *   --bg-stage: #3c6553 (the stage color showing through the transparent SVG).
 *   In Remotion the stage may be dark (#1a1a1a), so we explicitly set the
 *   pitch surface background to the app's canonical grass green:
 *   linear-gradient(180deg, #2d6a42 0%, #347a4c 50%, #2a5e3c 100%)
 *   (matches the app's --bg-stage #3c6553 visual; the SVG outer rect is
 *   fill="transparent" so the surface background shows directly through it).
 */

// Pitch-plan ratio from app variables.css
const PITCH_PLAN_RATIO = 1.28; // --pitch-plan-ratio

/**
 * Concrete pitch surface height at 2560×1440 (100vh = 1440px):
 *   pitch-wrap height = 65.34vh = 65.34% × 1440 = 940.9px
 *   pitch-surface height = calc(118% × 1.5 / 1.28) of 940.9px
 *     = (118/100 × 1.5 / 1.28) × 940.9
 *     = 1.383... × 940.9
 *     ≈ 1301px  → 90.35vh at 1440px
 *
 * We express everything as vh so it scales with the Remotion canvas height.
 */
const SURFACE_HEIGHT_VH = 90.35; // vh (≈ 65.34 × 1.383)

/**
 * Slot size mirrors .player-slot { width: calc(9.11% * 1.02 * 1.1) }
 * i.e. ~10.22% of the pitch surface width.
 * pitch-surface width = height × ratio = 90.35vh × 1.28 = 115.65vh
 * slot diameter = 10.22% × 115.65vh = 11.82vh
 */
const SLOT_DIAMETER_VH = 11.82; // vh

export const Pitch: React.FC<PitchProps> = ({ level, cues, assetBase }) => {
  const { fps } = useVideoConfig();

  if (!level) return null;

  const slots = level.slots;
  if (!slots || slots.length === 0) return null;

  const formation = getFormation(level.formationId);

  const flipStartFrame = cues ? msToFrames(cues.flipStartMs, fps) : 999999;
  const flipDurationFrames = cues ? msToFrames(cues.flipDurationMs, fps) : 47;

  const isNational = level.squadType === "national";

  // ── Styles ──────────────────────────────────────────────────────────────

  // .pitch-wrap — flex centering + perspective (mirrors app's .pitch-wrap)
  const pitchWrapStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    perspective: "1200px",
    // The app's pitch-wrap is height:65.34vh; an AbsoluteFill effectively
    // centres the surface vertically inside this full-bleed wrapper too.
  };

  // .pitch-surface — the tilted green field (mirrors app's .pitch-surface)
  const pitchSurfaceStyle: React.CSSProperties = {
    position: "relative",
    height: `${SURFACE_HEIGHT_VH}vh`,
    aspectRatio: `${PITCH_PLAN_RATIO} / 1`,
    maxWidth: "132vw",
    transformOrigin: "center center",
    transform: "rotateX(38deg) translateY(-11%) scale(1.0925)",
    transformStyle: "preserve-3d",
    borderRadius: "8px",
    boxShadow: "0 36px 90px rgba(0,0,0,0.85), 0 0 50px rgba(30,120,70,0.18)",
    // Explicit green background (app's --bg-stage #3c6553 shows through the
    // transparent SVG outer rect; we reproduce that here with a subtle gradient
    // matching the app's grass colour family).
    background: "linear-gradient(180deg, #2d6a42 0%, #347a4c 50%, #2a5e3c 100%)",
  };

  // .pitch-svg — fills the surface, exact app markings
  const pitchSvgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
    borderRadius: "4px",
    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.22))",
  };

  // .pitch-slots — absolute inset, preserve-3d
  const pitchSlotsStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transformStyle: "preserve-3d",
    pointerEvents: "none",
  };

  return (
    <AbsoluteFill style={pitchWrapStyle}>
      {/* ── Pitch surface (tilted green field) ───────────────────────── */}
      <div style={pitchSurfaceStyle}>

        {/* ── SVG markings (exact copy of html/pitch.html) ─────────── */}
        {/*
          viewBox="0 0 160 100" preserveAspectRatio="none"
          Outer rect fill="transparent" stroke="rgba(232,244,255,0.28)"
          Lines group stroke="rgba(255,255,255,0.28)" strokeWidth="0.42"
        */}
        <svg
          style={pitchSvgStyle}
          viewBox="0 0 160 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="0" y="0" width="160" height="100"
            fill="transparent"
            stroke="rgba(232,244,255,0.28)"
            strokeWidth="0.45"
          />
          <g
            className="pitch-lines"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.42"
            strokeLinecap="square"
            strokeLinejoin="miter"
          >
            {/* Halfway line */}
            <line x1="0" y1="50" x2="160" y2="50" />
            {/* Centre ellipse */}
            <ellipse cx="80" cy="50" rx="21.529" ry="8.714" />
            {/* Attack penalty area */}
            <rect x="32.565" y="0" width="94.871" height="20.5" />
            {/* Attack goal area */}
            <rect x="58.435" y="0" width="43.13" height="6.6" />
            {/* Attack penalty arc (D mark) */}
            <path d="M 73.038 20.5 A 8.71 8.71 0 0 0 86.962 20.5" />
            {/* GK penalty area */}
            <rect x="32.565" y="79.5" width="94.871" height="20.5" />
            {/* GK goal area */}
            <rect x="58.435" y="93.4" width="43.13" height="6.6" />
            {/* GK penalty arc (D mark) */}
            <path d="M 73.038 79.5 A 8.71 8.71 0 0 1 86.962 79.5" />
            {/* Corner arcs */}
            <path d="M 0 0.952 A 2.353 0.952 0 0 1 2.353 0" />
            <path d="M 160 0.952 A 2.353 0.952 0 0 0 157.647 0" />
            <path d="M 0 99.048 A 2.353 0.952 0 0 0 2.353 100" />
            <path d="M 160 99.048 A 2.353 0.952 0 0 1 157.647 100" />
          </g>
          <g className="pitch-marks" fill="rgba(255,255,255,0.28)">
            {/* Centre spot */}
            <circle cx="80" cy="50" r="0.55" />
            {/* Penalty spots */}
            <circle cx="80" cy="13.5" r="0.42" />
            <circle cx="80" cy="86.5" r="0.42" />
          </g>
        </svg>

        {/* ── Player slots layer ───────────────────────────────────── */}
        <div style={pitchSlotsStyle}>
          {slots.map((slot, i) => {
            const formationSlot = formation.slots[i];
            if (!formationSlot) return null;

            const frontScale = isNational
              ? (level.slotTeamLogoScales?.[i] ?? 1)
              : (level.slotFlagScales?.[i] ?? 1);

            return (
              <PlayerSlot
                key={i}
                slot={slot}
                xPct={formationSlot.x}
                yPct={formationSlot.y}
                slotDiameterVh={SLOT_DIAMETER_VH}
                frontScale={frontScale}
                flipStartFrame={flipStartFrame}
                flipDurationFrames={flipDurationFrames}
                assetBase={assetBase}
                displayMode={level.displayMode}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
