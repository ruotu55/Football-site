import { appState, getState } from "./state.js";

function shortsLayoutActive() {
  return (
    document.body.classList.contains("shorts-mode") ||
    document.documentElement.classList.contains("shorts-mode")
  );
}

function clearSoccerRolling(timerEl) {
  const soccer = timerEl?.querySelector?.(".soccer");
  if (!soccer) return;
  soccer.classList.remove("countdown-soccer-rolling");
  soccer.style.removeProperty("--shorts-soccer-run-ms");
}

/** First moment of Play Video: hide idle frozen pill before playback state flips on. */
export function hideShortsCountdownOnPlayVideoPress() {
  if (!shortsLayoutActive()) return;
  const timerEl = appState.els?.countdownTimer;
  if (!timerEl) return;
  timerEl.hidden = true;
  timerEl.classList.remove(
    "pulse",
    "timer-green",
    "timer-yellow",
    "timer-shake",
    "timer-phase-green",
    "timer-phase-orange",
    "timer-phase-yellow",
    "timer-phase-red",
    "countdown-timer-stage-enter"
  );
  document.body.classList.remove("shorts-question-countdown");
  clearSoccerRolling(timerEl);
  const fillEl = document.getElementById("countdown-bar-fill");
  if (fillEl) {
    fillEl.style.transition = "";
    fillEl.style.width = "";
  }
}

/** Shorts quiz + Video Mode on + not Play Video: full green pill (frozen preview). */
export function syncShortsVideoModeIdleTimerBar() {
  if (!shortsLayoutActive()) return;
  const timerEl = appState.els?.countdownTimer;
  if (!timerEl) return;
  if (appState.isVideoPlaying) return;

  const state = getState();
  const onQuestion =
    appState.currentLevelIndex >= 1 &&
    appState.currentLevelIndex < appState.totalLevelsCount;
  const fillEl = document.getElementById("countdown-bar-fill");

  if (!onQuestion || !state?.videoMode) {
    timerEl.hidden = true;
    timerEl.classList.remove(
      "pulse",
      "timer-green",
      "timer-yellow",
      "timer-shake",
      "timer-phase-green",
      "timer-phase-orange",
      "timer-phase-yellow",
      "timer-phase-red",
      "countdown-timer-stage-enter"
    );
    document.body.classList.remove("shorts-question-countdown");
    clearSoccerRolling(timerEl);
    if (fillEl) {
      fillEl.style.transition = "";
      fillEl.style.width = "";
    }
    return;
  }

  document.body.classList.remove("shorts-question-countdown");
  clearSoccerRolling(timerEl);
  timerEl.hidden = false;
  timerEl.classList.remove(
    "countdown-timer-stage-enter",
    "timer-shake",
    "timer-phase-orange",
    "timer-phase-yellow",
    "timer-phase-red",
    "pulse",
    "timer-green",
    "timer-yellow"
  );
  timerEl.classList.add("timer-phase-green");
  if (fillEl) {
    fillEl.style.transition = "none";
    fillEl.style.width = "100%";
  }
}
