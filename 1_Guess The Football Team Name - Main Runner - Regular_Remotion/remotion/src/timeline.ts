// SOURCE OF TRUTH for timing. Every value cites the live-app line it mirrors.
import { TRANSITION_TOTAL_MS } from "./transitions/transitionDurations";

export const MS = {
  LOGO_VOICE_DELAY: 500,        // video.js:47 INTRO_GAME_NAME_VOICE_DELAY_MS
  LOGO_REVEAL_DELAY: 2000,      // video.js:18 LOGO_PAGE_PLAY_VIDEO_DELAY_MS
  LOGO_AFTER_REVEAL: 1200,      // video.js:196 nested setTimeout
  INTRO_STEP_DELAY_IDX0: 1000,  // video.js:258 (currentLevelIndex===0 ? 1000 : 500)
  INTRO_STEP_DELAY_IDX1: 500,   // video.js:258
  FLIP_DELAY_INTRO: 1000,       // video.js:360 revealCurrentLevel default flipDelay
  STAGE_TRANSITION: 820,        // video.js:51 LEVEL_SWITCH_STAGE_TRANSITION_MS
  AFTER_CUSTOM_TRANSITION: 200, // video.js:231 setTimeout(fn, 200) after _transitionDone
  COUNTDOWN_TOTAL: 10000,       // video.js:266 count=10 * setInterval 1000
  TICK_LEAD: 3000,              // video.js:299 (10-3)*1000 ticking start lead
  REVEAL_STINGER: 150,          // audio.js:1054 stinger setTimeout
  REVEAL_VOICE_DELAY: 600,      // audio.js:1044 teamNameVoiceDelayMs default
  FLIP_DELAY_REVEAL: 3000,      // video.js:382 flipDelay = 3000
  FLIP_DURATION: 780,           // pitch.css:423 transition 0.78s
  OUTRO_TAIL: 1000,             // levels.js:222 setTimeout 1000 after outro voice
  PROGRESS_VOICE_DELAY: 1000,   // audio.js:1100 progress voice delayMs
  DEFAULT_TRANSITION_PHASE: 840,// transitions.js:45 PHASE_DUR=0.84
  LANDING_QUIZ_VOICE_DELAY: 1000, // delay before rules voice fires on opening landing
} as const;

/** Duration of the BallPreloader animation in ms (~3.35s). */
export const BALL_PRELOADER_MS = 3350;

export const msToFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);
export const questionBlockMs = () => MS.COUNTDOWN_TOTAL + MS.FLIP_DELAY_REVEAL; // 13000

export type PhaseKind = "logo" | "landing" | "question" | "outro" | "transition";

export interface QuestionCues {
  tickStartMs: number; revealMs: number; stingerMs: number; voiceMs: number;
  flipStartMs: number; flipDurationMs: number;
}

export interface Phase {
  kind: PhaseKind; index: number; durationMs: number;
  startMs: number; startFrame: number; durationFrames: number;
  cues?: QuestionCues; skipReveal?: boolean;
  /** True on the opening landing phase — BallPreloader overlays this phase. */
  hasBallPreloader?: boolean;
}

export interface Timeline { phases: Phase[]; totalDurationFrames: number; fps: number; }

export interface BuildOpts {
  questionCount: number; fps: number; transitionMs?: number;
  outroVoiceMs?: number; endingType?: "think-you-know" | "how-many";
  /** Probed duration of the rules/quiz-title voice in ms (default 2500). */
  rulesVoiceMs?: number;
}

export function buildTimeline(opts: BuildOpts): Timeline {
  const fps = opts.fps;
  // Full transition phase = cover(850) + reveal(850) + pad(200) = 1900ms (see
  // transitionDurations.ts). STAGE_TRANSITION(820) is only the app's NO-custom-transition
  // fallback; with a real overlay effect the gap is the full show+hide+pad.
  const transitionMs = opts.transitionMs ?? TRANSITION_TOTAL_MS;
  const outroVoiceMs = opts.outroVoiceMs ?? 0;
  const rulesVoiceMs = opts.rulesVoiceMs ?? 2500;
  // Opening landing holds for: ball animation + 1000ms delay before voice + voice duration (min 1500ms extra)
  const landingHoldMs = Math.max(1000 + rulesVoiceMs, 1500);
  const openingLandingMs = Math.round(BALL_PRELOADER_MS + landingHoldMs);

  const seq: { kind: PhaseKind; durationMs: number; cues?: QuestionCues; skipReveal?: boolean; hasBallPreloader?: boolean }[] = [];

  // Opening landing: BallPreloader plays for BALL_PRELOADER_MS, then reveals the landing screen.
  seq.push({ kind: "landing", durationMs: openingLandingMs, hasBallPreloader: true });

  // (No second landing phase — questions follow directly after the opening landing.)

  for (let i = 0; i < opts.questionCount; i++) {
    const isLast = i === opts.questionCount - 1;
    const bonusSkip = isLast && opts.endingType !== undefined && opts.endingType !== "how-many";
    seq.push({ kind: "transition", durationMs: transitionMs });
    if (bonusSkip) {
      seq.push({ kind: "question", durationMs: MS.COUNTDOWN_TOTAL, skipReveal: true });
    } else {
      seq.push({
        kind: "question",
        durationMs: MS.COUNTDOWN_TOTAL + MS.FLIP_DELAY_REVEAL,
        cues: {
          tickStartMs: MS.COUNTDOWN_TOTAL - MS.TICK_LEAD,
          revealMs: MS.COUNTDOWN_TOTAL,
          stingerMs: MS.COUNTDOWN_TOTAL + MS.REVEAL_STINGER,
          voiceMs: MS.COUNTDOWN_TOTAL + MS.REVEAL_VOICE_DELAY,
          flipStartMs: MS.COUNTDOWN_TOTAL,
          flipDurationMs: MS.FLIP_DURATION,
        },
      });
    }
  }

  seq.push({ kind: "transition", durationMs: transitionMs });
  seq.push({ kind: "outro", durationMs: outroVoiceMs + MS.OUTRO_TAIL });

  const phases: Phase[] = [];
  let cursorMs = 0;
  const counts: Record<string, number> = {};
  for (const s of seq) {
    const index = (counts[s.kind] = (counts[s.kind] ?? 0) + 1) - 1;
    const startFrame = Math.round((cursorMs / 1000) * fps);
    const durationFrames = Math.round((s.durationMs / 1000) * fps);
    phases.push({ ...s, index, startMs: cursorMs, startFrame, durationFrames });
    cursorMs += s.durationMs;
  }
  const totalDurationFrames = Math.round((cursorMs / 1000) * fps);
  return { phases, totalDurationFrames, fps };
}

export type ProgressVoiceKey = "warmUp" | "serious" | "nerds" | "genius";

/** questionIndex is the app's (levelIndex - 1). totalQuestions = app's totalLevelsCount - 3. */
export function progressVoiceForQuestion(questionIndex: number, totalQuestions: number): ProgressVoiceKey | null {
  if (questionIndex === 1) return "warmUp";
  const t30 = Math.max(2, Math.round(totalQuestions * 0.3));
  const t60 = Math.max(2, Math.round(totalQuestions * 0.6));
  const t90 = Math.max(2, Math.round(totalQuestions * 0.9));
  if (questionIndex === t30) return "serious";
  if (questionIndex === t60) return "nerds";
  if (questionIndex === t90) return "genius";
  return null;
}
