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
 * Each slot is a flip-card: front = nationality flag, back = player photo.
 */
export const Pitch: React.FC<PitchProps> = ({ level, cues, assetBase }) => {
  const { fps } = useVideoConfig();

  const slots = level.slots;
  if (!slots || slots.length === 0) return null;

  const formation = getFormation(level.formationId);

  // Flip timing: defaults to a far-future frame if no cues (never flips in countdown-only mode)
  const flipStartFrame = cues ? msToFrames(cues.flipStartMs, fps) : 999999;
  const flipDurationFrames = cues ? msToFrames(cues.flipDurationMs, fps) : 47; // 780ms @60fps

  const isNational = level.squadType === "national";

  // Subtle green pitch backdrop with center line/circle via SVG
  const pitchContainerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  // Pitch surface: the player slots live in a contained area that fills the whole frame.
  // The formation coordinates are % of this area.
  const pitchAreaStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  return (
    <div style={pitchContainerStyle}>
      {/* Subtle pitch art (will be replaced by real art in Phase 6.3) */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.12 }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Pitch outline */}
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="#ffffff" strokeWidth="0.5" />
        {/* Halfway line */}
        <line x1="2" y1="50" x2="98" y2="50" stroke="#ffffff" strokeWidth="0.4" />
        {/* Centre circle */}
        <circle cx="50" cy="50" r="12" fill="none" stroke="#ffffff" strokeWidth="0.4" />
        {/* Centre spot */}
        <circle cx="50" cy="50" r="0.7" fill="#ffffff" />
        {/* Penalty area (attack end — top) */}
        <rect x="22" y="2" width="56" height="20" fill="none" stroke="#ffffff" strokeWidth="0.3" />
        {/* Goal area (attack end — top) */}
        <rect x="36" y="2" width="28" height="8" fill="none" stroke="#ffffff" strokeWidth="0.3" />
        {/* Penalty area (GK end — bottom) */}
        <rect x="22" y="78" width="56" height="20" fill="none" stroke="#ffffff" strokeWidth="0.3" />
        {/* Goal area (GK end — bottom) */}
        <rect x="36" y="90" width="28" height="8" fill="none" stroke="#ffffff" strokeWidth="0.3" />
      </svg>

      {/* Player slots */}
      <div style={pitchAreaStyle}>
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
              x={formationSlot.x}
              y={formationSlot.y}
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
  );
};
