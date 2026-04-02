/* js/pitch-render.js — Placeholder runner: minimal question stage + header. */

import { appState, getState } from "./state.js";

export function cleanCareerHistory(history) {
  return Array.isArray(history) ? history : [];
}

export function syncCareerSlotControlsVisibility() {}

export function applyCareerPictureModeToActiveState() {}

export function persistCareerPictureModeFromActiveState() {}

export function syncShortsCareerVideoPreviewLayers() {}

/** Regular runner: `levels.js` expects this (Career Path API); no `careerPlayer` in placeholder mode. */
export function shouldUseVideoQuestionLayout(state = getState()) {
  if (!state) return false;
  return appState.currentLevelIndex > 1 && appState.currentLevelIndex < appState.totalLevelsCount;
}

export function getVideoQuestionPreviewState(state = getState()) {
  const useVideoQuestionLayout = shouldUseVideoQuestionLayout(state);
  const previewPostTimer =
    useVideoQuestionLayout &&
    (appState.videoRevealPostTimerActive || (!state.videoMode && !appState.isVideoPlaying));
  const previewPreTimer = useVideoQuestionLayout && state.videoMode && !previewPostTimer;
  return { useVideoQuestionLayout, previewPreTimer, previewPostTimer };
}

/** `teams.js` imports this; unused in placeholder flow. */
export function renderPitch() {}

export function renderHeader() {
  const { els } = appState;
  const state = getState();
  if (!els.teamHeader) return;
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);

  if (previewPreTimer) {
    els.teamHeader.classList.remove("video-revealed");
    els.teamHeader.classList.add("video-hidden");
  } else if (previewPostTimer) {
    els.teamHeader.classList.remove("video-hidden");
    els.teamHeader.classList.add("video-revealed");
  } else if (!state.videoMode) {
    els.teamHeader.classList.remove("video-hidden");
    els.teamHeader.classList.remove("video-revealed");
  }

  const nameEl = els.headerName;
  const logoEl = els.headerLogo;
  if (nameEl) {
    nameEl.textContent = `Level ${Math.max(0, appState.currentLevelIndex - 1)}`;
  }
  if (logoEl) {
    logoEl.removeAttribute("src");
    logoEl.hidden = true;
  }
}

export function renderCareer() {
  const wrap = appState.els.careerWrap;
  if (!wrap) return;
  const n = Math.max(0, appState.currentLevelIndex - 1);
  wrap.innerHTML = `<div class="placeholder-question-stage" aria-hidden="true"></div><div class="placeholder-question-label">Question ${String(n).padStart(2, "0")}</div>`;
}
