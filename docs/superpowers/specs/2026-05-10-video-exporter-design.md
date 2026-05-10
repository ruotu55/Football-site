# Video Exporter — Design Spec

**Date:** 2026-05-10
**Pilot scope:** `1_Guess The Football Team Name - Main Runner - Regular` only.
**Goal:** Replace real-time screen recording with a one-click, frame-perfect, high-quality `.mp4` export driven from the existing runner UI.

---

## 1. User flow

The control panel UI is unchanged: import teams, edit lineups, pick formation, voice, etc. exactly as today.

When the user clicks the existing **Play Video** button (in export mode):

1. Browser opens a native **"Save As"** dialog (via the File System Access API). User picks folder + filename.
2. A progress dialog appears in the runner page: *"Rendering frame N / M — X% — about Y minutes remaining."* Includes a **Cancel** button.
3. A background **render server** drives a hidden Chrome instance through the runner page frame by frame.
4. When rendering completes, ffmpeg combines frames + voice clips + music into a single `.mp4`, which is streamed back to the browser and written to the user-selected path.
5. The progress dialog shows "Done" and a "Show in Finder" button.

The visible runner tab remains usable during rendering.

### Resolution selection

A new **"Export Resolution"** dropdown is added in the control panel, directly below the existing `#btn-youtube-thumbnails` button in [controls.html:102-110](../../../1_Guess%20The%20Football%20Team%20Name%20-%20Main%20Runner%20-%20Regular/html/controls.html#L102-L110).

Options:

- **1080p60** (default — 1920 × 1080 @ 60 fps)
- **1440p60** (2560 × 1440 @ 60 fps)
- **2160p60** (3840 × 2160 @ 60 fps)

Selection is persisted in the same storage layer that backs the saved scripts. Selection applies per render — the user can switch between renders to compare output quality.

> **Quality caveat for 2160p:** Player photos in `Images/Players/Club images/` are 160–300 px source resolution. At 2160p they will be upscaled ~4× and look soft. Team logos, national logos, "Players No Background," text, and SVG content will all be crisp at any resolution. The toggle is provided so the user can experiment; 1080p is recommended until the small player photo library is upgraded.

---

## 2. Architecture

The render path lives **inside the existing `run_site.py`** server using the established `try_handle_get`/`try_handle_post` plugin pattern (the same pattern used by `runner-saved-server-sync` and `update-data`). No separate process. No Node. One language end-to-end (Python).

| Component | Role | New? |
|---|---|---|
| **`run_site.py` HTTP server** | Serves the runner page **and** dispatches export requests | Existing — adds one `try_handle_*` hook |
| **`.Storage/Scripts/dev_server_export_video.py`** | Backend module: HTTP layer + job state + render orchestration | **New** |
| **Hidden Chromium** (Playwright Python) | Loads the same runner page in "export mode," renders frame-by-frame | **New** — spawned per render by the backend module |
| **ffmpeg subprocess** | Encodes PNG frames + audio timeline → `.mp4` | **New** — spawned per render |

### Request flow

```
User clicks Play Video
   │
   ▼
Visible browser tab
   │  1. window.showSaveFilePicker() → user picks dest
   │  2. Serialize current app state (saved-script JSON form)
   │  3. POST /export-video/render { state, resolution, fps } to run_site.py
   ▼
run_site.py → dev_server_export_video.try_handle_post
   │  4. Spawn headless Chromium via Playwright (Python)
   │  5. Load http://localhost:<python_port>/index.html?exportMode=1
   │  6. Inject state via page.evaluate("window.__exportState__ = ...")
   │  7. Loop: for frame in 0..N → call window.__exportFrame__(t) → page.screenshot()
   │  8. Collect audio timeline emitted by the page during step 7
   │  9. Spawn ffmpeg: PNGs + voice MP3s + music → .mp4
   │ 10. Stream completed .mp4 back to the browser (chunked HTTP response)
   ▼
Visible browser tab
   │ 11. Write streamed bytes to the user-selected file handle
   │ 12. Show "Done" + "Show in Finder"
```

Progress polling endpoint `GET /export-video/progress/<job_id>` returns `{ frame, totalFrames, phase }` for the in-page progress dialog (poll every 500 ms — same pattern as Update Data).

The hidden Chromium runs the **exact same code** as the visible tab — same `index.html`, same JS files. There is no second copy of the runner. The runner gains an "export mode" that disables real-time playback and exposes a frame-stepping API.

---

## 3. Output specifications

| Setting | Value |
|---|---|
| Container | `.mp4` |
| Video codec | H.264, high profile, CRF 16 (visually lossless) |
| Pixel format | `yuv420p` (YouTube-safe) |
| Frame rate | 60 fps |
| Resolution | 1920×1080 / 2560×1440 / 3840×2160 (user-selected) |
| Audio codec | AAC-LC, 320 kbps, 48 kHz stereo |
| Audio source | Original voice/music MP3 files mixed by ffmpeg from a per-render timeline (not tab capture) |
| Color | sRGB / bt709 |

Hardware acceleration via Apple **VideoToolbox** on Apple Silicon Macs for encode.

Expected file size: ~300–500 MB for a 2-minute 1080p60 video; ~1 GB+ at 2160p60.

Expected render time on a strong M-series Mac: roughly **2–4× the video's real length** at 1080p60; ~4× longer at 2160p60.

---

## 4. Required code changes

### Existing runner — "export mode" instrumentation

Approximately 13 files in `1_Guess The Football Team Name - Main Runner - Regular/js/` reference real-time timers, animation frames, or random numbers. They need a small adaptation so they can be driven from a deterministic frame clock when `window.__exportMode__` is true.

The affected categories:

- **Timing primitives** — `setTimeout`, `requestAnimationFrame`, `await delay(...)`, GSAP `to/from/timeline` calls that rely on wall-clock time.
- **Randomness** — `Math.random()` calls (emoji backgrounds, question mark backgrounds, shuffled order).
- **Audio playback** — `new Audio(...).play()` and `audio.js` cue triggers must emit timeline entries instead of (or in addition to) playing audio when in export mode.

Approach:

1. Introduce `js/export-mode.js` with:
   - `isExportMode()` — returns true when `?exportMode=1` is in the URL
   - `now()` — returns either wall-clock ms or the export-mode frame time (set by the renderer)
   - `delay(ms)` — wraps `setTimeout` so in export mode it advances the frame clock instead
   - `seededRandom()` — replaces `Math.random` in export mode
   - `playAudio(file, opts)` — in export mode records `{ file, startMs, endMs, volume }` to a timeline buffer; in normal mode plays normally
2. Replace direct uses of `setTimeout` / `Math.random` / `new Audio()` in the 13 affected files with the wrapper calls above. Behavior in non-export mode is byte-identical.
3. Expose `window.__exportFrame__(frameNumber, fps)` — synchronously renders the page state at that exact frame number, returning a promise that resolves when all images/fonts are loaded.

### Control panel UI

- Add `#export-resolution` `<select>` element below `#btn-youtube-thumbnails` in [controls.html](../../../1_Guess%20The%20Football%20Team%20Name%20-%20Main%20Runner%20-%20Regular/html/controls.html). Options: 1080p / 1440p / 2160p.
- Wire to state in `js/state.js` and `js/dom-bindings.js`.
- Persist via existing saved-script storage.

### Play Video button

In `js/video.js`, the Play Video click handler gets a branch: if `exportMode` is configured for this run, call the export flow (`showSaveFilePicker` → POST `/export-video/render` → stream response → write to disk). Otherwise, current preview-mode behavior is kept for now.

For the pilot we will make Play Video **always export** (per the user's explicit request), with no preview mode. Preview mode can be re-added later if needed.

### New files

| File | Purpose |
|---|---|
| `.Storage/Scripts/dev_server_export_video.py` | Backend module. Exposes `try_handle_get` / `try_handle_post`; owns Playwright session, ffmpeg subprocess, job state, progress, cancel. |
| `.Storage/Scripts/tests/test_export_video.py` | Python unittest suite for the backend module. |
| `.Storage/Scripts/tests/test_export_video_e2e.py` | Python integration test using Playwright against a real saved script. |
| `1_Guess.../js/export-mode.js` | Runner-side export-mode helpers (`isExportMode`, `now`, `delay`, `seededRandom`, `playAudio`). |
| `1_Guess.../js/export-client.js` | Browser-side client: `showSaveFilePicker` → POST → poll progress → stream response → write to disk. |

### `run_site.py` change

Add the loader + dispatch for `dev_server_export_video` (mirroring the existing pattern around `_runner_update_mod`) inside `do_GET` / `do_POST`. No new subprocess on startup. The Playwright dependency is installed via the runner's existing `requirements.txt` (added in the plan).

---

## 5. Risks and open questions

### Risks

1. **Determinism completeness.** Some animation may depend on a real-time event we don't expect (e.g., a `transitionend` event nested inside a Promise chain). If found, fix is targeted — wrap the event with the frame clock — but adds debugging time. **Mitigation:** integration test that renders the same script twice and byte-compares output.
2. **Asset loading.** Player photos and team logos must fully decode before each `page.screenshot()`. Mitigation: `await page.waitForLoadState('networkidle')` + check `document.fonts.ready` + verify all `<img>` elements have `naturalWidth > 0` before capture.
3. **Voice file paths.** The Python server already serves voice files from `.Storage/Voices/...`. The ffmpeg step uses the **filesystem path** to those MP3s, not the URL. Trivially resolved since the backend module already has filesystem access to `PROJECT_ROOT`.
4. **First-run setup.** On a fresh machine, Playwright must download Chromium (~150 MB). One-time. `run_site.py` will verify the browser is installed on startup and run `playwright install chromium` automatically the first time.
5. **`showSaveFilePicker` browser support.** Requires Chrome/Edge. The user is on Mac and uses Chrome — confirmed via the existing `getDisplayMedia` code in `recorder.js` which has the same requirement.

### Out of scope for the pilot

- Other 14 runners (Shorts, runners #2–#8). Pattern is portable but each gets its own pass once the pilot proves out.
- Preview mode (real-time playback in tab). Removed temporarily per user request; can be re-added as a separate "Preview / Export" toggle later.
- Render queue / batch export. Single render at a time for now.
- 4K-grade source images for player photos. Separate project, blocks practical 2160p quality.

---

## 6. Success criteria

The pilot is "done" when:

1. User opens `run_site` exactly as today.
2. User loads any saved script in `lineups_regular.json`.
3. User picks an export resolution from the new dropdown.
4. User clicks **Play Video** → picks a save location → walks away.
5. A clean `.mp4` matching the section 3 specs lands at the chosen path.
6. Rendering the same script twice produces a byte-identical file.
7. Player photos, team logos, voice clips, music, and animations all appear correctly synced.
8. No regressions to the existing editing UI.
