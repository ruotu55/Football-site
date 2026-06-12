# Runner 9 MCQ — Remotion Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working Remotion project for "Football Quiz Multiple Choice A/B/C" (runner 9) inside `___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\` using the proven shared base from runner-2.

**Architecture:** Copy runner-2 as the scaffold (package.json, remotion.config.ts, tsconfig.json, FootballQuizDemo.tsx verbatim). Replace the Level scene with a bespoke MCQ scene that renders two question types (trivia + which-player) matching `mcq.css`. build-data.mjs reads runner-9 blocks from recording-status.json and emits embedded MCQ data directly (no squad resolution needed). The composition id is `Football-Quiz-Multiple-Choice-Regular`.

**Tech Stack:** Remotion 4.0.474, React 19, TypeScript 5.8, Node.js ESM build scripts, shared `.remotion-shared/src/` library (scenes/Intro/Outro/BallIntro, Stage, AnimatedBackground, timing, theme, transitions, build-lib.mjs).

---

## Key reference facts (read before touching code)

- Repo root: `C:\Users\Rom\Documents\GitHub\Football Channel`
- Reference runner: `___Remotion___\2_Guess The Football National Team - Main Runner - Regular_Remotion\`
- Shared lib: `.remotion-shared\src\`
- New folder: `___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\`
- Runner-9 data: `.Storage\storage\recording-status.json` — one block key `"9|..."` named `"World Cup"` with 50 MCQ levels (25 trivia, 25 which-player).
- Voices: only one answer voice exists: `.Storage\Voices\MCQ\Football Quiz MCQ\english\answers\uruguay.mp3`. No quiz-title voice for MCQ. Build tolerates missing voices gracefully.
- BGM: `script.bgmSongs[0]` = `"We Got This - Nathan Moore"` → `Ringhton\We Got This - Nathan Moore.mp3`; use `firstBgm()` from build-lib which picks alphabetically, fine for demo.
- Color label for THEME_DEFAULT: `"#C2185B - Football Quiz (Multiple Choice)"` (id `quiz-football-mcq`).
- Effect label: `"Rising soccer balls"` (id `rising-soccer-balls`).
- Composition id: `Football-Quiz-Multiple-Choice-Regular`.

---

## File map

| File (relative to new project root) | Action | Purpose |
|--------------------------------------|--------|---------|
| `package.json` | Create | Name `football-quiz-mcq-remotion-demo`, COMPOSITION_ID in render script |
| `remotion.config.ts` | Copy verbatim from runner-2 | Webpack alias, public dir, concurrency |
| `tsconfig.json` | Copy verbatim from runner-2 | Paths alias for `@shared` |
| `src/index.ts` | Copy verbatim from runner-2 | Entry point |
| `src/schema.ts` | Copy + change SAVE_NAMES import | Same zod schema, no formation field needed |
| `src/config.ts` | Create | MCQ-specific title strings, THEME_DEFAULT |
| `src/level-data.ts` | Create | ResolvedLevel with mcq field, levelCount, resolveLevel |
| `src/FootballQuizDemo.tsx` | Copy verbatim (change 3 import paths) | Orchestrates intro/levels/outro/audio |
| `src/Root.tsx` | Copy + edit defaults | Composition registration |
| `src/scenes/Level.tsx` | Create (bespoke) | MCQ question + reveal rendering |
| `src/generated/saves.json` | Generated | Created by build-data.mjs |
| `src/generated/audio.json` | Generated | Created by build-data.mjs |
| `scripts/build-data.mjs` | Create | Reads runner-9 blocks, emits saves+audio, syncs assets |
| `scripts/render.mjs` | Create (copy + edit) | Render CLI wrapper |
| `Open Remotion Studio.bat` | Create + CRLF | Windows launcher |

---

## Task 1: Create the project folder and scaffold

**Files:**
- Create: `___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\package.json`
- Create: `___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\remotion.config.ts`
- Create: `___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\tsconfig.json`

- [ ] **Step 1: Create the new project folder**

```
mkdir "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion"
mkdir "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\src"
mkdir "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\src\scenes"
mkdir "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\src\generated"
mkdir "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\scripts"
mkdir "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\out"
```

- [ ] **Step 2: Create package.json**

Write to `___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\package.json`:

```json
{
  "name": "football-quiz-mcq-remotion-demo",
  "version": "1.0.0",
  "description": "Remotion demo of the Football Quiz Multiple Choice (A/B/C) runner: intro + MCQ levels + ending",
  "private": true,
  "scripts": {
    "setup": "node scripts/build-data.mjs",
    "build-data": "node scripts/build-data.mjs",
    "studio": "remotion studio",
    "render": "node scripts/render.mjs",
    "render:draft": "remotion render Football-Quiz-Multiple-Choice-Regular out/draft.mp4 --scale=0.5",
    "still": "remotion still Football-Quiz-Multiple-Choice-Regular out/still.png",
    "upgrade": "remotion upgrade"
  },
  "dependencies": {
    "@remotion/cli": "4.0.474",
    "@remotion/google-fonts": "4.0.474",
    "@remotion/transitions": "4.0.474",
    "@remotion/zod-types": "^4.0.474",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "remotion": "4.0.474",
    "sharp": "^0.35.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/react": "19.2.7",
    "typescript": "5.8.3"
  }
}
```

- [ ] **Step 3: Copy remotion.config.ts verbatim from runner-2**

The file `___Remotion___\2_Guess The Football National Team - Main Runner - Regular_Remotion\remotion.config.ts` is identical for all runners (it only uses `process.cwd()` and relative paths to `.remotion-shared`). Copy it verbatim.

- [ ] **Step 4: Copy tsconfig.json verbatim from runner-2**

The file `___Remotion___\2_Guess The Football National Team - Main Runner - Regular_Remotion\tsconfig.json` is identical for all runners. Copy it verbatim.

---

## Task 2: Create config.ts and schema.ts

**Files:**
- Create: `src/config.ts`
- Create: `src/schema.ts`

- [ ] **Step 1: Create src/config.ts**

The MCQ intro title. The runner's `i18n.js` has `sideText: "ULTIMATE FOOTBALL QUIZ"` (English) and `"El Gran Test de Fútbol"` (Spanish), no dedicated landing title. Reasonable MCQ-specific title lines:

```typescript
// Per-runner config for runner 9 — "Football Quiz Multiple Choice (A/B/C)".
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Football-Quiz-Multiple-Choice-Regular";

export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["The Ultimate", "Football Quiz"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["El Mejor", "Quiz De Fútbol"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

export const TITLE_FONT_SIZE = 104;

// Background default (magenta accent matching MCQ runner #C2185B).
// Color label = the full label string from effects-data.ts.
export const THEME_DEFAULT = {
  color: "#C2185B - Football Quiz (Multiple Choice)",
  effect: "Rising soccer balls",
  opacity: 0.5,
} as const;
```

- [ ] **Step 2: Create src/schema.ts**

Identical to runner-2 schema.ts except: no `formation` field (MCQ levels have no pitch/formation). Import `SAVE_NAMES` from `./level-data`.

```typescript
import { z } from "zod";
import { TRANSITION_EFFECTS } from "@shared/transitions";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import {
  COLOR_LABELS,
  COMPETITION_LABELS,
  EFFECT_LABELS,
  colorHexByLabel,
  competitionByLabel,
  effectIdByLabel,
} from "@shared/effects/effects-data";
import { SAVE_NAMES } from "./level-data";

export const NONE_COMPETITION = "None — use Color + Effect";
export const LANGUAGES = ["English", "Spanish"] as const;
export const ENDINGS = [
  "Random",
  "Think you know the answer?",
  "How many did you get?",
] as const;

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

export const LEVEL_CHOICES = [
  "All", "1", "2", "3", "5", "10", "15", "20", "25", "30", "40", "50",
] as const;

export const demoSchema = z.object({
  language: z.enum(LANGUAGES),

  save: z.enum(asEnum(SAVE_NAMES)),
  levels: z.enum(LEVEL_CHOICES),

  ending: z.enum(ENDINGS),

  competition: z.enum(asEnum([NONE_COMPETITION, ...COMPETITION_LABELS])),
  color: z.enum(asEnum(COLOR_LABELS)),
  effect: z.enum(asEnum(EFFECT_LABELS)),
  opacity: z.number().min(0).max(1),

  transition: z.enum(TRANSITION_EFFECTS),
});

export type DemoProps = z.infer<typeof demoSchema>;

export const resolveBackground = (
  p: Pick<DemoProps, "competition" | "color" | "effect" | "opacity">,
): ResolvedBackground => {
  const comp = competitionByLabel(p.competition);
  return {
    competition: comp ? comp.recipe : null,
    colorHex: colorHexByLabel(p.color),
    effectId: effectIdByLabel(p.effect),
    opacity: p.opacity,
  };
};
```

---

## Task 3: Create level-data.ts

**Files:**
- Create: `src/level-data.ts`
- Create: `src/generated/saves.json` (placeholder until build-data runs)

- [ ] **Step 1: Create a placeholder src/generated/saves.json**

This lets TypeScript compile before build-data runs. It must match the shape that level-data.ts expects:

```json
{"saves":[]}
```

- [ ] **Step 2: Create src/level-data.ts**

The MCQ data is embedded directly — no formation/squad resolution. Each level carries the full `mcq` object. The `ResolvedLevel` type mirrors what `build-data.mjs` will emit.

```typescript
// Runner-9 data resolution. Each level is an MCQ question; the data is embedded
// verbatim from the recording-status.json block (no pitch/squad assembly needed).
// build-data.mjs emits src/generated/saves.json; this module reads it.
import savesData from "./generated/saves.json";

export type McqAnswer = {
  id: string;            // "A" | "B" | "C"
  text: { english: string; spanish: string };
  photoPath: string | null; // repo-relative, e.g. "Images/Players/..."
};

export type McqData = {
  questionType: "trivia" | "which-player";
  questionText: { english: string; spanish: string };
  answers: McqAnswer[];
  correctAnswerId: string;   // "A" | "B" | "C"
  topicImage: string | null; // repo-relative, e.g. "Images/Quiz/..."
};

export type ResolvedLevel = {
  mcq: McqData;
  revealVoiceEn: string | null; // "Voices/MCQ/.../slug.mp3" or null
  revealVoiceEs: string | null;
};

type RawLevel = {
  mcq: McqData;
  revealVoiceEn?: string | null;
  revealVoiceEs?: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.length > 0 ? SAVES.map((s) => s.name) : ["World Cup"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  if (!save) {
    // Fallback for empty saves (before build-data runs).
    return {
      mcq: {
        questionType: "trivia",
        questionText: { english: "Question", spanish: "Pregunta" },
        answers: [
          { id: "A", text: { english: "A", spanish: "A" }, photoPath: null },
          { id: "B", text: { english: "B", spanish: "B" }, photoPath: null },
          { id: "C", text: { english: "C", spanish: "C" }, photoPath: null },
        ],
        correctAnswerId: "A",
        topicImage: null,
      },
      revealVoiceEn: null,
      revealVoiceEs: null,
    };
  }
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  return {
    mcq: lvl.mcq,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
```

---

## Task 4: Create FootballQuizDemo.tsx and Root.tsx

**Files:**
- Create: `src/FootballQuizDemo.tsx`
- Create: `src/Root.tsx`
- Create: `src/index.ts`

- [ ] **Step 1: Create src/FootballQuizDemo.tsx**

Copy runner-2's `FootballQuizDemo.tsx` verbatim and change ONLY three import paths:
- `import { Level } from "./scenes/Level";`
- `import { AUTO_FORMATION, resolveBackground, type DemoProps } from "./schema";` → remove `AUTO_FORMATION` (not in schema), keep `resolveBackground, type DemoProps`
- `import { levelCount, resolveLevel } from "./level-data";`

Also `resolveLevel` in runner-9 takes only `(saveName, levelNumber)` — no `formationLabel`. Remove the `formationLabel` / `AUTO_FORMATION` lines:

```typescript
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
import { resolveBackground, type DemoProps } from "./schema";
import { levelCount, resolveLevel } from "./level-data";
import { INTRO_STRINGS, TITLE_FONT_SIZE } from "./config";

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

  const levels = React.useMemo(
    () => Array.from({ length: n }, (_, i) => resolveLevel(props.save, i + 1)),
    [props.save, n],
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
      <Intro language={props.language} questionsCount={n} strings={INTRO_STRINGS} titleFontSize={TITLE_FONT_SIZE} />
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
```

- [ ] **Step 2: Create src/Root.tsx**

Note: `demoSchema` in runner-9 has no `formation` field. Default props accordingly. Use `SAVE_NAMES[0]` as default save ("World Cup"):

```typescript
import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, calculateMetadata, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";
import { COMPOSITION_ID, THEME_DEFAULT } from "./config";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={FootballQuizDemo}
      durationInFrames={totalFramesForFps(60, 5)}
      calculateMetadata={calculateMetadata}
      fps={60}
      width={1920}
      height={1080}
      schema={demoSchema}
      defaultProps={{
        save: "World Cup" as const,
        levels: "1" as const,
        language: "English" as const,
        ending: "Random" as const,
        competition: "World Cup" as const,
        color: THEME_DEFAULT.color,
        effect: THEME_DEFAULT.effect,
        opacity: THEME_DEFAULT.opacity,
        transition: "Soft Iris" as const,
      }}
    />
  );
};
```

- [ ] **Step 3: Create src/index.ts (verbatim from runner-2)**

```typescript
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

---

## Task 5: Create the MCQ Level scene (bespoke)

**Files:**
- Create: `src/scenes/Level.tsx`

This is the most complex file — it replicates `mcq.css` in inline React styles and handles both question types plus reveal animation.

- [ ] **Step 1: Create src/scenes/Level.tsx**

Key design decisions:
- `REVEAL_START = 185` (same as runner-2 — timer runs from frame 14 to 185, then reveal).
- Trivia layout: question (top) + `.mcq-trivia-body` row (topic card left 44%, answers col right).
- Which-player layout: question (top) + three photo cards row.
- Reveal: correct card scales 1.05, green glow; others fade to opacity 0.32.
- Timer and LevelBadge copied from runner-2 Level.tsx (they are layout-independent).
- No pitch/pitch shift needed — the MCQ fills `AbsoluteFill` directly.

```typescript
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { sharedSrc, type Language } from "@shared/paths";
import { COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

export const REVEAL_START = 185;

// ── LevelBadge (gold number, top-left) ──────────────────────────────────────
const LevelBadge: React.FC<{ frame: number; n: number; opacity: number }> = ({ frame, n, opacity }) => {
  const pop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.8, stiffness: 170 },
    durationInFrames: 32,
  });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div style={{ position: "absolute", top: 34, left: 40, opacity, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div
        style={{
          width: 156,
          height: 156,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
          border: "7px solid rgba(255,255,255,0.94)",
          boxShadow: "0 18px 38px rgba(0,0,0,0.55), inset 0 -8px 18px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 93,
          lineHeight: 1,
          color: "#241500",
          textShadow: "0 2px 0 rgba(255,255,255,0.25)",
        }}
      >
        {n}
      </div>
    </div>
  );
};

// ── Timer ring (top-right) ────────────────────────────────────────────────────
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS.accent;
  return (
    <div style={{ position: "absolute", top: 34, right: 40, width: 162, height: 162, opacity, transform: `scale(${scale})`, transformOrigin: "top right" }}>
      <svg width={162} height={162} style={{ display: "block", filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.5))" }}>
        <circle cx={81} cy={81} r={R} fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" strokeWidth={14} />
        <circle
          cx={81} cy={81} r={R} fill="none" stroke={ringColor} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - remain)} transform="rotate(-90 81 81)"
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily, fontWeight: 800, fontSize: 72, color: COLORS.white, textShadow: "0 2px 6px rgba(0,0,0,0.6)",
      }}>
        {secs}
      </div>
    </div>
  );
};

// ── MCQ Question text ─────────────────────────────────────────────────────────
const QuestionText: React.FC<{ text: string }> = ({ text }) => (
  <div style={{
    fontFamily,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    color: "#fff",
    textAlign: "center" as const,
    fontSize: 54,
    lineHeight: 1.06,
    letterSpacing: 0.5,
    textShadow: "0 4px 18px rgba(0,0,0,0.45)",
    maxWidth: "88%",
    flexShrink: 0,
  }}>
    {text.toUpperCase()}
  </div>
);

// ── Trivia: letter badge for answer rows ──────────────────────────────────────
const LetterBadge: React.FC<{ id: string }> = ({ id }) => (
  <div style={{
    flexShrink: 0,
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "radial-gradient(circle at 30% 30%, #ffd66b, #e8a13a)",
    color: "#7a0e37",
    fontWeight: 900,
    fontSize: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.75), 0 4px 10px rgba(0,0,0,0.3)",
    fontFamily,
  }}>
    {id}
  </div>
);

// ── Trivia: answer row (pill) ─────────────────────────────────────────────────
const AnswerRow: React.FC<{
  id: string;
  text: string;
  isCorrect: boolean;
  revealed: boolean;
  revealProgress: number;
}> = ({ id, text, isCorrect, revealed, revealProgress }) => {
  const opacity = revealed
    ? isCorrect
      ? 1
      : interpolate(revealProgress, [0, 1], [1, 0.32], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const scale = revealed && isCorrect
    ? interpolate(revealProgress, [0, 1], [1, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const glow = revealed && isCorrect ? `0 0 0 6px #28c76f, 0 18px 44px rgba(40,199,111,0.5)` : "0 10px 26px rgba(0,0,0,0.28)";
  const textColor = revealed && isCorrect ? "#0a7a3f" : "#15151c";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 20,
      background: "#fff",
      borderRadius: 999,
      padding: "14px 28px",
      boxShadow: glow,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "center",
    }}>
      <LetterBadge id={id} />
      <span style={{
        fontFamily,
        fontWeight: 900,
        color: textColor,
        fontSize: 42,
        letterSpacing: 0.5,
        textTransform: "uppercase" as const,
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {text.toUpperCase()}
      </span>
    </div>
  );
};

// ── Which-player: photo card badge (red, top-left corner) ─────────────────────
const PhotoBadge: React.FC<{ id: string }> = ({ id }) => (
  <div style={{
    position: "absolute",
    top: -12,
    left: -12,
    zIndex: 3,
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "radial-gradient(circle at 30% 30%, #ff6b6b, #c2185b)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
    fontFamily,
  }}>
    {id}
  </div>
);

// ── Which-player: one photo card ──────────────────────────────────────────────
const PlayerCard: React.FC<{
  id: string;
  name: string;
  photoPath: string | null;
  isCorrect: boolean;
  revealed: boolean;
  revealProgress: number;
}> = ({ id, name, photoPath, isCorrect, revealed, revealProgress }) => {
  const opacity = revealed
    ? isCorrect
      ? 1
      : interpolate(revealProgress, [0, 1], [1, 0.32], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const scale = revealed && isCorrect
    ? interpolate(revealProgress, [0, 1], [1, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const glow = revealed && isCorrect ? `0 0 0 6px #28c76f, 0 18px 44px rgba(40,199,111,0.5)` : "0 16px 40px rgba(0,0,0,0.4)";
  const nameColor = revealed && isCorrect ? "#0a7a3f" : "#15151c";
  const photoSrc = photoPath ? sharedSrc(photoPath) : null;

  return (
    <div style={{
      flex: "0 0 28%",
      maxWidth: "30%",
      display: "flex",
      flexDirection: "column" as const,
      borderRadius: 24,
      background: "#fff",
      position: "relative" as const,
      boxShadow: glow,
      overflow: "visible",
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "center",
    }}>
      <PhotoBadge id={id} />
      {/* photo area */}
      <div style={{
        flex: "1 1 auto",
        minHeight: 0,
        borderRadius: "24px 24px 0 0",
        overflow: "hidden",
        background: "linear-gradient(180deg, #e9edf2, #c9d2dc)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        minHeight: 260,
      }}>
        {photoSrc ? (
          <Img
            src={photoSrc}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
          />
        ) : null}
      </div>
      {/* name bar */}
      <div style={{
        flexShrink: 0,
        background: "#fff",
        color: nameColor,
        textAlign: "center" as const,
        fontFamily,
        fontWeight: 900,
        fontSize: 32,
        padding: "16px 8px",
        borderRadius: "0 0 24px 24px",
        textTransform: "uppercase" as const,
        whiteSpace: "nowrap" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {name.toUpperCase()}
      </div>
    </div>
  );
};

// ── Main Level component ───────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
}> = ({ level, levelNumber, language }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const mcq = level.mcq;
  const lang = language === "Spanish" ? "spanish" : "english";
  const questionText = mcq.questionText[lang] || mcq.questionText.english || "";
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const revealed = frame >= REVEAL_START;
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  const topicSrc = mcq.topicImage ? sharedSrc(mcq.topicImage) : null;

  return (
    <AbsoluteFill style={{ padding: "0 60px", boxSizing: "border-box" as const }}>
      {/* ── MCQ stage ─────────────────────────────────────────── */}
      <AbsoluteFill style={{
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 24,
        padding: "20px 60px 24px",
        boxSizing: "border-box" as const,
      }}>
        {/* Question */}
        <QuestionText text={questionText} />

        {mcq.questionType === "trivia" ? (
          /* ── Trivia: topic image left + answer rows right ── */
          <div style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 64,
          }}>
            {/* Topic card */}
            <div style={{
              flex: "0 0 44%",
              maxWidth: "46%",
              alignSelf: "center",
              aspectRatio: "16/11",
              borderRadius: 26,
              overflow: "hidden",
              background: "rgba(255,255,255,0.1)",
              border: "6px solid rgba(255,255,255,0.92)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {topicSrc ? (
                <Img src={topicSrc} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : null}
            </div>

            {/* Answer rows */}
            <div style={{
              flex: "1 1 0",
              maxWidth: "50%",
              display: "flex",
              flexDirection: "column" as const,
              justifyContent: "center",
              gap: 24,
            }}>
              {mcq.answers.map((ans) => (
                <AnswerRow
                  key={ans.id}
                  id={ans.id}
                  text={ans.text[lang] || ans.text.english || ""}
                  isCorrect={ans.id === mcq.correctAnswerId}
                  revealed={revealed}
                  revealProgress={revealProgress}
                />
              ))}
            </div>
          </div>
        ) : (
          /* ── Which-player: three photo cards ── */
          <div style={{
            flex: "1 1 auto",
            minHeight: 0,
            width: "100%",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            gap: 40,
            paddingTop: 16,
          }}>
            {mcq.answers.map((ans) => (
              <PlayerCard
                key={ans.id}
                id={ans.id}
                name={ans.text[lang] || ans.text.english || ""}
                photoPath={ans.photoPath}
                isCorrect={ans.id === mcq.correctAnswerId}
                revealed={revealed}
                revealProgress={revealProgress}
              />
            ))}
          </div>
        )}
      </AbsoluteFill>

      {/* ── Timer + Badge (fade out on reveal) ── */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* ── Audio ── */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
      <Sequence from={f(REVEAL_START)}>
        <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
      </Sequence>
      {revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
```

---

## Task 6: Create scripts/build-data.mjs

**Files:**
- Create: `scripts/build-data.mjs`

- [ ] **Step 1: Create scripts/build-data.mjs**

Key differences from runner-2:
- Reads blocks with prefix `"9|"`.
- Data is embedded directly in `block.script.levels[i].mcq` — no squad resolution.
- Collects image paths from `mcq.topicImage` + `mcq.answers[].photoPath` (repo-relative under `Images/`).
- Answer voice: look for `.Storage/Voices/MCQ/Football Quiz MCQ/<lang>/answers/<slug>.mp3` where slug = mcqSlug(correctAnswer.text).
- Quiz-title voice: try `Game name/Football Quiz MCQ/english/*.mp3` (likely none); gracefully null.
- bgm: use `firstBgm()` (alphabetical pick from Ringhton/).

```javascript
// Runner 9 — "Football Quiz Multiple Choice (A/B/C)".
// MCQ data is embedded in block.script.levels[i].mcq — no squad file needed.
// Emits src/generated/{saves,audio}.json and syncs assets into .remotion-shared/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  norm,
  makeVoiceHelpers,
  COMMON_ASSETS,
  buildAudioManifest,
  firstBgm,
  syncAssets,
  syncVoices,
} from "../../../.remotion-shared/src/build-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const P = repoPaths(projectDir);

const V = makeVoiceHelpers(P.VOICES_SRC, "MCQ/Football Quiz MCQ");

// mcqSlug: mirrors run_site.py `_mcq_slug` and mcq-mode.js `mcqSlug`.
function mcqSlug(text) {
  const s = String(text || "")
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 80) || "untitled";
}

// Resolve a correct-answer voice for a given MCQ level.
// Path: MCQ/Football Quiz MCQ/<lang>/answers/<slug>.mp3
function resolveAnswerVoice(correctText, lang) {
  if (!correctText) return null;
  const slug = mcqSlug(correctText);
  return V.voiceRel(`${lang}/answers/${slug}.mp3`);
}

// Normalize an image path from the block (repo-relative "Images/..." or leading slash)
// to a path relative to P.IMAGES (i.e. strip "Images/" prefix).
function imageRelPath(rawPath) {
  if (!rawPath) return null;
  const clean = String(rawPath).replace(/\\/g, "/").replace(/^\.?\/+/, "");
  // Remove leading "Images/" prefix so it's relative to P.IMAGES
  return clean.replace(/^Images\//i, "") || null;
}

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];
let missingImages = 0;
let missingVoices = 0;

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("9|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue;

  const scriptLevels = (block.script && Array.isArray(block.script.levels))
    ? block.script.levels
    : [];

  const levels = [];
  for (const lvl of scriptLevels) {
    const mcq = lvl.mcq;
    if (!mcq || !Array.isArray(mcq.answers) || mcq.answers.length === 0) continue;

    const correctAns = mcq.answers.find((a) => a.id === mcq.correctAnswerId);
    const correctTextEn = correctAns ? (correctAns.text && correctAns.text.english) || "" : "";
    const correctTextEs = correctAns ? (correctAns.text && correctAns.text.spanish) || correctTextEn : "";

    const revealVoiceEn = resolveAnswerVoice(correctTextEn, "english");
    const revealVoiceEs = resolveAnswerVoice(correctTextEs, "spanish") || revealVoiceEn;
    if (!revealVoiceEn) missingVoices += 1;

    // Normalize answers for the saved level (strip "Images/" prefix from photoPath)
    const normalizedAnswers = mcq.answers.map((a) => ({
      id: a.id,
      text: a.text,
      photoPath: imageRelPath(a.photoPath),
    }));

    levels.push({
      mcq: {
        questionType: mcq.questionType,
        questionText: mcq.questionText,
        answers: normalizedAnswers,
        correctAnswerId: mcq.correctAnswerId,
        topicImage: imageRelPath(mcq.topicImage),
      },
      revealVoiceEn,
      revealVoiceEs,
    });
  }
  if (levels.length) saves.push({ name, levels });
}

const OUT = path.join(projectDir, "src", "generated", "saves.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ saves }, null, 0));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✓ ${saves.length} saves, ${saves.reduce((n, s) => n + s.levels.length, 0)} levels -> src/generated/saves.json (${kb} KB)`);
console.log(`  answer voice missing: ${missingVoices}`);

// ── audio manifest ─────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
// No dedicated MCQ quiz-title voice — try "Game name/Football Quiz MCQ/<lang>" if it exists.
const quizTitleEn = V.voiceRel(V.findVoiceFile("../Game name/Football Quiz MCQ/english", /.+/));
const quizTitleEs = V.voiceRel(V.findVoiceFile("../Game name/Football Quiz MCQ/spanish", /.+/));
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "— (none)"}/ES ${audio.quizTitle.spanish ? "ok" : "— (none)"}`);

// ── sync assets ────────────────────────────────────────────────────────────────
const wantedImages = new Set();
for (const save of saves) {
  for (const lv of save.levels) {
    if (lv.mcq.topicImage) wantedImages.add(lv.mcq.topicImage);
    for (const ans of lv.mcq.answers) {
      if (ans.photoPath) wantedImages.add(ans.photoPath);
    }
  }
}
COMMON_ASSETS.forEach((p) => wantedImages.add(p));
const a = syncAssets([...wantedImages], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  images: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
missingImages = a.missing;

const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);

if (missingImages > 0) {
  console.warn(`  ⚠ ${missingImages} image(s) not found in Images/ — those levels will show empty slots`);
}
```

---

## Task 7: Create scripts/render.mjs and Open Remotion Studio.bat

**Files:**
- Create: `scripts/render.mjs`
- Create: `Open Remotion Studio.bat` (MUST be CRLF)

- [ ] **Step 1: Create scripts/render.mjs**

```javascript
// Render a video into the shared Ready Videos tree:
//   ___Remotion___/Ready Videos/<Quiz Name>/<Language>/<save>.mp4
// Usage: npm run render -- --save "World Cup" --language English --levels All [--fps 60]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSITION_ID = "Football-Quiz-Multiple-Choice-Regular";
const QUIZ_NAME = "Football Quiz Multiple Choice";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const save = arg("save", "World Cup");
const language = arg("language", "English");
const levels = arg("levels", "All");
const fps = arg("fps", "60");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const outDir = path.resolve(projectDir, "..", "Ready Videos", QUIZ_NAME, language);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${save}.mp4`);

const propsFile = path.join(projectDir, "out", ".render-props.json");
fs.mkdirSync(path.dirname(propsFile), { recursive: true });
fs.writeFileSync(propsFile, JSON.stringify({ save, language, levels }));

console.log(`▶ Rendering "${save}" (${language}, levels=${levels}) → ${outFile}`);
const cmd = `npx remotion render ${COMPOSITION_ID} "${outFile}" "--props=${propsFile}"`;
const res = spawnSync(cmd, { cwd: projectDir, stdio: "inherit", shell: true });
process.exit(res.status ?? 0);
```

- [ ] **Step 2: Create Open Remotion Studio.bat (then convert to CRLF)**

Write the file content:

```bat
@echo off
title Remotion Studio - Football Quiz Multiple Choice
cd /d "%~dp0"

rem Ensure npm works when launched by double-click (Explorer PATH can differ)
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo   Remotion Studio - Football Quiz Multiple Choice
echo   ------------------------------------------------
echo   Browser: http://localhost:3000
echo   Keep this window open while you work. Close it to stop the studio.
echo.

call npm.cmd run studio

echo.
echo   Studio stopped.
pause
```

After writing, convert to CRLF using PowerShell:
```powershell
$path = "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion\Open Remotion Studio.bat"
$content = [System.IO.File]::ReadAllText($path)
$crlf = $content -replace "(?<!\r)\n", "`r`n"
[System.IO.File]::WriteAllText($path, $crlf, [System.Text.Encoding]::GetEncoding(1252))
```

---

## Task 8: Install dependencies and run build-data

**Files:**
- Modify: `src/generated/saves.json` (overwritten by build-data)
- Modify: `src/generated/audio.json` (overwritten by build-data)

- [ ] **Step 1: Install npm dependencies**

```
cd "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion"
npm install --no-audit --no-fund
```

Expected: package-lock.json created, node_modules populated. Takes 30-60s.

- [ ] **Step 2: Run build-data**

```
node scripts/build-data.mjs
```

Expected output (approximate):
```
✓ 1 saves, 50 levels -> src/generated/saves.json (XX KB)
  answer voice missing: 49
  audio: bgm ok, quizTitle EN — (none)/ES — (none)
  images: +XX copied, XX up-to-date, XX missing
  voices: +1 copied, 0 up-to-date, X missing
```

- The high answer-voice missing count is expected (only `uruguay.mp3` exists).
- Missing images count depends on which `Images/Quiz/World Cup/*.jpg` files exist locally.
- Verify `src/generated/saves.json` is non-empty:

```
node -e "const d=require('./src/generated/saves.json'); console.log(d.saves.length, 'saves,', d.saves[0].levels.length, 'levels');"
```

Expected: `1 saves, 50 levels`

---

## Task 9: Verify stills and iterate

- [ ] **Step 1: Take a still at frame 600 (question screen)**

```
npx remotion still Football-Quiz-Multiple-Choice-Regular out/q.png --frame=600 --scale=0.5 --timeout=120000 --concurrency=2
```

Read `out/q.png`. Expected to show a trivia question (frame 600 is level 2, ~frame 280 into that level, before reveal at 185 of level 2 = second level starts at BALL_INTRO_FRAMES + introFrames + LEVEL_FRAMES ≈ 540 + 10-20 intro ≈ frame range).

- If the still is a solid-color screen or entirely black, the most likely cause is:
  - TypeScript compile error → check console output from the still command for errors.
  - `SAVE_NAMES` is empty → check `src/generated/saves.json` has saves.

- [ ] **Step 2: Take a still at frame 830 (during a reveal)**

```
npx remotion still Football-Quiz-Multiple-Choice-Regular out/r.png --frame=830 --scale=0.5 --timeout=120000 --concurrency=2
```

Expected: same question but correct answer highlighted green, others dimmed.

- [ ] **Step 3: Read both stills and compare against mcq.css spec**

Look for:
- Trivia: white pill answer rows with gold letter badge (A/B/C), topic image card on left with white border.
- Reveal: correct row has green glow ring, others at ~30% opacity, correct text in green.
- Timer ring (gold) top-right, gold number badge top-left.

If the question screen shows a `which-player` level instead of trivia at frame 600, adjust the frame. Level 1 starts at `BALL_INTRO_FRAMES + introFrames - IRIS_FRAMES = 90 + 179 - 39 = 230` (design frames) → at 60fps that is frame `230 * 2 = 460`. Frame 600 is in level 1 still. To hit reveal for level 1: `460 + 185 * 2 = 460 + 370 = 830` (which is why frame 830 was chosen for reveal).

Check which questionType level 0 is: already confirmed — level 0 is trivia ("Who won the first FIFA World Cup in 1930?").

- [ ] **Step 4: Fix any layout issues found**

Common issues and fixes:

**Issue: topic image has wrong aspect ratio or isn't visible**
Fix in `Level.tsx`: ensure topicSrc correctly resolves `sharedSrc(mcq.topicImage)`. The `imageRelPath` in build-data strips the `Images/` prefix, and `sharedSrc` calls `staticFile(p)` which resolves against the shared public dir. The image files are synced there by build-data.

**Issue: answer text truncated / overflowing**
Fix: reduce `fontSize` on the answer row text span from 42 to 36px, or add `flexWrap: "wrap"` to the row.

**Issue: player cards too tall / overflowing the frame**
Fix: add `maxHeight: "70%"` to the player cards container div, or reduce the cards `minHeight: 260` to `minHeight: 0`.

**Issue: question text too large for long questions**
Fix: reduce `fontSize` from 54 to 44 in `QuestionText`.

- [ ] **Step 5: Re-take stills after any fixes**

After each fix to `Level.tsx`, re-run the `npx remotion still` commands and read both output images. Iterate until:
- Trivia layout: question top + topic image card (left, 16:11 aspect ratio, white border) + 3 answer pill rows (right, white pills, gold letter badges).
- Which-player layout: question top + 3 photo cards in a row (white cards with red corner badge, player photo, name bar at bottom).
- Reveal: correct answer = green glow + text green, others at ~30% opacity.

---

## Self-Review Checklist

- [x] **Spec coverage:** All sections covered:
  - Folder creation ✓ (Task 1)
  - package.json name + composition id ✓ (Task 1)
  - remotion.config.ts + tsconfig.json verbatim ✓ (Task 1)
  - config.ts: INTRO_STRINGS, TITLE_FONT_SIZE, THEME_DEFAULT ✓ (Task 2)
  - schema.ts: no formation field ✓ (Task 2)
  - FootballQuizDemo.tsx verbatim + 3 import changes ✓ (Task 4)
  - Root.tsx: no formation in defaultProps ✓ (Task 4)
  - Level.tsx: trivia + which-player + reveal animation ✓ (Task 5)
  - level-data.ts: ResolvedLevel with mcq, levelCount, resolveLevel ✓ (Task 3)
  - build-data.mjs: reads 9| blocks, embedded MCQ, images sync, answer voice resolve ✓ (Task 6)
  - render.mjs: COMPOSITION_ID + QUIZ_NAME correct ✓ (Task 7)
  - Open Remotion Studio.bat: retitled + CRLF ✓ (Task 7)
  - npm install + build-data run ✓ (Task 8)
  - Two stills + iterate ✓ (Task 9)

- [x] **Placeholder scan:** No TBD/TODO in plan. All code is complete.

- [x] **Type consistency:**
  - `McqAnswer.photoPath` is `string | null` in `level-data.ts`; `PlayerCard` receives `string | null` ✓
  - `ResolvedLevel.mcq` is `McqData`; `Level` destructures `level.mcq` ✓
  - `resolveLevel(saveName, levelNumber)` — no `formationLabel` param ✓
  - `DemoProps` has no `formation` field; `FootballQuizDemo` doesn't reference `AUTO_FORMATION` ✓
  - `SAVE_NAMES` exported from `level-data.ts`, imported in `schema.ts` ✓
  - `audioManifest.ticking` + `audioManifest.stinger` come from `buildAudioManifest` which always sets them ✓

- [x] **CRLF:** `.bat` file has CRLF conversion step ✓

- [x] **No Chrome DevTools MCP used** ✓

- [x] **No edits to `.remotion-shared/`, `___Remotion___/_studio/`, or other runner folders** ✓
