import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { RemotionLevel } from "../props";
import type { QuestionCues } from "../timeline";
import { msToFrames } from "../timeline";
import { Pitch } from "../pitch/Pitch";
import { CountdownRing } from "../CountdownRing";
import { TeamHeader } from "../TeamHeader";

interface QuestionLevelProps {
  level: RemotionLevel;
  /** 0-based question index (p.index from the timeline phase) */
  questionIndex: number;
  cues?: QuestionCues;
  skipReveal?: boolean;
  localDurationInFrames: number;
  assetBase: string;
}

export const QuestionLevel: React.FC<QuestionLevelProps> = ({
  level,
  cues,
  skipReveal,
  localDurationInFrames: _localDurationInFrames,
  assetBase,
}) => {
  const { fps } = useVideoConfig();

  // Guard: level may be undefined when defaultProps has empty levels[] (Studio preview).
  if (!level) return null;

  // Reveal frame: when countdown ends. Null if skipReveal (bonus last question).
  const revealFrame = cues && !skipReveal ? msToFrames(cues.revealMs, fps) : null;

  return (
    <AbsoluteFill>
      {/* Pitch (the visual centerpiece — flags + player photos) */}
      <Pitch level={level} cues={skipReveal ? undefined : cues} assetBase={assetBase} />

      {/* Countdown ring: visible during countdown phase, hidden after reveal */}
      <CountdownRing />

      {/* Team header: slides in at reveal, not shown in skipReveal (bonus) mode */}
      {revealFrame !== null && (
        <TeamHeader
          level={level}
          assetBase={assetBase}
          visibleFromFrame={revealFrame}
        />
      )}
    </AbsoluteFill>
  );
};
