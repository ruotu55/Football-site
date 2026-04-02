/* js/pitch-render.js — Placeholder runner: minimal question stage + header. */

import { appState } from "./state.js";

export function cleanCareerHistory(history) {
  return Array.isArray(history) ? history : [];
}

export function syncCareerSlotControlsVisibility() {}

export function applyCareerPictureModeToActiveState() {}

export function persistCareerPictureModeFromActiveState() {}

export function syncShortsCareerVideoPreviewLayers() {}

export function renderHeader() {
  const { els } = appState;
  if (!els.teamHeader) return;
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
