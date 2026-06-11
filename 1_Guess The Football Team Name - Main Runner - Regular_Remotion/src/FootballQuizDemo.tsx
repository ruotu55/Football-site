import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, type CalculateMetadataFunction } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import audioManifest from "./generated/audio.json";
import { Stage } from "./components/Stage";
import { AnimatedBackground } from "./effects/AnimatedBackground";
import { BallIntro, BALL_INTRO_FRAMES } from "./scenes/BallIntro";
import { Intro } from "./scenes/Intro";
import { Level } from "./scenes/Level";
import { Outro } from "./scenes/Outro";
import { resolveEndingKey } from "./ending";
import { AUTO_FORMATION, resolveBackground, type DemoProps } from "./schema";
import { levelCount, resolveLevel } from "./level-data";
import { getPresentation, transitionFramesFor } from "./transitions";
import { iris } from "./transitions/iris";
import { DESIGN_FPS, useFrameScale } from "./timing";

// Scene durations in DESIGN frames (30fps), scaled to the real fps at render time.
export const LEVEL_FRAMES = 320;
export const OUTRO_FRAMES_MIN = 130;
export const OUTRO_TAIL_FRAMES = 30; // ~1s hold after the ending voice (matches Regular play flow)
export const ENDING_VOICE_DELAY_SEC = 0.5;
export const ENDING_VOICE_DELAY_FRAMES = Math.round(ENDING_VOICE_DELAY_SEC * DESIGN_FPS);
export const TRANSITION_FRAMES = 18;
// Runner: reveal tweens --reveal-r 0→diagonal over 1.3s, starting 0.3s into the
// ball's 1.6s expand. The transition occupies the LAST 1.3s (39f) of the ball
// scene, so it begins at MERGE_DONE + 9 (=0.3s after the expand starts). LINEAR.
export const IRIS_FRAMES = 39;

const langKey = (language: DemoProps["language"]) => (language === "Spanish" ? "spanish" : "english");

// Intro = voice length + transition overlap so level 1 only appears once the voice
// finishes (TransitionSeries starts the next scene `transFrames` before intro ends).
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

type EndingDurationManifest = {
  endingDurationSec?: Record<string, Record<string, number | null>>;
};

// Outro length: long enough for the ending voice (starts at the transition) + 1s tail.
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
  // Voice begins `transFrames` before the outro scene; keep the tail after it ends.
  return Math.max(OUTRO_FRAMES_MIN, voiceFrames + OUTRO_TAIL_FRAMES - transFrames);
};

// How many levels actually render: "All" → the save's full count, else the
// chosen number clamped to what the save has.
export const levelsToRender = (save: string, levels: string): number => {
  const all = levelCount(save);
  if (levels === "All") return all;
  return Math.max(1, Math.min(parseInt(levels, 10) || all, all));
};

// Total composition length for `n` levels at a given fps. `transFrames` is the
// per-transition length in design frames (varies by selected transition).
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

// Dynamic duration: depends on the loaded save + chosen level count + transition.
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

  // Resolve each level's team (1..n) once per props change.
  const levels = React.useMemo(
    () => Array.from({ length: n }, (_, i) => resolveLevel(props.save, i + 1, formationLabel)),
    [props.save, n, formationLabel],
  );

  // Build the alternating Sequence / Transition list:
  // BallIntro → (iris) → Intro → [ (trans) → Level ]×n → (trans) → Outro
  const children: React.ReactNode[] = [];
  children.push(
    <TransitionSeries.Sequence key="ball" durationInFrames={f(BALL_INTRO_FRAMES)}>
      <BallIntro bg={background} />
    </TransitionSeries.Sequence>,
  );
  children.push(
    <TransitionSeries.Transition
      key="t-iris"
      presentation={iris()}
      timing={linearTiming({ durationInFrames: f(IRIS_FRAMES) })}
    />,
  );
  children.push(
    <TransitionSeries.Sequence key="intro" durationInFrames={f(introFrames)}>
      <Intro language={props.language} questionsCount={n} />
    </TransitionSeries.Sequence>,
  );
  levels.forEach((lvl, i) => {
    children.push(
      <TransitionSeries.Transition
        key={`t-l${i}`}
        presentation={transitionFor()}
        timing={timing}
      />,
    );
    children.push(
      <TransitionSeries.Sequence key={`l${i}`} durationInFrames={f(LEVEL_FRAMES)}>
        <Level bg={background} level={lvl} levelNumber={i + 1} language={props.language} />
      </TransitionSeries.Sequence>,
    );
  });
  children.push(
    <TransitionSeries.Transition
      key="t-out"
      presentation={transitionFor()}
      timing={timing}
    />,
  );
  children.push(
    <TransitionSeries.Sequence key="out" durationInFrames={f(outroFrames)}>
      <Outro language={props.language} endingKey={endingKey} />
    </TransitionSeries.Sequence>,
  );

  // ── audio layer (absolute composition timing) ──
  const voiceLangKey = langKey(props.language);
  const quizTitleSrc = audioManifest.quizTitle[voiceLangKey];
  const endingSrc = audioManifest.ending[voiceLangKey][endingKey];
  // Outro sequence start (design frames) — mirrors the TransitionSeries layout.
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

      {/* Background music — loops the whole video at a low bed level. */}
      {audioManifest.bgm ? <Audio src={staticFile(audioManifest.bgm)} loop volume={0.22} /> : null}
      {/* Quiz-title voice — starts the instant the intro (quiz-type text) appears. */}
      {quizTitleSrc ? (
        <Sequence from={f(introStartDesign)}>
          <Audio src={staticFile(quizTitleSrc)} volume={1} />
        </Sequence>
      ) : null}
      {/* Ending voice — 0.5s after the outro transition begins. */}
      {endingSrc ? (
        <Sequence from={f(outroStart + ENDING_VOICE_DELAY_FRAMES)}>
          <Audio src={staticFile(endingSrc)} volume={1} />
        </Sequence>
      ) : null}
    </>
  );
};
