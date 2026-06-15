import React from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, staticFile, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import audioManifest from "./generated/audio.json";
import { Stage } from "@shared/components/Stage";
import { AnimatedBackground } from "@shared/effects/AnimatedBackground";
import { BallIntro, BALL_INTRO_FRAMES } from "@shared/scenes/BallIntro";
import { UltimateIntro } from "@shared/scenes/UltimateIntro";
import { brandAccent } from "@shared/brand-accent";
import { introHandoff } from "@shared/transitions/intro-handoff";
import { Intro } from "@shared/scenes/Intro";
import { Outro } from "@shared/scenes/Outro";
import { BonusIntro } from "@shared/scenes/BonusIntro";
import { Ending } from "@shared/scenes/Ending";
import { breakAfterLevels, bonusVariantForSave } from "@shared/ending";
import { getPresentation, transitionFramesFor } from "@shared/transitions";
import { iris } from "@shared/transitions/iris";
import { DESIGN_FPS, useFrameScale } from "@shared/timing";
import { Level, REVEAL_START } from "./scenes/Level";
import { AUTO_FORMATION, resolveBackground, type DemoProps } from "./schema";
import { levelCount, resolveLevel } from "./level-data";
import { INTRO_STRINGS, TITLE_FONT_SIZE, SEASON_FONT_SIZE } from "./config";

// Intro toggle: the new branded "Ultimate Football Quiz" channel intro vs the
// original 4-ball merge. Set false to revert to BallIntro.
const USE_ULTIMATE_INTRO = true;

// Scene durations in DESIGN frames (30fps), scaled to the real fps at render time.
export const LEVEL_FRAMES = 320;
export const OUTRO_FRAMES_MIN = 130;
export const OUTRO_TAIL_FRAMES = 30;
export const ENDING_VOICE_DELAY_SEC = 0.5;
export const ENDING_VOICE_DELAY_FRAMES = Math.round(ENDING_VOICE_DELAY_SEC * DESIGN_FPS);
export const TRANSITION_FRAMES = 18;
export const IRIS_FRAMES = 39;
// The BONUS level (the one before the break) plays its full countdown, then is
// FROZEN at the reveal tick (timer at 0, no flip) for one transition's length so
// the break only starts moving in AFTER the timer finishes — answer stays hidden.
export const BONUS_LEVEL_FRAMES = REVEAL_START;

const langKey = (language: DemoProps["language"]) => (language === "Spanish" ? "spanish" : "english");

// Ultimate intro: the intro voice is ONE continuous clip = greeting + the quiz title
// ("…let's get started. Guess the player by club, position, country and age."). The
// ball opens at the pause BETWEEN them so the title is revealed as the quiz name is
// said. GREETING_PORTION_SEC = that pause point per language (measured from the clip).
const GREETING_START_F = 4;
const GREETING_PORTION_SEC: Record<string, number> = { english: 3.71, spanish: 3.80 };
// Where the spoken line ends in the combined clip (trailing silence start, measured).
const SPEECH_END_SEC: Record<string, number> = { english: 7.71, spanish: 7.28 };
const greetingPortionFrames = (language: DemoProps["language"]) =>
  Math.ceil((GREETING_PORTION_SEC[langKey(language)] ?? 3.71) * DESIGN_FPS);
const effectiveIntroFrames = (language: DemoProps["language"]) =>
  USE_ULTIMATE_INTRO ? GREETING_START_F + greetingPortionFrames(language) + IRIS_FRAMES : BALL_INTRO_FRAMES;
// Quiz-title screen length: for the Ultimate intro it runs from the pause to the end of
// the spoken quiz-title part (so level 1 transitions in exactly when the voice ends).
const TITLE_TAIL_FRAMES = 15; // ~0.5s hold after the voice ends before level 1 transitions in
const introTitleFrames = (language: DemoProps["language"], transFrames: number): number =>
  USE_ULTIMATE_INTRO
    ? Math.max(40, Math.ceil((SPEECH_END_SEC[langKey(language)] ?? 7.71) * DESIGN_FPS) - greetingPortionFrames(language) + transFrames + TITLE_TAIL_FRAMES)
    : introFramesForLanguage(language, transFrames);

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

// The ending is ALWAYS "How many did you get?" — no choice anymore.
export const outroFramesFor = (
  language: DemoProps["language"],
  transFrames: number = TRANSITION_FRAMES,
): number => {
  const key = langKey(language);
  const sec = (audioManifest as EndingDurationManifest).endingDurationSec?.[key]?.["how-many"] ?? 3.84;
  const voiceFrames = Math.ceil(sec * DESIGN_FPS);
  return Math.max(OUTRO_FRAMES_MIN, voiceFrames + OUTRO_TAIL_FRAMES - transFrames);
};

type BreakDurationManifest = { midBreakDurationSec?: Record<string, number | null> };

// Mid-quiz break ("Think you know the answer?" after the bonus level): its voice
// starts AFTER the time's-up stinger (once the break covers the bonus level), so the
// scene holds for transition + stinger gap + voice + tail.
export const BREAK_VOICE_AFTER_COVER = 8;
export const breakFramesForLanguage = (
  language: DemoProps["language"],
  transFrames: number = TRANSITION_FRAMES,
): number => {
  const key = langKey(language);
  const sec =
    (audioManifest as BreakDurationManifest).midBreakDurationSec?.[key] ?? (key === "spanish" ? 6.8 : 5.2);
  const voiceFrames = Math.ceil(sec * DESIGN_FPS);
  return Math.max(
    OUTRO_FRAMES_MIN,
    transFrames + BREAK_VOICE_AFTER_COVER + voiceFrames + OUTRO_TAIL_FRAMES - transFrames,
  );
};

type BonusDurationManifest = { bonusDurationSec?: Record<string, (number | null)[]> };

// BONUS window before the bonus level: starburst + "BONUS QUESTION!" + the voice
// variant picked for this save (bonus-01..05).
export const bonusFramesForLanguage = (
  language: DemoProps["language"],
  transFrames: number = TRANSITION_FRAMES,
  variant = 0,
): number => {
  const key = langKey(language);
  const sec = (audioManifest as BonusDurationManifest).bonusDurationSec?.[key]?.[variant] ?? 3.0;
  const voiceFrames = Math.ceil(sec * DESIGN_FPS);
  return Math.max(95, ENDING_VOICE_DELAY_FRAMES + voiceFrames + 20 - transFrames);
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
  save = "",
): number => {
  const outroFrames = outroFramesFor(language, transFrames);
  const m = breakAfterLevels(n);
  const breakFrames = m ? breakFramesForLanguage(language, transFrames) : 0;
  const bonusFrames = m ? bonusFramesForLanguage(language, transFrames, bonusVariantForSave(save)) : 0;
  // With a break, level m is the BONUS level (shorter: cut at the reveal tick).
  const bonusLevelDelta = m ? BONUS_LEVEL_FRAMES + transFrames - LEVEL_FRAMES : 0;
  const design =
    effectiveIntroFrames(language) +
    introTitleFrames(language, transFrames) +
    n * LEVEL_FRAMES +
    bonusFrames +
    breakFrames +
    bonusLevelDelta +
    outroFrames -
    IRIS_FRAMES -
    (n + 1 + (m ? 2 : 0)) * transFrames;
  return Math.round((design * fps) / DESIGN_FPS);
};

export const calculateMetadata: CalculateMetadataFunction<DemoProps> = ({ props }) => {
  const n = levelsToRender(props.save, props.levels);
  const transFrames = transitionFramesFor(props.transition, TRANSITION_FRAMES);
  return {
    durationInFrames: totalFramesForFps(60, n, transFrames, props.language, props.save),
  };
};

// Plays its children normally up to design-frame `at`, then HOLDS that frame.
// Used for the bonus level: countdown runs, then it freezes on the last
// pre-reveal frame (timer 0, no flip) while the break wipes over it.
const FrozenAfter: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  return (
    <Freeze frame={at} active={frame >= at}>
      {children}
    </Freeze>
  );
};

export const FootballQuizDemo: React.FC<DemoProps> = (props) => {
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const background = resolveBackground(props);
  const accent = brandAccent(props.competition); // per-competition brand colour
  const transFrames = transitionFramesFor(props.transition, TRANSITION_FRAMES);
  const timing = linearTiming({ durationInFrames: f(transFrames) });
  const transitionFor = () => getPresentation(props.transition);

  const n = levelsToRender(props.save, props.levels);
  const m = breakAfterLevels(n); // level m = the BONUS level; break follows it (0 = none)
  const outroFrames = outroFramesFor(props.language, transFrames);
  const breakFrames = m ? breakFramesForLanguage(props.language, transFrames) : 0;
  const bonusVariant = bonusVariantForSave(props.save);
  const bonusFrames = m ? bonusFramesForLanguage(props.language, transFrames, bonusVariant) : 0;
  const introFrames = introTitleFrames(props.language, transFrames);
  const introStartDesign = effectiveIntroFrames(props.language) - IRIS_FRAMES;
  const formationLabel = props.formation === AUTO_FORMATION ? null : props.formation;

  const levels = React.useMemo(
    () => Array.from({ length: n }, (_, i) => resolveLevel(props.save, i + 1, formationLabel)),
    [props.save, n, formationLabel],
  );

  const children: React.ReactNode[] = [];
  children.push(
    <TransitionSeries.Sequence key="ball" durationInFrames={f(effectiveIntroFrames(props.language))}>
      {USE_ULTIMATE_INTRO ? <UltimateIntro accent={accent} /> : <BallIntro bg={background} />}
    </TransitionSeries.Sequence>,
  );
  children.push(
    <TransitionSeries.Transition key="t-iris" presentation={USE_ULTIMATE_INTRO ? introHandoff() : iris()} timing={linearTiming({ durationInFrames: f(IRIS_FRAMES) })} />,
  );
  children.push(
    <TransitionSeries.Sequence key="intro" durationInFrames={f(introFrames)}>
      <Intro language={props.language} questionsCount={n} strings={INTRO_STRINGS} titleFontSize={TITLE_FONT_SIZE} seasonFontSize={SEASON_FONT_SIZE} accent={accent} />
    </TransitionSeries.Sequence>,
  );
  levels.forEach((lvl, i) => {
    const isBonus = m > 0 && i === m - 1;
    if (isBonus) {
      children.push(<TransitionSeries.Transition key="t-bonus" presentation={transitionFor()} timing={timing} />);
      children.push(
        <TransitionSeries.Sequence key="bonus" durationInFrames={f(bonusFrames)}>
          <BonusIntro language={props.language} accent={accent} />
        </TransitionSeries.Sequence>,
      );
    }
    children.push(<TransitionSeries.Transition key={`t-l${i}`} presentation={transitionFor()} timing={timing} />);
    children.push(
      <TransitionSeries.Sequence
        key={`l${i}`}
        durationInFrames={f(isBonus ? BONUS_LEVEL_FRAMES + transFrames : LEVEL_FRAMES)}
      >
        {isBonus ? (
          <FrozenAfter at={f(BONUS_LEVEL_FRAMES)}>
            <Level bg={background} level={lvl} levelNumber={i + 1} language={props.language} muteReveal />
          </FrozenAfter>
        ) : (
          <Level bg={background} level={lvl} levelNumber={i + 1} language={props.language} />
        )}
      </TransitionSeries.Sequence>,
    );
    // Mid-quiz break right after the (unrevealed) bonus level — then the quiz continues.
    if (isBonus) {
      children.push(<TransitionSeries.Transition key="t-break" presentation={transitionFor()} timing={timing} />);
      children.push(
        <TransitionSeries.Sequence key="break" durationInFrames={f(breakFrames)}>
          <Outro language={props.language} endingKey="think-you-know" isBreak />
        </TransitionSeries.Sequence>,
      );
    }
  });
  children.push(<TransitionSeries.Transition key="t-out" presentation={transitionFor()} timing={timing} />);
  children.push(
    <TransitionSeries.Sequence key="out" durationInFrames={f(outroFrames)}>
      <Ending language={props.language} questionsCount={n} />
    </TransitionSeries.Sequence>,
  );

  // ── audio layer (absolute composition timing) ──
  const voiceLangKey = langKey(props.language);
  const quizTitleSrc = audioManifest.quizTitle[voiceLangKey];
  // Intro voice = ONE continuous clip (greeting + quiz title). When it's used we DON'T also
  // play the separate quiz-title voice (it's already inside this clip).
  const greetingSrc = (audioManifest as { introGreeting?: Record<string, string | null> }).introGreeting?.[voiceLangKey];
  const useGreeting = USE_ULTIMATE_INTRO && !!greetingSrc;
  const GREETING_START = GREETING_START_F;
  const quizTitleStart = introStartDesign; // only used when NOT using the combined clip
  const endingSrc = audioManifest.ending[voiceLangKey]["how-many"];
  const breakSrc = (audioManifest as { midBreak?: Record<string, string | null> }).midBreak?.[voiceLangKey];
  const bonusSrc = (audioManifest as { bonus?: Record<string, (string | null)[]> }).bonus?.[voiceLangKey]?.[bonusVariant];
  const introEnd = introStartDesign + introFrames;
  const levelsStart = introEnd - transFrames; // level 1 starts here (overlap)
  const bonusStart = m ? levelsStart + (m - 1) * (LEVEL_FRAMES - transFrames) : 0;
  const bonusLevelStart = m ? bonusStart + bonusFrames - transFrames : 0;
  const breakStart = m ? bonusLevelStart + BONUS_LEVEL_FRAMES : 0;
  const outroStart = m
    ? breakStart + breakFrames - transFrames + (n - m) * (LEVEL_FRAMES - transFrames)
    : levelsStart + n * (LEVEL_FRAMES - transFrames);

  return (
    <>
      <Stage>
        <AnimatedBackground bg={background} />
        <AbsoluteFill>
          <TransitionSeries>{children}</TransitionSeries>
        </AbsoluteFill>
      </Stage>

      {audioManifest.bgm ? <Audio src={staticFile(audioManifest.bgm)} loop volume={0.22} /> : null}
      {useGreeting && greetingSrc ? (
        <Sequence from={f(GREETING_START)}>
          <Audio src={staticFile(greetingSrc)} volume={1} />
        </Sequence>
      ) : null}
      {/* Quiz-title voice — starts the instant the intro (quiz-type text) appears.
          Skipped when using the Ultimate intro (combined clip already contains it). */}
      {!useGreeting && quizTitleSrc ? (
        <Sequence from={f(quizTitleStart)}>
          <Audio src={staticFile(quizTitleSrc)} volume={1} />
        </Sequence>
      ) : null}
      {/* BONUS voice — 0.5s after the bonus-window transition begins. */}
      {m && bonusSrc ? (
        <Sequence from={f(bonusStart + ENDING_VOICE_DELAY_FRAMES)}>
          <Audio src={staticFile(bonusSrc)} volume={1} />
        </Sequence>
      ) : null}
      {/* Mid-quiz break voice — right after the stinger, once the break covers the level. */}
      {m && breakSrc ? (
        <Sequence from={f(breakStart + transFrames + BREAK_VOICE_AFTER_COVER)}>
          <Audio src={staticFile(breakSrc)} volume={1} />
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
