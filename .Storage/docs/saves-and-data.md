# Saves & Data Model

How a configured video is represented, persisted, and rebuilt.

Key files: `js/saved-scripts.js`, `js/recording-queue.js`, `js/saved-team-layouts.js`, `.Storage/shared/import-pair-format.js`, `.Storage/shared/import-player-manual-clubs.js`, `.Storage/shared/video-status.js`. Backend: `.Storage/Scripts/dev_server_recording_status.py`, `dev_server_runner_blob.py`, `dev_server_saved_scripts.py`.

## Three stores
1. **`recording-status.json`** (`.Storage/storage/`) — the calendar/runner **blocks**. Source of truth for what gets recorded.
2. **Saved scripts** — named per-mode configs (`.Storage/storage/saved-scripts/<mode>_<variant>.json`, mirrored in localStorage).
3. **Runner JSON blobs** (`.Storage/storage/runner-blobs/<bucket>.json`) — shared cross-save data, esp. saved team layouts and name overrides.

## recording-status.json (blocks)
Block key: `"<runnerId>|<type>|<episode>"` where type ∈ `long|short` (e.g. `1|long|5`). Schema:
```json
{ "blocks": { "1|long|5": {
  "name": "...",
  "teamsImportText": "[Team1, Team2, ...]",   // ← SOURCE OF TRUTH; script rebuilt from this
  "script": { /* optional legacy snapshot */ },
  "recorded": { "english": <ts|null>, "spanish": <ts|null> },
  "video":   { "english": {path,title,description,tags}, "spanish": {...} },
  "youtube": { "english": {videoId,uploadedAt,playlistId,...}, "spanish": {...} },
  "voiceFreeze": { "bundledVariants": {...} },
  "levelVoiceFreezes": [ { "revealPhraseByLanguage": {english,spanish} }, ... ],
  "videoStatus": { "enabled": bool, "savedAt": ts, "frozenScript": {...} },
  "updatedAt": <ts>
} } }
```
- **`teamsImportText` is the source of truth** — the script is rebuilt from it (against the *current* saved layouts), not from a frozen snapshot. Line suffix = country (runner 1) / continent (runner 2); edit it to reorder teams.
- Endpoint `POST /__recording-status` ops: `replace`, `stampRecording`, `setVideoStatus`, `setYoutube`, `clearLanguage`. **Mass-delete safeguard**: `replace` is refused if it would wipe >50% of ≥10 existing blocks (stops a stale tab from blanking the store).
- Shorts blocks are intentionally **nameless** (auto-named from the calendar slot on record); Regular blocks must have a name.

## Saved scripts (`saved-scripts.js`)
`captureCurrentScriptObject(name)` → script object; `applyScriptObject(script)` / `loadScriptByName(name)` restore it. Fields: `landing` (gameMode, quizType, endingType, difficulty counts), `lineup`, `transitions`, `levels[]`, `voiceFreeze`, `bgmSongs[]` (5 frozen songs), `competition`.

Per-level fields include: `selectedEntry`, `currentSquad`, `formationId`, `displayMode`, `customXi` (saved XI), `customNames`, `videoMode`, `headerTeamNameOverride`, `headerLogoOverrideRelPath`, slot scale/photo-index arrays, `voiceFreeze.revealPhraseByLanguage`.

localStorage keys are per-runner, e.g. `footballQuizScripts_lineups_regular_fcbnew`. Server sync via `runner-saved-server-sync.js`.

⚠️ **Importer `?v=` token must match across importers** or you get two `activeScriptName` instances ("Load a saved setting first" split-brain). Align tokens across app.js / recording-queue.js / saved-scripts.js per runner.

## Saved team layouts / lineups (`saved-team-layouts.js`)
Blob bucket: `lineups_runner_team_layouts_shared` → `.Storage/storage/runner-blobs/lineups_runner_team_layouts_shared.json`. Keyed by the team's squad JSON path. Per team: `squadType, formationId, displayMode, customXi[], customNames, headerLogo*, slotClubCrestOverrideRelPathBySlot, slotFlagScales[11], slotTeamLogoScales[11], slotPhotoIndexEntries`.
- `customXi` is **positional by slot index**.
- A team must **have a saved layout** to import (`hasSavedLayoutForEntry`) → otherwise "X dont have a save team". Create the snapshot via `serializeTeamLayoutSnapshot()`.
- Player rehydration (`findPoolPlayerForSavedSlot`) matches saved names to the live squad: exact → fuzzy last-name → substring → club filter → position filter.
- To rebuild runner-1 lineups: `docs/REBUILD_SAVED_TEAM_LINEUPS.md` + `scripts/lineup_rebuild/`.

## Other runner-blob buckets
- `team_name_overrides_shared` / `…_national` — `"<quizType>::<squad path>": "Display Name"` header overrides.
- `shared_background_opacity_profiles_v1` — per-color background opacity.
Endpoint: `GET/POST /__runner-json-blob/<bucket>` (bucket name `[a-z0-9_]{1,64}`, max 12 MB).

## Import resolution (`import-pair-format.js` + `saved-scripts.js`)
`buildScriptFromImportText(text)`: parse "Team - Country" pairs or legacy `[A, B, ...]` → `normalizeForImport()` (strips diacritics, ł/đ/slash, Turkish letters) → `IMPORT_TEAM_ALIASES` exact map → find entry in teams-index → require saved layout → load squad → build level. Manual overrides: `PLAYER_MANUAL_CLUBS` / `PLAYER_IMPORT_ALIASES` (`import-player-manual-clubs.js`); an explicit typed club (`e.right`) now wins over a stale manual-club entry.

## Video Status freeze (`video-status.js`)
"Save Video Status" button under Record Video. Toggling **on** stores `block.videoStatus.frozenScript` (a full `captureCurrentScriptObject` snapshot) via `setVideoStatus`; loading the block then applies it verbatim instead of rebuilding from `teamsImportText`. Toggling **off** reverts to the normal rebuild.
