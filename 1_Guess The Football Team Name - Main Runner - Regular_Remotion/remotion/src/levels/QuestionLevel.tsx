import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { RemotionLevel } from "../props";
import type { QuestionCues } from "../timeline";
import { msToFrames } from "../timeline";
import { Pitch } from "../pitch/Pitch";

interface QuestionLevelProps {
  level: RemotionLevel;
  /** 0-based question index (p.index from the timeline phase) */
  questionIndex: number;
  cues?: QuestionCues;
  skipReveal?: boolean;
  localDurationInFrames: number;
  assetBase: string;
}

const INDICATOR: React.CSSProperties = {
  position: "absolute",
  top: 32,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(0,0,0,0.55)",
  borderRadius: 14,
  padding: "10px 32px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  zIndex: 10,
  pointerEvents: "none",
};

export const QuestionLevel: React.FC<QuestionLevelProps> = ({
  level,
  questionIndex,
  cues,
  skipReveal,
  localDurationInFrames: _localDurationInFrames,
  assetBase,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const revealFrame = cues ? msToFrames(cues.revealMs, fps) : null;
  const isRevealed = !skipReveal && revealFrame !== null && frame >= revealFrame;
  const phase = skipReveal ? "COUNTDOWN (skip reveal)" : isRevealed ? "REVEAL" : "countdown…";

  const qLabel = `Q${questionIndex + 1}`;

  return (
    <AbsoluteFill>
      {/* Pitch (the visual centerpiece) */}
      <Pitch level={level} cues={skipReveal ? undefined : cues} assetBase={assetBase} />

      {/* Minimal dev indicator (keeps builds verifiable, unobtrusive) */}
      <div style={INDICATOR}>
        <span style={{ fontSize: 52, fontWeight: 900, color: "#e8b500", letterSpacing: 3 }}>
          {qLabel}: {level.teamName ?? "(no team)"}
        </span>
        <span
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: isRevealed ? "#6dffb0" : "rgba(255,255,255,0.75)",
          }}
        >
          {phase}
        </span>
        {revealFrame !== null && (
          <span style={{ fontSize: 22, color: "rgba(255,255,255,0.4)" }}>
            local frame: {frame} / reveal @ {revealFrame}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
