// js/render-mode.js — controls deterministic "render mode" (URL ?render=1).
// Inert unless ?render=1 is present. Drives the existing video flow under a virtual
// clock (supplied externally by the headless render driver via CDP virtual time),
// with seeded randomness so every run is reproducible.
//
// IMPORTANT: import specifiers must match app.js exactly, or the browser loads a second
// copy of the module with separate state. app.js imports video.js as "./video.js?v=20260416-ball".

import { appState } from "./state.js";
import { startVideoFlow } from "./video.js?v=20260416-ball";
import { setCurrentLanguage } from "./voice-tab.js";
import { loadScriptByName, applyScriptObject } from "./saved-scripts.js?v=20260527d";
import { switchLevel } from "./levels.js";
import { renderSeedDurations, renderGetDurations } from "./audio.js";

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
  // The headless driver normally seeds earlier (before any app code) via
  // evaluateOnNewDocument and sets __RENDER_SEEDED__; only seed here if it didn't.
  if (!window.__RENDER_SEEDED__) {
    Math.random = makeSeededRandom(cfg.seed);
    window.__RENDER_SEEDED__ = true;
  }

  if (cfg.lang) setCurrentLanguage(cfg.lang);

  // Parallel workers inject the duration map from the probe pass so every worker's
  // flow timing is identical -> frames line up -> segments concatenate seamlessly.
  if (window.__renderDurations) {
    try { renderSeedDurations(window.__renderDurations); } catch (_) {}
  }

  const render = {
    active: true,
    config: cfg,
    ready: false,
    done: false,
    error: null,
    endMs: 0,
    _startFn: null,
    start() { if (this._startFn) this._startFn(); },
    getDurations() { try { return renderGetDurations(); } catch (_) { return {}; } },
  };
  window.__render = render;

  // Audio manifest: every audio action stamped with virtual-clock time, for ffmpeg
  // soundtrack reconstruction (Phase 2). Guarded taps in audio.js push here.
  window.__audioManifest = [];
  window.__audioTap = (event) => {
    if (!window.__render || !window.__render.active) return;
    window.__audioManifest.push({ atMs: performance.now(), ...event });
  };

  // Signal natural end of the video (same event Record Video waits for).
  document.addEventListener("recording-naturally-finished", () => {
    render.endMs = performance.now();
    render.done = true;
  }, { once: true });

  (async () => {
    try {
      // Prefer the live on-screen state the user is editing (captured at click time and
      // injected by the driver). Fall back to loading the saved script by name.
      if (window.__renderScript) {
        await applyScriptObject(window.__renderScript);
      } else if (cfg.script) {
        await loadScriptByName(cfg.script);
      }

      // Begin from the landing page (level 1), exactly like Record Video's runRecordingPhase.
      if (appState.currentLevelIndex !== 1) {
        switchLevel(1);
        if (appState._transitionDone && typeof appState._transitionDone.then === "function") {
          await appState._transitionDone.catch(() => {});
        }
      }

      // Enable video mode on all levels (mirror Play/Record).
      if (Array.isArray(appState.levelsData)) {
        appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
      }
      const toggle = document.getElementById("video-mode-toggle");
      if (toggle && !toggle.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event("change"));
      }

      if (document.fonts && document.fonts.ready) {
        // Never hang setup on fonts (can stall under heavy parallel load); cap the wait.
        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 8000)),
        ]);
      }

      render._startFn = () => startVideoFlow();
      render.ready = true;
    } catch (err) {
      render.error = String((err && err.message) || err);
      render.ready = true; // surface the error to the driver
    }
  })();

  return render;
}
