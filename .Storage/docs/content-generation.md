# Content Generation & Theming

Titles/descriptions/tags, background themes, BGM source data, and the thumbnail studio.

## Name / Description / Tags generator
`.Storage/shared/name-description-generator/`: `name-description-generator.js` (orchestrator), `description-templates.js` / `-es.js`, `viral-tags.js` / `-es.js`.

- **API:** `initNameDescriptionGenerator()` (button + modal) and headless `generateNameDescription(language) → {title, description, tags[]}` (used by the recording queue to stamp YouTube metadata).
- **Titles:** Regular = **fixed** (`{QUIZ_TITLE} | {CHANNEL} {YEAR}`, optional save name if ≤100 chars). Shorts = **viral, randomized** (`buildShortsTitle`): `SHORTS_TITLE_FRAMES` × `SHORTS_TITLE_TASKS` (+ tails) ≈ **140 combos**, re-rolled every generate.
- **Descriptions:** Regular = long (hook + quiz explanation + features + engagement + cross-promo + 10–14 hashtags + sign-off). Shorts = compact (hook + CTA + 4–9 hashtags). Descriptions/tags **shuffle each generate**.
- **Tags:** Regular 12–15, Shorts 6–8, hard ceiling ~480 chars. Built from shuffled universal/quizType/format pools + context-matched club/country/league/player tags.
- **Context:** `buildContext()` scans the loaded levels for real team/player/country/league names + year.
- **RULE — no fabricated channel content:** only tags teams/players/countries that actually appear in the loaded levels and only references series/playlists that really exist. No "best of"/"all-time XI" invention.

## Background themes
`.Storage/shared/backgrounds/background-theme.js` (one big module). `initSharedBackgroundTheme(colorSel, effectSel, opacitySel, opts)`, `applyTheme()`, `applyCompetitionTheme()`, `resolveCompetitionId(name)`.

- **Brand colors:** ~15 per-quiz-type presets `{id, label, hex}`; the chosen color drives `--bg-stage`.
- **Procedural effects:** ~10 — `sun-rays-*`, `sun-spiral-center`, `center-rings`, `floating-emojis`, `rising-question-marks`, `rising-soccer-balls`, `youtube-thumbnails`, `diagonal-flow`, `football-pitch`. Line opacity default ~3.5%, persisted per color in localStorage bucket `shared_background_opacity_profiles_v1` (server-synced when on localhost).
- **Competition themes:** ~10 real tournaments (Champions/Europa/Conference League, Premier/La Liga/Bundesliga/Serie A/Ligue 1, World Cup, Euro) — brand gradient + procedural pattern tiles. **Auto-derived from the block/competition name** (`resolveCompetitionId` alias map, e.g. "ucl"→champions-league); falls back to per-quiz palette. Sets `--bg-stage` so stage/question colors match. Calendar has a competition dropdown. Engine shared across all runners. **Two UI models for picking a competition:**
- **Dedicated dropdown (runner 1):** a separate **"Competition background"** `<select id="in-competition-background">` (above Background Color in `controls.html`), wired via `initSharedBackgroundTheme(..., {competitionSelectEl})`. Options = "None" + each competition (bare `id`). Selecting one calls `applyCompetitionTheme` and **locks** the Color/Effect/Opacity controls (`setCompetitionLock` → `disabled` + `.field--locked` dim); "None" unlocks them and re-applies the plain theme. Competitions are NOT added to the color/effect selects in this mode. The render carries the choice: `app.js captureCurrentThemeOverride()` includes `competition`, and `render-mode.js` sets the competition dropdown (or color/effect) and fires `change`.
- **Legacy (other runners, no `competitionSelectEl`):** competitions appear as `comp-<id>` options inside BOTH the Color and Effect dropdowns; `applyCompetitionTheme` syncs both. Gotcha (fixed): `applyCurrentSelection` applies a competition if EITHER dropdown is `comp-`, so picking a plain value while the other dropdown still held `comp-` re-applied the competition ("effect only changes once") — the change handlers now clear the leftover `comp-` from the other dropdown.

Keep both paths working when editing `initSharedBackgroundTheme` / `applyCompetitionTheme` / `applyTheme`.
- **Floating emojis:** 7 football PNGs in `Images/Emojis/`; rendered in a 10×8 grid (runner `js/emojis.js` `initFloatingEmojis()` and the shared effect both implement it). Styling in `css/components/decor.css` (B&W, low opacity, edge-masked).

## BGM source data
Tracks live in `.Storage/Voices/Ringhton/` (~31 MP3s). Engine in `js/audio.js` (see [video-record-render.md](video-record-render.md) for the per-save 5-song freeze + crossfade + ducking). `BGM_PLAYLIST` exported; `pickRandomBgmSongs(n)` freezes a save's set (default 5).

## Teams data (for mixed videos)
- `.Storage/storage/well-known-teams.json` — canonical 3-tier (~85) list; basis for mixed-team videos when no specific save is loaded.
- `.Storage/data/teams-index.json` — `{clubs:[{id,name,country,league,path}]}` lookup → squad files.
- `.Storage/Squad Formation/Teams/<Country>/<League>/<Team>.json` — squad with players by position; each player: name, position, age, nationality, club, current + career totals, transfer history, shirt number, Transfermarkt id.

## Thumbnail studio
`js/thumbnail-studio.js` — per-runner 1280×720 YouTube thumbnail builder. `initThumbnailStudio()` opens an overlay. Composition: red banner (top ~25%, "GUESS THE" white + quiz line yellow, Impact font) + green pitch (bottom ~75%) with an 11-flag formation (slot coords normalized [0..1]) + procedural effect + optional competition icon (`Images/Icons/specific-title/<Comp>.png`, or a user-dropped data-URL). 5 palettes × 5 effects; "Regenerate visuals" re-rolls; "Download PNG" exports. Static (no animation).

Note: the **team-logo + player-name** quiz runners (folders 7 & 8) use `.career-team-quiz-card`, not `.career-portrait-card` (the four-params portrait CSS is dead code there).
