# Storage & Repo Layout

Where every kind of file lives. Paths are relative to the repo root (`Football Channel/`).

## Top-level folders

### Runner apps (one folder per quiz type × variant)
Each numbered folder is a standalone browser app + its own `run_site.py` dev server. See [runner-architecture.md](runner-architecture.md) for the full list and what each quiz is.
- `1_Guess The Football Team Name - Main Runner - Regular` (+ `- Shorts`, + `_Remotion`)
- `2_Guess The Football National Team - Main Runner - Regular` (+ `- Shorts`)
- `3_Guess The Player By Carrer Path - Main Runner - Regular` (+ `- Shorts`)
- `4_Guess The Player By Carrer Stats - Regular` (+ `- Shorts`)  ← note: no "Main Runner" in name
- `5_Guess The Player By Club_Position_Country_Age - Regular` (+ `- Shorts`)  ← "Four params"
- `6_Guess The Fake Informaiton - Regular` (+ `- Shorts`)  ← "Informaiton" typo is real
- `7_Guess The Football Team Logo Name - Main Runner - Regular` (+ `- Shorts`)
- `8_Guess The Football Player Name - Main Runner - Regular` (+ `- Shorts`)
- `9_Football Quiz Multiple Choice - Main Runner - Regular` (Regular only)

A runner folder contains: `css/ html/ js/ render/ assets/ docs/ tests/`, plus `index.html`, `run_site.py`, `run_site.bat`, `run_site.sh`, `CALENDAR_RULES.md`.

### Utility / support folders
- `999_Calander/` — calendar & scheduling web UI (`js/schedule.js`, `js/recording-status-client.js`). Launches runners, paints recorded badges, drives uploads. Runs on port **8899**.
- `999_Mac_Uploader/` — tiny localhost:**9876** helper for the "site-on-PC, record-on-Mac" split; routes calendar Upload + OBS record-dir to the Mac.
- `Images/` — all image assets (see below + [images.md](images.md)).
- `Ready videos/<English|Spanish>/` — OBS + render output MP4s. `…/render-tests/` holds render test clips.
- `scripts/`, `tests/`, `docs/` — repo-level scripts, tests, and superpowers plans/specs.

## `Images/` tree (repo root)
- `Images/Teams/<Country>/<League>/<Team>.png` — club crests.
- `Images/Teams/(1) Other Teams/<Team>.png` — fallback crests that don't fit a country/league.
- `Images/National Team Logos/<Country>.png` — national crests.
- `Images/Players/Club images/<Country>/<League>/<Club>/<Player>/<file>.webp|png` — club player photos (long SHA-named files).
- `Images/Players/Nationality images/<Region>/<Country>/<Player>/<file>` — national player photos.
- `Images/Players No Background/Ready photos/<Player>.png` — clean career/reveal portraits.
- `Images/Logo/`, `Images/Small Logos/`, `Images/Banner/`, `Images/Backgrounds/`, `Images/Emojis/`, `Images/Icons/specific-title/` — branding, decor, competition icons.

## `.Storage/` tree

### `.Storage/data/` — master indices
- `teams-index.json` — index of all clubs `{ id, name, country, league, path }` → squad JSON. The lookup backbone.
- `player-images.json` — maps `country|league|club|player` (and `region|country|player`) → array of photo rel-paths. See [images.md](images.md).
- `player-photo-overrides.json` — manual photo associations.
- `country-to-flagcode.json` — country → ISO flag code.
- `other-teams-logos.json` — logos for non-standard teams.

### `.Storage/storage/` — runtime state (source of truth for what gets recorded)
- `recording-status.json` — **the central store**: all video "blocks" (per runner/episode), their `teamsImportText`, recorded timestamps, YouTube metadata, frozen video status. Heavily backed up (`.bak-*`). See [saves-and-data.md](saves-and-data.md).
- `well-known-teams.json` — canonical 3-tier (~85) team list for mixed-team videos.
- `import-aliases.json` — import name aliases.
- `saved-scripts/` — cached per-mode saved scripts (`<mode>_regular.json`, `<mode>_shorts.json`).
- `runner-blobs/` — shared per-runner JSON blobs (served via `/__runner-json-blob/<bucket>`):
  - `lineups_runner_team_layouts_shared.json` — saved team lineups (XI/formation/photos). **A team needs a saved layout here to import.**
  - `lineups_shorts_team_layouts.json` — legacy shorts layouts (migrated into shared).
  - `team_name_overrides_shared.json` / `…_national.json` — header display-name overrides.
  - `shared_background_opacity_profiles_v1.json` — per-color background opacity.

### `.Storage/Squad Formation/` — player/squad data
- `Teams/<Country>/<League>/<Team>.json` — club squads (goalkeepers/defenders/midfielders/forwards, each player with stats, transfer history, nationality, shirt number). ~121 country dirs.
- `Nationalities/<Continent>/…` — national squads.
- `_transfermarkt_nationality_id_map.json`, `_tier1_competitions.json`, sync logs.

### `.Storage/Voices/` — TTS audio (see [voices.md](voices.md))
`Team names/`, `Players Names/`, `Nationality teams names/`, `Game name/`, `Welcome/`, `Ending Guess/`, `Levels/`, `MCQ/`, `Fake Stats/`, `Transitions/`, `Ticking sound/`, `Ringhton/` (BGM tracks).

### `.Storage/shared/` — shared JS/CSS used by all runners (see [runner-architecture.md](runner-architecture.md))
Image cache, asset probe, ball preloader, background theme, record-language chooser, name-description generator, import format, update-data freshness, prod-asset validation, video-status, modal/loading overlays, etc.

### `.Storage/Scripts/` — Python dev-server endpoint modules + maintenance scripts
`dev_server_*.py` (youtube, runner_blob, recording_status, update_data, launch_runner, import_aliases, saved_scripts) are imported by each runner's `run_site.py`. Plus `add-*-blocks.mjs` / `apply-*-picks.mjs` data scripts and `authorize_youtube.py`.

### `.Storage/youtube/` — credentials & upload state (sensitive)
`client_secret*.json` (multiple OAuth apps), `token_en*.json` / `token_es*.json` (per channel), `playlists.json`, `thumbnails/`.

### Other
- `.Storage/transitions/` — Lottie/JSON transition animations.
- `.Storage/General values/` — `image.json`, `image_sources.json`.
- `.Storage/Legacy/` — archived images/scripts (incl. the Transfermarkt squad generator used by Update Data).
- `.Storage/update-data-cookie.json`, `.Storage/update-data-history.json` — Update Data session cookie + per-team refresh timestamps.

## Gotchas
- **Legacy `Teams Images/` folder bug**: old crest paths get rewritten to `Images/Teams/` by `normalizeLegacyTeamImageRelPath()` — don't re-create the stray folder.
- `recording-status.json` is mass-delete-guarded server-side; a stale tab can't wipe it. Recover from `.bak-*` / git if needed.
- The `_Remotion` runner folder is largely unused/experimental.
