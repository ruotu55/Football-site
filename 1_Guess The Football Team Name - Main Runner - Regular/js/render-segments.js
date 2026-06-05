// js/render-segments.js — catalog + runners for partial Render Video test clips (?render=1&segment=…)

import { appState } from "./state.js";
import { switchLevel } from "./levels.js";
import { playBallPreloader as runSharedBallPreloader } from "../../.Storage/shared/ball-preloader-animation.js";
import { runVideoStep, revealCurrentLevelForRenderTest } from "./video.js?v=20260605-3scountdown";
import { resetTransitionOverlays } from "./transitions.js";

/** Sections shown in the Render Test Clips menu. Exactly three clips. */
export const RENDER_TEST_SECTIONS = [
  {
    title: "Intro",
    clips: [
      { id: "intro", label: "Intro", hint: "The 4 balls merge → reveal Level 1" },
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
  intro: 300,             // 0.5s background-only hold + ball merge + bounce + circular reveal of Level 1 (~5s; cap-bound, no natural finish)
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
}

let renderLandingFloatTween = null;
/** Render-only GSAP take-over of the landing `float-up-down` bob (see coverLandingForRenderIntro). */
function startRenderLandingFloat() {
  if (!window.__render?.active) return;
  const gsap = window.gsap;
  const group = document.querySelector(".landing-page .landing-motion-group");
  if (!gsap || !group || renderLandingFloatTween) return;
  group.style.animation = "none"; // composited CSS bob is frozen under virtual time; take over
  gsap.set(group, { y: 0, force3D: true });
  // Match the CSS keyframes: 0/-12px/0 over 3.2s ease-in-out (half-cycle 1.6s yoyo).
  renderLandingFloatTween = gsap.to(group, {
    y: -12, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1, force3D: true,
  });
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
}

function ensureQuestionReady(index, label) {
  const state = appState.levelsData?.[index];
  if (!state?.currentSquad) {
    throw new Error(`Load a script with a team on ${label} before rendering this clip.`);
  }
}

/** Intro: the 4-ball merge → bounce → reveal of Level 1 (landing). */
async function runIntro() {
  switchLevel(1, { instant: true });
  prepareRenderPlaybackUi();
  coverLandingForRenderIntro();
  await runSharedBallPreloader(loadGsap);
  finishRenderSegment(500);
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
