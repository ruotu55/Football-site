// Level orchestrator. Computes the reveal/timer state and drives the audio,
// then renders ONE of the 5 swappable templates (see ../templates). Each template
// owns its full visual layer (clues, silhouette, reveal, timer, badge, ambient
// objects); this file stays purely logic + sound so they can't drift.
import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import { EASE_FLIP, FLIP_DURATION } from "@shared/components/PlayerSlot";
import type { ResolvedLevel } from "../level-data";
import { REVEAL_START } from "../templates/common";
import { getTemplate, DEFAULT_TEMPLATE } from "../templates";
import audioManifest from "../generated/audio.json";

// Re-export so FootballQuizDemo keeps importing REVEAL_START from here.
export { REVEAL_START };

const T_START = 14; // timer starts counting after the level settles in

export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
  muteReveal?: boolean;
  template?: string;
}> = ({ level, levelNumber, language, muteReveal, template }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + FLIP_DURATION], [0, 1], {
    easing: EASE_FLIP,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  // countdown state
  const timerRemain = interpolate(frame, [T_START, REVEAL_START], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((REVEAL_START - Math.max(frame, T_START)) / DESIGN_FPS));

  const Template = getTemplate(template ?? DEFAULT_TEMPLATE);

  return (
    <AbsoluteFill>
      <Template
        level={level}
        levelNumber={levelNumber}
        language={language}
        frame={frame}
        revealProgress={revealProgress}
        uiOpacity={uiOpacity}
        secs={secs}
        timerRemain={timerRemain}
        photoSrc={sharedSrc(level.photoPath)}
        clubSrc={sharedSrc(level.clubCrestPath)}
        flagSrc={sharedSrc(level.countryFlagPath)}
      />

      {/* ── Audio (unchanged from the original Level) ─────────────────────────── */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
      {/* Bonus level (muteReveal): no flip stinger — the answer stays hidden. */}
      {muteReveal ? null : (
        <Sequence from={f(REVEAL_START)}>
          <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
        </Sequence>
      )}
      {!muteReveal && revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
