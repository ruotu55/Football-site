/**
 * PREP PANEL slim replacement (2026-06-12). The old play-flow switchLevel
 * (stage transitions, audio, recording teardown) lives in git history.
 * switchLevel now only moves the "active level" pointer; prep-panel.js
 * listens for the event and re-renders / scrolls.
 */
import { appState } from "./state.js";

export async function switchLevel(index) {
  const i = Math.max(0, Math.min(Number(index) || 0, (appState.levelsData?.length || 1) - 1));
  appState.currentLevelIndex = i;
  document.dispatchEvent(new CustomEvent("prep:level-switched", { detail: { index: i } }));
}
