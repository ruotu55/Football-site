# Render Video — Frame-by-Frame Renderer Design

**Date:** 2026-05-27
**Scope:** `1_Guess The Football Team Name - Main Runner - Regular` ONLY. No sibling runners touched.

## Goal

Add a **Render Video** button (between **PROD** and **Record Video**) that produces an
MP4 that is visually identical to what the user sees when they press **Play Video** /
**Record Video** — same animations, transitions, background effects, photos, audio, and
timing — but built deterministically **frame by frame** instead of by screen-recording a
live browser via OBS. This removes the lag/glitch/zoom/PC-dependency problems of OBS
screen capture.

- **Reference look:** the app open in Google Chrome at **125% page zoom**.
- **Output:** `2560×1440 @ 60fps`, H.264 MP4, full soundtrack.
- **Languages:** current selected language only (one file per click).
- **Output path:** `Ready videos/<language>/<savedScriptName>.mp4` (mirrors Record Video).

## Guiding principle

The "perfect" look already exists in the running app, produced by its existing engine
(GSAP transitions + CSS transitions + `setTimeout`/`setInterval`-driven question flow +
HTML5 audio). Re-implementing that engine (e.g. in Remotion, as the separate Quiz Channel
project does) could never be byte-for-byte identical. Therefore we **run the real app,
unchanged, in a headless Chrome under a controlled virtual clock, and capture each frame**.
Same code + same assets + same layout ⇒ same pixels. Audio (which headless Chrome does not
output) is reconstructed separately from a manifest recorded during the render.

## Rejected alternatives

- **Re-implement in Remotion / React** — different renderer, cannot be identical. Rejected.
- **Refactor all app timing onto an injectable clock and convert every CSS transition to JS** —
  too invasive; rewriting the animations risks changing the very look we must preserve. Rejected
  except as a narrow fallback for specific CSS transitions (see Risks).
- **Real-time capture of headless playback (CDP screencast / MediaRecorder)** — not
  frame-deterministic; reintroduces the dropped-frame/lag problems we are escaping. Rejected.

---

## Architecture overview

Five components, all inside this runner folder:

1. **In-app render mode** (`js/render-mode.js` + small taps in `js/audio.js`, `js/app.js`) —
   activated by URL flag; makes the existing flow deterministic and records an audio manifest.
2. **Node render driver** (`render/` subfolder) — headless Chrome + CDP virtual clock + frame
   capture, piping frames to ffmpeg.
3. **Audio reconstruction + mux** (part of the Node driver) — rebuilds the soundtrack from the
   manifest with ffmpeg and muxes it onto the video.
4. **Server endpoints** (`run_site.py`) — `POST /__render-video` spawns the driver; SSE progress.
5. **UI** (`index.html`, `js/dom-bindings.js`, `js/state.js`, `js/app.js`, CSS) — the button +
   a progress modal.

```
[Render Video btn] --POST--> run_site.py /__render-video
                                   |
                                   v  (subprocess)
                         render/index.mjs  (Node driver)
                                   |
              launches headless Chrome -> http://127.0.0.1:8888/<runner>/index.html?render=1&lang=..&script=..
                                   |
        CDP Emulation.setVirtualTimePolicy(pause) + advance 16.667ms/frame
                                   |
            per frame: render -> capture PNG -> pipe to ffmpeg (H.264, silent)
                                   |
        on window.__renderDone: read window.__audioManifest
                                   |
            ffmpeg: rebuild voices+BGM+ticking with exact timings/volumes -> mux onto video
                                   |
                  Ready videos/<lang>/<script>.mp4   (+ SSE progress back to UI)
```

---

## Component 1 — In-app render mode

**New file: `js/render-mode.js`** (loaded from `index.html`, after the other app modules).

Activated when `?render=1` is present in the URL. Responsibilities:

### 1a. Mode detection & setup
- Parse `?render=1&lang=<english|spanish>&script=<name>&w=2560&h=1440&fps=60&zoom=1.25`.
- Expose `window.__render = { active, config }`.
- Set the active language (`setCurrentLanguage`) and **load the named saved script** the same
  way the UI does, so the level data, transition effect, voices, photos are exactly the loaded
  setting. (Reuse existing saved-scripts load path.)
- Enable video mode on all levels (same as Play/Record: `lvl.videoMode = true`,
  `videoModeToggle` checked) — see `app.js:1395-1410`.
- Skip OBS and fullscreen entirely (those are Record-only paths in
  `recording-flow.js` / `obs-recorder.js`).

### 1b. Determinism
- **Seed `Math.random`** with a fixed seed (from `script` name hash) before any flow starts, so:
  - random ending-type pick (`app.js:565`),
  - random transition-effect pick (`transitions.js:848`),
  - GSAP `from:"random"` staggers (Pixel Pop, Diamond Burst, Checker Flash — they call
    `Math.random` internally),
  - BGM track pick + Fisher-Yates shuffle (`audio.js:253,640,679`),
  - random phrase-variant pick (`bundled-level-voices.js:222`),
  - emoji jitter (`emojis.js`), header hatch (`team-header-hatch.js`)
  all become reproducible. (Also seed/override `crypto.getRandomValues` if used.)
- `Date.now` / `performance.now` / `requestAnimationFrame` come from the **virtual clock**
  supplied by CDP virtual time (Component 2) — no JS override needed for these.
- Before frame 0: `await document.fonts.ready` and reuse the existing **preflight warm-up**
  (`recording-preflight.js runPreflight`) so every image/logo/photo/voice file is loaded and
  every random pick is frozen *before* capture begins. (Preflight already freezes reveal
  phrases and warms assets; we call it without the OBS pieces.)

### 1c. Audio: virtual playback + manifest
Headless Chrome won't reliably fire HTML5 `ended` events or output sound, and two flow steps
gate on audio completion:
- `playRules(...).then(...)` — landing → level 2 (`video.js`).
- `playCommentBelow().then(...)` — outro → stop + `recording-naturally-finished` (`levels.js:212-223`).

In render mode we replace the real audio layer (only when `window.__render.active`) with a
**virtual audio** shim that:
- Resolves each play-promise after the clip's **known duration** (probed once via
  `decodeAudioData` for `.duration`, or supplied by the server via `ffprobe`), advanced on the
  virtual clock via `setTimeout` — so the *visual* flow timing matches real playback exactly.
- Records every audio action to `window.__audioManifest`, an ordered list of events:
  - `play`  → `{ id, kind: "voice"|"bgm"|"ticking"|"stinger", src, startMs, mediaOffsetSec, volume }`
  - `volume` → `{ id, atMs, volume }`  (captures BGM crossfades + voice ducking ramps)
  - `stop` → `{ id, atMs }`
  `startMs`/`atMs` are virtual-clock timestamps.

**Implementation taps (only fire when render mode active; live behaviour unchanged):**
- `audio.js` play functions: `playVoice` (304), `playTicking` (422), `playRules` (446),
  `playTeamNameVoiceIfExists` (793), `playTheAnswerIs` (804), `playCommentBelow` (826),
  `playEndingVoice` (834), `playProgressVoice` (856).
- `audio.js` volume automation lines to log: BGM crossfade & duck ramps at
  `149,152,191,227,229,236,238,256,292`, reveal stinger `816`.
- Cleanest approach: route these through a thin `__audioTap(event)` helper guarded by
  `window.__render?.active`, so the manifest is a faithful replay of what the live code did
  (we do **not** re-derive the mixing logic — we record the observed automation).

### 1d. Start / finish signalling
- `window.__render.start()` kicks off the same `startVideoFlow()` the buttons use, from the
  landing page (level 1), exactly like `runRecordingPhase` (`app.js:1311-1382`) minus OBS.
- The existing `recording-naturally-finished` event (`levels.js:218-221`) marks the end. The
  render-mode handler sets `window.__renderDone = true` and stamps `window.__renderEndMs`
  (virtual time), plus the audio manifest's last event end, so the driver knows the true tail.

---

## Component 2 — Node render driver (`render/`)

**New files:**
- `render/package.json` — deps: `puppeteer` (bundles Chromium). ffmpeg/ffprobe are on PATH (v8.1.1 confirmed).
- `render/index.mjs` — CLI entry: `node index.mjs --script "<name>" --lang english --out "<path>" --port 8888`.
- `render/frame-capture.mjs` — Chrome launch + virtual-clock frame loop.
- `render/audio-mux.mjs` — ffmpeg audio reconstruction + mux (Component 3).

### 2a. Browser launch & viewport (the 125%-zoom reproduction)
- Launch Chromium with flags: `--headless=new --enable-begin-frame-control --hide-scrollbars
  --force-color-profile=srgb --disable-gpu-vsync --force-device-scale-factor=1` (+ font hinting flags
  for deterministic text).
- Viewport via CDP `Emulation.setDeviceMetricsOverride`:
  `width=2048, height=1152, deviceScaleFactor=1.25` ⇒ rendered frames are **2560×1440**.
  This is the page at 125% zoom filling a 1440p frame.
- Navigate to
  `http://127.0.0.1:8888/1_Guess%20The%20Football%20Team%20Name%20-%20Main%20Runner%20-%20Regular/index.html?render=1&lang=<lang>&script=<name>&w=2560&h=1440&fps=60&zoom=1.25`.
- Wait for `window.__render.ready` (assets warmed, fonts ready).

### 2b. Deterministic capture loop
- `Emulation.setVirtualTimePolicy({ policy: "pause" })`.
- Call `window.__render.start()`.
- Loop, frame index `n = 0,1,2,…`:
  1. `Emulation.setVirtualTimePolicy({ policy: "advance", budget: 1000/60, ... })` (advance one frame).
  2. await `Emulation.virtualTimeBudgetExpired`.
  3. `HeadlessExperimental.beginFrame({ frameTimeTicks, screenshot:{ format:"png" } })` —
     deterministically composites + screenshots that exact frame.
  4. Pipe the PNG into ffmpeg stdin (image2pipe → libx264).
- **Stop condition:** `window.__renderDone === true` AND virtual time ≥ audio-manifest tail.
  Pad trailing frames if audio outlasts the last visual frame.
- Progress: emit `{ frame, estTotalFrames, pct }` to stdout (consumed by `run_site.py` → SSE).

### 2c. Video encode
- ffmpeg: `image2pipe` input @ 60fps → `libx264 -preset slow -crf 16 -pix_fmt yuv420p
  -profile:v high -r 60 -s 2560x1440` → intermediate silent `video.mp4` (or pipe straight
  into the final mux). High quality, near-lossless for YouTube.

---

## Component 3 — Audio reconstruction + mux (`render/audio-mux.mjs`)

Input: `window.__audioManifest` (read from the page before browser close).

- For each `play` event, build an ffmpeg input: the source file, trimmed from `mediaOffsetSec`,
  delayed to `startMs` (`adelay`), with a **volume-automation envelope** built from that clip's
  `volume` events (piecewise via `volume=eval=frame` expression or successive `afade`/`volume`
  enable windows). This reproduces ducking (voice 1.0→0.2) and BGM crossfades (the
  `outgoing*(1-t)` / `incoming*t` ramps at `audio.js:227-238`) exactly, because we replay the
  observed automation rather than re-deriving it.
- `amix`/`amerge` all tracks → 48kHz stereo AAC.
- Mux onto the silent video: `ffmpeg -i video.mp4 -i audio.m4a -c:v copy -c:a aac -b:a 256k
  -shortest? no — pad to max(video,audio)` → final MP4.
- Write to `Ready videos/<language>/<savedScriptName>.mp4` (create dirs if missing).

---

## Component 4 — Server endpoints (`run_site.py`)

`run_site.py` already imports `subprocess` (line 22) and serves SSE (`text/event-stream`,
line 2913), with `do_GET` (2947) / `do_POST` (2983) dispatchers.

- **`POST /__render-video`** — body `{ script, language }`. Validates the saved script exists,
  resolves the output path, spawns `node render/index.mjs …` as a subprocess, returns a
  `jobId`. Streams the driver's stdout progress lines.
- **`GET /__render-video/progress?job=<id>`** (SSE) — forwards `{pct, frame, stage}` events to the
  UI; final event `{stage:"done", path}` or `{stage:"error", message}`.
- Node + ffmpeg/ffprobe assumed on PATH; endpoint returns a clear error if `node`/`ffmpeg`
  missing.

---

## Component 5 — UI

- **`index.html`** — insert between line 38 (`prod-btn`) and line 39 (`record-video-btn`):
  `<button type="button" class="panel-fab render-video-btn" id="render-video-btn">Render Video</button>`
  Final order: PROD · Render Video · Record Video · Play Video.
- **`js/dom-bindings.js`** — `els.renderVideoBtn = document.getElementById("render-video-btn");`
- **`js/state.js`** — add `renderVideoBtn: null` and a `rendering` flag.
- **`js/app.js`** — new handler near the Record handler (≈1417-1461):
  - Same guards as Record: if `isProdMode()` run `runProdValidation()`; require a loaded saved
    script name (`getActiveScriptName()`).
  - `POST /__render-video` with `{ script, language: getCurrentLanguage() }`.
  - Open a progress modal; subscribe to the SSE progress; on done show the output path with an
    "Open folder" affordance; on error show the message.
  - The button does **not** itself drive the in-page flow — the headless driver does. The
    on-screen app stays usable.
- **CSS** — reuse `panel-fab` styling; add progress-modal styles (reuse preflight modal look).

---

## Phasing (implementation order)

- **Phase 0 — Determinism spike (DE-RISK FIRST).** Minimal Node driver + a temporary
  `?render=1` that just plays the flow. Verify under CDP virtual time that **GSAP transitions
  AND the CSS-transition effects advance correctly frame-by-frame**: slot-flip (`.slot-inner`
  0.78s), team-header slide, countdown ring (`stroke-dashoffset` 1s linear), pitch-height
  transition, logo shift. Capture ~5s, eyeball against the live app at 125%. **Gate:** if any
  CSS transition does not advance under virtual time, fall back to converting *only those few*
  to WAAPI/GSAP (clock-driven) — scope limited to the listed effects.
- **Phase 1 — Silent video, full length.** Render-mode setup + seeded RNG + preflight warm-up +
  full capture loop + ffmpeg encode. Produces a correct silent 2560×1440/60 MP4.
- **Phase 2 — Audio manifest + reconstruction + mux.** Audio taps, manifest, ffmpeg audio build,
  mux. Produces the final MP4 with exact soundtrack.
- **Phase 3 — UI + server wiring.** Button, endpoint, SSE progress modal, output naming.
- **Phase 4 — Validation harness.** Render a few frames; compare against the live app at 125%
  zoom at matching timestamps; iterate to indistinguishable.

---

## Risks & mitigations

- **CSS transitions under virtual time** — primary risk; de-risked by Phase 0 spike with a
  narrow, well-defined fallback (convert only the 5 listed effects).
- **`HeadlessExperimental.beginFrame`** is an experimental CDP domain — if unreliable, fall back
  to `Emulation.setVirtualTimePolicy` + `Page.captureScreenshot` per frame (slower but stable).
- **Audio durations in headless** — probed via `decodeAudioData`/`ffprobe`; flow waits use these
  durations, not real `ended` events.
- **Overlapping voices / ducking edge cases** — handled by replaying observed volume automation
  rather than re-deriving the mixing logic.
- **Render speed** — frame-by-frame at 1440p/60 is slower than realtime; acceptable (offline,
  background subprocess, progress bar). `-preset` can be tuned.
- **Scope discipline** — all new files live inside this runner folder; no sibling runner edits.

## Out of scope (for now)

- EN+ES double render (current language only per click).
- YouTube upload of the rendered file (existing upload flow untouched).
- Applying this to sibling runners (mirror later once proven here).
