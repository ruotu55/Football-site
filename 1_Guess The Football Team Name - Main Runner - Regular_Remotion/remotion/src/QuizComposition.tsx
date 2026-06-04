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
 * A node frozen at `freeze` and shown only during the cover OR the reveal window of a
 * transition (selected by `window`), gated on the transition-local frame.
 *
 * Must NOT be wrapped in an inner <Sequence>: <Freeze> offsets by its enclosing Sequence's
 * relativeFrom, so an extra nested Sequence double-counts it and the frozen frame collapses
 * to 0. Reading the transition-local frame directly keeps a single relativeFrom.
 *
 * Used for the previous level during the cover (frozen at its final/revealed frame) and for
 * the outro during its reveal (questions are revealed LIVE instead — see RevealGate).
 */
const TransitionFrozen: React.FC<{
  node: React.ReactNode;
  freeze: number;
  window: "cover" | "reveal";
  showFrames: number;
}> = ({ node, freeze, window, showFrames }) => {
  const f = useCurrentFrame();
  const inCover = f < showFrames;
  if (window === "cover" && !inCover) return null;
  if (window === "reveal" && inCover) return null;
  return <Freeze frame={freeze}>{node}</Freeze>;
};

/**
 * Keeps children MOUNTED (so the bob keeps advancing and images decode) but invisible until
 * the local frame reaches `fromFrame`. A question level is mounted at the start of its
 * preceding transition's COVER, runs hidden behind the cover (bobbing, flags decoding), and
 * is uncovered exactly at the cover→reveal midpoint — so when the overlay reveals it the
 * circles are already moving and the flags are already drawn (no "blank → flag" pop, no bob
 * starting from rest). A hard opacity switch is invisible because the overlay fully covers
 * the screen at that instant.
 */
const RevealGate: React.FC<{ fromFrame: number; children: React.ReactNode }> = ({
  fromFrame,
  children,
}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: f >= fromFrame ? 1 : 0 }}>{children}</AbsoluteFill>
  );
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
   * Sequence. `preRollFrames` is forwarded to question levels so their countdown/flip/header
   * are delayed (the bob still runs from frame 0). Reused for the live phase render and for
   * the frozen snapshots shown under a transition overlay.
   */
  function renderInner(p: Phase, preRollFrames = 0): React.ReactNode {
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
            preRollFrames={preRollFrames}
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
            // App overlay model: previous level frozen under the COVER, overlay animating on
            // top, then the next level REVEALED. The landing→first-question transition is
            // forced to Cloud Drift ("new-1") like levels.js (isLandingToFirstQuiz); the rest
            // use the selected effect. A question NEXT is revealed live (its own Sequence
            // starts under this cover — see the question branch); only a non-question next
            // (the outro) is shown frozen during the reveal.
            const prev = tl.phases[i - 1];
            const next = tl.phases[i + 1];
            const isLandingToFirstQuiz = prev?.kind === "landing";
            const effect = isLandingToFirstQuiz ? "new-1" : props.transitionEffect;
            const prevFreeze = prev ? Math.max(0, prev.durationFrames - 1) : 0;
            const nextIsQuestion = next?.kind === "question";

            return (
              <Sequence
                key={key}
                from={p.startFrame}
                durationInFrames={p.durationFrames}
                name={`transition ${p.index} (${effect})`}
              >
                {/* Previous level frozen at its final (revealed) frame, during the cover */}
                {prev && (
                  <AbsoluteFill style={{ zIndex: 40 }}>
                    <TransitionFrozen
                      node={renderInner(prev)}
                      freeze={prevFreeze}
                      window="cover"
                      showFrames={showFrames}
                    />
                  </AbsoluteFill>
                )}
                {/* Non-question next (outro) frozen at frame 0 during the reveal. Question
                    nexts reveal live via their own early-starting Sequence. */}
                {next && !nextIsQuestion && (
                  <AbsoluteFill style={{ zIndex: 1 }}>
                    <TransitionFrozen
                      node={renderInner(next)}
                      freeze={0}
                      window="reveal"
                      showFrames={showFrames}
                    />
                  </AbsoluteFill>
                )}
                {/* Overlay animation (cover→reveal), on top */}
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

          if (p.kind === "question") {
            // Mount the question at the START of its preceding transition's cover so it is
            // alive (bobbing, flags decoding) before the reveal. It is hidden behind the
            // cover until the cover→reveal midpoint, then uncovered live. The countdown is
            // delayed by preRollFrames so it still starts at the level's real start time.
            const precedingTransition = tl.phases[i - 1]; // always a transition before a question
            const preRollFrames = precedingTransition ? precedingTransition.durationFrames : 0;
            const seqFrom = precedingTransition ? precedingTransition.startFrame : p.startFrame;
            const seqDuration = p.durationFrames + preRollFrames;

            return (
              <Sequence
                key={key}
                from={seqFrom}
                durationInFrames={seqDuration}
                name={`question ${p.index} (preroll ${preRollFrames})`}
              >
                <RevealGate fromFrame={showFrames}>
                  {renderInner(p, preRollFrames)}
                </RevealGate>
              </Sequence>
            );
          }

          // landing / outro — rendered at their natural phase position
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
