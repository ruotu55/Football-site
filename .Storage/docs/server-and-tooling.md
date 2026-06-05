# Dev Server & Tooling

`run_site.py` — the per-runner local HTTP server — plus Update Data, YouTube upload, and the Mac uploader.

## run_site.py
Each runner has its own. Serves the static app + a set of `__`-prefixed JSON/SSE endpoints. Built on `ThreadingHTTPServer`; delegates many endpoints to dynamically-imported modules in `.Storage/Scripts/dev_server_*.py` (youtube, runner_blob, recording_status, update_data, launch_runner, import_aliases, saved_scripts).

**Launch:** `run_site.bat` (Windows; must be **CRLF** or it fails silently) → `python run_site.py --host 0.0.0.0`. Flags: `--port N`, `--strict-port`, `--no-browser`, `--host`.

**Ports:** deterministic `8900 + runnerId*2 + (1 if short else 0)` (runner 1 long = 8902, short = 8903). Calendar = **8899**, Mac uploader = **9876**. Launched directly it defaults to **8888** and falls back +1 until free (unless `--strict-port`). Prints a LAN URL when bound to `0.0.0.0`.

**Idle auto-shutdown:** server `os._exit`s ~5 min after the last browser tab disconnects (`FC_IDLE_SHUTDOWN_SECONDS`, default 300; 0 disables). Fixes servers piling up + RAM exhaustion. During recording the tab stays open so it won't exit.

## Endpoint reference
| Group | Endpoints | Notes |
|-------|-----------|-------|
| Voices | `/__team-voice/*`, `/__player-voice/*`, `/__quiz-title-voice/*`, `/__ending-voice/*`, `/__bundled-voice/*` (status/generate/delete) | ElevenLabs TTS. See [voices.md](voices.md) |
| Photos | `/__player-photo/{auto-fetch,list-candidates,save-chosen,from-url,save-crop,delete}`, `/__team-logo/fetch`, `/__other-teams-logos.json` | See [images.md](images.md) |
| Render | `/__render-video` (POST), `/__render-video/progress` (SSE), `/__render-video/delete` (POST, validated to `Ready videos/`) | See [video-record-render.md](video-record-render.md) |
| Recording state | `/__recording-status` (GET/POST: replace/stampRecording/setVideoStatus/setYoutube/clearLanguage) | See [saves-and-data.md](saves-and-data.md) |
| Runner blobs | `/__runner-json-blob/<bucket>` (GET/POST) | saved layouts, name overrides |
| Saved scripts | `/__saved-scripts` (GET/POST) | named configs |
| Import aliases | `/__runner-import-aliases` (GET/POST) | team-name aliases |
| Update Data | `/__update-data/{start,start-cached,progress(SSE),history}` | Transfermarkt fetch |
| OBS | `/__obs-config?language=` | recordings dir, ws url, profile/scene |
| Remote | `/__launch-runner` (POST), `/__remote-url` | launch a runner on its port / get LAN URL |
| YouTube | `/__youtube-status`, `/__youtube-upload`, `/__youtube-thumbnail` (GET/POST) | upload + per-video thumbnail |
| Live reload | `/__live-reload` (SSE) | dev auto-reload + idle heartbeat |

**Cache headers:** images `Cache-Control: public, max-age=86400`; HTML/CSS/JS/JSON `no-store` (so `?v=` tokens drive freshness — see runner-architecture).

## Live reload
HTML gets a `LIVE_RELOAD_SNIPPET`; client opens `EventSource(/__live-reload)`; server bumps a version on file change (polled ~0.6s) → client reloads. The render-mode driver neuters this EventSource so it doesn't reload mid-render.

## Update Data (Transfermarkt squad refresh)
`update-data.js` (UI) + `dev_server_update_data.py` → legacy `.Storage/Legacy/Legacy - Scripts/generate_squads_from_transfermarkt.py`. Auth via `.Storage/update-data-cookie.json`. Writes squad JSON under `.Storage/Squad Formation/Teams|Nationalities/…`.
- **Weekly freshness:** `.Storage/shared/update-data-freshness.js` (`UPDATE_DATA_FRESH_DAYS = 7`); only stale teams refresh; history in `.Storage/update-data-history.json`.
- **Per-team timeout:** `FC_UPDATE_DATA_TEAM_TIMEOUT` (default 240s) — recover a stuck run by restarting the server + fresh cookie.
- curl spawns use `CREATE_NO_WINDOW` (stops ~100 console windows flashing).

## YouTube upload
`dev_server_youtube.py` + `.Storage/youtube/` (OAuth `client_secret*.json`, `token_en*/es*`, `playlists.json`). Uploads resumable, set `private` + `publishAt` for scheduled publish; auto-find/create playlist. Per-video thumbnail via `/__youtube-thumbnail` (🖼 button on calendar pills), stored in `.Storage/youtube/thumbnails/`. `authorize_youtube.py` mints tokens.

## Mac uploader (site-on-PC, record-on-Mac)
`999_Mac_Uploader/mac_youtube_uploader.py` on localhost:**9876** (config `uploader-config.json`). Reuses the YouTube upload logic; calendar Upload + OBS record-dir auto-route to it when it's running. The whole repo can also just run on the Mac (OBS → `<repo>/Ready videos/<Lang>`).

## Gotchas
- **Stale server on a deterministic port**: an old long-running `run_site.py` on `8900+id*2+short` serves stale data ("saved empty / no teams list"). Kill the PID.
- **.bat must be CRLF** (the Write tool emits LF).
- After editing a `dev_server_*.py` module or curl/timeout/no-window behavior, **restart the runner's server** to apply.
