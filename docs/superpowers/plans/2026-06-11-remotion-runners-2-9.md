# Remotion Projects for Regular Runners 2–9 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a Remotion project for each Regular runner 2–9 that renders its play-video faithfully, with byte-identical intro / outro-ending / background / transitions / controls / level handling / language to runner-1's existing Remotion project.

**Architecture:** Copy runner-1's identical scene/effect/transition code into a new shared library `.remotion-shared/src/` (runner 1 itself untouched). Each new runner = a thin project that imports the shared lib and supplies only its `Level` screen, `level-data`, `config` (title/theme/voices), and `build-data` script. Prove the shared-import bundles on runner 2 + render a proof MP4 before fanning out 3–9.

**Tech Stack:** Remotion (React + TypeScript, webpack bundler), Node ESM build scripts, ffprobe (durations), the repo's `.Storage/` data + `Images/` assets.

**Verification model:** No unit tests (visual video). Each runner's gate = `npm run build-data` completes without missing-critical-asset errors **and** `remotion render` produces a short proof MP4 (intro + first level + ending) that plays correctly.

---

## Phase 0 — Shared library + bundler proof

### Task 0.1: Create `.remotion-shared/src/` by copying runner-1's identical files

**Files:**
- Create dir: `.remotion-shared/src/` with subdirs `scenes/`, `components/`, `effects/`, `transitions/`
- Copy (unchanged) from `1_…_Regular_Remotion/src/`:
  - `scenes/BallIntro.tsx`, `scenes/Outro.tsx`
  - `components/Stage.tsx`, `components/SoccerBall.tsx`, `components/Pitch.tsx`, `components/PlayerSlot.tsx`
  - `effects/AnimatedBackground.tsx`, `effects/effects-data.ts`, `effects/hatch.ts`
  - `transitions/*` (all files)
  - `timing.ts`, `theme.ts`, `paths.ts`, `ending.ts`

- [ ] **Step 1:** Copy the listed files verbatim into `.remotion-shared/src/` preserving subfolders.
- [ ] **Step 2:** Verify imports inside copied files are still relative-resolvable (they reference siblings within the same set — `./theme`, `../components/…`, etc.). Fix only paths that pointed at files NOT copied (e.g. anything importing `formations.ts`, `level-data.ts`, `schema.ts` — those stay per-runner; if a shared file imports them, lift the needed type into a shared `audio-types.ts`/`scene-props.ts` instead).
- [ ] **Step 3:** Commit: `chore(remotion): seed .remotion-shared/src from runner-1 identical scenes`.

### Task 0.2: Parameterize the Intro shell into the shared lib

**Files:**
- Create: `.remotion-shared/src/scenes/Intro.tsx` (from runner-1's `scenes/Intro.tsx`)
- Create: `.remotion-shared/src/scene-props.ts` (shared prop types)

- [ ] **Step 1:** Copy runner-1 `Intro.tsx`; replace its hardcoded title/season/questions-badge strings with props: `titleHtml: string`, `seasonLabel: string`, `questionsLabel: string`, `bonusLabel: string`. Keep all animation/layout identical.
- [ ] **Step 2:** In `scene-props.ts` export `IntroProps` and the shared `AudioManifest` shape (mirror runner-1 `audio.json` keys).
- [ ] **Step 3:** Commit: `feat(remotion): parameterize shared Intro shell (title/season/badge as props)`.

---

## Phase 1 — Runner 2 (proven template) + render QA

### Task 1.1: Scaffold `2_…_Regular_Remotion` project skeleton

**Files:**
- Create: `2_Guess The Football National Team - Main Runner - Regular_Remotion/` with `package.json`, `remotion.config.ts`, `tsconfig.json`, `src/index.ts`, `src/Root.tsx`
- Base each on runner-1's equivalent; change composition id to `Guess-The-Football-National-Team-Regular`, `setPublicDir` to the shared `.remotion-shared/public`, and dependency versions identical to runner 1.

- [ ] **Step 1:** Copy runner-1's `package.json`/`remotion.config.ts`/`tsconfig.json`/`src/index.ts`; update names + composition id + render script output path.
- [ ] **Step 2:** `npm install` in the new folder. Expected: completes, `remotion` resolves.
- [ ] **Step 3:** Commit: `feat(remotion-r2): scaffold runner-2 Remotion project`.

### Task 1.2: Prove the shared import bundles (bundler gate)

**Files:**
- Modify: `2_…_Regular_Remotion/src/Root.tsx` to import `Stage` + `AnimatedBackground` from `../../.remotion-shared/src/…`
- Temp: a minimal composition rendering just the shared `AnimatedBackground`.

- [ ] **Step 1:** Wire a throwaway composition that renders only the shared `AnimatedBackground`.
- [ ] **Step 2:** Run `npx remotion still <id> out/bundle-proof.png`. Expected: a PNG is produced (proves webpack bundles TS from `.remotion-shared/src`).
- [ ] **Step 3:** **GATE:** If bundling fails, switch this runner (and the plan) to clone-per-runner: copy runner-1's whole `src/` into runner 2 instead of importing shared, and continue with the same per-runner deltas below. Record the decision in the spec.
- [ ] **Step 4:** Commit: `test(remotion-r2): prove shared .remotion-shared/src import bundles`.

### Task 1.3: Runner-2 `config.ts`

**Files:**
- Create: `2_…_Regular_Remotion/src/config.ts`

- [ ] **Step 1:** Export: `COMPOSITION_ID="Guess-The-Football-National-Team-Regular"`; `TITLE_HTML.english="GUESS THE FOOTBALL<br>NATIONAL TEAM NAME<br>BY PLAYERS' CLUB"`, `.spanish="ADIVINA EL NOMBRE DEL<br>EQUIPO NACIONAL POR<br>EL CLUB DE LOS JUGADORES"`; `SEASON.english="2025/6 SEASON"`, `.spanish="TEMPORADA 2025/6"`; `THEME_DEFAULT={colorId:"quiz-nat-by-club",effectId:"youtube-thumbnails",opacity:0.5}`; quiz-title voice filenames (EN/ES) per the spec.
- [ ] **Step 2:** Commit.

### Task 1.4: Runner-2 `build-data.mjs` + shared `build-data-lib.mjs`

**Files:**
- Create: `.remotion-shared/src/build-data-lib.mjs` (lift the reusable helpers from runner-1's `scripts/build-data.mjs`: asset sync, ffprobe duration, flag/crest/photo resolution, voice lookup, audio.json assembly)
- Create: `2_…_Regular_Remotion/scripts/build-data.mjs` (thin: points at runner-2 saves source + runner-2 quiz-title voice; resolves **club crest** per slot + **national flag/name** for the answer)

- [ ] **Step 1:** Extract runner-1 build helpers into `build-data-lib.mjs` (pure functions, no runner-1-specific paths baked in — pass data source + voice paths as args).
- [ ] **Step 2:** Write runner-2 `build-data.mjs` calling the lib: read runner-2 recording-status blocks, for each level resolve the national team (name + flag) and 11 players (club crest front, photo back), write `src/generated/saves.json` + `audio.json`, sync assets to `.remotion-shared/public`.
- [ ] **Step 3:** Run `npm run build-data`. Expected: writes both JSONs; warns (not crashes) on any missing voice/photo.
- [ ] **Step 4:** Commit.

### Task 1.5: Runner-2 `level-data.ts` + `Level.tsx` (the only custom UI)

**Files:**
- Create: `2_…_Regular_Remotion/src/level-data.ts` (`ResolvedLevel`: national team name + flag path; 11 players each with `clubCrestPath` + `photoPath` + formation x/y)
- Create: `2_…_Regular_Remotion/src/scenes/Level.tsx` (reuse shared `Pitch` + `PlayerSlot`; slot **front = club crest**, back = player photo; reveal panel = **national flag + national-team name**)
- Create: `2_…_Regular_Remotion/src/schema.ts` (Zod; reuse shared background/transition/ending/language enums + runner-2 save list)
- Create: `2_…_Regular_Remotion/src/FootballQuizDemo.tsx` (wire shared BallIntro→Intro(config text)→Level(s)→Outro + shared audio)

- [ ] **Step 1:** `level-data.ts` resolves a save → national team + 11 placed players (club crest + photo).
- [ ] **Step 2:** `Level.tsx`: render shared `PlayerSlot` with `front=clubCrest`, `back=photo`; reveal panel shows national flag + name (adapt runner-1 `RevealPanel`: crest slot → national flag, team-name text = national team).
- [ ] **Step 3:** `FootballQuizDemo.tsx` composes shared scenes; `Intro` gets runner-2 `TITLE_HTML`/`SEASON`; audio sequences identical to runner 1.
- [ ] **Step 4:** `Root.tsx` registers composition with runner-2 default props.
- [ ] **Step 5:** Commit.

### Task 1.6: Runner-2 render QA (user sign-off gate)

- [ ] **Step 1:** `npm run studio` — confirm intro, one level (crests → flip → national flag/name reveal), and outro all display correctly.
- [ ] **Step 2:** `npx remotion render <id> out/r2-proof.mp4 --frames=…` for a short window covering intro + first level + ending (or render `levels:"1"`). Expected: valid MP4.
- [ ] **Step 3:** **GATE — present MP4 to user for approval.** Do not fan out until approved.
- [ ] **Step 4:** Commit: `feat(remotion-r2): runner-2 Remotion complete, render QA passed`.

---

## Phase 2 — Fan out runners 3–9

Runners **3, 4, 5, 6, 9** need a bespoke `Level` layout (not the 11-slot pitch); **7, 8** are single-element (crest / player card) reveals. Each follows the same shape as runner 2: gather spec → scaffold → config → build-data → level-data + Level → render QA.

### Task 2.N (one per runner 3,4,5,6,7,8,9): Build runner N

**Files (per runner N):** `N_…_Regular_Remotion/` with `package.json`, `remotion.config.ts`, `tsconfig.json`, `src/{index.ts,Root.tsx,config.ts,schema.ts,level-data.ts,FootballQuizDemo.tsx,scenes/Level.tsx}`, `scripts/build-data.mjs`.

- [ ] **Step 1: Gather spec.** Dispatch one Explore agent on runner N's folder for: slot/card front + reveal contents (`pitch-render.js renderSlot`/`renderHeader`), data model (`levels.js`, saves source), intro title EN/ES + quiz-title voice filename (`i18n.js`/`audio.js`), reveal-voice dir, theme default (`app.js`), formation usage.
- [ ] **Step 2: Scaffold** from runner-2's proven skeleton (copy package/config/tsconfig/index/Root, rename + new composition id).
- [ ] **Step 3: config.ts** — title/season/theme-default/voice filenames from the gathered spec.
- [ ] **Step 4: build-data.mjs** — call shared `build-data-lib.mjs` with runner-N data source + voices; resolve runner-N's clue + answer assets.
- [ ] **Step 5: level-data.ts + Level.tsx** — implement runner-N's question screen (timeline / stats grid / 4-param card / fake-info list / crest / player card / A-B-C options) + its reveal, reusing shared Stage/background/timing/audio/intro/outro unchanged.
- [ ] **Step 6: build-data** runs clean; **render** short proof MP4.
- [ ] **Step 7: Commit** `feat(remotion-rN): runner-N Remotion complete`.

These 7 tasks are independent (different folders, shared lib is read-only) → run in parallel agents.

---

## Phase 3 — Docs

### Task 3.1: Update system docs
- [ ] **Step 1:** Update `.Storage/docs/runner-architecture.md` (the "Runner 1 — Remotion variant" section → generalize: all Regular runners have a `_Remotion`; shared lib in `.remotion-shared/src`; per-runner = config + Level + level-data + build-data).
- [ ] **Step 2:** Add a row/line to `.Storage/docs/INDEX.md` if needed.
- [ ] **Step 3:** Commit `docs: document shared Remotion library + runners 2-9`.

---

## Self-review notes
- **Spec coverage:** shared-lib extraction (0.1–0.2), runner-2 proof+render (1.x), fan-out 3–9 (2.x), docs (3.1), bundler fallback (1.2 gate) — all spec sections covered.
- **Asset-missing handling:** build-data warns not crashes (1.4 step 3, 2.6).
- **Identical intro/ending:** guaranteed by single shared source (Phase 0) consumed by all (1.5, 2.5).
