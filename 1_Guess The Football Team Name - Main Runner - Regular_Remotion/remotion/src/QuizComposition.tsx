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

// TODO(reconcile outro duration via props): pass probed outroVoiceMs through RemotionProps so
// the in-composition buildTimeline() call matches calculateMetadata's total exactly.

export const QuizComposition: React.FC<RemotionProps> = (props) => {
  const { fps } = useVideoConfig();
  // Rebuild timeline without outroVoiceMs (unknown at render time).
  // The composition's durationInFrames (from calculateMetadata) may be slightly longer;
  // trailing frames after the outro Sequence are fine — the outro simply stays visible.
  const tl = buildTimeline({
    questionCount: props.questionCount,
    fps,
    endingType: props.endingType,
  });

  const outroLevel = props.levels[props.levels.length - 1];

  return (
    <AbsoluteFill>
      <BackgroundTheme competition={undefined} />

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
              <TransitionOverlay durationInFrames={p.durationFrames} />
            </Sequence>
          );
        }

        let inner: React.ReactNode = null;

        if (p.kind === "logo") {
          inner = <LogoLevel level={props.levels[0]} />;
        } else if (p.kind === "landing") {
          inner = <LandingLevel level={props.levels[1]} />;
        } else if (p.kind === "question") {
          const level = props.levels[2 + p.index];
          inner = (
            <>
              <ProgressSteps total={props.questionCount} current={p.index} />
              <QuestionLevel
                level={level}
                questionIndex={p.index}
                cues={p.cues}
                skipReveal={!!p.skipReveal}
                localDurationInFrames={p.durationFrames}
                assetBase={props.assetBase}
              />
            </>
          );
        } else if (p.kind === "outro") {
          inner = <OutroLevel level={outroLevel} endingType={props.endingType} />;
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
  );
};
