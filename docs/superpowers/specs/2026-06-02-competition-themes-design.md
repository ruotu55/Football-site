# Competition Themes — Design

**Date:** 2026-06-02
**Status:** Approved, implementing.

## Goal
Each special competition in the calendar gets its own full-bleed background + pattern (procedural, brand colours) and a matching transition colour. "Mixed" videos keep today's per-quiz-type default. The calendar's free-text competition name becomes a dropdown (competitions + Mixed); themes also auto-resolve from existing block names so no manual editing is required.

## Competitions (from the live calendar)
World Cup, Euro, Champions League, Europa League, Conference League, Premier League, La Liga, Bundesliga, Serie A, Ligue 1. Everything else (empty / "Mixed players N" / "Mixed teams N" / "Logos N" / "Player names N") = **mixed**.

## Architecture
- **Registry** in `.Storage/shared/backgrounds/background-theme.js`: `COMPETITION_THEMES[id] = { id, label, aliases[], dominantHex, opacity, build() -> { background, backgroundSize, animation, extraCss } }`. `aliases` map current calendar names (e.g. "Champion League", "Seria A", "Premier league") → id.
- **New exported fns:** `applyCompetitionTheme(id)` (sibling of `applyTheme`: sets `--bg-stage`=dominantHex so the transition matches, sets root `data-shared-background-color/effect="comp-<id>"`, injects the comp's gradient+pattern CSS, reuses the ball-preloader mirror + shorts `.stage::before` + keyframes helpers); `resolveCompetitionId(name)` (alias/normalize match → id or `null`); `listCompetitionThemes()` (for the calendar dropdown); `COMPETITION_MIXED = "mixed"`.
- **Procedural patterns** (full-bleed, scale to Regular + Shorts): `stars` (tiled SVG), `chevron` (zigzag bands), `diagonal` (bold brand stripes), `rays` (repeating-conic). Each comp = a brand gradient base + one pattern.

| id | dominantHex (transition) | gradient | pattern |
|---|---|---|---|
| champions-league | #0a1a4a | navy→blue | stars |
| premier-league | #37003c | purple→magenta | chevron |
| world-cup | #6b0f1a | dark red→gold | rays |
| euro | #0a3d4a | teal→navy | chevron |
| europa-league | #1a1a1a | black→orange | diagonal |
| conference-league | #0a3d2e | green→lime | diagonal |
| bundesliga | #1a1a1a | black→red | diagonal |
| la-liga | #001e44 | navy→coral | chevron |
| serie-a | #021a3a | navy blue | diagonal |
| ligue-1 | #091c3e | navy→lime | chevron |

(Colours/patterns are tuned live after first render.)

## Data flow (mirrors voiceFreeze / bgmSongs)
- Block carries `script.competition` (id or `"mixed"`). Re-injected on load in `recording-queue.js`; set into `appState.competition` in `saved-scripts.js#loadScript`; frozen on save in the buildScript object.
- On load the runner applies the theme: special id → `applyCompetitionTheme(id)`; `mixed`/absent → existing `applyDefaultThemeForCurrentQuizType()` (unchanged).
- **Migration** (one-time, backed up): add `script.competition` to all 226 blocks — `resolveCompetitionId(block.name)` or `"mixed"`.

## Calendar
Save-block modal: replace the free-text competition field with a dropdown = `listCompetitionThemes()` + "Mixed". Special pick → sets `block.competition` and auto-names the block to the competition label; "Mixed" → keeps free-text name. Writes `block.script.competition`.

## Scope
All 17 runners (theme rides in the save). Transition color is automatic via `--bg-stage`. No image assets.

## Out of scope
Per-competition photo backgrounds (can drop one in later for a single comp if wanted).
