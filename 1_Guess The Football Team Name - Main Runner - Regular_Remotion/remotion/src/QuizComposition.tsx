import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { RemotionProps } from "./props";
import { buildTimeline } from "./timeline";
import { BackgroundTheme } from "./BackgroundTheme";
import { ProgressSteps } from "./ProgressSteps";
import { LogoLevel } from "./levels/LogoLevel";
import { LandingLevel } from "./levels/LandingLevel";
import { QuestionLevel } from "./levels/QuestionLevel";
import { OutroLevel } from "./levels/OutroLevel";
import { TransitionOverlay } from "./transitions/TransitionOverlay";
import { transitionDurationMs } from "./transitions/transitionDurations";
import { AudioTimeline } from "./audio/AudioTimeline";
import { SideText } from "./SideText";

export const QuizComposition: React.FC<RemotionProps> = (props) => {
  const { fps } = useVideoConfig();
  // Use outroVoiceMs injected by calculateMetadata (via props reconcile) so the
  // in-component timeline matches the metadata duration exactly.
  const tl = buildTimeline({
    questionCount: props.questionCount,
    fps,
    endingType: props.endingType,
    outroVoiceMs: props.outroVoiceMs ?? 0,
    transitionMs: transitionDurationMs(props.transitionEffect),
  });

  const outroLevel = props.levels[props.levels.length - 1];

  return (
    <AbsoluteFill>
      {/* Background — always the bottom layer (no zIndex override so it stays at 0) */}
      <BackgroundTheme bgTheme={props.bgTheme} />

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

          if (p.kind === "logo") {
            inner = (
              <LogoLevel
                assetBase={props.assetBase}
                language={props.language}
              />
            );
          } else if (p.kind === "landing") {
            inner = (
              <LandingLevel
                language={props.language}
                quizType={props.quizType ?? "club-by-nat"}
                questionCount={props.questionCount}
              />
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
