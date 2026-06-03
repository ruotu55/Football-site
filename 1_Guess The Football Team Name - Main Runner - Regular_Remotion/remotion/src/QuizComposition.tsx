import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { RemotionProps } from "./props";
import { buildTimeline, BALL_PRELOADER_MS, msToFrames } from "./timeline";
import { BackgroundTheme } from "./BackgroundTheme";
import { ProgressSteps } from "./ProgressSteps";
import { LandingLevel } from "./levels/LandingLevel";
import { QuestionLevel } from "./levels/QuestionLevel";
import { OutroLevel } from "./levels/OutroLevel";
import { TransitionOverlay } from "./transitions/TransitionOverlay";
import { transitionDurationMs } from "./transitions/transitionDurations";
import { AudioTimeline } from "./audio/AudioTimeline";
import { SideText } from "./SideText";
import { generateBgTheme, generateCompetitionBgTheme } from "./background/themeEngine";
import { BallPreloader } from "./BallPreloader";

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
            return (
              <Sequence
                key={key}
                from={p.startFrame}
                durationInFrames={p.durationFrames}
                name={`transition ${p.index}`}
              >
                <TransitionOverlay
                  durationInFrames={p.durationFrames}
                  effect={props.transitionEffect}
                />
              </Sequence>
            );
          }

          let inner: React.ReactNode = null;

          if (p.kind === "landing") {
            const ballFrames = msToFrames(BALL_PRELOADER_MS, fps);
            inner = (
              <>
                {/* Landing screen (quiz-type title + pill) — always visible underneath */}
                <LandingLevel
                  language={props.language}
                  quizType={props.quizType ?? "club-by-nat"}
                  questionCount={props.questionCount}
                />
                {/* BallPreloader overlaid on top; its reveal-mask wipes away to expose the landing */}
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
          } else if (p.kind === "question") {
            const qLevel = props.levels[2 + p.index];
            // Guard: skip rendering inner content when level data is missing (e.g. Studio defaultProps).
            inner = qLevel ? (
              <>
                <ProgressSteps total={props.questionCount} current={p.index} />
                <QuestionLevel
                  level={qLevel}
                  questionIndex={p.index}
                  cues={p.cues}
                  skipReveal={!!p.skipReveal}
                  localDurationInFrames={p.durationFrames}
                  assetBase={props.assetBase}
                />
              </>
            ) : null;
          } else if (p.kind === "outro") {
            inner = (
              <OutroLevel
                level={outroLevel}
                endingType={props.endingType}
                language={props.language}
                assetBase={props.assetBase}
              />
            );
          }

          return (
            <Sequence
              key={key}
              from={p.startFrame}
              durationInFrames={p.durationFrames}
              name={`${p.kind} ${p.index}`}
            >
              {inner}
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
