import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { RemotionLevel } from "../props";
import type { QuestionCues } from "../timeline";
import { msToFrames } from "../timeline";

interface QuestionLevelProps {
  level: RemotionLevel;
  /** 0-based question index (p.index from the timeline phase) */
  questionIndex: number;
  cues?: QuestionCues;
  skipReveal?: boolean;
  localDurationInFrames: number;
}

const PANEL: React.CSSProperties = {
  background: "rgba(0,0,0,0.6)",
  borderRadius: 20,
  padding: "48px 80px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 20,
  maxWidth: 1200,
};

const SLOT_LIST: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 6,
  marginTop: 16,
  width: "100%",
};

export const QuestionLevel: React.FC<QuestionLevelProps> = ({
  level,
  questionIndex,
  cues,
  skipReveal,
  localDurationInFrames: _localDurationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const revealFrame = cues ? msToFrames(cues.revealMs, fps) : null;
  const isRevealed = !skipReveal && revealFrame !== null && frame >= revealFrame;
  const phase = skipReveal ? "COUNTDOWN (skip reveal)" : isRevealed ? "REVEAL" : "countdown…";

  const qLabel = `Q${questionIndex + 1}`;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={PANEL}>
        <span style={{ fontSize: 80, fontWeight: 900, color: "#e8b500", letterSpacing: 4 }}>
          {qLabel}: {level.teamName ?? "(no team)"}
        </span>
        <span
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: isRevealed ? "#6dffb0" : "rgba(255,255,255,0.75)",
            marginTop: 4,
          }}
        >
          {phase}
        </span>
        {revealFrame !== null && (
          <span style={{ fontSize: 30, color: "rgba(255,255,255,0.4)" }}>
            local frame: {frame} / reveal @ {revealFrame}
          </span>
        )}
        <div style={SLOT_LIST}>
          {(level.slots ?? []).map((slot, i) => (
            <span key={i} style={{ fontSize: 28, color: "rgba(255,255,255,0.7)" }}>
              {i + 1}. {slot.name}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
