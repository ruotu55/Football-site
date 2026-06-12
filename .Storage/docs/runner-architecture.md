# Runner App Architecture

How a runner app is built, what each JS module does, and the shared modules.

## The runners (quiz types)
| # | Quiz | Variants |
|---|------|----------|
| 1 | Guess the Team Name (club, by player nationality) | **Regular = PREP PANEL (Remotion)** — see below, Shorts, _Remotion |
| 2 | Guess the National Team (by player club) | Regular, Shorts |
| 3 | Guess the Player by Career Path | Regular, Shorts |
| 4 | Guess the Player by Career Stats | Regular, Shorts |
| 5 | Guess the Player by Club/Position/Country/Age ("four params") | Regular, Shorts |
| 6 | Guess the Fake Information | Regular, Shorts |
| 7 | Guess the Team Logo Name | Regular, Shorts |
| 8 | Guess the Player Name | Regular, Shorts |
| 9 | Football Quiz Multiple Choice (A/B/C) | Regular only |

**Naming gotchas:** folders 4/5/6 lack "Main Runner" in the name (glob `1..9`, not `*Main Runner*`). Folder 6 has the literal typo "Informaiton". Runner 3 vs 4 Shorts look alike — confirm the URL/title in the browser before bumping caches. Runner 9 (MCQ) was cloned from #6; uses `mcq-mode.js`.

> **Every Regular runner (1–9) also has a Remotion project** that re-creates its play-video look, all grouped under the top-level **`___Remotion___/`** folder on a shared library. See **[Remotion projects — all Regular runners](#remotion-projects--all-regular-runners-_remotion_)** below.

## Boot sequence
`index.html` loads shared scripts (debug-overlay, loading-overlay, modal-layer, calendar schedule + recording-status-client), then an inline module fetches `html/*.html` partials into the DOM (`controls, progress, modals, pitch, landing, logo, outro`), moves the team header into its mount, and finally injects `js/app.js?v=<Date.now()>`. `app.js` builds `appState`, wires UI, imports the subsystems. (**Runner 1 Regular** loads only `controls, modals, pitch` and boots into the prep panel — see its section below.)

## Runner 1 Regular = Remotion prep panel (2026-06-12)

`1_Guess The Football Team Name - Main Runner - Regular` is no longer a playable quiz — it is the **control panel for preparing Remotion videos**. The whole browser play/record/headless-render layer was deleted (git history keeps it): `video.js`, `levels.js` play flow, `progress.js`, `transitions.js` overlays, `obs-recorder.js`, `recording-flow/preflight/queue.js`, all `render-*.js`, `thumbnail-studio.js`, the `render/` Node folder, `html/landing|logo|outro|progress.html`, and the play/record/render FABs. `run_site.py` (all endpoints) is untouched — open it the same way as before.

**How it works:**
- **Saved tab = `js/save-picker.js`** — lists EXACTLY the saves Remotion renders: named blocks with key prefix `1|` from `/__recording-status` (same filter as `___Remotion___/1_…_Remotion/scripts/build-data.mjs`). Clicking one loads via the old flow: frozen Save Video Status snapshot first, else rebuild from `teamsImportText` + Save Team layouts (`buildScriptFromImportText` → `applyScriptObject`).
- **Main view = `js/prep-panel.js`** — every question level of the loaded save is a stacked section ("Level N — Team" + 11 player cards). It reuses `pitch-render.js`'s `renderSlot`/slot controls UNCHANGED via a context swap: each section owns a `.pitch-slots` clone, and a capture-phase `pointerdown` sets `appState.currentLevelIndex` + `appState.els.pitchSlots` to that section before any click handler runs (all handlers read the "current" level via `getState()` at click time). `appState.videoRevealPostTimerActive = true` is forced so videoMode saves render the revealed card (photo + name + PHOTO/X/CROP controls). The single `#team-header` is the active-level toolbar (crest zoom/nudge/swap/Get-logo + dblclick name edit). Layout in `css/components/prep-panel.css` (flattens the pitch-formation absolute positioning into a grid).
- **💾 Save to save** (`#save-to-block-btn` FAB) — writes `captureCurrentScriptObject()` into **`block.script`** via the `replace` op. This is the save-back contract: Remotion `build-data.mjs` reads `block.script.levels`, so panel edits (names, photo picks, scales, XI) only reach the rendered video after this (photos themselves are disk files under `Images/` and are picked up immediately). "Save Video Status" still freezes the load-snapshot separately.
- **Kept tools:** full Voice tab, Update Data, Name & Description, PROD validation, bulk photo fetch, photo source picker/crop, saved team layouts, BGM 5-song preview (in the voice tab).
- **Slimmed shims:** `js/levels.js` (`switchLevel` just moves the pointer + fires `prep:level-switched`) and `js/transitions.js` (only `transitionSettings` + capture/apply + the Look-tab select) keep the script-object schema byte-compatible.
- All importers of `saved-scripts.js`/`levels.js` use the `?v=20260612-prep` token (split-brain rule).

## A runner's `js/` modules
**Core/state:** `app.js` (entry/wiring), `state.js` (`appState`), `constants.js`, `dom-bindings.js` (caches DOM into `appState.els`), `ui-panels.js`, `bootstrap-hybrid.js`, `dev-live-reload-state.js`.
**Teams/levels:** `levels.js` (`switchLevel`), `teams.js` (search/load squad), `formations.js` (slot coords per formation), `pick-xi.js`, `progress.js`, `level-control.js`, `nationality-pool-key.js`, `search-normalize.js`, `custom-selects.js`.
**Render/visuals:** `pitch-render.js` (`renderPitch`/`renderHeader`, slot flips), `transitions.js` (GSAP overlays), `team-header-hatch.js`, `flag-stripe-colors.js`, `emojis.js`, `thumbnail-studio.js`. (The "QUESTIONS + BONUS" pill style picker `landing-qstyle-switcher.js` was removed from runner 1 Regular on 2026-06-09 — only the ticket-stub look remains, baked into `landing.css`; other runners may still have it. See [video-record-render.md](video-record-render.md).)
**Photos:** `photo-helpers.js`, `photo-source-picker.js`, `bulk-photo-picker.js`, `photo-crop.js` (see [images.md](images.md)).
**Video/audio:** `video.js` (`startVideoFlow`/`runVideoStep`), `audio.js` (voices + BGM), `bgm-crossfade-preview.js`, `team-voice-manager.js`, `bundled-level-voices.js`, `voice-tab.js`.
**Record/render:** `recording-flow.js`, `recording-preflight.js`, `obs-recorder.js`, `recording-queue.js`, `render-mode.js`, `render-segments.js`, `render-progress-ui.js`, `render-test-clips-ui.js`, `prod-validation.js` (see [video-record-render.md](video-record-render.md)).
**Data/saves:** `saved-scripts.js`, `saved-team-layouts.js`, `update-data.js`, `runner-saved-server-sync.js`, `i18n.js`, `paths.js` (see [saves-and-data.md](saves-and-data.md)).
**`render/` (Node, headless):** `index.mjs`, `worker.mjs`, `lib.mjs`, `audio-mux.mjs`, `audio-filtergraph.mjs`, `segment-budgets.mjs`.

## Shared modules (`.Storage/shared/`)
`image-cache.js`, `asset-probe.js`, `team-image-paths.js`, `prod-asset-validation.js`, `record-language-chooser.js`, `recording-preflight-core.js`, `video-status.js`, `ball-preloader-animation.js`, `ball-merge-soccer-clones.js`, `backgrounds/background-theme.js`, `debug-overlay.js`, `loading-overlay.js` (DISABLED — no-op per user), `modal-layer.js`, `shorts-intro-quiz-title-fit.js`, `block-import-text.js`, `import-pair-format.js`, `import-player-manual-clubs.js`, `update-data-freshness.js`, `name-description-generator/` (see [content-generation.md](content-generation.md)).

## `appState` (state.js)
Single source of truth. Holds `els` (60+ DOM refs), `teamsIndex {clubs, nationalities}`, `levelsData[]` (index 0 logo, 1 landing, 2..N questions, last = outro), `currentLevelIndex`, `totalLevelsCount`, `playerImages`, `flagcodes`, session fields (`currentSquad`, `selectedEntry`, `squadType`, `formationId`, `displayMode`), video/record flags (`isVideoPlaying`, `rendering`, `videoMode`, `doubleRecording`), `bundledVoiceVariants`, `bgmSongs`. Helpers: `getState()`, `getQuizQuestionCount()`, `initLevels()`.

## Cache-busting (important)
Every JS/CSS import carries a `?v=` token. `app.js` is injected with `?v=<Date.now()>` (always fresh); CSS uses a semantic token in `index.html` (e.g. `styles.css?v=20260604-renderintro`).
- **CSS edit not showing** → bump the `styles.css?v=` token in `index.html`.
- **JS module edit not showing** → bump the `?v=` in the importer.
- **Split-brain bug**: if two importers load the *same* module with *different* `?v=` tokens, the browser creates **two module instances** with separate state. Symptom: "only the tab I reloaded works" / "Load a saved setting first". Fix: align tokens across all importers (app.js, recording-queue.js, saved-scripts.js, render-mode.js).
- Prefer **one `Write` per file** over many edits — rapid live-reload saves stall the page.

## Pitch player cards (Guess Team Name — Regular)

Runner **`1_Guess The Football Team Name - Main Runner - Regular`** renders each XI slot as a **portrait trading card**: white rounded frame, player photo, **red name band** (18% of card height) with **black italic uppercase text** at fixed size (`font-size: 13.2cqh` on `.slot-name`). Card footprint uses `--slot-card-size: 0.9` on `.player-slot`. Video flip **back** uses the trading-card frame; club-quiz video **front** (`.slot-front--club-flag`) is flag-only at old circle size via `.slot-inner--flag-flip` (scale → rotateY morph, 0.88s ease). Styles in `css/components/pitch.css`; DOM in `renderSlot`. Bump `styles.css?v=` in `index.html` after CSS edits.

## i18n
`i18n.js` `t(key)` over `TRANSLATIONS.{english,spanish}` + `translateCountry()`. `voice-tab.js` **forces language back to english on every page load** (record phase 2 left it spanish); runtime switches via `setCurrentLanguage()` still work. Shorts intro title is language-aware (`SHORTS_INTRO_QUIZ_TITLE_*`).

## Remotion projects — all Regular runners (`___Remotion___/`)

Every **Regular** runner (1–9) has a [Remotion](https://www.remotion.dev/) project that re-creates its **play-video** look as a deterministic React composition (separate from the browser play/record/render pipeline). They all live under the top-level **`___Remotion___/`** folder:

```
___Remotion___/
├─ Open Remotion.bat            ← opens ALL projects in ONE Studio (Compositions list)
├─ _studio/                     ← aggregator: registers every runner's composition
├─ Ready Videos/<Quiz Name>/<Language>/<save>.mp4   ← render output tree
├─ 1_…Team Name…_Remotion/      ← each project: + its own "Open Remotion Studio.bat"
├─ 2_…National Team…_Remotion/
└─ … 3–9 …
```

### Shared architecture (the important part)
- **Shared code library: `.remotion-shared/src/`** (repo root, committed; a sibling of the gitignored `.remotion-shared/public/` asset cache). Holds the pieces that are **byte-identical for every runner**: `scenes/BallIntro.tsx` (4-ball merge intro), `scenes/Outro.tsx` (the ending/CTA), `scenes/Intro.tsx` (landing **shell** — title/season/badge are props), `effects/*` (all background colors/effects/competitions), `transitions/*`, `components/Stage|SoccerBall|Pitch|PlayerSlot|RevealPanel`, `timing.ts`, `theme.ts`, `paths.ts`, `ending.ts`, `scene-props.ts`, and `build-lib.mjs` (shared build-data helpers).
- Projects import shared code via the **`@shared/*` alias** (configured per project in `remotion.config.ts` `resolve.alias` + `tsconfig.json` `paths`), so the folder nesting doesn't matter. `remotion.config.ts` also adds the project's `node_modules` to `resolve.modules` (so shared files outside the project root resolve react/remotion) and sets `setPublicDir` to `../../.remotion-shared/public` (one shared asset cache for all).
- **A per-runner project is only ~4 bespoke things:** `src/config.ts` (title strings EN/ES, theme default, `COMPOSITION_ID`), `src/scenes/Level.tsx` (+ any reveal components — the ONLY runner-specific UI), `src/level-data.ts` (resolves the save → display data), and `scripts/build-data.mjs` (its data source). Everything else (`FootballQuizDemo.tsx` scene-wiring + audio + duration math, `Root.tsx`, `schema.ts`, `index.ts`, `scripts/render.mjs`) is copied from runner 2 and only re-pointed at the local files. **Runner 1 is the original self-contained project (it predates the shared lib and keeps its own copies) — leave it as the visual reference.**

### Data + build
`scripts/build-data.mjs` imports `../../../.remotion-shared/src/build-lib.mjs` (helpers: `repoPaths`, `buildPhotoIndex`, `buildClubCrestIndex`, `buildFlagResolver`, `buildSquadPlayerIndex`→`findPlayer(club,name)`, `makeVoiceHelpers(VOICES_SRC, revealDir)`, `buildAudioManifest`, `firstBgm`, `syncAssets`, `syncVoices`, `COMMON_ASSETS`, `REVEAL_EN/ES`). It reads the runner's `recording-status.json` blocks (key prefix `N|`, **named blocks only**), writes `src/generated/{saves,audio}.json`, and syncs referenced assets into `.remotion-shared/public/`. **Data sourcing differs by runner:** runners 2–8 store only a `teamsImportText` list (the squad/team data is rebuilt at build time) — `"Team - Continent"` (r2 national teams), `"Team - Country"` (r7 crests), `"PlayerName - Club"` (r3/4/5/6/8 → `findPlayer` loads the player's full record from the club squad JSON in `Squad Formation/Teams`). **Runner 9 (MCQ) embeds the full `mcq` object per level** (question + A/B/C answers + `correctAnswerId` + `topicImage`) — no `teamsImportText`.

### The runners
| # | Composition id | Level (question → reveal) | Data clue | Theme default |
|---|---|---|---|---|
| 1 | `Guess-The-Football-Team-Name-Regular` | 11-slot pitch, nationality flags → player photos; club crest + flag panel | save's embedded XI | Club by Nationality |
| 2 | `Guess-The-Football-National-Team-Regular` | 11-slot pitch, **club crests** → photos; **national flag + name** panel | national squad XI | `#1B5E20 - National Team by Club` |
| 3 | `Guess-The-Player-By-Career-Path-Regular` | **career timeline** of club crests + years, silhouette → photo + name | player `transfer_history` | `#0069EC - Career Path` |
| 4 | `Guess-The-Player-By-Career-Stats-Regular` | **stats panel** (games/pos/goals/assists or GK conceded/clean-sheets) + clubs grid + flag, silhouette → photo + name | player `club_career_totals` | `#AB47BC - Career Stats` |
| 5 | `Guess-The-Player-By-Club-Position-Country-Age-Regular` | **2×2 frosted cards** (club crest, position, country flag, age) + portrait → photo + name | player record | `#5C6BC0 - Club + Position + Country + Age` |
| 6 | `Guess-The-Fake-Information-Regular` | same 4-param grid but ONE card is **fake** → flips to real value on reveal (fake-stat voice) | player record + deterministic fake | `#E57373 - Fake Information` |
| 7 | `Guess-The-Football-Team-Logo-Name-Regular` | ONE big crest **obscured** (blur+dark) → clear crest + team name | team crest | `#81C784 - Football Team Name` |
| 8 | `Guess-The-Football-Player-Name-Regular` | ONE player photo **silhouetted** → full color + name | player photo | `#9575CD - Football Player Name` |
| 9 | `Football-Quiz-Multiple-Choice-Regular` | question + **A/B/C cards** (trivia: topic image + text; which-player: 3 photo cards) → correct highlighted green | embedded `mcq` | `#C2185B - Football Quiz (Multiple Choice)` |

All share the **same intro, outro/ending, background effects, transitions, level/countdown handling, and EN/ES language** by construction (one shared source). The `Level` component signature is uniform: `<Level bg={…} level={lvl} levelNumber={i+1} language={…} />`, with `REVEAL_START = 185` design frames (the flip/reveal tick) and the shared gold `LevelBadge` (top-left) + countdown `Timer` ring (top-right) that fade out on reveal.

**Ending voice (mirrors Regular play video):** two clips per language (`think-you-know` / `how-many`) from `.Storage/Voices/Ending Guess/`; chosen by the **Ending** prop. **Random** resolves once per save via `@shared/ending` `resolveEndingKey()` (deterministic hash) so voice + `Outro.tsx` title stay matched. The voice `<Sequence>` starts **0.5s after** `outroStart` (`ENDING_VOICE_DELAY_SEC` in `FootballQuizDemo.tsx`). Outro scene length is `outroFramesForEnding()` (voice duration + ~1s tail).

### Run / Studio / render
- **One Studio for everything:** double-click `___Remotion___/Open Remotion.bat` (runs `remotion studio ../_studio/studio-entry.tsx` from runner 2's folder, reusing its install) → Compositions panel lists all 9. Per-project: each folder's `Open Remotion Studio.bat` (or `npm run studio`).
- **"Save default props" in the aggregated Studio:** the studio server resolves the file it rewrites via Remotion's `<stem>-entry.tsx` → `<Pascal>Root.tsx` convention (`getRootFileFromEntryPoint` in `@remotion/studio-server`). That is why the entry is named `studio-entry.tsx` and the root `StudioRoot.tsx` — with any other names the server falls back to `src/Root.tsx` **of the cwd (runner 2)**, whose `id={COMPOSITION_ID}` variable defeats static extraction → "Could not find or extract defaultProps". Each `<Composition>` in `StudioRoot.tsx` must also keep a literal string `id` and a fully inline `defaultProps` literal (`as const` is fine; no spreads/variable refs). The same applies to every per-runner `src/Root.tsx` (used by each folder's own `Open Remotion Studio.bat`): all 9 now hardcode the id (= config.ts `COMPOSITION_ID`) and inline color/effect (= config.ts `THEME_DEFAULT`) — keep them in sync by hand if config.ts changes.
- **Render to the Ready Videos tree:** `npm run render -- --save "<Save>" --language English [--levels All]` → `Ready Videos/<Quiz Name>/<Language>/<save>.mp4` (via `scripts/render.mjs`). Verified end-to-end (1920×1080 H.264+AAC) for runners 2 + 9.
- Re-run `npm run build-data` after the save list / voices / assets change (it also updates `quizTitleDurationSec` / `endingDurationSec` used for scene lengths).

### Competition background themes (Remotion) — the ONLY background control
The `color` + `effect` props were REMOVED from all 9 Remotion schemas (2026-06-12); `competition` alone now defines the whole background. Two kinds of entries in `COMPETITIONS`:
- **Real competitions** — gradient + a UNIQUE sparse pattern (5 small shapes per 300px tile, alpha ≈0.05, slow downward drift — the CL stars set the subtlety benchmark): CL=5-point stars, Premier League=crown outlines (faint cyan), La Liga=rings+dots, Ligue 1=hexagon outlines, Euro=4-point sparkles, Bundesliga=diamond (Raute) outlines, Serie A=scudetto shield outlines, World Cup=center rays, Europa/Conference League=diagonal stripes.
- **Generic 1–4** — fresh gradients (none of the old 16 quiz colors) + ONE animated effect each via `recipe.effectId` (`pattern: "none"`): 1=Sun spiral/crimson, 2=Sun rays top-right/bronze, 3=Rising question marks/charcoal, 4=Rising soccer balls/steel-blue. (Started as 10; user culled to these 4 on 2026-06-12.) All background motion runs at ONE global speed — `DRIFT_PX_PER_SEC` in `AnimatedBackground.tsx` (rotation periods + sprite travel are derived from it so the *visible* speed matches the CL stars drift).

Recipes + SVG tile generators in `.remotion-shared/src/effects/effects-data.ts` (`COMPETITIONS`, `*TileUri()`); rendering in `AnimatedBackground.tsx` (`CompetitionBg` + effect overlay when `recipe.effectId` is set). NOTE: runner 1 keeps LOCAL COPIES of both files (`1_…/src/effects/`) — copy the shared versions over them after editing shared. Each runner's `resolveBackground` lives in its `schema.ts`.

### Known gaps (non-blocking, by-design or asset-dependent)
- **Reveal voices** are missing for many teams/players (TTS not yet generated) — the Level just skips the voice (no crash); generate them in the browser runners' voice tab, then re-run `build-data`.
- **Career-history crests** (runner 3/4 clubs grid) use short transfer_history names (e.g. "Dortmund", "Birmingham") that don't always match `Images/Teams/*.png` filenames → some crest slots are blank. Same limitation as the browser runner; an alias map could improve it.
- Runner-9 MCQ quiz-title voice + per-answer voices mostly absent (no `Game name/Football Quiz MCQ` clips yet).
