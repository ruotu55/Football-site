# Runner App Architecture

How a runner app is built, what each JS module does, and the shared modules.

## The runners (quiz types)
| # | Quiz | Variants |
|---|------|----------|
| 1 | Guess the Team Name (club, by player nationality) | Regular, Shorts, _Remotion |
| 2 | Guess the National Team (by player club) | Regular, Shorts |
| 3 | Guess the Player by Career Path | Regular, Shorts |
| 4 | Guess the Player by Career Stats | Regular, Shorts |
| 5 | Guess the Player by Club/Position/Country/Age ("four params") | Regular, Shorts |
| 6 | Guess the Fake Information | Regular, Shorts |
| 7 | Guess the Team Logo Name | Regular, Shorts |
| 8 | Guess the Player Name | Regular, Shorts |
| 9 | Football Quiz Multiple Choice (A/B/C) | Regular only |

**Naming gotchas:** folders 4/5/6 lack "Main Runner" in the name (glob `1..9`, not `*Main Runner*`). Folder 6 has the literal typo "Informaiton". Runner 3 vs 4 Shorts look alike — confirm the URL/title in the browser before bumping caches. Runner 9 (MCQ) was cloned from #6; uses `mcq-mode.js`.

## Boot sequence
`index.html` loads shared scripts (debug-overlay, loading-overlay, modal-layer, calendar schedule + recording-status-client), then an inline module fetches `html/*.html` partials into the DOM (`controls, progress, modals, pitch, landing, logo, outro`), moves the team header into its mount, and finally injects `js/app.js?v=<Date.now()>`. `app.js` builds `appState`, wires UI, imports the subsystems.

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

## Runner 1 — Remotion variant (`1_Guess The Football Team Name - Main Runner - Regular_Remotion`)
Separate [Remotion](https://www.remotion.dev/) project (not the browser play/record/render pipeline). Composition `Guess-The-Football-Team-Name-Regular` in `src/FootballQuizDemo.tsx`; props in `src/schema.ts` (save, levels, formation, language, **ending**, background, transition). Data built by `scripts/build-data.mjs` → `src/generated/saves.json` + `audio.json`; voices synced to `<repo>/.remotion-shared/public/Voices/`.

**Ending voice (mirrors Regular play video):** two clips per language (`think-you-know` / `how-many`) from `.Storage/Voices/Ending Guess/`; chosen by the **Ending** prop. **Random** resolves once per save via `src/ending.ts` `resolveEndingKey()` (deterministic hash) so voice + `Outro.tsx` title stay matched. The voice `<Sequence>` starts **0.5s after** `outroStart` (`ENDING_VOICE_DELAY_SEC` in `FootballQuizDemo.tsx`) — i.e. half a second into the transition into the outro. Outro scene length is `outroFramesForEnding()` (voice duration + ~1s tail). Re-run `npm run build-data` after ending voice files change (updates `endingDurationSec` in `audio.json`).
