import React from "react";
import { AbsoluteFill } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { Stage } from "./components/Stage";
import { AnimatedBackground } from "./effects/AnimatedBackground";
import { BallIntro, BALL_INTRO_FRAMES } from "./scenes/BallIntro";
import { Intro } from "./scenes/Intro";
import { Level } from "./scenes/Level";
import { Outro } from "./scenes/Outro";
import { resolveBackground, type DemoProps } from "./schema";
import { getPresentation } from "./transitions";
import { iris } from "./transitions/iris";
import { DESIGN_FPS, DESIGN_HEIGHT, DESIGN_WIDTH, useFrameScale } from "./timing";

// Scene durations in DESIGN frames (30fps), scaled to the real fps at render time.
export const INTRO_FRAMES = 120; // 4.0s
export const LEVEL_FRAMES = 320; // ~10.7s
export const OUTRO_FRAMES = 130; // ~4.3s
export const TRANSITION_FRAMES = 18;
export const IRIS_FRAMES = 32; // opens AFTER the ball has filled the screen (frame 46 of BallIntro)

// Transitions overlap adjacent scenes, so they subtract from the total.
export const TOTAL_DESIGN_FRAMES =
  BALL_INTRO_FRAMES +
  INTRO_FRAMES +
  LEVEL_FRAMES +
  OUTRO_FRAMES -
  IRIS_FRAMES -
  2 * TRANSITION_FRAMES;

export const totalFramesForFps = (fps: number): number =>
  Math.round((TOTAL_DESIGN_FRAMES * fps) / DESIGN_FPS);

export const FootballQuizDemo: React.FC<DemoProps> = (props) => {
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const background = resolveBackground(props);
  const dims = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
  const timing = linearTiming({ durationInFrames: f(TRANSITION_FRAMES) });

  return (
    <Stage>
      {/* Continuous animated background behind every scene */}
      <AnimatedBackground bg={background} />

      <AbsoluteFill>
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={f(BALL_INTRO_FRAMES)}>
            <BallIntro bg={background} />
          </TransitionSeries.Sequence>

          {/* Ball opens to reveal the quiz type */}
          <TransitionSeries.Transition
            presentation={iris()}
            timing={linearTiming({ durationInFrames: f(IRIS_FRAMES) })}
          />

          <TransitionSeries.Sequence durationInFrames={f(INTRO_FRAMES)}>
            <Intro />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition
            presentation={getPresentation(props.transitionEffect, dims)}
            timing={timing}
          />

          <TransitionSeries.Sequence durationInFrames={f(LEVEL_FRAMES)}>
            <Level bg={background} />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition
            presentation={getPresentation(props.transitionEffect, dims)}
            timing={timing}
          />

          <TransitionSeries.Sequence durationInFrames={f(OUTRO_FRAMES)}>
            <Outro />
          </TransitionSeries.Sequence>
        </TransitionSeries>
      </AbsoluteFill>
    </Stage>
  );
};
