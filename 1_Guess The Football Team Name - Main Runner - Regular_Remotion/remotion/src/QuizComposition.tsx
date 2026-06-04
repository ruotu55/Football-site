import React from "react";
import { AbsoluteFill, Sequence, Freeze, useCurrentFrame, useVideoConfig } from "remotion";
import type { RemotionProps } from "./props";
import type { Phase } from "./timeline";
import { buildTimeline, BALL_PRELOADER_MS, msToFrames } from "./timeline";
import { BackgroundTheme } from "./BackgroundTheme";
import { ProgressSteps } from "./ProgressSteps";
import { LandingLevel } from "./levels/LandingLevel";
import { QuestionLevel } from "./levels/QuestionLevel";
import { OutroLevel } from "./levels/OutroLevel";
import { TransitionOverlay } from "./transitions/TransitionOverlay";
import {
  transitionDurationMs,
  TRANSITION_SHOW_MS,
  TRANSITION_ANIM_MS,
} from "./transitions/transitionDurations";
import { AudioTimeline } from "./audio/AudioTimeline";
import { SideText } from "./SideText";
import { generateBgTheme, generateCompetitionBgTheme } from "./background/themeEngine";
import { BallPreloader } from "./BallPreloader";

/**
 * Frozen content shown UNDER a transition overlay. Switches on the transition-local frame:
 * the previous level (frozen at its final frame) during the cover window, then the next level
 * (frozen at frame 0 — its static pre-countdown state) during the reveal + pad window.
 *
 * Must NOT be wrapped in an inner <Sequence>: <Freeze> offsets by its enclosing Sequence's
 * relativeFrom, so an extra nested Sequence double-counts it and the frozen frame collapses to
 * 0 (the previous question would show flags + a full countdown ring instead of the revealed
 * photos). Reading the transition-local frame directly keeps a single relativeFrom.
 */
const TransitionContent: React.FC<{
  prevNode: React.ReactNode;
  nextNode: React.ReactNode;
  prevFreeze: number;
  showFrames: number;
}> = ({ prevNode, nextNode, prevFreeze, showFrames }) => {
  const f = useCurrentFrame(); // relative to the transition Sequence
  if (f < showFrames) {
    return <Freeze frame={prevFreeze}>{prevNode}</Freeze>;
  }
  return <Freeze frame={0}>{nextNode}</Freeze>;
};

export const QuizComposition: React.FC<RemotionProps> = (props) => {
  const { fps } = useVideoConfig();
  // Use outroVoiceMs injected by calculateMetadata (via props reconcile) so the
  // in-component timeline matches the metadata duration exactly.
  const tl = buildTimeline({
    questionCount: props.questionCount,
    fps,
    endingType: props.endingType,
    outroVoiceMs: props.outroVoiceMs ?? 0,
    rulesVoiceMs: props.voiceDurationsMs?.rules,
    transitionMs: transitionDurationMs(props.transitionEffect),
  });

  const outroLevel = props.levels[props.levels.length - 1];

  // Studio background controls: when backgroundColor is overridden (not "__captured__"),
  // regenerate the theme from the ported engine so the Studio dropdowns preview live.
  // Real renders leave it "__captured__" → keep the app-captured bgTheme.
  let effectiveBg = props.bgTheme;
  if (props.backgroundColor && props.backgroundColor !== "__captured__") {
    effectiveBg = props.backgroundColor.startsWith("comp-")
      ? generateCompetitionBgTheme(props.backgroundColor.slice(5))
      : generateBgTheme(
          props.backgroundColor,
          props.backgroundEffect ?? "youtube-thumbnails",
          props.backgroundOpacity ?? 3.5,
        );
  }

  // Transition cell/cloud color — color-mix(in srgb, var(--bg-stage) 70%, white 30%),
  // i.e. the app's --new-fx-color / grid cell color built from the live theme.
  const bgStage = effectiveBg?.bgStage;
  const fxColor = bgStage
    ? `color-mix(in srgb, ${bgStage} 70%, white 30%)`
    : undefined;

  /**
   * Build the on-screen content for a single (non-transition) phase, WITHOUT its wrapping
   * Sequence. Reused both for the live phase render and for the frozen snapshots shown
   * under a transition overlay (previous level during cover, next level during reveal).
   */
  function renderInner(p: Phase): React.ReactNode {
    if (p.kind === "landing") {
      const ballFrames = msToFrames(BALL_PRELOADER_MS, fps);
      return (
        <>
          <LandingLevel
            language={props.language}
            quizType={props.quizType ?? "club-by-nat"}
            questionCount={props.questionCount}
          />
          {p.hasBallPreloader && (
            <Sequence durationInFrames={ballFrames} name="ball-preloader">
              <AbsoluteFill style={{ zIndex: 10 }}>
                <BallPreloader
                  bgColor={effectiveBg?.bgStage ?? "#3c6553"}
                  hideAfterReveal={false}
                />
              </AbsoluteFill>
            </Sequence>
          )}
        </>
      );
    }
    if (p.kind === "question") {
      const qLevel = props.levels[2 + p.index];
      return qLevel ? (
        <>
          <ProgressSteps total={props.questionCount} current={p.index} />
          <QuestionLevel
            level={qLevel}
            questionIndex={p.index}
            cues={p.cues}
            skipReveal={!!p.skipReveal}
            localDurationInFrames={p.durationFrames}
            assetBase={props.assetBase}
            bgStage={bgStage}
          />
        </>
      ) : null;
    }
    if (p.kind === "outro") {
      return (
        <OutroLevel
          level={outroLevel}
          endingType={props.endingType}
          language={props.language}
          assetBase={props.assetBase}
        />
      );
    }
    return null;
  }

  // Window sizes for the transition (frames). The overlay animation spans cover+reveal;
  // the phase is longer by the 200ms pad, during which the revealed next level is shown.
  const showFrames = msToFrames(TRANSITION_SHOW_MS, fps);
  const animFrames = msToFrames(TRANSITION_ANIM_MS, fps);

  return (
    <AbsoluteFill>
      {/* Background — always the bottom layer (no zIndex override so it stays at 0) */}
      <BackgroundTheme bgTheme={effectiveBg} />

      {/* App-wide decorative side text — above all content, persists on every frame */}
      <SideText />

      {/* All quiz content sits above the background (zIndex 1 so body::before/::after at 0 don't cover it) */}
      <AbsoluteFill style={{ zIndex: 1 }}>
        {/* Audio layer — always-on, spans whole composition */}
        <AudioTimeline timeline={tl} props={props} />

        {tl.phases.map((p, i) => {
          const key = `${p.kind}-${p.index}-${i}`;

          if (p.kind === "transition") {
            // Reproduce the app's overlay model: previous level frozen under the COVER,
            // next level frozen under the REVEAL, overlay animating on top. The landing→
            // first-question transition is forced to Cloud Drift ("new-1"), exactly like
            // levels.js (isLandingToFirstQuiz); every other transition uses the selected effect.
            const prev = tl.phases[i - 1];
            const next = tl.phases[i + 1];
            const isLandingToFirstQuiz = prev?.kind === "landing";
            const effect = isLandingToFirstQuiz ? "new-1" : props.transitionEffect;
            const prevFreeze = prev ? Math.max(0, prev.durationFrames - 1) : 0;

            return (
              <Sequence
                key={key}
                from={p.startFrame}
                durationInFrames={p.durationFrames}
                name={`transition ${p.index} (${effect})`}
              >
                {/* Frozen prev (cover) → frozen next (reveal), always present under the overlay */}
                <AbsoluteFill style={{ zIndex: 1 }}>
                  <TransitionContent
                    prevNode={prev ? renderInner(prev) : null}
                    nextNode={next ? renderInner(next) : null}
                    prevFreeze={prevFreeze}
                    showFrames={showFrames}
                  />
                </AbsoluteFill>
                {/* Overlay animation (cover→reveal), on top of the frozen content */}
                <Sequence durationInFrames={animFrames} layout="none" name="trans-overlay">
                  <AbsoluteFill style={{ zIndex: 50 }}>
                    <TransitionOverlay
                      durationInFrames={animFrames}
                      effect={effect}
                      fxColor={fxColor}
                    />
                  </AbsoluteFill>
                </Sequence>
              </Sequence>
            );
          }

          return (
            <Sequence
              key={key}
              from={p.startFrame}
              durationInFrames={p.durationFrames}
              name={`${p.kind} ${p.index}`}
            >
              {renderInner(p)}
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
