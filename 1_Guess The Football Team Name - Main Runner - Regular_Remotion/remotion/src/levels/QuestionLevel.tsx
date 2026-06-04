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
  /** Resolved theme stage color, forwarded to the team-header panel tint. */
  bgStage?: string;
  /** Frames the level is mounted (live, bobbing) BEFORE its countdown starts — i.e. the
   *  transition pre-roll. The countdown, flip and header are all delayed by this; the bob
   *  runs from frame 0 so the circles are already moving when the transition reveals them.
   *  Default 0 (no preceding transition). */
  preRollFrames?: number;
}

export const QuestionLevel: React.FC<QuestionLevelProps> = ({
  level,
  cues,
  skipReveal,
  localDurationInFrames: _localDurationInFrames,
  assetBase,
  bgStage,
  preRollFrames = 0,
}) => {
  const { fps } = useVideoConfig();

  // Guard: level may be undefined when defaultProps has empty levels[] (Studio preview).
  if (!level) return null;

  // Reveal frame (countdown end), shifted by the pre-roll. Null if skipReveal (bonus).
  const revealFrame =
    cues && !skipReveal ? msToFrames(cues.revealMs, fps) + preRollFrames : null;

  return (
    <AbsoluteFill>
      {/* Pitch (the visual centerpiece — flags + player photos). frameOffset delays the
          flip past the pre-roll; the bob inside PlayerSlot runs continuously from frame 0. */}
      <Pitch
        level={level}
        cues={skipReveal ? undefined : cues}
        assetBase={assetBase}
        frameOffset={preRollFrames}
      />

      {/* Countdown ring: full during the pre-roll, drains once the countdown starts */}
      <CountdownRing startFrame={preRollFrames} />

      {/* Team header: slides in at reveal, not shown in skipReveal (bonus) mode */}
      {revealFrame !== null && (
        <TeamHeader
          level={level}
          assetBase={assetBase}
          visibleFromFrame={revealFrame}
          bgStage={bgStage}
        />
      )}
    </AbsoluteFill>
  );
};
