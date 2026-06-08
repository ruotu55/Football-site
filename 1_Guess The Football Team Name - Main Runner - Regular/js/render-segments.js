// js/render-segments.js — catalog + runners for partial Render Video test clips (?render=1&segment=…)

import { appState } from "./state.js";
import { switchLevel } from "./levels.js?v=20260608-logofade";
import { runVideoStep, revealCurrentLevelForRenderTest, runLandingIntro, scheduleAfterTransition, LEVEL_SWITCH_STAGE_TRANSITION_MS } from "./video.js?v=20260608-logofade";
import { resetTransitionOverlays } from "./transitions.js";
import { startBgMusic } from "./audio.js";

/** Sections shown in the Render Test Clips menu. Exactly three clips. */
export const RENDER_TEST_SECTIONS = [
  {
    title: "Intro",
    clips: [
      { id: "intro", label: "Intro", hint: "4 balls merge → reveal Level 1 → first 3s of Q1 (countdown)" },
    ],
  },
  {
    title: "Level playing",
    clips: [
      { id: "level-playing", label: "Level playing", hint: "A question plays out, then moves to the next level" },
    ],
  },
  {
    title: "Ending",
    clips: [
      { id: "ending", label: "Ending", hint: "Last level's final seconds → the full ending" },
    ],
  },
];

export function getRenderTestClip(id) {
  for (const section of RENDER_TEST_SECTIONS) {
    const clip = section.clips.find((c) => c.id === id);
    if (clip) return { ...clip, section: section.title };
  }
  return null;
}

export function finishRenderSegment(tailMs = 300) {
  setTimeout(() => {
    if (window.__render) {
      window.__render.endMs = performance.now();
      window.__render.done = true;
    }
    document.dispatchEvent(new CustomEvent("recording-naturally-finished"));
  }, tailMs);
}

/** @type {Record<string, number>} frames at 60fps — keep in sync with render/segment-budgets.mjs */
export const SEGMENT_FRAME_BUDGETS = {
  intro: 840,             // intro (~8-9s: 0.5s hold + ball merge/bounce/reveal + quiz-title voice + switch to Q1) + first ~3s of Q1 (transition + 3s countdown), ends at the countdown end via the "level-countdown" gate (~11s; cap is just a safety)
  "level-playing": 960,   // 10s countdown + 3s reveal + transition into the next level
  ending: 900,            // last level tail + transition + full ending (probe stops early on natural finish)
};

function loadGsap() {
  if (window.gsap) return Promise.resolve(window.gsap);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    s.onload = () => resolve(window.gsap);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function coverLandingForRenderIntro() {
  // Kill any leftover transition overlay (e.g. a Cloud Drift still fading out from
  // boot/script-apply) so it doesn't bleed clouds over the ball-preloader intro.
  try { resetTransitionOverlays(); } catch (_) { /* ignore */ }
  const preloader = document.getElementById("ball-preloader");
  const preloaderBall = preloader?.querySelector(".ball-preloader-ball");
  if (preloader) {
    preloader.hidden = false;
    document.body.classList.add("ball-preloader-active");
  }
  if (preloaderBall) preloaderBall.style.opacity = "0";
  // The landing quiz-type text bobs via a composited CSS `float-up-down` animation,
  // which does NOT advance under the virtual clock — so in render the revealed title
  // sits frozen. Drive the same bob with GSAP (RAF/virtual-time-synced) so it's
  // already moving up/down behind the ball when it opens, exactly like Play Video.
  startRenderLandingFloat();
  // Same problem for the sunburst rays (youtube-thumbnails effect): their CSS spin
  // (--thumb-rays-angle keyframes) is frozen under the virtual clock. Drive the one shared
  // var with GSAP so BOTH the merge rays (ball-layer-1::before) and the landing rays
  // (body::before) rotate together — moving, continuous, identical — for the whole render.
  startRenderRaysSpin();
  // EVERY other background effect (competition star/chevron drop, sun-rays rotate, particle
  // drifts, …) also animates via CSS @keyframes that are frozen under the virtual clock. Drive
  // them all from virtual time so they MOVE on every screen, the whole render — see below.
  startRenderCssAnimationDriver();
}

let renderCssAnimDriverRaf = null;
/** Render-only: CSS @keyframes animations don't advance under the headless virtual clock
 *  (they sit frozen), so every background effect looked static in the render. RAF fires once
 *  per virtual frame here, so set each RUNNING CSS animation's currentTime to the elapsed
 *  virtual ms — advancing them all at their real design speed, on every screen (landing,
 *  questions, outro), for the whole render. Skips CSS transitions (no `animationName`) and
 *  GSAP tweens (not CSS animations). The youtube-thumbnails rays are GSAP-driven separately
 *  (disabled as a CSS animation in render-mode.css) so they aren't double-driven. */
function startRenderCssAnimationDriver() {
  if (!window.__render?.active || renderCssAnimDriverRaf) return;
  const start = performance.now();
  const tick = () => {
    const t = performance.now() - start;
    try {
      const anims = document.getAnimations ? document.getAnimations() : [];
      for (const a of anims) {
        // ONLY the looping background-effect keyframes (shared-bg-* / comp-*). Other CSS
        // animations (e.g. the one-shot stage enter/exit at level transitions) must NOT be
        // force-advanced to elapsed time — that would snap them to their end state. CSS
        // transitions and GSAP tweens have no `animationName` and are skipped anyway.
        const name = a && a.animationName;
        if (name && (name.indexOf("shared-bg-") === 0 || name.indexOf("comp-") === 0)) {
          try { a.currentTime = t; } catch (_) { /* some anims reject explicit currentTime */ }
        }
      }
    } catch (_) { /* getAnimations unsupported — leave effects as-is */ }
    renderCssAnimDriverRaf = requestAnimationFrame(tick);
  };
  renderCssAnimDriverRaf = requestAnimationFrame(tick);
}

let renderRaysSpinTween = null;
/** Render-only GSAP spin of the sunburst rays. The CSS `shared-bg-thumb-rays-spin`
 *  animation on `--thumb-rays-angle` does NOT advance under the virtual clock (frozen
 *  rays). We GSAP-drive `--thumb-rays-angle` on :root (the @property is now inherits:true)
 *  so every layer that reads it — the landing `body::before` and the render-only merge
 *  `.ball-layer-1::before` — rotates in lockstep. 240s/rev matches the site CSS. Persists
 *  for the whole render (repeat:-1), so there is no freeze and no merge↔landing seam. */
function startRenderRaysSpin() {
  if (!window.__render?.active) return;
  const gsap = window.gsap;
  if (!gsap || renderRaysSpinTween) return;
  const root = document.documentElement;
  const state = { a: 0 };
  renderRaysSpinTween = gsap.to(state, {
    a: 360, duration: 240, ease: "none", repeat: -1,
    onUpdate() { root.style.setProperty("--thumb-rays-angle", state.a + "deg"); },
  });
}

let renderLandingFloatTween = null;
/** Render-only GSAP take-over of the landing `float-up-down` bob (see coverLandingForRenderIntro). */
function startRenderLandingFloat() {
  if (!window.__render?.active) return;
  const gsap = window.gsap;
  const group = document.querySelector(".landing-page .landing-motion-group");
  if (!gsap || !group || renderLandingFloatTween) return;
  group.style.animation = "none"; // composited CSS bob is frozen under virtual time; take over
  // Match the CSS `float-up-down-title` keyframes: -15px → +15px → -15px over 2.8s ease-in-out
  // (oscillates both up AND down around the title's position; half-cycle 1.4s yoyo).
  renderLandingFloatTween = gsap.fromTo(group,
    { y: -15, force3D: true },
    { y: 15, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1, force3D: true },
  );
}

/** Hide FABs / mimic Play Video chrome for headless capture. */
export function prepareRenderPlaybackUi() {
  const { els } = appState;
  appState.isVideoPlaying = true;
  if (Array.isArray(appState.levelsData)) {
    appState.levelsData.forEach((lvl) => { lvl.videoMode = true; });
  }
  document.body.classList.add("play-video-active");
  if (els.playVideoBtn) els.playVideoBtn.hidden = true;
  if (els.recordVideoBtn) els.recordVideoBtn.hidden = true;
  if (els.renderVideoBtn) els.renderVideoBtn.hidden = true;
  if (els.panelFab) els.panelFab.hidden = true;
  if (els.controlPanel) els.controlPanel.classList.add("collapsed");
  if (els.rightPanel) els.rightPanel.hidden = true;
  if (els.sideTextRight) els.sideTextRight.hidden = true;
  // Start the background music exactly like the full render does (startVideoFlow calls
  // startBgMusic in its setup). Without this, test clips rendered SILENT of BGM while the
  // full render had it — breaking the "test clips are 100% identical to the full render"
  // rule. startBgMusic taps __audioManifest, so the BGM is reconstructed into the clip's
  // muxed audio too. Single shared point (all 3 clips call this) so it can't drift.
  startBgMusic();
}

function ensureQuestionReady(index, label) {
  const state = appState.levelsData?.[index];
  if (!state?.currentSquad) {
    throw new Error(`Load a script with a team on ${label} before rendering this clip.`);
  }
}

/** Intro test clip: runs the EXACT same intro as the full render (runLandingIntro in
 *  video.js) — ball merge → reveal Level 1 → quiz-title voice 0.5s after the balls → switch
 *  to Q1 when the voice ENDS — AND THEN the first ~3s of Q1 (the question countdown), so the
 *  clip is "intro + first 3s of the level" instead of stopping right at the switch. The
 *  after-switch flow is byte-for-byte the full render's (scheduleAfterTransition → runVideoStep,
 *  same LEVEL_SWITCH_STAGE_TRANSITION_MS); the ONLY difference is we flip the render gate to
 *  "level-countdown" so video.js ends the clip at the END of the 3s countdown (before the
 *  reveal) instead of revealing + continuing. Keep using the shared funcs so it can't drift. */
async function runIntro() {
  switchLevel(1, { instant: true });
  prepareRenderPlaybackUi();
  coverLandingForRenderIntro();
  runLandingIntro(() => {
    window.__renderSegment = "level-countdown"; // video.js stops the clip at the countdown end (~3s into Q1)
    scheduleAfterTransition(() => {
      if (!appState.isVideoPlaying) return;
      runVideoStep();
    }, LEVEL_SWITCH_STAGE_TRANSITION_MS);
  });
}

/** Level playing: first question plays out (countdown + reveal) then moves to the next level. */
async function runLevelPlaying() {
  ensureQuestionReady(2, "Question 1");
  switchLevel(2, { instant: true });
  prepareRenderPlaybackUi();
  // runVideoStep runs the full countdown → reveal → transition; video.js finishes the
  // clip once the NEXT level is on screen (guarded by window.__renderSegment === "level-playing").
  runVideoStep();
}

/** Ending: last level's final seconds → transition → the full real ending (outro). */
async function runEnding() {
  const lastQuestionIndex = appState.totalLevelsCount - 1;
  ensureQuestionReady(lastQuestionIndex, "the last question");
  switchLevel(lastQuestionIndex, { instant: true });
  prepareRenderPlaybackUi();
  // Show the last level for ~3s, then let the natural reveal → outro flow run to completion.
  // The real outro fires "recording-naturally-finished", which ends the render.
  await waitMs(3000);
  revealCurrentLevelForRenderTest();
}

const RUNNERS = {
  intro: runIntro,
  "level-playing": runLevelPlaying,
  ending: runEnding,
};

/** Called from render-mode when ?segment= is set (headless test clip). */
export async function runRenderTestSegment(segmentId) {
  window.__renderSegment = segmentId;
  const runner = RUNNERS[segmentId];
  if (!runner) throw new Error(`Unknown render test segment: ${segmentId}`);
  await runner();
}
