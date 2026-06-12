import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, type CalculateMetadataFunction } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import audioManifest from "./generated/audio.json";
import { Stage } from "@shared/components/Stage";
import { AnimatedBackground } from "@shared/effects/AnimatedBackground";
import { BallIntro, BALL_INTRO_FRAMES } from "@shared/scenes/BallIntro";
import { Intro } from "@shared/scenes/Intro";
import { Outro } from "@shared/scenes/Outro";
import { resolveEndingKey } from "@shared/ending";
import { getPresentation, transitionFramesFor } from "@shared/transitions";
import { iris } from "@shared/transitions/iris";
import { DESIGN_FPS, useFrameScale } from "@shared/timing";
import { Level } from "./scenes/Level";
import { AUTO_FORMATION, resolveBackground, type DemoProps } from "./schema";
import { levelCount, resolveLevel } from "./level-data";
import { INTRO_STRINGS, TITLE_FONT_SIZE, SEASON_FONT_SIZE } from "./config";

// Scene durations in DESIGN frames (30fps), scaled to the real fps at render time.
export const LEVEL_FRAMES = 320;
export const OUTRO_FRAMES_MIN = 130;
export const OUTRO_TAIL_FRAMES = 30;
export const ENDING_VOICE_DELAY_SEC = 0.5;
export const ENDING_VOICE_DELAY_FRAMES = Math.round(ENDING_VOICE_DELAY_SEC * DESIGN_FPS);
export const TRANSITION_FRAMES = 18;
export const IRIS_FRAMES = 39;

const langKey = (language: DemoProps["language"]) => (language === "Spanish" ? "spanish" : "english");

export const introFramesForLanguage = (
  language: DemoProps["language"],
  transFrames: number = TRANSITION_FRAMES,
): number => {
  const key = langKey(language);
  const sec =
    (audioManifest as { quizTitleDurationSec?: Record<string, number | null> }).quizTitleDurationSec?.[key] ??
    (key === "spanish" ? 6 : 5.36);
  return Math.ceil(sec * DESIGN_FPS) + transFrames;
};

type EndingDurationManifest = { endingDurationSec?: Record<string, Record<string, number | null>> };

export const outroFramesForEnding = (
  language: DemoProps["language"],
  endingKey: ReturnType<typeof resolveEndingKey>,
  transFrames: number = TRANSITION_FRAMES,
): number => {
  const key = langKey(language);
  const sec =
    (audioManifest as EndingDurationManifest).endingDurationSec?.[key]?.[endingKey] ??
    (endingKey === "how-many" ? 3.84 : 4.2);
  const voiceFrames = Math.ceil(sec * DESIGN_FPS);
  return Math.max(OUTRO_FRAMES_MIN, voiceFrames + OUTRO_TAIL_FRAMES - transFrames);
};

export const levelsToRender = (save: string, levels: string): number => {
  const all = levelCount(save);
  if (levels === "All") return all;
  return Math.max(1, Math.min(parseInt(levels, 10) || all, all));
};

export const totalFramesForFps = (
  fps: number,
  n: number,
  transFrames = TRANSITION_FRAMES,
  language: DemoProps["language"] = "English",
  ending: DemoProps["ending"] = "Random",
  save = "",
): number => {
  const endingKey = resolveEndingKey(ending, save);
  const outroFrames = outroFramesForEnding(language, endingKey, transFrames);
  const design =
    BALL_INTRO_FRAMES +
    introFramesForLanguage(language, transFrames) +
    n * LEVEL_FRAMES +
    outroFrames -
    IRIS_FRAMES -
    (n + 1) * transFrames;
  return Math.round((design * fps) / DESIGN_FPS);
};

export const calculateMetadata: CalculateMetadataFunction<DemoProps> = ({ props }) => {
  const n = levelsToRender(props.save, props.levels);
  const transFrames = transitionFramesFor(props.transition, TRANSITION_FRAMES);
  return {
    durationInFrames: totalFramesForFps(60, n, transFrames, props.language, props.ending, props.save),
  };
};

export const FootballQuizDemo: React.FC<DemoProps> = (props) => {
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const background = resolveBackground(props);
  const transFrames = transitionFramesFor(props.transition, TRANSITION_FRAMES);
  const timing = linearTiming({ durationInFrames: f(transFrames) });
  const transitionFor = () => getPresentation(props.transition);

  const n = levelsToRender(props.save, props.levels);
  const endingKey = resolveEndingKey(props.ending, props.save);
  const outroFrames = outroFramesForEnding(props.language, endingKey, transFrames);
  const introFrames = introFramesForLanguage(props.language, transFrames);
  const introStartDesign = BALL_INTRO_FRAMES - IRIS_FRAMES;
  const formationLabel = props.formation === AUTO_FORMATION ? null : props.formation;

  const levels = React.useMemo(
    () => Array.from({ length: n }, (_, i) => resolveLevel(props.save, i + 1, formationLabel)),
    [props.save, n, formationLabel],
  );

  const children: React.ReactNode[] = [];
  children.push(
    <TransitionSeries.Sequence key="ball" durationInFrames={f(BALL_INTRO_FRAMES)}>
      <BallIntro bg={background} />
    </TransitionSeries.Sequence>,
  );
  children.push(
    <TransitionSeries.Transition key="t-iris" presentation={iris()} timing={linearTiming({ durationInFrames: f(IRIS_FRAMES) })} />,
  );
  children.push(
    <TransitionSeries.Sequence key="intro" durationInFrames={f(introFrames)}>
      <Intro language={props.language} questionsCount={n} strings={INTRO_STRINGS} titleFontSize={TITLE_FONT_SIZE} seasonFontSize={SEASON_FONT_SIZE} />
    </TransitionSeries.Sequence>,
  );
  levels.forEach((lvl, i) => {
    children.push(<TransitionSeries.Transition key={`t-l${i}`} presentation={transitionFor()} timing={timing} />);
    children.push(
      <TransitionSeries.Sequence key={`l${i}`} durationInFrames={f(LEVEL_FRAMES)}>
        <Level bg={background} level={lvl} levelNumber={i + 1} language={props.language} />
      </TransitionSeries.Sequence>,
    );
  });
  children.push(<TransitionSeries.Transition key="t-out" presentation={transitionFor()} timing={timing} />);
  children.push(
    <TransitionSeries.Sequence key="out" durationInFrames={f(outroFrames)}>
      <Outro language={props.language} endingKey={endingKey} />
    </TransitionSeries.Sequence>,
  );

  // ── audio layer (absolute composition timing) ──
  const voiceLangKey = langKey(props.language);
  const quizTitleSrc = audioManifest.quizTitle[voiceLangKey];
  const endingSrc = audioManifest.ending[voiceLangKey][endingKey];
  const introEnd = introStartDesign + introFrames;
  const outroStart = introEnd - transFrames + (n - 1) * (LEVEL_FRAMES - transFrames) + LEVEL_FRAMES - transFrames;

  return (
    <>
      <Stage>
        <AnimatedBackground bg={background} />
        <AbsoluteFill>
          <TransitionSeries>{children}</TransitionSeries>
        </AbsoluteFill>
      </Stage>

      {audioManifest.bgm ? <Audio src={staticFile(audioManifest.bgm)} loop volume={0.22} /> : null}
      {quizTitleSrc ? (
        <Sequence from={f(introStartDesign)}>
          <Audio src={staticFile(quizTitleSrc)} volume={1} />
        </Sequence>
      ) : null}
      {endingSrc ? (
        <Sequence from={f(outroStart + ENDING_VOICE_DELAY_FRAMES)}>
          <Audio src={staticFile(endingSrc)} volume={1} />
        </Sequence>
      ) : null}
    </>
  );
};
