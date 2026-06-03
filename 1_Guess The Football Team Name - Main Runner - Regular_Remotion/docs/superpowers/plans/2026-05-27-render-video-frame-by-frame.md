# Render Video — Frame-by-Frame Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Render Video** button to the Regular runner that produces a 2560×1440/60fps MP4 visually identical to Play/Record Video, built deterministically frame-by-frame in headless Chrome (no OBS screen capture), with the full reconstructed soundtrack.

**Architecture:** Run the *existing* app unchanged in headless Chrome under a CDP virtual clock; capture one frame per 1/60s via `HeadlessExperimental.beginFrame`; pipe frames to ffmpeg for H.264. Headless Chrome outputs no sound, so the app records an audio manifest (every play/volume/stop event at virtual timestamps) which ffmpeg replays to rebuild the exact soundtrack and mux it on. A new render mode (URL `?render=1`) makes the flow deterministic (seeded RNG, duration-based audio waits) and is inert during normal use.

**Tech Stack:** Vanilla-JS app + Python `http.server` (`run_site.py`, port 8888) + new Node driver (`puppeteer`) + ffmpeg/ffprobe 8.1.1 (on PATH).

**Scope:** `1_Guess The Football Team Name - Main Runner - Regular` ONLY. No sibling runners.

**Spec:** `docs/superpowers/specs/2026-05-27-render-video-frame-by-frame-design.md`

---

## File structure

**New files (all inside the runner folder):**
- `render/package.json` — Node project, dep: `puppeteer`.
- `render/index.mjs` — CLI entry; parses args, orchestrates capture → encode → audio → mux, prints JSON progress.
- `render/frame-capture.mjs` — Chrome launch, viewport, virtual-clock frame loop, ffmpeg video pipe.
- `render/audio-mux.mjs` — pure manifest→ffmpeg-filtergraph builder + mux runner.
- `render/audio-filtergraph.mjs` — pure function: manifest → ffmpeg `-filter_complex` string + input list (unit-tested).
- `render/test/audio-filtergraph.test.mjs` — Node `node:test` unit tests for the filtergraph builder.
- `js/render-mode.js` — in-app render-mode controller (detect flag, load script, seed RNG, audio manifest, ready/done signals).

**Modified files:**
- `index.html` — add Render Video button; load `render-mode.js`.
- `js/dom-bindings.js` — bind `els.renderVideoBtn`.
- `js/state.js` — add `renderVideoBtn` + `rendering` fields.
- `js/app.js` — Render Video click handler + render-mode bootstrap on `?render=1`.
- `js/audio.js` — guarded manifest taps in play/volume/stop paths.
- `js/saved-scripts.js` — export `loadScriptByName(name)`.
- `run_site.py` — `POST /__render-video` (spawn driver) + `GET /__render-video/progress` (SSE).
- `css/components/` — render-button + progress-modal styles (new small file, linked from styles.css).

---

## IMPLEMENTATION NOTES (live — 2026-05-27)

Findings from building Phase 0/1 against the real app (script "Champion League", 35 questions ≈ 708s/42,480 frames @ 60fps):

- **`HeadlessExperimental.beginFrame` is REMOVED** in current Chromium (Chrome 131 via puppeteer 23). Capture uses the fallback: `Emulation.setVirtualTimePolicy({policy:"advance",budget:16.667})` → await `Emulation.virtualTimeBudgetExpired` → `Page.captureScreenshot`. Verified: virtual time advances **both** rAF/GSAP and CSS transitions; steady-state frames are byte-identical run-to-run (startup ~0.5s has minor jitter, cosmetically irrelevant for a single render).
- **Dev-server live-reload reloads the headless page** (the file-watcher fires on any change, and its EventSource heartbeat misbehaves under virtual time → `location.reload()` → "Execution context was destroyed"). FIX: in the driver, `evaluateOnNewDocument` neuters only the `__live-reload` EventSource. ALSO: **never write render artifacts inside the runner folder** (the watcher would reload the user's real browser tab too). Temp frames/intermediates go to OS temp; final output to `Ready videos/` (repo root, not watched).
- **Seed `Math.random` BEFORE any app code** via `evaluateOnNewDocument` (not just in render-mode init) — otherwise early init renders (emoji/hatch) use unseeded random. render-mode skips re-seeding when `window.__RENDER_SEEDED__` is set.
- **Audio doesn't play in muted headless**, so `playVoice`'s `ended` never fires and the flow stalls. FIX (in `audio.js`, render-mode-guarded): resolve the voice promise on the clip's measured duration via the virtual clock. Within ONE pass the manifest timestamps (virtual time) align with frames, so run-to-run determinism is NOT required for audio sync.
- **Capture speed (2560×1440):** PNG 2.8 fps (254 min) · **JPEG q100 11.4 fps (62 min)** · JPEG q92 13.2 fps (53 min). Using JPEG q100 (near-lossless, re-encoded to H.264 CRF 16 anyway). Parallel-segment rendering (render level ranges in N browsers, concat) is the path to ~10–15 min.
- **BGM** is a continuous playlist crossfaded on real `timeupdate`/`ended` — these don't fire headless, so exact BGM reconstruction is the hardest remaining audio piece (Phase 2).

## PHASE 0 — Determinism spike (de-risk before building anything else)

Goal: prove that under CDP virtual time, the **GSAP transitions AND the CSS-transition effects** advance frame-by-frame and are bit-reproducible across two runs. If a CSS transition does not advance, the fallback (convert only those few effects to clock-driven WAAPI/GSAP) is scoped here.

### Task 0.1: Create the Node render project

**Files:**
- Create: `render/package.json`

- [ ] **Step 1: Create `render/package.json`**

```json
{
  "name": "runner-render",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "puppeteer": "^23.0.0"
  }
}
```

- [ ] **Step 2: Install puppeteer (downloads its own Chromium)**

Run (from the runner folder):
```bash
cd render && npm install
```
Expected: `node_modules/` created; puppeteer downloads a Chromium build. If the download is blocked, set `PUPPETEER_SKIP_DOWNLOAD=1` and instead use the Chromium that ships with the repo's other tools — but default is the bundled download.

- [ ] **Step 3: Verify Chromium launches**

Run:
```bash
cd render && node -e "import('puppeteer').then(async p=>{const b=await p.default.launch({headless:'new'});console.log('chromium ok', await b.version());await b.close();})"
```
Expected: prints `chromium ok HeadlessChrome/<version>`.

- [ ] **Step 4: Commit**

```bash
git add "render/package.json" "render/package-lock.json"
git commit -m "feat(render): scaffold Node render project with puppeteer"
```
(Do NOT commit `render/node_modules/`; add it to `.gitignore` in Step of Task 0.2.)

### Task 0.2: Add a minimal render-mode bootstrap to the app

**Files:**
- Create: `js/render-mode.js`
- Modify: `index.html` (load the module), `.gitignore` (ignore render artifacts)

- [ ] **Step 1: Create minimal `js/render-mode.js`**

```javascript
// js/render-mode.js — controls deterministic "render mode" (URL ?render=1).
// Inert unless ?render=1 is present. Phase 0 = minimal: seed RNG + start flow + signal ready/done.

import { startVideoFlow } from "./video.js";
import { setCurrentLanguage } from "./voice-tab.js";

function parseConfig() {
  const q = new URLSearchParams(location.search);
  if (q.get("render") !== "1") return null;
  return {
    active: true,
    lang: (q.get("lang") || "english").toLowerCase(),
    script: q.get("script") || "",
    fps: Number(q.get("fps") || 60),
    seed: q.get("seed") || (q.get("script") || "seed"),
  };
}

// Deterministic PRNG (mulberry32) seeded from a string.
function makeSeededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initRenderModeIfRequested() {
  const cfg = parseConfig();
  if (!cfg) return null;

  // Seed Math.random so GSAP "from:random" staggers, BGM/track picks, ending/phrase
  // picks, emoji jitter, and hatch patterns are all reproducible run-to-run.
  Math.random = makeSeededRandom(cfg.seed);

  if (cfg.lang) setCurrentLanguage(cfg.lang);

  window.__render = {
    active: true,
    config: cfg,
    ready: false,
    done: false,
    start() { startVideoFlow(); },
  };

  // Phase 0: mark ready as soon as the module initializes (full asset warm-up added in Phase 1).
  window.__render.ready = true;
  return window.__render;
}
```

- [ ] **Step 2: Load `render-mode.js` from the app entry**

In `index.html`, the app is bootstrapped by a dynamically-created module `<script>` near line 140. Add an import of render-mode into the app's main module. Concretely, in `js/app.js` near the top imports add:

```javascript
import { initRenderModeIfRequested } from "./render-mode.js";
```

and in `app.js` after the app finishes wiring DOM/handlers (end of the main init, after the button handlers around line 1461), add:

```javascript
// Render mode: when launched headless with ?render=1, drive the flow deterministically.
initRenderModeIfRequested();
```

(The headless driver calls `window.__render.start()` itself once `window.__render.ready` is true — see Task 0.3 — so init must NOT auto-start.)

- [ ] **Step 3: Add `.gitignore` entries for render artifacts**

Append to the runner folder `.gitignore`:
```
render/node_modules/
render/out/
render/frames-tmp/
```

- [ ] **Step 4: Manually verify inert in normal use**

Run the dev server (`run_site.py`) and open the app normally (no `?render=1`). Confirm Play Video / Record Video behave exactly as before and `window.__render` is `undefined`.
Then open with `?render=1&script=<any>` and confirm `window.__render.ready === true` in the console and the page did NOT auto-start the flow.

- [ ] **Step 5: Commit**

```bash
git add js/render-mode.js js/app.js index.html .gitignore
git commit -m "feat(render): minimal render-mode bootstrap behind ?render=1 (Phase 0)"
```

### Task 0.3: Minimal headless capture spike

**Files:**
- Create: `render/spike.mjs`

- [ ] **Step 1: Write `render/spike.mjs`**

```javascript
// render/spike.mjs — Phase 0 determinism spike.
// Launches headless Chrome, drives the app under a virtual clock, captures N frames as PNG.
// Usage: node spike.mjs --script "<name>" --lang english --frames 300 --out ./frames-tmp
import puppeteer from "puppeteer";
import { mkdir, writeFile } from "node:fs/promises";
import { argv } from "node:process";

function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

const SCRIPT = arg("script", "");
const LANG = arg("lang", "english");
const FRAMES = Number(arg("frames", 300));
const OUT = arg("out", "./frames-tmp");
const PORT = Number(arg("port", 8888));
const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";
const FRAME_MS = 1000 / 60;

const url =
  `http://127.0.0.1:${PORT}/${encodeURIComponent(RUNNER)}/index.html` +
  `?render=1&lang=${LANG}&script=${encodeURIComponent(SCRIPT)}&fps=60`;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--enable-begin-frame-control",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-gpu-vsync",
    "--run-all-compositor-stages-before-draw",
    "--disable-new-content-rendering-timeout",
    "--disable-threaded-animation",
    "--disable-threaded-scrolling",
    "--disable-checker-imaging",
  ],
});
const page = await browser.target().createCDPSession();
const tab = (await browser.pages())[0];
const client = await tab.createCDPSession();

await client.send("Emulation.setDeviceMetricsOverride", {
  width: 2048, height: 1152, deviceScaleFactor: 1.25, mobile: false, screenWidth: 2048, screenHeight: 1152,
});

await tab.goto(url, { waitUntil: "load" });
await tab.waitForFunction("window.__render && window.__render.ready === true", { timeout: 60000 });

// Pause virtual time, then start the flow.
await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
await tab.evaluate(() => window.__render.start());

let frameTimeTicks = 0;
for (let n = 0; n < FRAMES; n++) {
  const budget = client.send("Emulation.setVirtualTimePolicy", {
    policy: "advance", budget: FRAME_MS, maxVirtualTimeTaskStarvationCount: 100000,
  });
  await new Promise((resolve) => {
    client.once("Emulation.virtualTimeBudgetExpired", resolve);
    budget.catch(() => {});
  });
  frameTimeTicks += FRAME_MS;
  const { screenshotData } = await client.send("HeadlessExperimental.beginFrame", {
    frameTimeTicks, screenshot: { format: "png" },
  });
  if (screenshotData) {
    await writeFile(`${OUT}/frame_${String(n).padStart(5, "0")}.png`, Buffer.from(screenshotData, "base64"));
  }
}
await browser.close();
console.log(`captured ${FRAMES} frames to ${OUT}`);
```

- [ ] **Step 2: Run the spike against a real loaded script**

Pre-req: dev server running; pick an existing saved script name (e.g. open the app, note a name from the saved list). Render-mode in Phase 0 does not yet load the script by name, so for THIS spike, manually load the script in a normal tab, then in the spike rely on default level data — OR temporarily hardcode loading. Simplest: run the spike just to confirm capture mechanics + transitions animate. Run:
```bash
cd render && node spike.mjs --script "Test" --frames 120 --out ./frames-tmp
```
Expected: `captured 120 frames`; `frames-tmp/` has 120 PNGs at 2560×1440.

- [ ] **Step 3: Verify a transition + a CSS effect actually progress**

Open `frame_00000.png` … `frame_00119.png`. Confirm: (a) a GSAP transition overlay visibly progresses across consecutive frames, and (b) at least one CSS-transition effect (e.g. the slot flip when a reveal happens, or the countdown ring) progresses smoothly rather than jumping.
Make a quick montage to eyeball:
```bash
cd render && ffmpeg -y -framerate 60 -i frames-tmp/frame_%05d.png -frames:v 120 -c:v libx264 -pix_fmt yuv420p _spike.mp4
```
Play `_spike.mp4`. **Gate:** transitions must look smooth/correct.

- [ ] **Step 4: Verify determinism (two identical runs)**

Run the spike twice into two dirs and compare hashes:
```bash
cd render && node spike.mjs --frames 120 --out ./f1 && node spike.mjs --frames 120 --out ./f2
diff <(cd f1 && sha1sum *.png) <(cd f2 && sha1sum *.png | sed 's#f2#f1#') && echo IDENTICAL || echo DIFFERS
```
Expected: `IDENTICAL`. If it differs, identify the non-deterministic source (unseeded random, time-based) and fix in `render-mode.js` before proceeding.

- [ ] **Step 5: Decision + note**

Record the outcome in the plan (edit this file): does `HeadlessExperimental.beginFrame` work and do CSS transitions advance under virtual time?
- If YES → proceed to Phase 1 as written.
- If CSS transitions DON'T advance → before Phase 1, add a sub-task to convert ONLY these effects to clock-driven WAAPI/GSAP: `.slot-inner` flip (`pitch-render.js`, 0.78s), team-header slide (`pitch-render.js`), countdown ring `stroke-dashoffset` (`video.js`, 1s linear), pitch-height transition, logo shift (`levels.js`). Keep the visual result pixel-equal to current CSS.
- If `beginFrame` is unreliable → switch capture in Phase 1 to `Page.captureScreenshot` per frame (still under virtual time).

- [ ] **Step 6: Commit the spike (kept as a diagnostic tool)**

```bash
git add render/spike.mjs docs/superpowers/plans/2026-05-27-render-video-frame-by-frame.md
git commit -m "feat(render): determinism spike + documented Phase 0 outcome"
```

---

## PHASE 1 — Silent full-length render

### Task 1.1: Export `loadScriptByName` from saved-scripts

**Files:**
- Modify: `js/saved-scripts.js` (uses in-memory `savedScripts` at line 77, `normalizeForImport` at 326, `applyScriptObject` at 170, server bucket `lineups_regular`)

- [ ] **Step 1: Add the exported loader**

Append to `js/saved-scripts.js`:
```javascript
/* Render mode: load a saved script purely by name in a fresh (headless) browser.
   localStorage starts empty headless, so pull the server bucket first, then apply. */
export async function loadScriptByName(name) {
  const target = normalizeForImport(String(name || ""));
  if (!target) throw new Error("loadScriptByName: empty name");

  // Ensure the in-memory list is populated from the server bucket.
  if (!Array.isArray(savedScripts) || savedScripts.length === 0) {
    try {
      const r = await fetch("/__runner-saved-scripts/lineups_regular", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.scripts)) savedScripts = data.scripts;
      }
    } catch (_) { /* offline */ }
  }
  let entry = savedScripts.find((s) => normalizeForImport(s.name) === target);
  if (!entry) {
    entry = savedScripts.find(
      (s) => normalizeForImport(s.name).includes(target) || target.includes(normalizeForImport(s.name)),
    );
  }
  if (!entry) throw new Error(`loadScriptByName: no saved script matching "${name}"`);
  await applyScriptObject(entry);
  return entry.name;
}
```

- [ ] **Step 2: Manual verify in a normal tab**

In the browser console (normal app, dev server): `const m = await import('./js/saved-scripts.js'); await m.loadScriptByName('<a real saved name>');` — confirm the level data switches to that script.

- [ ] **Step 3: Commit**

```bash
git add js/saved-scripts.js
git commit -m "feat(render): add loadScriptByName for headless script loading"
```

### Task 1.2: Full render-mode setup (load script, warm assets, ready/done)

**Files:**
- Modify: `js/render-mode.js`

- [ ] **Step 1: Expand `js/render-mode.js` to load script + warm assets + signal done**

Replace the body of `initRenderModeIfRequested` so it becomes async-aware:
```javascript
import { startVideoFlow } from "./video.js";
import { setCurrentLanguage } from "./voice-tab.js";
import { loadScriptByName } from "./saved-scripts.js";
import { runPreflight } from "./recording-preflight.js";

// (parseConfig + makeSeededRandom unchanged from Phase 0)

export function initRenderModeIfRequested() {
  const cfg = parseConfig();
  if (!cfg) return null;
  Math.random = makeSeededRandom(cfg.seed);
  if (cfg.lang) setCurrentLanguage(cfg.lang);

  window.__render = { active: true, config: cfg, ready: false, done: false, endMs: 0, _startFn: null };
  window.__render.start = () => { if (window.__render._startFn) window.__render._startFn(); };

  // Signal natural end of the video (same event Record Video waits for).
  document.addEventListener("recording-naturally-finished", () => {
    window.__render.endMs = performance.now();
    window.__render.done = true;
  }, { once: true });

  (async () => {
    try {
      if (cfg.script) await loadScriptByName(cfg.script);
      // Enable video mode on all levels (mirror Play/Record).
      const st = window.appState || null;
      if (st && Array.isArray(st.levelsData)) st.levelsData.forEach((lvl) => { lvl.videoMode = true; });
      const toggle = document.getElementById("video-mode-toggle");
      if (toggle && !toggle.checked) { toggle.checked = true; toggle.dispatchEvent(new Event("change")); }

      // Warm every image + voice and freeze random picks (reuse existing preflight).
      try { await runPreflight(cfg.lang); } catch (_) { /* non-fatal */ }
      if (document.fonts && document.fonts.ready) { await document.fonts.ready; }

      window.__render._startFn = () => startVideoFlow();
      window.__render.ready = true;
    } catch (err) {
      window.__render.error = String(err && err.message || err);
      window.__render.ready = true; // let the driver read the error
    }
  })();

  return window.__render;
}
```

Note: `appState` must be reachable. If `app.js` does not already expose it on `window`, add `window.appState = appState;` in `app.js` (guarded — only assign once). Verify whether it's already global before adding.

- [ ] **Step 2: Manual verify headless ready+done**

Run the spike (Task 0.3) but bump `--frames` high (e.g. 4000) and add at the end of `spike.mjs` a check that `window.__render.done` becomes true. Confirm the flow loads the named script, plays through, and `done` flips true. (Use a real saved name.)

- [ ] **Step 3: Commit**

```bash
git add js/render-mode.js js/app.js
git commit -m "feat(render): full render-mode setup (script load, asset warm, done signal)"
```

### Task 1.3: Frame-capture module → silent MP4

**Files:**
- Create: `render/frame-capture.mjs`

- [ ] **Step 1: Write `render/frame-capture.mjs`**

```javascript
// render/frame-capture.mjs — deterministic capture of the app -> silent H.264 MP4.
import puppeteer from "puppeteer";
import { spawn } from "node:child_process";

const FRAME_MS = 1000 / 60;
const RUNNER = "1_Guess The Football Team Name - Main Runner - Regular";

export async function captureSilentVideo({ script, lang, port = 8888, outPath, onProgress }) {
  const url =
    `http://127.0.0.1:${port}/${encodeURIComponent(RUNNER)}/index.html` +
    `?render=1&lang=${lang}&script=${encodeURIComponent(script)}&fps=60`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--enable-begin-frame-control", "--hide-scrollbars", "--force-color-profile=srgb",
      "--disable-gpu-vsync", "--run-all-compositor-stages-before-draw",
      "--disable-new-content-rendering-timeout", "--disable-threaded-animation",
      "--disable-threaded-scrolling", "--disable-checker-imaging", "--mute-audio",
    ],
  });
  try {
    const tab = (await browser.pages())[0];
    const client = await tab.createCDPSession();
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 2048, height: 1152, deviceScaleFactor: 1.25, mobile: false,
      screenWidth: 2048, screenHeight: 1152,
    });
    await tab.goto(url, { waitUntil: "load" });
    await tab.waitForFunction("window.__render && window.__render.ready === true", { timeout: 120000 });
    const err = await tab.evaluate(() => window.__render.error || null);
    if (err) throw new Error("render-mode setup failed: " + err);

    // ffmpeg: read PNGs from stdin pipe -> H.264, near-lossless.
    const ff = spawn("ffmpeg", [
      "-y", "-f", "image2pipe", "-framerate", "60", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "16",
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "60", "-s", "2560x1440",
      outPath,
    ], { stdio: ["pipe", "inherit", "inherit"] });

    await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
    await tab.evaluate(() => window.__render.start());

    let frameTimeTicks = 0;
    let n = 0;
    const MAX_FRAMES = 60 * 60 * 12; // safety cap: 12 min
    while (n < MAX_FRAMES) {
      const budget = client.send("Emulation.setVirtualTimePolicy", {
        policy: "advance", budget: FRAME_MS, maxVirtualTimeTaskStarvationCount: 100000,
      });
      await new Promise((resolve) => { client.once("Emulation.virtualTimeBudgetExpired", resolve); budget.catch(() => {}); });
      frameTimeTicks += FRAME_MS;
      const { screenshotData } = await client.send("HeadlessExperimental.beginFrame", {
        frameTimeTicks, screenshot: { format: "png" },
      });
      if (screenshotData) {
        if (!ff.stdin.write(Buffer.from(screenshotData, "base64"))) {
          await new Promise((r) => ff.stdin.once("drain", r));
        }
      }
      n++;
      if (onProgress && n % 30 === 0) onProgress({ frame: n });

      const done = await tab.evaluate(() => window.__render.done === true);
      if (done) {
        // capture a short tail so the final frame + any fade settles (0.5s)
        for (let t = 0; t < 30; t++) {
          const b2 = client.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: FRAME_MS, maxVirtualTimeTaskStarvationCount: 100000 });
          await new Promise((resolve) => { client.once("Emulation.virtualTimeBudgetExpired", resolve); b2.catch(() => {}); });
          frameTimeTicks += FRAME_MS;
          const shot = await client.send("HeadlessExperimental.beginFrame", { frameTimeTicks, screenshot: { format: "png" } });
          if (shot.screenshotData) ff.stdin.write(Buffer.from(shot.screenshotData, "base64"));
          n++;
        }
        break;
      }
    }
    const manifest = await tab.evaluate(() => window.__audioManifest || []);
    ff.stdin.end();
    await new Promise((resolve, reject) => { ff.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg exited " + code))); });
    return { frames: n, manifest };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Add a thin CLI in `render/index.mjs` (silent-only for now)**

```javascript
// render/index.mjs — CLI orchestrator. Phase 1: silent video only.
import { captureSilentVideo } from "./frame-capture.mjs";
import { argv } from "node:process";

function arg(name, def) { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; }

const script = arg("script", "");
const lang = arg("lang", "english");
const out = arg("out", "./out/video.mp4");
const port = Number(arg("port", 8888));

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
await mkdir(dirname(out), { recursive: true });

console.log(JSON.stringify({ stage: "start", script, lang }));
const res = await captureSilentVideo({
  script, lang, port, outPath: out,
  onProgress: (p) => console.log(JSON.stringify({ stage: "capture", ...p })),
});
console.log(JSON.stringify({ stage: "done", path: out, frames: res.frames }));
```

- [ ] **Step 3: Run a full silent render**

```bash
cd render && node index.mjs --script "<real saved name>" --lang english --out ./out/test.mp4
```
Expected: progress JSON lines, then `{"stage":"done",...}`; `out/test.mp4` plays and visually matches Play Video (silent). Spot-check duration ≈ the live video length.

- [ ] **Step 4: Commit**

```bash
git add render/frame-capture.mjs render/index.mjs
git commit -m "feat(render): silent full-length frame capture -> H.264 MP4"
```

---

## PHASE 2 — Audio manifest, reconstruction, mux

### Task 2.1: Record an audio manifest in render mode

**Files:**
- Modify: `js/render-mode.js` (manifest store + tap helper)
- Modify: `js/audio.js` (guarded taps)

- [ ] **Step 1: Add manifest store + tap API in `render-mode.js`**

Inside `initRenderModeIfRequested`, after creating `window.__render`, add:
```javascript
  window.__audioManifest = [];
  window.__audioTap = (event) => {
    if (!window.__render || !window.__render.active) return;
    // stamp with virtual-clock time
    window.__audioManifest.push({ atMs: performance.now(), ...event });
  };
```

- [ ] **Step 2: Tap the audio play/volume/stop paths in `audio.js`**

`audio.js` is the only audio source. Add taps at these confirmed points, each guarded so live behaviour is unchanged. Wrap with `if (window.__audioTap) window.__audioTap({...})`.

At each play function, immediately after the element's `src` is resolved and `.play()` is about to be called, emit a `play` event with the resolved file URL, kind, current `.volume`, and media start offset:
- `playVoice` (line 304): `kind:"voice"`.
- `playRules` (line 446): `kind:"voice"`.
- `playTeamNameVoiceIfExists` (line 793): `kind:"voice"`.
- `playTheAnswerIs` (line 804) incl. reveal stinger at 816: `kind:"voice"` and a separate `kind:"stinger"` for the stinger.
- `playEndingVoice` (line 834): `kind:"voice"`.
- `playProgressVoice` (line 856): `kind:"voice"`.
- `playTicking` (line 422): `kind:"ticking"`.
- BGM start/crossfade: emit `kind:"bgm"` `play` when a `bgMusic`/`incoming`/`outgoing` element starts; emit `volume` events at each volume assignment (lines 149,152,191,227,229,236,238,256,292) with the element id + new volume; emit `stop` on pause/end.

Concrete pattern (example for `playVoice`):
```javascript
// inside playVoice, after pickExistingSrc resolves `chosenSrc` and before currentVoice.play():
if (window.__audioTap) window.__audioTap({
  type: "play", kind: "voice", id: "voice", src: chosenSrc,
  mediaOffsetSec: 0, volume: currentVoice.volume,
});
```
Each distinct concurrent element needs a stable `id` (e.g. `"bgm-a"`/`"bgm-b"` for the two crossfading BGM elements, `"voice"`, `"ticking"`, `"stinger"`) so volume/stop events can be correlated to the right `play`.

- [ ] **Step 3: Manual verify the manifest is populated**

Run a full render (or the spike with high frames). After it finishes, in the driver read `window.__audioManifest` and dump it to a file. Confirm it contains: BGM play + volume ramps, voice plays at sensible times, ticking near each countdown end, stinger at reveals. Sanity-check timestamps increase monotonically.

- [ ] **Step 4: Commit**

```bash
git add js/render-mode.js js/audio.js
git commit -m "feat(render): record audio manifest (play/volume/stop) in render mode"
```

### Task 2.2: Make flow-gating audio waits duration-based under the virtual clock

**Files:**
- Modify: `js/audio.js` (only the two flow-gating promises) OR `js/render-mode.js` (override)

Headless playback won't reliably fire `ended`; `playRules().then(...)` (landing→L2) and `playCommentBelow().then(...)` (outro→stop) gate the flow on it.

- [ ] **Step 1: Probe durations and resolve on duration in render mode**

In render mode, make `playRules` and `playCommentBelow` resolve their promise after the clip's known duration (via `setTimeout`, which the virtual clock drives) instead of waiting for the real `ended`. Implementation: when `window.__render?.active`, after resolving `chosenSrc`, get the duration via a cached `decodeAudioData`/`HTMLMediaElement.duration` lookup (preload metadata in preflight), then `setTimeout(resolve, durationMs)`. Keep the existing `ended`-based path for normal use.

Concrete (guarded) pattern inside the promise body:
```javascript
if (window.__render && window.__render.active) {
  const durMs = await getClipDurationMs(chosenSrc); // resolves metadata duration, cached
  // still tap the play event (Task 2.1)
  setTimeout(resolve, durMs);
  return;
}
// ...existing real-playback path with 'ended' listener...
```
Add a small `getClipDurationMs(src)` helper (cache in a Map; create a detached `Audio`, `preload="metadata"`, resolve on `loadedmetadata` with `el.duration*1000`).

- [ ] **Step 2: Verify the rendered video length matches live**

Run a full render. Compare total duration to a manually-timed Play Video run of the same script (±0.1s). They should match because flow timing now uses the same durations.

- [ ] **Step 3: Commit**

```bash
git add js/audio.js js/render-mode.js
git commit -m "feat(render): duration-based audio gating for deterministic flow timing"
```

### Task 2.3: Pure filtergraph builder (TDD)

**Files:**
- Create: `render/audio-filtergraph.mjs`
- Create: `render/test/audio-filtergraph.test.mjs`

- [ ] **Step 1: Write the failing test**

`render/test/audio-filtergraph.test.mjs`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFiltergraph } from "../audio-filtergraph.mjs";

test("single voice delayed and volume-ramped", () => {
  const manifest = [
    { type: "play", kind: "voice", id: "voice", src: "/v.mp3", mediaOffsetSec: 0, atMs: 1000, volume: 1 },
    { type: "stop", id: "voice", atMs: 3000 },
  ];
  const { inputs, filterComplex, finalLabel } = buildFiltergraph(manifest, { sampleRate: 48000 });
  assert.deepEqual(inputs, ["/v.mp3"]);
  assert.match(filterComplex, /adelay=1000\|1000/);   // delay to 1000ms, both channels
  assert.ok(finalLabel.startsWith("[") && finalLabel.endsWith("]"));
});

test("two clips are amixed", () => {
  const manifest = [
    { type: "play", kind: "bgm", id: "bgm-a", src: "/b.mp3", mediaOffsetSec: 0, atMs: 0, volume: 0.3 },
    { type: "play", kind: "voice", id: "voice", src: "/v.mp3", mediaOffsetSec: 0, atMs: 500, volume: 1 },
  ];
  const { inputs, filterComplex } = buildFiltergraph(manifest, { sampleRate: 48000 });
  assert.equal(inputs.length, 2);
  assert.match(filterComplex, /amix=inputs=2/);
});

test("volume automation becomes a stepped volume expression", () => {
  const manifest = [
    { type: "play", kind: "bgm", id: "bgm-a", src: "/b.mp3", mediaOffsetSec: 0, atMs: 0, volume: 1 },
    { type: "volume", id: "bgm-a", atMs: 1000, volume: 0.2 },
  ];
  const { filterComplex } = buildFiltergraph(manifest, { sampleRate: 48000 });
  assert.match(filterComplex, /volume=/);   // an envelope is emitted
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd render && node --test test/audio-filtergraph.test.mjs`
Expected: FAIL — `buildFiltergraph` not found.

- [ ] **Step 3: Implement `render/audio-filtergraph.mjs`**

```javascript
// render/audio-filtergraph.mjs
// Pure: manifest -> { inputs:[paths], filterComplex, finalLabel }.
// Each "play" event = one ffmpeg input, trimmed at mediaOffset, delayed to atMs,
// with a volume envelope built from that id's subsequent "volume" events, ending at its "stop".
export function buildFiltergraph(manifest, { sampleRate = 48000 } = {}) {
  const plays = manifest.filter((e) => e.type === "play");
  const inputs = [];
  const chains = [];
  const labels = [];

  plays.forEach((p, idx) => {
    inputs.push(p.src);
    const inLabel = `${idx}:a`;
    const out = `a${idx}`;
    const parts = [`aformat=sample_rates=${sampleRate}:channel_layouts=stereo`];

    if (p.mediaOffsetSec > 0) parts.push(`atrim=start=${p.mediaOffsetSec}`, "asetpts=PTS-STARTPTS");

    // volume envelope from this id's events after its play
    const vEvents = manifest.filter(
      (e) => e.type === "volume" && e.id === p.id && e.atMs >= p.atMs,
    ).sort((a, b) => a.atMs - b.atMs);
    const stop = manifest.find((e) => e.type === "stop" && e.id === p.id && e.atMs >= p.atMs);

    // stepped envelope: volume=...:eval=frame with 'between' expressions relative to delayed timeline
    const points = [{ atMs: p.atMs, volume: p.volume }, ...vEvents.map((e) => ({ atMs: e.atMs, volume: e.volume }))];
    const expr = buildVolumeExpr(points, p.atMs);
    parts.push(`volume=eval=frame:volume='${expr}'`);

    if (stop) {
      const durSec = Math.max(0, (stop.atMs - p.atMs) / 1000);
      parts.push(`atrim=end=${durSec}`, "asetpts=PTS-STARTPTS");
    }
    const delayMs = Math.max(0, Math.round(p.atMs));
    parts.push(`adelay=${delayMs}|${delayMs}`);

    chains.push(`[${inLabel}]${parts.join(",")}[${out}]`);
    labels.push(`[${out}]`);
  });

  let filterComplex;
  let finalLabel;
  if (labels.length === 0) {
    filterComplex = `anullsrc=r=${sampleRate}:cl=stereo[outa]`;
    finalLabel = "[outa]";
  } else if (labels.length === 1) {
    filterComplex = chains.join(";");
    finalLabel = labels[0];
  } else {
    filterComplex = chains.join(";") + `;${labels.join("")}amix=inputs=${labels.length}:normalize=0[outa]`;
    finalLabel = "[outa]";
  }
  return { inputs, filterComplex, finalLabel };
}

// piecewise-constant volume as ffmpeg expr over t (seconds, post-delay absolute time)
function buildVolumeExpr(points, baseMs) {
  // points sorted; produce nested if(): if(lt(t,t1),v0,if(lt(t,t2),v1,...))
  const segs = points.map((p) => ({ t: p.atMs / 1000, v: p.volume }));
  let expr = String(segs[segs.length - 1].v);
  for (let i = segs.length - 2; i >= 0; i--) {
    expr = `if(lt(t,${segs[i + 1].t.toFixed(4)}),${segs[i].v},${expr})`;
  }
  return expr;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd render && node --test test/audio-filtergraph.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add render/audio-filtergraph.mjs render/test/audio-filtergraph.test.mjs
git commit -m "feat(render): pure manifest->ffmpeg filtergraph builder (TDD)"
```

### Task 2.4: Build audio + mux onto the silent video

**Files:**
- Create: `render/audio-mux.mjs`
- Modify: `render/index.mjs` (wire audio + mux)

- [ ] **Step 1: Write `render/audio-mux.mjs`**

```javascript
// render/audio-mux.mjs — render manifest to an audio file, then mux onto silent video.
import { spawn } from "node:child_process";
import { buildFiltergraph } from "./audio-filtergraph.mjs";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

// Resolve a project-relative web path (from the manifest src) to an absolute file path.
export function resolveSrc(src, { repoRoot }) {
  // manifest srcs are http URLs or root-relative paths served by run_site.py from repoRoot
  let p = src;
  try { p = new URL(src).pathname; } catch (_) { /* already a path */ }
  p = decodeURIComponent(p).replace(/^\/+/, "");
  return require("node:path").join(repoRoot, p);
}

export async function buildAndMux({ manifest, silentVideoPath, outPath, repoRoot, sampleRate = 48000 }) {
  const { inputs, filterComplex, finalLabel } = buildFiltergraph(manifest, { sampleRate });
  const audioPath = outPath.replace(/\.mp4$/, ".audio.m4a");

  if (inputs.length === 0) {
    // no audio: just copy video
    await run("ffmpeg", ["-y", "-i", silentVideoPath, "-c", "copy", outPath]);
    return outPath;
  }

  // 1) render mixed audio track
  const audioArgs = ["-y"];
  for (const src of inputs) audioArgs.push("-i", resolveSrc(src, { repoRoot }));
  audioArgs.push("-filter_complex", filterComplex, "-map", finalLabel,
    "-c:a", "aac", "-b:a", "256k", "-ar", String(sampleRate), audioPath);
  await run("ffmpeg", audioArgs);

  // 2) mux audio onto silent video; pad to longest stream
  await run("ffmpeg", ["-y", "-i", silentVideoPath, "-i", audioPath,
    "-c:v", "copy", "-c:a", "copy", "-map", "0:v:0", "-map", "1:a:0", outPath]);
  return outPath;
}
```

Note: use `import path from "node:path"` at top instead of `require` (ESM). Fix `resolveSrc` to `import path`.

- [ ] **Step 2: Wire audio into `render/index.mjs`**

```javascript
import { buildAndMux } from "./audio-mux.mjs";
import path from "node:path";
// ...after captureSilentVideo returns { frames, manifest }:
const silent = out.replace(/\.mp4$/, ".silent.mp4");
// (capture into `silent` instead of `out`)
const repoRoot = path.resolve(process.cwd(), "..", ".."); // render/ -> runner/ -> repo root; adjust to actual
console.log(JSON.stringify({ stage: "audio" }));
await buildAndMux({ manifest: res.manifest, silentVideoPath: silent, outPath: out, repoRoot });
console.log(JSON.stringify({ stage: "done", path: out, frames: res.frames }));
```
Confirm `repoRoot` resolves to the folder that `run_site.py` serves from (PROJECT_ROOT = the `Football Channel` repo root). The driver receives `--repo-root` from the server to avoid guessing.

- [ ] **Step 3: Full render with audio**

```bash
cd render && node index.mjs --script "<real name>" --lang english --out ./out/test.mp4 --repo-root "C:/Users/Rom/Documents/GitHub/Football Channel"
```
Expected: video + audio. Play it and compare against Play Video: voices, BGM, ticking, ducking, crossfades all present and time-aligned.

- [ ] **Step 4: Commit**

```bash
git add render/audio-mux.mjs render/index.mjs
git commit -m "feat(render): reconstruct soundtrack from manifest and mux onto video"
```

---

## PHASE 3 — UI + server wiring

### Task 3.1: Add the Render Video button + bindings + state

**Files:**
- Modify: `index.html` (between line 38 `prod-btn` and 39 `record-video-btn`)
- Modify: `js/dom-bindings.js` (~line 38-40)
- Modify: `js/state.js` (els object)

- [ ] **Step 1: Add the button**

In `index.html`, insert between the PROD button (line 38) and Record Video (line 39):
```html
            <button type="button" class="panel-fab render-video-btn" id="render-video-btn">Render Video</button>
```
Final order: PROD · Render Video · Record Video · Play Video.

- [ ] **Step 2: Bind it**

In `js/dom-bindings.js` alongside the other FAB bindings:
```javascript
els.renderVideoBtn = document.getElementById("render-video-btn");
```

- [ ] **Step 3: Declare state fields**

In `js/state.js` els object add `renderVideoBtn: null,` and in `appState` add `rendering: false,`.

- [ ] **Step 4: Verify the button appears**

Open the app; confirm a "Render Video" button shows between PROD and Record Video and is clickable (no handler yet → no-op).

- [ ] **Step 5: Commit**

```bash
git add index.html js/dom-bindings.js js/state.js
git commit -m "feat(render): add Render Video button + bindings"
```

### Task 3.2: Server endpoints — spawn driver + SSE progress

**Files:**
- Modify: `run_site.py` (`do_POST` dispatch ~2983, `do_GET` ~2947, add handler methods near other `_try_*`)

- [ ] **Step 1: Add `_try_render_video` (POST) to spawn the Node driver**

Add a method following the existing `_try_*` pattern (uses `self._read_json_body`, `self._write_json`):
```python
    def _try_render_video(self) -> bool:
        from urllib.parse import urlparse
        if urlparse(self.path).path.rstrip("/") != "/__render-video":
            return False
        try:
            body = self._read_json_body()
            script = str(body.get("script") or "").strip()
            language = _normalize_language(body.get("language"))
            if not script:
                raise ValueError("script is required")
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        runner_dir = Path(__file__).resolve().parent
        out_dir = PROJECT_ROOT / "Ready videos" / language
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{script}.mp4"

        job_id = uuid.uuid4().hex
        cmd = [
            _node_exe(), str(runner_dir / "render" / "index.mjs"),
            "--script", script, "--lang", language,
            "--out", str(out_path), "--port", str(DEFAULT_PORT),
            "--repo-root", str(PROJECT_ROOT),
        ]
        proc = subprocess.Popen(cmd, cwd=str(runner_dir / "render"),
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        _RENDER_JOBS[job_id] = {"proc": proc, "lines": [], "done": False}
        threading.Thread(target=_pump_render_job, args=(job_id,), daemon=True).start()
        self._write_json(200, {"ok": True, "jobId": job_id})
        return True
```
Add module-level helpers near the top of the handler module:
```python
import uuid, threading, shutil
_RENDER_JOBS = {}

def _node_exe():
    return shutil.which("node") or "node"

def _pump_render_job(job_id):
    job = _RENDER_JOBS.get(job_id)
    if not job: return
    proc = job["proc"]
    for line in proc.stdout:
        job["lines"].append(line.rstrip("\n"))
    proc.wait()
    job["done"] = True
    job["code"] = proc.returncode
```

- [ ] **Step 2: Add `_try_render_progress` (GET SSE)**

Mirror the existing SSE `text/event-stream` mechanism (line ~2913):
```python
    def _try_render_progress(self) -> bool:
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__render-video/progress":
            return False
        job_id = (parse_qs(parsed.query).get("job") or [""])[0]
        job = _RENDER_JOBS.get(job_id)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if not job:
            self.wfile.write(b'data: {"stage":"error","message":"unknown job"}\n\n'); return True
        sent = 0
        import time as _t
        while True:
            while sent < len(job["lines"]):
                self.wfile.write(f'data: {job["lines"][sent]}\n\n'.encode("utf-8")); self.wfile.flush()
                sent += 1
            if job["done"]:
                code = job.get("code", 0)
                tail = '{"stage":"finished","code":%d}' % code
                self.wfile.write(f'data: {tail}\n\n'.encode("utf-8")); self.wfile.flush()
                break
            _t.sleep(0.2)
        return True
```

- [ ] **Step 3: Register both in the dispatchers**

In `do_POST` (line 2983), add before the final `send_error(404)`:
```python
        if self._try_render_video():
            return
```
In `do_GET` (line 2947), add alongside the other GET `_try_*`:
```python
        if self._try_render_progress():
            return
```

- [ ] **Step 4: Verify endpoint with curl**

With dev server running:
```bash
curl -s -X POST http://127.0.0.1:8888/__render-video -H "Content-Type: application/json" -d '{"script":"<real name>","language":"english"}'
```
Expected: `{"ok": true, "jobId": "<hex>"}` and a Node process starts. Then:
```bash
curl -N "http://127.0.0.1:8888/__render-video/progress?job=<hex>"
```
Expected: streamed `data: {"stage":...}` lines ending in `{"stage":"finished","code":0}` and `Ready videos/english/<name>.mp4` exists.

- [ ] **Step 5: Commit**

```bash
git add run_site.py
git commit -m "feat(render): server endpoints to spawn render driver + SSE progress"
```

### Task 3.3: Wire the button to the endpoint + progress modal

**Files:**
- Modify: `js/app.js` (new handler near the Record handler ~1461)
- Modify: `css/components/` (new `render-progress.css`, linked from `styles.css`)

- [ ] **Step 1: Add the click handler in `app.js`**

```javascript
// ── Render Video button: build the MP4 frame-by-frame (current language only) ──
if (els.renderVideoBtn) {
  els.renderVideoBtn.onclick = async () => {
    if (appState.rendering) return;
    if (isProdMode()) {
      const result = await runProdValidation();
      if (!result.allPassed) { showValidationModal(result); return; }
    }
    const savedName = (getActiveScriptName() || "").trim();
    if (!savedName) { alert("Load a saved setting first — the rendered file is named after it."); return; }

    appState.rendering = true;
    showRenderProgressModal(savedName);
    try {
      const res = await fetch("/__render-video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: savedName, language: getCurrentLanguage() }),
      });
      const data = await res.json();
      if (!data.ok) { setRenderProgressError(data.error || "Failed to start render"); appState.rendering = false; return; }
      const es = new EventSource(`/__render-video/progress?job=${encodeURIComponent(data.jobId)}`);
      es.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.stage === "capture") updateRenderProgress(msg);
        else if (msg.stage === "audio") updateRenderProgress({ label: "Building audio…" });
        else if (msg.stage === "done") setRenderProgressDone(msg.path);
        else if (msg.stage === "error") setRenderProgressError(msg.message);
        else if (msg.stage === "finished") { es.close(); appState.rendering = false; }
      };
    } catch (err) {
      setRenderProgressError(String(err)); appState.rendering = false;
    }
  };
}
```
Add small UI helpers `showRenderProgressModal/updateRenderProgress/setRenderProgressDone/setRenderProgressError` (reuse the preflight modal markup/styling; a simple overlay with a label + bar + "Open folder" link on done). Place them in `app.js` or a tiny `js/render-progress-ui.js` imported by `app.js`.

- [ ] **Step 2: Verify end-to-end from the UI**

Load a saved script, click Render Video. Confirm: progress modal appears, frame count climbs, "Building audio…" shows, then "Done" with the path. Open the file — it matches Play Video with full audio.

- [ ] **Step 3: Commit**

```bash
git add js/app.js js/render-progress-ui.js css/components/render-progress.css css/styles.css
git commit -m "feat(render): wire Render Video button to driver with progress modal"
```

---

## PHASE 4 — Validation (the "perfect at 125%" check)

### Task 4.1: Compare a rendered frame against the live app at 125%

**Files:**
- Create: `render/compare.mjs` (diagnostic, not shipped in UI)

- [ ] **Step 1: Capture a reference from the live app at 125% zoom**

In a normal Chrome window at exactly 125% zoom, sized so the page area is 2560×1440 device px, press Play Video, pause at a known moment (e.g. a specific level's countdown at 10s, or mid-transition), and screenshot just the page content.

- [ ] **Step 2: Pull the matching frame from a render**

Compute the frame index for that exact virtual timestamp and extract it (re-run capture writing PNGs, or add a `--dump-frame <n>` flag to `frame-capture.mjs`).

- [ ] **Step 3: Diff**

```bash
cd render && ffmpeg -i live_ref.png -i render_frame.png -filter_complex "blend=all_mode=difference,signalstats" -f null - 2>&1 | grep -i "YAVG\|max"
```
Expected: differences negligible (anti-aliasing only). If a layout element is off, adjust viewport (`deviceScaleFactor`/width) until it matches — this calibrates the 125% reproduction.

- [ ] **Step 4: Document calibration result + commit**

```bash
git add render/compare.mjs docs/superpowers/plans/2026-05-27-render-video-frame-by-frame.md
git commit -m "test(render): frame-compare harness + 125% calibration notes"
```

---

## Self-review notes (author)

- **Spec coverage:** render-mode (Task 0.2,1.2,2.1,2.2) · headless virtual-clock capture (0.3,1.3) · 125% viewport (1.3 device metrics, 4.1 calibration) · seeded determinism (0.2,0.4) · audio manifest+reconstruction+mux (2.1–2.4) · button between PROD/Record (3.1) · output `Ready videos/<lang>/<script>.mp4` (3.2) · server spawn+SSE (3.2) · progress modal (3.3) · current-language-only (3.1/3.3 use `getCurrentLanguage()`) — all covered.
- **Determinism risk** is front-loaded in Phase 0 with an explicit gate + scoped fallback (only 5 named CSS effects).
- **Type/name consistency:** `window.__render` (`active/ready/done/start/error/endMs`), `window.__audioManifest`, `window.__audioTap`, `buildFiltergraph(manifest,{sampleRate})→{inputs,filterComplex,finalLabel}`, `buildAndMux(...)`, `loadScriptByName(name)`, `_try_render_video`/`_try_render_progress`, `els.renderVideoBtn`, `appState.rendering` are used consistently across tasks.
- **Known follow-ups:** confirm `appState` is exposed for render-mode (Task 1.2 Step 1); confirm `repoRoot` passed via `--repo-root` (Task 2.4 Step 2 / 3.2). Both flagged inline.
```
