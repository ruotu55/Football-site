# Runner 1 Regular → Remotion Prep Panel — Design

**Date:** 2026-06-12
**Status:** Approved by user (chat)
**Folder:** `1_Guess The Football Team Name - Main Runner - Regular`

## Purpose

The runner stops being a playable quiz app. It becomes a **control panel for preparing Remotion videos**: the user picks a save, sees every level's 11 players as cards, and fixes photos / names / voices / data before rendering the video in `___Remotion___/1_…_Remotion`.

The actual video (intro, level play, countdown, reveal, outro, record, headless render) is Remotion's job now. This app only **prepares assets and save data**.

## Save connection (hard requirement)

The panel must operate on **exactly the saves Remotion renders**:

- Source: `.Storage/storage/recording-status.json`, named blocks with key prefix `1|` (same filter as `___Remotion___/1_…_Remotion/scripts/build-data.mjs`: named blocks only).
- Fetched via the existing `/__recording-status` endpoint (`run_site.py`, unchanged).
- Selecting a save resolves the script the same way the runner does today: frozen `script` snapshot if "Save Video Status" was used, else rebuilt from `teamsImportText` + saved team layouts (`buildScriptFromImportText` in `saved-scripts.js`).
- Loading goes through the existing `applyScriptObject()` → `appState.levelsData`.

Photos, voices, crests, flags all stay at their current `.Storage` / `Images/` paths — Remotion's `build-data.mjs` already reads those same paths.

## Main view

New module `js/prep-panel.js` replaces the stage (pitch/landing/logo/outro):

- One scrollable page. One section per **question level** (levelsData index 2..N-1).
- Section header: "Level N — <Team>" + status chips (photos ✔/⚠ count, reveal voice ✔/⚠, crest ✔/⚠).
- Body: the 11 player cards (photo + name), reusing the existing `renderSlot` + slot controls from `pitch-render.js`, refactored to take an explicit level index instead of `appState.currentLevelIndex`.
- Per-card controls kept as-is: PHOTO (3-source picker), X (remove photo), CROP, name edit (double-click + button), per-slot flag/logo scale.
- Per-level header controls kept: team crest scale / nudge / override.

## Kept features (existing implementations)

| Feature | Module(s) |
|---|---|
| Save picker (new UI, old data flow) | new `save-picker.js` + `saved-scripts.js`, `video-status.js` |
| Voice tab — per-level/intro/ending rows, Create All Voices, Download all (EN+ES) | `voice-tab.js`, `audio.js`, `team-voice-manager.js`, `bundled-level-voices.js` |
| Update Data | `update-data.js` + modal |
| Name & Description generator | `.Storage/shared/name-description-generator/` |
| PROD validation | `prod-validation.js` |
| Bulk photo fetch ("Get all team photos") | `bulk-photo-picker.js` |
| Photo tools | `photo-helpers.js`, `photo-source-picker.js`, `photo-crop.js` |
| BGM viewer (read-only 5 frozen songs + preview) | `bgm-crossfade-preview.js` |
| Save-back: "Save changes to block" so panel edits (names, photo picks, scales) persist into `recording-status.json` for Remotion | `video-status.js` freeze / block-update op |

## Deleted outright (git history keeps them)

`video.js`, `levels.js` (play-flow switching; loader hook replaced), `transitions.js` (except the two capture/apply-settings helpers `saved-scripts.js` needs — script schema stays byte-compatible), `progress.js`, `obs-recorder.js`, `recording-flow.js`, `recording-preflight.js`, `recording-queue.js`, `render-mode.js`, `render-segments.js`, `render-ease.js`, `render-options-dialog.js`, `render-progress-ui.js`, `render-test-clips-ui.js`, `thumbnail-studio.js`, the `render/` Node folder, `html/landing.html`, `html/logo.html`, `html/outro.html`, play/record/render buttons in `controls.html`, and their CSS modes.

## Not touched

- `run_site.py` / `run_site.bat` — opened exactly as before; all endpoints stay.
- The script-object schema (saves stay compatible with Remotion, the calendar, and other tooling).
- All other 16 runners and the Remotion projects.

## Risks

- `pitch-render.js` (~2.6k lines) is the one real refactor: generalize slot rendering + slot controls from "current level" to "any level index". Everything else is deletion plus a thin new panel module.
- Save-back must reuse the existing block-update op (server refuses mass-delete replace — the safeguard stays).

## Verification

- Open via `run_site.bat`, pick a named `1|` save → all levels render with photos + names.
- PHOTO / X / CROP / name edit work on any card in any level; edits persist after Save-back + reload.
- Voice tab lists every level + intro + ending; Create All Voices works.
- Update Data, Name & Description, PROD validation, bulk photo fetch, BGM preview all work.
- `___Remotion___` runner 1 `build-data` picks up panel edits (photo file changes immediately; script changes after Save-back).
