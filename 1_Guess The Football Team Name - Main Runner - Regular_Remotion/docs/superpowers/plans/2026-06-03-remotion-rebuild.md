# Remotion Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Remotion (React/TS) frame-deterministic renderer inside `1_..._Regular_Remotion` that reproduces the live app's Play-Video flow — same layout, animations, countdown, flips, transitions, audio, and **exact timing** — triggered by a Quality/FPS modal on `#record-video-btn` and spawned by the Python server.

**Architecture:** A single shared `timeline.ts` encodes every phase boundary as frame math from the verified constants (the one source of truth for `calculateMetadata` and every `<Sequence>`). React components render each phase as a pure function of `useCurrentFrame()`. The existing Python server gains a `/__remotion-render` endpoint that spawns `npx remotion render` and streams SSE progress. Assets load over `http://127.0.0.1:<port>/...` URLs served by that same server. Timing is verified by unit tests AND by diffing against a `__audioTap` manifest captured from the live app.

**Tech Stack:** Remotion 4.x, React 18, TypeScript, `@remotion/cli`, `@remotion/media-utils`, Vitest (timeline unit tests), Node 18+, existing Python `http.server`.

**Determinism contract (verified — see spec `docs/superpowers/specs/2026-06-03-remotion-rebuild-design.md`):**
All ms constants below are quoted from source and must appear in `timeline.ts` as named constants with `// source:` comments. No magic numbers anywhere else.

---

## File Structure

```
1_..._Regular_Remotion/
├─ remotion/                         # NEW — the Remotion project (self-contained)
│  ├─ package.json                   # remotion deps + scripts
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  ├─ remotion.config.ts             # image format png, overwrite, etc.
│  └─ src/
│     ├─ Root.tsx                    # <Composition id="Quiz"> + calculateMetadata
│     ├─ QuizComposition.tsx         # top-level: maps levels -> <Sequence>s + audio
│     ├─ timeline.ts                 # PURE timing math (the source of truth)
│     ├─ timeline.test.ts            # Vitest unit tests for timeline.ts
│     ├─ props.ts                    # TS types for the render props (state JSON)
│     ├─ assets.ts                   # rel-path -> served-URL helper
│     ├─ easing.ts                   # cubic-bezier(0.25,1,0.5,1) etc.
│     ├─ audio/
│     │  ├─ AudioTimeline.tsx        # all <Audio> layers + duck/crossfade envelopes
│     │  └─ envelopes.ts             # pure volume-envelope math + tests
│     ├─ levels/
│     │  ├─ LogoLevel.tsx
│     │  ├─ LandingLevel.tsx
│     │  ├─ QuestionLevel.tsx
│     │  └─ OutroLevel.tsx
│     ├─ pitch/
│     │  ├─ Pitch.tsx                # formation -> 11 slots
│     │  ├─ PlayerSlot.tsx           # front/back faces + flip
│     │  └─ formations.ts            # ported FORMATIONS (or imported from ../js)
│     ├─ TeamHeader.tsx
│     ├─ CountdownRing.tsx
│     ├─ BackgroundTheme.tsx
│     ├─ ProgressSteps.tsx
│     └─ transitions/
│        ├─ TransitionOverlay.tsx    # dispatches by effect key
│        └─ gridOverlay.tsx          # default effect first; others added later
├─ js/remotion-config-modal.js       # NEW — vanilla modal bound to #record-video-btn
├─ js/remotion-render-client.js      # NEW — POST + SSE progress (reuses render-progress-ui look)
├─ run_site.py                       # MODIFY — add /__remotion-render + progress SSE
└─ docs/superpowers/...              # spec + this plan
```

**Responsibility boundaries:** `timeline.ts` knows *when*; components know *what to draw*; `AudioTimeline` knows *what to play*; the modal/client know *how to trigger*; the server knows *how to spawn*. None reaches into another's concern.

---

## Phase 0 — Harness & one static frame (DE-RISK)

### Task 0.1: Scaffold the Remotion project

**Files:**
- Create: `remotion/package.json`
- Create: `remotion/tsconfig.json`
- Create: `remotion/remotion.config.ts`

- [ ] **Step 1: Create `remotion/package.json`**

```json
{
  "name": "regular-remotion",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "render": "remotion render src/Root.tsx Quiz",
    "studio": "remotion studio src/Root.tsx",
    "test": "vitest run"
  },
  "dependencies": {
    "@remotion/cli": "4.0.290",
    "@remotion/media-utils": "4.0.290",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "remotion": "4.0.290"
  },
  "devDependencies": {
    "@types/react": "18.3.12",
    "typescript": "5.6.3",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `remotion/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `remotion/remotion.config.ts`**

```ts
import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setConcurrency(null); // auto
```

- [ ] **Step 4: Install deps**

Run: `cd remotion && npm install`
Expected: `node_modules/` created, no peer-dep errors that block (warnings OK). If `npm` not found, STOP and report — Node toolchain is a prerequisite.

- [ ] **Step 5: Commit**

```bash
git add remotion/package.json remotion/tsconfig.json remotion/remotion.config.ts
git commit -m "chore(remotion): scaffold project config"
```

### Task 0.2: Minimal Root + Quiz composition that renders one frame

**Files:**
- Create: `remotion/src/Root.tsx`
- Create: `remotion/src/QuizComposition.tsx`

- [ ] **Step 1: Create `remotion/src/QuizComposition.tsx` (placeholder visual)**

```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";

export const QuizComposition: React.FC<{ title?: string }> = ({ title = "Quiz" }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1117", color: "#fff",
      justifyContent: "center", alignItems: "center", fontSize: 80 }}>
      {title} — frame {frame}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Create `remotion/src/Root.tsx`**

```tsx
import { Composition } from "remotion";
import { QuizComposition } from "./QuizComposition";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Quiz"
    component={QuizComposition}
    durationInFrames={120}
    fps={60}
    width={2560}
    height={1440}
    defaultProps={{ title: "Quiz" }}
  />
);
```

Note: Remotion's CLI auto-detects `RemotionRoot` via `registerRoot`. Add an entry file:

- [ ] **Step 3: Create `remotion/src/index.ts`**

```ts
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
```

Update `remotion.config.ts` entry point is auto; ensure `package.json` scripts point at `src/index.ts`:

- [ ] **Step 4: Fix scripts to entry file**

In `remotion/package.json` change `"render"` and `"studio"` targets from `src/Root.tsx` to `src/index.ts`.

- [ ] **Step 5: Render one frame**

Run: `cd remotion && npx remotion render src/index.ts Quiz out/test.mp4 --frames=0-1`
Expected: `out/test.mp4` produced; no crash. This proves the toolchain works on this machine.

- [ ] **Step 6: Commit**

```bash
git add remotion/src/Root.tsx remotion/src/QuizComposition.tsx remotion/src/index.ts remotion/package.json
git commit -m "feat(remotion): minimal Quiz composition renders"
```

### Task 0.3: Prove served-URL assets load in headless render

**Files:**
- Modify: `remotion/src/QuizComposition.tsx`

- [ ] **Step 1: Add an `<Img>`/`<Audio>` pointing at a served asset**

Temporarily render `<Img src="http://127.0.0.1:8888/Images/..." />` (pick any real crest path) and `<Audio src="http://127.0.0.1:8888/.Storage/Voices/Ticking sound/ticking sound.mp3" />`.

- [ ] **Step 2: Start the server, then render**

Run (two shells): start `python run_site.py` in the runner; then `cd remotion && npx remotion render src/index.ts Quiz out/asset.mp4 --frames=0-30`
Expected: render completes with the crest visible in the frame (open `out/asset.mp4`). If Remotion can't fetch the URL, STOP — resolve asset serving before continuing.

- [ ] **Step 3: Revert the temporary asset code** (keep the learning; the real impl comes later). Commit nothing or revert.

**GATE 0:** Toolchain renders; served URLs load. Do not proceed otherwise.

---

## Phase 1 — `timeline.ts`: the timing source of truth (TDD)

This is the most important phase for your "timing must be the same" requirement. `timeline.ts` is pure (no React), unit-tested, and consumed by everything else.

### Task 1.1: Constants module (verified values)

**Files:**
- Create: `remotion/src/timeline.ts`
- Test: `remotion/src/timeline.test.ts`

- [ ] **Step 1: Write failing test for constants**

```ts
// remotion/src/timeline.test.ts
import { describe, it, expect } from "vitest";
import { MS } from "./timeline";

describe("MS constants (verified against source)", () => {
  it("matches the live app", () => {
    expect(MS.LOGO_VOICE_DELAY).toBe(500);        // video.js:47
    expect(MS.LOGO_REVEAL_DELAY).toBe(2000);      // video.js:18
    expect(MS.LOGO_AFTER_REVEAL).toBe(1200);      // video.js:196
    expect(MS.INTRO_STEP_DELAY_IDX0).toBe(1000);  // video.js:258
    expect(MS.INTRO_STEP_DELAY_IDX1).toBe(500);   // video.js:258
    expect(MS.FLIP_DELAY_INTRO).toBe(1000);       // video.js:360
    expect(MS.STAGE_TRANSITION).toBe(820);        // video.js:51 / levels.js:23
    expect(MS.AFTER_CUSTOM_TRANSITION).toBe(200); // video.js:231
    expect(MS.COUNTDOWN_TOTAL).toBe(10000);       // video.js:266 (10*1000)
    expect(MS.TICK_LEAD).toBe(3000);              // video.js:299 (10-3)s
    expect(MS.REVEAL_STINGER).toBe(150);          // video.js:378 / audio.js:1054
    expect(MS.REVEAL_VOICE_DELAY).toBe(600);      // audio.js:1044
    expect(MS.FLIP_DELAY_REVEAL).toBe(3000);      // video.js:382
    expect(MS.FLIP_DURATION).toBe(780);           // pitch.css:423 (0.78s)
    expect(MS.OUTRO_TAIL).toBe(1000);             // levels.js:222
    expect(MS.PROGRESS_VOICE_DELAY).toBe(1000);   // audio.js:1100
    expect(MS.DEFAULT_TRANSITION_PHASE).toBe(840);// transitions.js:45 PHASE_DUR
  });
});
```

- [ ] **Step 2: Run, expect fail** — Run: `cd remotion && npx vitest run` → FAIL "Cannot find module './timeline'".

- [ ] **Step 3: Implement constants**

```ts
// remotion/src/timeline.ts
// SOURCE OF TRUTH for timing. Every value cites the live-app line it mirrors.
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
  DEFAULT_TRANSITION_PHASE: 840,// transitions.js:45 PHASE_DUR=0.84 (grid-overlay show/hide ~0.4 inside; full normalized phase 840)
} as const;
```

- [ ] **Step 4: Run, expect pass** — Run: `cd remotion && npx vitest run` → PASS.
- [ ] **Step 5: Commit** — `git add remotion/src/timeline.ts remotion/src/timeline.test.ts && git commit -m "feat(timeline): verified ms constants"`

### Task 1.2: `msToFrames` + phase-block builders

**Files:**
- Modify: `remotion/src/timeline.ts`, `remotion/src/timeline.test.ts`

- [ ] **Step 1: Write failing tests for frame conversion + question block**

```ts
import { msToFrames, questionBlockMs } from "./timeline";
describe("frame math", () => {
  it("rounds ms to frames", () => {
    expect(msToFrames(1000, 60)).toBe(60);
    expect(msToFrames(780, 60)).toBe(47);  // 0.78s*60 = 46.8 -> 47
    expect(msToFrames(1000, 30)).toBe(30);
  });
  it("question block = countdown + reveal hold", () => {
    // 10s countdown + 3s reveal hold (stinger+voice live inside reveal)
    expect(questionBlockMs()).toBe(13000); // video.js: 10000 + 3000
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement**

```ts
export const msToFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);
export const questionBlockMs = () => MS.COUNTDOWN_TOTAL + MS.FLIP_DELAY_REVEAL; // 13000
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(timeline): msToFrames + questionBlockMs"`

### Task 1.3: Full timeline builder (the flow as data)

This encodes the exact Regular flow from `video.js`/`levels.js`. It returns an ordered list of phases with absolute ms offsets, plus per-question audio cue offsets. **Transition handling:** for v1 we assume the deterministic 820ms `STAGE_TRANSITION` fallback (see Open Item; custom-transition reproduction is Phase 4b). `buildTimeline` takes `{ questionCount, fps, transitionMs }`.

**Files:**
- Modify: `remotion/src/timeline.ts`, `remotion/src/timeline.test.ts`

- [ ] **Step 1: Write failing tests for `buildTimeline`**

```ts
import { buildTimeline } from "./timeline";

describe("buildTimeline (Regular flow)", () => {
  const fps = 60;
  const tl = buildTimeline({ questionCount: 3, fps, transitionMs: 820 });

  it("phase order is logo, transition, landing, transition, Q*N(+transition), outro", () => {
    expect(tl.phases.map(p => p.kind)).toEqual([
      "logo", "transition", "landing",
      "transition", "question",
      "transition", "question",
      "transition", "question",
      "transition", "outro",
    ]);
  });

  it("logo block duration = reveal(2000) + afterReveal(1200) + step(1000) + flipDelay(1000)", () => {
    const logo = tl.phases[0];
    expect(logo.durationMs).toBe(2000 + 1200 + 1000 + 1000); // 5200
  });

  it("landing block = step(500) + flipDelay(1000)", () => {
    const landing = tl.phases[2];
    expect(landing.durationMs).toBe(500 + 1000); // 1500
  });

  it("each question block = 13000ms", () => {
    const q = tl.phases.find(p => p.kind === "question")!;
    expect(q.durationMs).toBe(13000);
  });

  it("transition blocks are 820ms", () => {
    expect(tl.phases.filter(p => p.kind === "transition").every(p => p.durationMs === 820)).toBe(true);
  });

  it("question cue offsets: tick at 7000, reveal at 10000, stinger at 10150, voice at 10600", () => {
    const q = tl.phases.find(p => p.kind === "question")!;
    expect(q.cues.tickStartMs).toBe(7000);
    expect(q.cues.revealMs).toBe(10000);
    expect(q.cues.stingerMs).toBe(10150);
    expect(q.cues.voiceMs).toBe(10600);
    expect(q.cues.flipStartMs).toBe(10000);
    expect(q.cues.flipDurationMs).toBe(780);
  });

  it("absolute start frames are cumulative", () => {
    // logo starts at 0
    expect(tl.phases[0].startFrame).toBe(0);
    // transition after logo starts at 5200ms
    expect(tl.phases[1].startFrame).toBe(msToFramesHelper(5200, fps));
  });

  it("totalDurationFrames is the sum of all blocks + outro tail", () => {
    const sumMs = tl.phases.reduce((a, p) => a + p.durationMs, 0);
    expect(tl.totalDurationFrames).toBe(Math.round((sumMs / 1000) * fps));
  });
});
function msToFramesHelper(ms: number, fps: number) { return Math.round((ms/1000)*fps); }
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement `buildTimeline`**

```ts
export type PhaseKind = "logo" | "landing" | "question" | "outro" | "transition";
export interface QuestionCues {
  tickStartMs: number; revealMs: number; stingerMs: number; voiceMs: number;
  flipStartMs: number; flipDurationMs: number;
}
export interface Phase {
  kind: PhaseKind; index: number; durationMs: number;
  startMs: number; startFrame: number; durationFrames: number;
  cues?: QuestionCues;
}
export interface Timeline { phases: Phase[]; totalDurationFrames: number; fps: number; }

export function buildTimeline(opts: { questionCount: number; fps: number; transitionMs?: number; outroVoiceMs?: number; }): Timeline {
  const fps = opts.fps;
  const transitionMs = opts.transitionMs ?? MS.STAGE_TRANSITION; // 820 fallback
  const outroVoiceMs = opts.outroVoiceMs ?? 0; // probed at calculateMetadata; tail added separately
  const seq: { kind: PhaseKind; durationMs: number; cues?: QuestionCues }[] = [];

  // Logo: reveal(2000) -> afterReveal(1200) -> runVideoStep step(1000, idx0) -> flipDelay(1000)
  seq.push({ kind: "logo", durationMs: MS.LOGO_REVEAL_DELAY + MS.LOGO_AFTER_REVEAL + MS.INTRO_STEP_DELAY_IDX0 + MS.FLIP_DELAY_INTRO });
  seq.push({ kind: "transition", durationMs: transitionMs });
  // Landing (reached via switchLevel(1) from logo): step(500, idx1) -> flipDelay(1000)
  seq.push({ kind: "landing", durationMs: MS.INTRO_STEP_DELAY_IDX1 + MS.FLIP_DELAY_INTRO });
  for (let i = 0; i < opts.questionCount; i++) {
    seq.push({ kind: "transition", durationMs: transitionMs });
    seq.push({
      kind: "question",
      durationMs: MS.COUNTDOWN_TOTAL + MS.FLIP_DELAY_REVEAL,
      cues: {
        tickStartMs: MS.COUNTDOWN_TOTAL - MS.TICK_LEAD, // 7000
        revealMs: MS.COUNTDOWN_TOTAL,                   // 10000
        stingerMs: MS.COUNTDOWN_TOTAL + MS.REVEAL_STINGER,       // 10150
        voiceMs: MS.COUNTDOWN_TOTAL + MS.REVEAL_VOICE_DELAY,     // 10600
        flipStartMs: MS.COUNTDOWN_TOTAL,                // 10000
        flipDurationMs: MS.FLIP_DURATION,              // 780
      },
    });
  }
  seq.push({ kind: "transition", durationMs: transitionMs });
  seq.push({ kind: "outro", durationMs: outroVoiceMs + MS.OUTRO_TAIL });

  // Resolve absolute offsets.
  const phases: Phase[] = [];
  let cursorMs = 0; const counts: Record<string, number> = {};
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
```

- [ ] **Step 4: Run, expect pass.** Fix any off-by-one until green at fps=60 AND add a duplicate test run at fps=30.
- [ ] **Step 5: Commit** — `git commit -am "feat(timeline): full Regular-flow buildTimeline + cues"`

### Task 1.4: Bonus-skip + landing-voice-gated variants

The last question before the outro is skipped (reveal omitted, `flipDelay=0`) when ending ≠ `how-many` (video.js:362-386). Landing, when started directly, is voice-gated (video.js:207-217) — but in the full-video (logo-start) flow we use the fixed 500+1000. Add `endingType` + `lastQuestionIsBonus` handling.

**Files:** Modify `remotion/src/timeline.ts`, `remotion/src/timeline.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("bonus skip: ending think-you-know drops the last question's reveal hold", () => {
  const tl = buildTimeline({ questionCount: 3, fps: 60, endingType: "think-you-know" });
  const qs = tl.phases.filter(p => p.kind === "question");
  expect(qs[qs.length - 1].durationMs).toBe(10000); // countdown only, flipDelay 0
  expect(qs[0].durationMs).toBe(13000);
});
it("how-many keeps the last question's reveal", () => {
  const tl = buildTimeline({ questionCount: 3, fps: 60, endingType: "how-many" });
  const qs = tl.phases.filter(p => p.kind === "question");
  expect(qs[qs.length - 1].durationMs).toBe(13000);
});
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** — add `endingType?: "think-you-know" | "how-many"` to opts; when building the last question and `endingType !== "how-many"`, set `durationMs = MS.COUNTDOWN_TOTAL` and `cues` reveal fields omitted/marked `skipReveal: true`.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(timeline): bonus-skip last question by ending type"`

### Task 1.5: Progress-voice schedule (warmUp/30/60/90%)

Mirrors `audio.js:1092-1115` + `levels.js:226-233`. A pure function `progressVoiceForQuestion(questionIndex, questionCount)` → `"warmUp"|"serious"|"nerds"|"genius"|null`. Fires when ENTERING the level (i.e., at that question phase's start), delay 1000ms.

**Files:** Modify `remotion/src/timeline.ts`, `remotion/src/timeline.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { progressVoiceForQuestion } from "./timeline";
it("progress voice milestones", () => {
  // totalQuestions used by app = totalLevelsCount-3; here questionCount IS totalQuestions
  const n = 10;
  expect(progressVoiceForQuestion(1, n)).toBe("warmUp");            // questionIndex===1
  expect(progressVoiceForQuestion(Math.max(2, Math.round(n*0.3)), n)).toBe("serious");
  expect(progressVoiceForQuestion(Math.max(2, Math.round(n*0.6)), n)).toBe("nerds");
  expect(progressVoiceForQuestion(Math.max(2, Math.round(n*0.9)), n)).toBe("genius");
  expect(progressVoiceForQuestion(5, n)).toBe(null); // a non-milestone (when 5 isn't a target)
});
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** exactly per audio.js:1095-1114 (questionIndex = levelIndex-1; here the caller passes questionIndex directly which equals app's `levelIndex-1`). Guard the precedence (warmUp first; then 30/60/90 with `Math.max(2, Math.round(...))`).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat(timeline): progress-voice milestone schedule"`

**GATE 1:** `npx vitest run` fully green. The timing brain is proven before any pixel is drawn.

---

## Phase 2 — Server endpoint, state serialization, config modal

### Task 2.1: State serializer in the app (`remotion-state-export.js`)

Serialize current on-screen state to the render props JSON. Mirrors the freeze fields from `saved-scripts.js:267-295` but reads live `appState`.

**Files:**
- Create: `js/remotion-state-export.js`

- [ ] **Step 1: Implement `buildRemotionState()`**

```js
// js/remotion-state-export.js
import { appState } from "./state.js";
import { getActiveScriptName } from "./saved-scripts.js";

/** Serialize the live on-screen state into Remotion render props.
 *  Photos/logos are emitted as repo-relative paths; the server maps them to URLs. */
export function buildRemotionState() {
  const levels = appState.levelsData.map((lvl) => ({
    isLogo: !!lvl.isLogo, isIntro: !!lvl.isIntro, isOutro: !!lvl.isOutro, isBonus: !!lvl.isBonus,
    squadType: lvl.squadType, displayMode: lvl.displayMode, formationId: lvl.formationId,
    videoMode: true,
    currentSquad: lvl.currentSquad || null,
    slotPhotoIndexBySlot: lvl.slotPhotoIndexBySlot instanceof Map
      ? Object.fromEntries(lvl.slotPhotoIndexBySlot) : (lvl.slotPhotoIndexBySlot || {}),
    slotFlagScales: Array.isArray(lvl.slotFlagScales) ? lvl.slotFlagScales.slice() : [],
    slotTeamLogoScales: Array.isArray(lvl.slotTeamLogoScales) ? lvl.slotTeamLogoScales.slice() : [],
    slotClubCrestOverrideRelPathBySlot: { ...(lvl.slotClubCrestOverrideRelPathBySlot || {}) },
    headerLogoScale: lvl.headerLogoScale ?? 1, headerLogoNudgeX: lvl.headerLogoNudgeX ?? 0,
    headerLogoOverrideRelPath: lvl.headerLogoOverrideRelPath || null,
    selectedEntry: lvl.selectedEntry || null,
    __revealPhraseByLanguage: lvl.__revealPhraseByLanguage || null,
  }));
  return {
    script: getActiveScriptName() || "",
    totalLevelsCount: appState.totalLevelsCount,
    questionCount: Math.max(0, appState.totalLevelsCount - 3), // logo+landing+outro removed (bonus counts as question)
    bgmSongs: Array.isArray(appState.bgmSongs) ? appState.bgmSongs.slice() : [],
    bundledVoiceVariants: appState.bundledVoiceVariants || null,
    endingType: typeof window.__getSelectedEndingType === "function" ? window.__getSelectedEndingType() : "think-you-know",
    transitionEffect: (window.__captureTransitionEffect && window.__captureTransitionEffect()) || "grid-overlay",
    levels,
  };
}
```

- [ ] **Step 2: Expose transition capture** — In `js/transitions.js`, after `transitionSettings`, add `window.__captureTransitionEffect = () => transitionSettings.effect;` (1 line; only addition). Confirm `window.__getSelectedEndingType` already exists (it is referenced in video.js:326).
- [ ] **Step 3: Manual smoke** — load the page, in console run `import("./js/remotion-state-export.js").then(m=>console.log(JSON.stringify(m.buildRemotionState()).length))` → prints a number > 0.
- [ ] **Step 4: Commit** — `git add js/remotion-state-export.js js/transitions.js && git commit -m "feat: serialize live state for Remotion render"`

### Task 2.2: Config modal (`remotion-config-modal.js`)

**Files:**
- Create: `js/remotion-config-modal.js`
- Modify: `index.html` (load module), `js/app.js` (intercept #record-video-btn in this clone)

- [ ] **Step 1: Implement the modal**

```js
// js/remotion-config-modal.js — Quality/FPS chooser for Remotion render.
const RES = [
  { key: "1080p", label: "1080p Full HD", w: 1920, h: 1080 },
  { key: "1440p", label: "1440p Quad HD", w: 2560, h: 1440 },
  { key: "4k",    label: "4K Ultra HD",   w: 3840, h: 2160 },
];
const FPS = [30, 60];

export function openRemotionConfigModal() {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "remotion-config-overlay";
    ov.innerHTML = `
      <div class="remotion-config-modal" role="dialog" aria-modal="true">
        <h2>Render Video</h2>
        <div class="rc-group"><div class="rc-label">Quality</div>
          <div class="rc-options rc-res">${RES.map((r,i)=>`<button data-res="${r.key}" class="${i===1?'sel':''}">${r.label}</button>`).join("")}</div></div>
        <div class="rc-group"><div class="rc-label">Frame rate</div>
          <div class="rc-options rc-fps">${FPS.map(f=>`<button data-fps="${f}" class="${f===60?'sel':''}">${f} FPS${f===60?' · fluid':''}</button>`).join("")}</div></div>
        <div class="rc-actions"><button class="rc-cancel">Cancel</button><button class="rc-confirm">Render</button></div>
      </div>`;
    document.body.appendChild(ov);
    let res = "1440p", fps = 60;
    ov.querySelector(".rc-res").onclick = (e) => { const b=e.target.closest("button"); if(!b)return; ov.querySelectorAll(".rc-res button").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); res=b.dataset.res; };
    ov.querySelector(".rc-fps").onclick = (e) => { const b=e.target.closest("button"); if(!b)return; ov.querySelectorAll(".rc-fps button").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); fps=Number(b.dataset.fps); };
    const close = (v) => { ov.remove(); resolve(v); };
    ov.querySelector(".rc-cancel").onclick = () => close(null);
    ov.querySelector(".rc-confirm").onclick = () => { const r=RES.find(x=>x.key===res); close({ width:r.w, height:r.h, fps }); };
    ov.onclick = (e) => { if (e.target === ov) close(null); };
  });
}
```

- [ ] **Step 2: Add modal CSS** — append to `css/components/panel-overlays.css`: dark overlay centered (z-index above control panel 100000 → use 100100 per memory `project_modal_zindex_below_control_panel`), `.rc-options button.sel{border-color:var(--accent)}`. (Full rules included in the task; mirror existing `.swap-modal` look.)

- [ ] **Step 3: Intercept the button in `js/app.js`** — locate the `els.recordVideoBtn.onclick` handler (app.js:~1436). In THIS clone only, replace its body with: guard (already recording / saved name required), `const cfg = await openRemotionConfigModal(); if(!cfg) return;`, then `await startRemotionRender(cfg)` (next task). Keep the saved-name guard ("Load a saved setting first").

- [ ] **Step 4: Load the module in `index.html`** — add `<script type="module" src="js/remotion-config-modal.js?v=1"></script>` (or import from app.js). Bump `?v=` per memory `project_js_module_cache_buster`.

- [ ] **Step 5: Manual smoke** — click Record Video → modal appears, defaults 1440p/60, Cancel resolves null.
- [ ] **Step 6: Commit** — `git add js/remotion-config-modal.js index.html js/app.js css/components/panel-overlays.css && git commit -m "feat: Remotion quality/fps config modal"`

### Task 2.3: Render client (POST + SSE) (`remotion-render-client.js`)

**Files:**
- Create: `js/remotion-render-client.js`

- [ ] **Step 1: Implement**

```js
// js/remotion-render-client.js
import { buildRemotionState } from "./remotion-state-export.js";
import { getActiveScriptName } from "./saved-scripts.js";

function currentLanguage() {
  try { return (localStorage.getItem("voice-tab.language") || "english").toLowerCase(); } catch { return "english"; }
}

export async function startRemotionRender(cfg) {
  const state = buildRemotionState();
  const script = (getActiveScriptName() || "").trim();
  const body = { width: cfg.width, height: cfg.height, fps: cfg.fps, script, language: currentLanguage(), stateJson: state };
  const res = await fetch("/__remotion-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.ok) { alert("Render failed to start: " + (data.error || "unknown")); return; }
  subscribeProgress(data.jobId);
}

function subscribeProgress(jobId) {
  const es = new EventSource(`/__remotion-render/progress?job=${encodeURIComponent(jobId)}`);
  // reuse render-progress-ui look; show pct + stage; on done show path, on error show message.
  es.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.stage === "done" || m.stage === "finished") { es.close(); /* show success + path */ }
    else if (m.stage === "error") { es.close(); /* show error */ }
    else { /* update progress bar with m.pct/m.frame */ }
  };
}
```

- [ ] **Step 2: Wire `startRemotionRender` import into the app.js handler** from Task 2.2 Step 3.
- [ ] **Step 3: Commit** — `git add js/remotion-render-client.js js/app.js && git commit -m "feat: Remotion render client (POST + SSE)"`

### Task 2.4: Server endpoint `/__remotion-render` (+ progress SSE)

Mirror the existing `_try_render_video` / `_try_render_progress` / `_pump_render_job` patterns (run_site.py:3386-3464, 54-67). Spawn `npx remotion render` with overrides; parse Remotion's progress.

**Files:**
- Modify: `run_site.py`

- [ ] **Step 1: Add a jobs dict + pump (reuse pattern)** — near `_RENDER_JOBS` (run_site.py:~50), add `_REMOTION_JOBS = {}` and a `_pump_remotion_job(job_id)` that drains stdout, parsing Remotion progress. Remotion `--log=verbose` emits `Rendered X/Y` lines; convert to `{"stage":"render","pct":..,"frame":X}`; on exit append `{"stage":"done","path":...}` or `{"stage":"error",...}`.

- [ ] **Step 2: Add `_try_remotion_render(self)`** dispatched from `do_POST` (add one line in the do_POST chain at run_site.py:3504): 

```python
def _try_remotion_render(self) -> bool:
    if urlparse(self.path).path.rstrip("/") != "/__remotion-render":
        return False
    try:
        body = self._read_json_body()
        width = int(body.get("width") or 2560); height = int(body.get("height") or 1440)
        fps = int(body.get("fps") or 60)
        language = _normalize_language(body.get("language"))
        script = str(body.get("script") or "").strip()
        state = body.get("stateJson")
        if not script: raise ValueError("script is required")
        if not isinstance(state, dict): raise ValueError("stateJson object required")
    except ValueError as exc:
        self._write_json(400, {"ok": False, "error": str(exc)}); return True
    out_dir = PROJECT_ROOT / "Ready videos" / language
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{script}.mp4"
    # serve-base for assets = this server's own origin
    server_port = self.server.server_address[1]
    props = {**state, "width": width, "height": height, "fps": fps,
             "language": language, "assetBase": f"http://127.0.0.1:{server_port}"}
    render_dir = RUNNER_DIR / "remotion"
    props_path = render_dir / "out" / f"props-{uuid.uuid4().hex}.json"
    props_path.parent.mkdir(parents=True, exist_ok=True)
    props_path.write_text(json.dumps(props), encoding="utf-8")
    cmd = ["npx", "remotion", "render", "src/index.ts", "Quiz", str(out_path),
           f"--props={props_path}", f"--width={width}", f"--height={height}",
           "--log=verbose"]
    # NOTE: Remotion fps is set via calculateMetadata from props, not a CLI flag.
    creationflags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
    try:
        proc = subprocess.Popen(cmd, cwd=str(render_dir), stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1, shell=False, creationflags=creationflags)
    except FileNotFoundError:
        self._write_json(500, {"ok": False, "error": "npx/node not found on PATH."}); return True
    job_id = uuid.uuid4().hex
    _REMOTION_JOBS[job_id] = {"proc": proc, "lines": [], "done": False, "code": None, "out": str(out_path)}
    threading.Thread(target=_pump_remotion_job, args=(job_id,), daemon=True).start()
    self._write_json(200, {"ok": True, "jobId": job_id, "out": str(out_path)})
    return True
```

(Use `creationflags` per memory `project_update_data_curl_no_window` so no console windows flash. `npx` on Windows is `npx.cmd`; if `FileNotFoundError`, retry with `shell=True` or `npx.cmd` — include that fallback.)

- [ ] **Step 3: Add `_try_remotion_progress(self)`** dispatched from `do_GET` (one line at run_site.py:3466) — copy `_try_render_progress` verbatim but match `/__remotion-render/progress` and read `_REMOTION_JOBS`.

- [ ] **Step 4: Import `uuid`** at top of run_site.py if not present.

- [ ] **Step 5: Manual integration smoke** — start server, click Record Video → Render; confirm a child `node`/`remotion` process starts (Task 3 must exist for it to succeed; until then expect a controlled error in SSE). Confirm NO console window flashes.
- [ ] **Step 6: Commit** — `git add run_site.py && git commit -m "feat(server): /__remotion-render spawn + SSE progress"`

---

## Phase 3 — Remotion Root + calculateMetadata (timing wired to props)

### Task 3.1: Props types + asset URL helper

**Files:**
- Create: `remotion/src/props.ts`, `remotion/src/assets.ts`

- [ ] **Step 1: `props.ts`** — TS interfaces mirroring `buildRemotionState()` output (RemotionState, RemotionLevel, Squad, Player) + `width/height/fps/assetBase/language`.
- [ ] **Step 2: `assets.ts`**

```ts
import { staticFile } from "remotion";
export function assetUrl(relOrAbs: string, assetBase: string): string {
  if (!relOrAbs) return "";
  if (/^https?:\/\//.test(relOrAbs)) return relOrAbs;
  // App uses "../X" (repo-root) and "Images/..." (repo-root) — normalize to server origin.
  const clean = relOrAbs.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
  return `${assetBase}/${clean.split("/").map(encodeURIComponent).join("/")}`;
}
```

- [ ] **Step 3: Test `assets.ts`**

```ts
import { assetUrl } from "./assets";
it("maps repo-relative paths to server URLs", () => {
  expect(assetUrl("../.Storage/Voices/Ticking sound/ticking sound.mp3", "http://127.0.0.1:8888"))
    .toBe("http://127.0.0.1:8888/.Storage/Voices/Ticking%20sound/ticking%20sound.mp3");
  expect(assetUrl("Images/Teams/x.png", "http://h")).toBe("http://h/Images/Teams/x.png");
});
```

- [ ] **Step 4: Run vitest, expect pass. Commit** — `git commit -am "feat(remotion): props types + asset url helper"`

### Task 3.2: calculateMetadata with audio probing

**Files:**
- Modify: `remotion/src/Root.tsx`

- [ ] **Step 1: Implement metadata** — `calculateMetadata` reads props, builds the timeline via `buildTimeline({ questionCount, fps, endingType })`, probes the outro voice + rules + any progress/reveal voices it needs for *duration-gated* phases via `getAudioDurationInSeconds(assetUrl(...))`, and returns `{ durationInFrames: timeline.totalDurationFrames, fps, width, height }`. Reveal/stinger/ticking live INSIDE fixed phases so they don't change duration; only the outro voice extends the outro block.

```tsx
import { Composition, getInputProps } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { QuizComposition } from "./QuizComposition";
import { buildTimeline } from "./timeline";
import { assetUrl } from "./assets";
import { endingVoiceRelPath } from "./audio/voicePaths";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Quiz"
    component={QuizComposition}
    width={2560} height={1440} fps={60} durationInFrames={600}
    defaultProps={{} as any}
    calculateMetadata={async ({ props }) => {
      const p: any = props;
      const fps = p.fps ?? 60;
      let outroVoiceMs = 0;
      try {
        const url = assetUrl(endingVoiceRelPath(p.endingType, p.language), p.assetBase);
        outroVoiceMs = Math.round((await getAudioDurationInSeconds(url)) * 1000);
      } catch { outroVoiceMs = 2500; } // safe default if probe fails
      const tl = buildTimeline({ questionCount: p.questionCount, fps, endingType: p.endingType, outroVoiceMs });
      return { durationInFrames: tl.totalDurationFrames, fps, width: p.width ?? 2560, height: p.height ?? 1440 };
    }}
  />
);
```

- [ ] **Step 2: Create `remotion/src/audio/voicePaths.ts`** — port `endingPathFor`, `quizTitlePathFor`, `levelPathFor` filename maps from audio.js:21-57 + bundled-level-voices.js so the renderer resolves the same files.
- [ ] **Step 3: Manual smoke** — `npx remotion studio src/index.ts` with a sample props file; confirm the composition length matches `buildTimeline` for the sample's questionCount.
- [ ] **Step 4: Commit** — `git commit -am "feat(remotion): calculateMetadata wires timeline + probes outro voice"`

---

## Phase 4 — Visual components (contract-driven; each has a QA gate)

> These reproduce existing CSS as frame functions. For each, the "test" is: render the phase's key frames and compare against the live app at the same timestamp (Phase 6 does the formal diff; here each task has an inline eyeball gate). Import existing stylesheets where practical (`css/components/pitch.css`, etc.) via a `<style>` injected from the served CSS URL, then OVERRIDE only the time-based rules.

### Task 4.1: QuizComposition shell — map phases to `<Sequence>`s

**Files:** Modify `remotion/src/QuizComposition.tsx`

- [ ] **Step 1:** Build `buildTimeline` from props; render one `<Sequence from={phase.startFrame} durationInFrames={phase.durationFrames}>` per phase, switching on `phase.kind` to the right level component, passing the matching `props.levels[...]`. Map question phases to `props.levels[2 + index]`. Render `<BackgroundTheme>` and `<AudioTimeline>` as always-on layers. **Gate:** studio shows correctly-timed blocks (use a debug overlay printing `phase.kind` + frame).
- [ ] **Step 2: Commit.**

### Task 4.2: LogoLevel

**Files:** Create `remotion/src/levels/LogoLevel.tsx`
- [ ] Reproduce the logo page: logo image centered; `.reveal` scale animation begins at local frame = `msToFrames(2000)`. Use existing logo CSS. **Gate:** frame at 2000ms matches live app's logo reveal start. Commit.

### Task 4.3: LandingLevel

**Files:** Create `remotion/src/levels/LandingLevel.tsx`
- [ ] Reproduce landing copy + ball preloader end-state (the ball animation is intro flavor; render its resting state or a faithful keyframed version). **Gate:** landing visual matches. Commit.

### Task 4.4: Pitch + PlayerSlot (geometry + flip)

**Files:** Create `remotion/src/pitch/formations.ts`, `Pitch.tsx`, `PlayerSlot.tsx`
- [ ] **Step 1:** Port `FORMATIONS` from `js/formations.js` (or import it — it's plain data; prefer importing to stay DRY). Each slot `{x,y}` is a percent; place with `transform: translate3d(calc(x% ...), calc(y% ...), 0)` centered, NO top/margin (hardware-accelerated per spec).
- [ ] **Step 2:** `PlayerSlot` renders front face (flag or club logo, scaled by `slotFlagScales[i]`/`slotTeamLogoScales[i]`) and back face (player photo from `playerPhotoPaths` resolution — port the resolver or precompute paths in the state export). `transform-style: preserve-3d`, `backface-visibility: hidden`.
- [ ] **Step 3:** Flip: at question-local frame `msToFrames(10000)`, interpolate `rotateY` 0→180° over `msToFrames(780)` frames using `Easing.bezier(0.25,1,0.5,1)`. **Gate:** flip starts exactly at 10s and spans 0.78s; compare to live. Commit each step.

> **Decision (photo paths):** Precompute `playerPhotoPaths()` results in `buildRemotionState()` (call the existing resolver in-app where `appState.playerImages` is populated) and emit a `photoPaths: string[]` per slot, so the renderer doesn't need the image index. Update `remotion-state-export.js` + `props.ts` accordingly (amend Task 2.1).

### Task 4.5: CountdownRing

**Files:** Create `remotion/src/CountdownRing.tsx`
- [ ] SVG ring, `strokeDasharray=283`; `strokeDashoffset` interpolated 0→283 over `msToFrames(10000)` frames, LINEAR (matches `1s linear` per-tick, which is linear overall). Color classes: green > 6s, yellow > 3s, pulse ≤ 3s (reproduce as frame thresholds). Numeric text hidden (Regular). **Gate:** offset at 0s/5s/10s = 0/141.5/283; colors switch at the right seconds. Commit.

### Task 4.6: TeamHeader

**Files:** Create `remotion/src/TeamHeader.tsx`
- [ ] Render header crest (resolved via header-logo chain — precompute the resolved URL in state export, amend Task 2.1) + team name, with `headerLogoScale`/`headerLogoNudgeX`. Header appears on the reveal (post-timer) per video.js logic. **Gate:** header matches on reveal frame. Commit.

### Task 4.7: BackgroundTheme + ProgressSteps

**Files:** Create `remotion/src/BackgroundTheme.tsx`, `remotion/src/ProgressSteps.tsx`
- [ ] Port the per-competition background (shared `background-theme.js`) resting visual (no animated transition needed between levels beyond the TransitionOverlay) + progress dots. **Gate:** background + progress match. Commit.

### Task 4.8: OutroLevel

**Files:** Create `remotion/src/levels/OutroLevel.tsx`
- [ ] Reproduce the outro screen (ending text per `endingType`, EN/ES). Duration = outro voice + 1000ms tail (already in timeline). **Gate:** matches. Commit.

### Task 4.9a: TransitionOverlay — default grid-overlay

**Files:** Create `remotion/src/transitions/TransitionOverlay.tsx`, `gridOverlay.tsx`
- [ ] Reproduce `grid-overlay` (transitions.js:176-204): 8×14 grid; show phase cells scale 0→1.05 staggered 0.03s from index 0 (`power3.inOut`), content swaps at midpoint, hide phase scales down staggered from end (`power2`). Fit the whole effect inside the 820ms transition phase (the live custom transition is longer — see 4.9b). For v1 default we render grid-overlay across the transition phase frames. **Gate:** transition reads as a grid wipe with content swap at midpoint. Commit.

### Task 4.9b: Custom-transition duration fidelity (FOLLOW-UP)

- [ ] **Decision needed at this point:** the live custom transition resolves via `appState._transitionDone` + 200ms, NOT the 820ms fallback, so its real duration is the effect's show+hide (~0.84s phases). Update `buildTimeline` to accept a per-effect `transitionMs` derived from a ported `TRANSITION_DURATIONS` table (from the Explore catalog: grid-overlay etc.), and have `calculateMetadata` pass the right value for `props.transitionEffect`. Add tests asserting the table values. Reproduce additional effects only as needed (default-first). Commit.

---

## Phase 5 — Audio timeline

### Task 5.1: Envelope math (pure, tested)

**Files:** Create `remotion/src/audio/envelopes.ts` + test
- [ ] **Step 1: Failing test** for `duckEnvelope` (BGM volume across a phase given voice windows): at a voice start frame the volume ramps 1.0→0.2 over the voice's `delayMs`; after the voice ends, holds, then restores 0.2→1.0 over `RESTORE_FADE_MS=1500` after `RESTORE_WAIT_STANDALONE_MS=2500` (or 0 if chained, `VOICE_CHAIN_GAP_MS=3000`). Constants from audio.js:203-219.
- [ ] **Step 2-4: Implement + green.** A pure function `bgmVolumeAtFrame(frame, voiceWindows, fps)` returning 0..1. Commit.

### Task 5.2: AudioTimeline component

**Files:** Create `remotion/src/audio/AudioTimeline.tsx`
- [ ] **Step 1:** BGM — render the per-save 5-song session as sequential `<Audio>` with 3000ms crossfade (`BGM_CROSSFADE_MS`); volume each frame = `bgmVolumeAtFrame(...)`. Resolve song basenames → `paths.bgmPlaylist` URLs (port the playlist or read from served `js/audio.js`? prefer a ported `bgmPlaylist.ts`).
- [ ] **Step 2:** Per question phase: `<Audio src=ticking>` from `cues.tickStartMs` (7000) to 10000; `<Audio src=revealStinger volume=0.5>` one-shot at `cues.stingerMs` (10150); `<Audio src=revealVoice>` at `cues.voiceMs` (10600); progress voice (if `progressVoiceForQuestion` non-null) at phase start + 1000ms.
- [ ] **Step 3:** Landing/logo rules voice at the logo's 500ms (the quiz title). Outro voice at outro phase start (+100ms).
- [ ] **Step 4:** Gate — render the audio of one question and confirm duck-down begins at the voice frame and ticking spans the last 3s. Commit.

> **Voice file resolution:** reuse `voicePaths.ts` (Task 3.2). Reveal team-name voice path depends on team name + phrase variant (`__revealPhraseByLanguage`); precompute the resolved reveal-voice rel path per level in `buildRemotionState()` (amend Task 2.1) to avoid re-deriving the candidate chain in the renderer.

---

## Phase 6 — Integration + timing verification + visual QA

### Task 6.1: End-to-end render of a real saved script
- [ ] Load a real saved script in the app, click Record Video → Render (1440p/60). Confirm `Ready videos/english/<name>.mp4` is produced and plays start-to-finish. Commit any fixes.

### Task 6.2: Timing verification against the live `__audioTap` manifest (the user's #1 requirement)
- [ ] **Step 1:** In the live app, run the flow once with audio-tap capture enabled (the app already calls `window.__audioTap`; add a tiny capture shim that pushes events with `performance.now()` timestamps to `window.__audioManifest` — confirm whether one already exists from the old render-mode and reuse it). Export `__audioManifest` to JSON.
- [ ] **Step 2:** Write `remotion/src/timeline.manifest.test.ts` that loads that JSON and asserts: rules voice ≈ logo+500ms, each ticking start ≈ phase+7000ms, each stinger ≈ phase+10150ms, reveal voice ≈ phase+10600ms, outro voice ≈ outro start, progress voices at the warmUp/30/60/90 questions — each within ±1 frame at 60fps. Fix `timeline.ts` until the derived offsets match the captured manifest. **This is the proof that timing is "the same."**
- [ ] **Step 3:** Commit.

### Task 6.3: Visual frame diff
- [ ] Render the same saved script in the live app (a few screenshots at known timestamps: logo reveal, mid-countdown, flip mid-point, reveal, outro) and capture the same frames from the Remotion output (`--frames=N`). Compare side by side; tune CSS (fonts, scales, colors, background) until indistinguishable. Iterate. Commit per fix.

### Task 6.4: Cleanup + docs
- [ ] Remove temporary debug overlays/flags behind a `?debug=1`-style guard or delete. Update the spec's "Open items" to "resolved" with how. Add a short `remotion/README.md` (how to render manually, how to run tests). Commit.

---

## Self-Review checklist (run before handing off to execution)
- Spec coverage: modal ✔(2.2), server CLI ✔(2.4), Root/calculateMetadata ✔(3.2), composition+pitch+flip+countdown+audio ✔(4.x,5.x), timing contract ✔(1.x,6.2). 
- Photo/logo resolution moved to precompute-in-state (amends to 2.1) — keep 2.1, 4.4, 4.6, 5.2 consistent on the `photoPaths`/resolved-URL fields.
- Transition fidelity: default-first (4.9a) with a real follow-up (4.9b) — no hand-wave.
- No magic numbers: all timing flows from `timeline.ts` constants.
```
