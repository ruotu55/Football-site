# Remotion Projects for Regular Runners 2–9 — Design

**Date:** 2026-06-11
**Status:** Approved (architecture + approach + first runner + QA bar)

## Goal

Create a Remotion project for **every Regular runner** that does not yet have one — runners **2 through 9** (8 projects). Each must render its quiz's **play-video** look faithfully (photos, text, positions, reveal behaviour all 100% accurate), while keeping the **intro (4-ball merge), ending/outro, background effects, transitions, controls, level handling, and language (EN/ES)** byte-identical to what runner-1's Remotion project (`1_…_Remotion`) has today.

Runner 1 already has a working Remotion project; it is the template/source of truth.

## The runners (Regular variants needing a Remotion port)

| # | Quiz | "Level" (question) screen — what differs from runner 1 |
|---|------|--------------------------------------------------------|
| 2 | National Team by player club | 11-slot pitch; slot **front = club crest** (not flag); reveal = **national flag + national-team name** |
| 3 | Player by Career Path | club-history **path/timeline**; reveal = player |
| 4 | Player by Career Stats | **stats grid**; reveal = player |
| 5 | Player by Club/Pos/Country/Age | **4-param card**; reveal = player |
| 6 | Fake Information | info list with a **fake item**; reveal |
| 7 | Team Logo Name | **crest**; reveal = team name |
| 8 | Player Name | **player photo/card**; reveal = name |
| 9 | MCQ (A/B/C) | question + **A/B/C options** |

Each runner's exact play-video spec is gathered from its real source (`js/pitch-render.js renderSlot`/`renderHeader`, `levels.js`, `i18n.js`, `audio.js`, `app.js` theme defaults) the same way runner-2's was — see "Per-runner spec gathering" below.

## Architecture — Shared code library

Extract the **identical** pieces of runner-1's Remotion `src/` into a new **`.remotion-shared/src/`** (sibling of the existing `.remotion-shared/public/` that already holds shared assets). Every Remotion project imports them via relative path. This makes "identical intro/ending everywhere" true **by construction** (one source of truth), and makes each new runner ~4 files.

### Shared (`.remotion-shared/src/`) — identical for all runners
- `scenes/BallIntro.tsx` — 4-ball merge + expand intro
- `scenes/Outro.tsx` — logo + CTA + cursor + ending voice (the "ending")
- `scenes/Intro.tsx` — landing **shell** (title text + season + questions badge are passed in as props)
- `effects/AnimatedBackground.tsx`, `effects/effects-data.ts`, `effects/hatch.ts` — all background colors/effects/competitions
- `transitions/*` — all transition presentations + registry
- `components/Stage.tsx`, `components/SoccerBall.tsx`, `components/Pitch.tsx`, `components/PlayerSlot.tsx` (flip mechanics)
- `timing.ts`, `theme.ts`, `paths.ts`
- `ending.ts` — deterministic ending-key resolution
- `audio-types.ts` — shared audio manifest shape + `<Sequence>` helpers
- `build-data-lib.mjs` — shared build helpers (asset sync to `.remotion-shared/public`, ffprobe duration, flag/crest/photo resolution, voice lookup) used by each runner's `build-data.mjs`

### Per-runner project (`N_…_Remotion/`) — only the deltas
- `src/Root.tsx` — composition id (`<Quiz-Name>-Regular`), default props
- `src/config.ts` — title text EN/ES, season, badge text, theme default (`colorId`/`effectId`/`opacity`), save-name list, quiz-title voice filenames
- `src/FootballQuizDemo.tsx` — thin composition wiring shared scenes + this runner's Level
- `src/scenes/Level.tsx` (+ any reveal sub-components) — **the only genuinely runner-specific UI**
- `src/level-data.ts` — resolves this runner's save → display data
- `src/schema.ts` — Zod props (reuses shared enums for background/transition/ending/language)
- `scripts/build-data.mjs` — thin script calling `build-data-lib.mjs` with this runner's data source + voice paths
- `package.json`, `remotion.config.ts`, `tsconfig.json`, `src/index.ts`, `src/generated/*` (built)

For runners 2 (and 7/8 which also use a single-element reveal) the `Level` is a small variation of runner-1's pitch Level. Runners 3/4/5/6/9 get a bespoke `Level` layout but still reuse Stage/background/timing/audio/intro/outro unchanged.

### Bundler verification (first build step)
Remotion uses webpack; importing TS from a sibling `.remotion-shared/src` outside the project root must be confirmed to bundle. **Runner 2's first task is to prove a shared import renders.** If it fails, fall back to **clone-per-runner** (copy runner-1's Remotion, adapt deltas) — the per-runner Level/build-data design is unchanged either way.

### Folder naming
Match runner-1's convention: top-level sibling folders `N_<Quiz Name> - Main Runner - Regular_Remotion` (folders 4/5/6 lack "Main Runner" in the runner name — mirror each runner's own name + `_Remotion`).

## Data flow (unchanged from runner 1)
`build-data.mjs` reads the runner's saves (the `recording-status.json` blocks — **not** the empty saved-scripts bucket), resolves crests/flags/photos/voices, writes `src/generated/saves.json` + `audio.json`, and syncs referenced assets into `.remotion-shared/public/`. Composition props (save / levels / formation / language / ending / background / transition) drive rendering exactly as runner 1.

## Per-runner spec gathering (fan-out)
For each of runners 3–9, before building, gather its play-video spec from source (one Explore agent per runner): slot/card front + reveal contents, data model, intro title EN/ES + voice filename, reveal-voice dir, theme default, formation usage. Runner 2's spec is already gathered.

## Plan of work
1. **Shared library extraction (copy, don't refactor runner 1)** — **copy** the identical files from runner-1 `src/` into `.remotion-shared/src/` as the canonical shared source, parameterizing the Intro shell (title/season/badge). **Runner-1's own Remotion project is left untouched** (it keeps its current copies) so the one working project carries zero regression risk; it remains the visual reference. The 8 new runners consume the shared lib. (Optionally migrating runner 1 onto the shared lib later is out of scope.)
2. **Runner 2** — build the per-runner files; prove shared import bundles; `build-data` + studio + **render a short proof MP4 (intro + 1 level + ending)** → user sign-off.
3. **Fan out 3–9** — one agent per runner: gather spec, build per-runner files from the proven base.
4. **QA render pass** — short proof MP4 per runner.
5. **Docs** — update `.Storage/docs/runner-architecture.md` + `INDEX.md` with the shared-lib architecture.

## QA bar
Per runner: `npm install` → `npm run build-data` (no missing-asset errors) → opens in Remotion Studio → `remotion render` a short proof MP4 the user watches and approves. Sign-off on runner 2 gates the fan-out.

## Risks
- **Bundler/shared-import** — mitigated by proving on runner 2 first; clone fallback ready.
- **Runner-1 regression** during extraction — mitigated by render-comparing runner 1 before/after.
- **Missing assets/voices** per runner (some voices may not be generated) — `build-data` must warn, not crash; projects build with whatever exists, user generates missing voices later.
- **Bespoke layouts (3/4/5/6/9)** are more work than 2/7/8 — handled per-runner in fan-out, each with its own gathered spec.

## Out of scope
- Shorts variants (only Regular runners).
- Generating any missing voice/image assets (the browser runners own that).
- Changing the existing browser play/record/render pipeline.
