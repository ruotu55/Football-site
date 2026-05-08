import { gaugeColors } from "./constants.js";
import { appState } from "./state.js";
import { t } from "./i18n.js";

let quizProgressSwitchLevelRef = null;
let browseCenterIndex = null;
let lastRenderedCurrentLevelIndex = -1;
let __quizWheelAccum = 0;
let __quizWheelCooldownUntil = 0;

function getNavigableLevelIndicesCareerRegular(totalLevels) {
  const navigable = [];
  for (let i = 0; i <= totalLevels; i++) {
    const isLogo = i === 0;
    const isLanding = i === 1;
    const isOutro = i === totalLevels;
    if (isLogo) continue;
    if (appState.isVideoPlaying && (isLogo || isLanding || isOutro)) continue;
    navigable.push(i);
  }
  return navigable;
}

function bindQuizProgressWheelNav(getNavigableIndices) {
  const root = appState.els?.quizProgressContainer;
  if (!root || root.dataset.quizWheelNav === "1") return;
  root.dataset.quizWheelNav = "1";

  const handler = (e) => {
    if (appState.isVideoPlaying) return;
    if (root.hidden) return;

    const dy = e.deltaY;
    if (!dy) return;

    const navigable = getNavigableIndices(appState.totalLevelsCount);
    if (navigable.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (now < __quizWheelCooldownUntil) return;

    if ((__quizWheelAccum > 0) !== (dy > 0)) __quizWheelAccum = 0;
    __quizWheelAccum += dy;
    if (Math.abs(__quizWheelAccum) < 5) return;

    const dir = __quizWheelAccum > 0 ? 1 : -1;
    __quizWheelAccum = 0;
    __quizWheelCooldownUntil = now + 140;

    const center = browseCenterIndex !== null ? browseCenterIndex : appState.currentLevelIndex;
    let pos = navigable.indexOf(center);
    if (pos === -1) pos = navigable.indexOf(appState.currentLevelIndex);
    if (pos === -1) pos = 0;
    let nextPos = pos + dir * 2;
    if (nextPos < 0) nextPos = 0;
    if (nextPos >= navigable.length) nextPos = navigable.length - 1;
    if (nextPos === pos) return;

    browseCenterIndex = navigable[nextPos];
    renderProgressSteps(appState.totalLevelsCount, quizProgressSwitchLevelRef);
  };

  root.addEventListener("wheel", handler, { passive: false });
  if (appState.els?.quizProgressScroll) {
    appState.els.quizProgressScroll.addEventListener("wheel", handler, { passive: false });
  }
}

/**
 * Keep active step visible inside the progress strip only.
 * `scrollIntoView({ block: "center" })` can scroll ancestor scrollports and shifts the whole stage
 * on the last question levels (20 + bonus) where the step sits at the bottom of the track.
 */
function scrollQuizProgressToActiveStep(scrollEl, stepEl, isShorts) {
  if (!scrollEl || !stepEl || !stepEl.isConnected) return;
  if (isShorts) {
    if (scrollEl.clientWidth <= 0) return;
    const sr = scrollEl.getBoundingClientRect();
    const er = stepEl.getBoundingClientRect();
    const delta = er.left + er.width / 2 - (sr.left + sr.width / 2);
    const max = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
    const next = Math.min(max, Math.max(0, scrollEl.scrollLeft + delta));
    scrollEl.scrollTo({ left: next, behavior: "instant" });
  } else {
    if (scrollEl.clientHeight <= 0) return;
    const sr = scrollEl.getBoundingClientRect();
    const er = stepEl.getBoundingClientRect();
    const delta = er.top + er.height / 2 - (sr.top + sr.height / 2);
    const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const next = Math.min(max, Math.max(0, scrollEl.scrollTop + delta));
    scrollEl.scrollTo({ top: next, behavior: "instant" });
  }
}

export function renderProgressSteps(totalLevels, switchLevel) {
  const { els } = appState;

  quizProgressSwitchLevelRef = switchLevel;
  bindQuizProgressWheelNav(getNavigableLevelIndicesCareerRegular);

  if (lastRenderedCurrentLevelIndex !== appState.currentLevelIndex) {
    browseCenterIndex = null;
    lastRenderedCurrentLevelIndex = appState.currentLevelIndex;
  }

  els.quizProgressScroll.innerHTML = "";
  let activeStepEl = null;

  // Build the full list of visible level indices first
  const visibleIndices = [];
  for (let i = 0; i <= totalLevels; i++) {
    const isLogo = (i === 0);
    const isLanding = (i === 1);
    const isOutro = (i === totalLevels);
    if (isLogo) continue;
    if (appState.isVideoPlaying && (isLogo || isLanding || isOutro)) continue;
    visibleIndices.push(i);
  }

  // Window of 5 centered on the browse center (which follows currentLevelIndex unless wheel-scrolled)
  let indicesToRender = visibleIndices;
  const WINDOW = 5;
  const windowCenter = browseCenterIndex !== null ? browseCenterIndex : appState.currentLevelIndex;
  let activePos = visibleIndices.indexOf(windowCenter);
  if (activePos === -1) activePos = visibleIndices.indexOf(appState.currentLevelIndex);
  if (activePos !== -1 && visibleIndices.length > WINDOW) {
    const half = Math.floor(WINDOW / 2); // 2
    let start = activePos - half;
    let end = start + WINDOW;
    if (start < 0) { start = 0; end = WINDOW; }
    if (end > visibleIndices.length) { end = visibleIndices.length; start = end - WINDOW; }
    indicesToRender = visibleIndices.slice(start, end);
  }

  for (const i of indicesToRender) {
    const isLogo = (i === 0);
    const isLanding = (i === 1);
    const isOutro = (i === totalLevels);
    const endingType = typeof window.__getSelectedEndingType === "function"
      ? window.__getSelectedEndingType() : "think-you-know";
    const isBonus = (i === totalLevels - 1) && endingType !== "how-many";
    const step = document.createElement("div");
    step.className = "step";
    step.style.cursor = "pointer";
    let levelColor = "#fff";
    if (isLogo) {
      step.innerHTML = "🎬";
    } else if (isLanding) {
      step.innerHTML = "📝";
    } else if (isOutro) {
      step.innerHTML = "🏁";
      levelColor = "#4da3ff";
    } else if (isBonus) {
      step.innerHTML = `<span class='bonus-text'>${t("bonus")}</span>`;
      step.classList.add("bonus-step");
      levelColor = "#ff5252";
    } else {
      step.textContent = i - 1;
      const colorIndex = Math.floor(((i - 2) / (totalLevels - 3)) * gaugeColors.length);
      levelColor = gaugeColors[Math.min(colorIndex, gaugeColors.length - 1)];
    }
    step.style.color = levelColor;
    step.style.transition = "none";
    if (i === appState.currentLevelIndex) {
      activeStepEl = step;
      step.style.borderColor = levelColor;
      step.style.backgroundColor = "rgba(17, 17, 17, 0.8)";
      step.style.transform = "scale(1.08)";
      step.style.boxShadow = `0 0 8px ${levelColor}80`;
    } else if (i < appState.currentLevelIndex) {
      step.style.borderColor = levelColor;
      step.style.backgroundColor = "rgba(17, 17, 17, 0.8)";
      step.style.transform = "scale(1)";
      step.style.boxShadow = "none";
    } else {
      step.style.borderColor = "rgba(255, 255, 255, 0.25)";
      step.style.backgroundColor = "rgba(17, 17, 17, 0.8)";
      step.style.transform = "scale(1)";
      step.style.boxShadow = "none";
    }
    if (isBonus && i !== appState.currentLevelIndex) {
      step.style.borderColor = "#4D4D4D";
      step.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
    }
    step.onclick = () => {
      if (!appState.isVideoPlaying) {
        switchLevel(i);
      }
    };
    els.quizProgressScroll.appendChild(step);

    // Add dot separator after each step except the last
    if (indicesToRender.indexOf(i) < indicesToRender.length - 1) {
      const dots = document.createElement("div");
      dots.className = "step-dots";
      els.quizProgressScroll.appendChild(dots);
    }
  }

  // Extra bottom padding only when bonus step is visible
  const currentEndingType = typeof window.__getSelectedEndingType === "function"
    ? window.__getSelectedEndingType() : "think-you-know";
  const bonusVisible = indicesToRender.includes(totalLevels - 1) && currentEndingType !== "how-many";
  els.quizProgressScroll.classList.toggle("has-bonus", bonusVisible);
}
