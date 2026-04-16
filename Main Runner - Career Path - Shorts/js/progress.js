import { gaugeColors } from "./constants.js";
import { appState } from "./state.js";

let quizProgressSwitchLevelRef = null;

function getNavigableLevelIndicesCareerShorts(totalLevels) {
  const navigable = [];
  const isShortsLayout = document.body.classList.contains("shorts-mode");
  for (let i = 0; i <= totalLevels; i++) {
    const isLogo = i === 0;
    const isOutro = i === totalLevels;
    if (isShortsLayout && isLogo) continue;
    if (appState.isVideoPlaying && (isLogo || isOutro)) continue;
    navigable.push(i);
  }
  return navigable;
}

function bindQuizProgressWheelNav(getNavigableIndices) {
  const root = appState.els?.quizProgressContainer;
  if (!root || root.dataset.quizWheelNav === "1") return;
  root.dataset.quizWheelNav = "1";
  root.addEventListener(
    "wheel",
    (e) => {
      const switchLevel = quizProgressSwitchLevelRef;
      if (!switchLevel || appState.isVideoPlaying) return;
      if (root.hidden) return;

      const navigable = getNavigableIndices(appState.totalLevelsCount);
      if (navigable.length === 0) return;

      const isShortsLayout = document.body.classList.contains("shorts-mode");
      const primary =
        isShortsLayout && Math.abs(e.deltaX) > Math.abs(e.deltaY)
          ? e.deltaX
          : e.deltaY;
      if (Math.abs(primary) < 8) return;

      let pos = navigable.indexOf(appState.currentLevelIndex);
      if (pos === -1) pos = 0;

      const dir = primary > 0 ? 1 : -1;
      const nextPos = pos + dir;
      if (nextPos < 0 || nextPos >= navigable.length) return;

      e.preventDefault();
      e.stopPropagation();
      switchLevel(navigable[nextPos]);
    },
    { passive: false }
  );
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
  bindQuizProgressWheelNav(getNavigableLevelIndicesCareerShorts);

  const prevScrollTop = els.quizProgressScroll.scrollTop || 0;
  const prevScrollLeft = els.quizProgressScroll.scrollLeft || 0;
  els.quizProgressScroll.innerHTML = "";
  let activeStepEl = null;
  const isShortsLayout = document.body.classList.contains("shorts-mode");

  // Build the full list of visible level indices first
  const visibleIndices = [];
  for (let i = 0; i <= totalLevels; i++) {
    const isLogo = (i === 0);
    const isOutro = (i === totalLevels);
    if (isShortsLayout && isLogo) continue;
    if (appState.isVideoPlaying && (isLogo || isOutro)) continue;
    visibleIndices.push(i);
  }

  // Shorts mode: only show a window of 5 levels centered on the current level
  let indicesToRender = visibleIndices;
  if (isShortsLayout) {
    const WINDOW = 5;
    const activePos = visibleIndices.indexOf(appState.currentLevelIndex);
    if (activePos !== -1 && visibleIndices.length > WINDOW) {
      const half = Math.floor(WINDOW / 2); // 2
      let start = activePos - half;
      let end = start + WINDOW;
      if (start < 0) { start = 0; end = WINDOW; }
      if (end > visibleIndices.length) { end = visibleIndices.length; start = end - WINDOW; }
      indicesToRender = visibleIndices.slice(start, end);
    }
  }

  for (const i of indicesToRender) {
    const isLogo = (i === 0);
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
    } else if (isOutro) {
      step.innerHTML = "🏁";
      levelColor = "#4da3ff";
    } else if (isBonus) {
      step.innerHTML = "<span class='bonus-text'>BONUS</span>";
      step.classList.add("bonus-step");
      levelColor = "#ff5252";
    } else {
      step.textContent = i;
      const denom = Math.max(1, totalLevels - 2);
      const colorIndex = Math.floor(((i - 1) / denom) * gaugeColors.length);
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

    // Shorts mode: dot separators instead of lines
    if (isShortsLayout) {
      if (indicesToRender.indexOf(i) < indicesToRender.length - 1) {
        const dots = document.createElement("div");
        dots.className = "step-dots";
        els.quizProgressScroll.appendChild(dots);
      }
      continue;
    }

    let drawLine = false;
    if (appState.isVideoPlaying) {
      if (i < totalLevels - 1) drawLine = true;
    } else {
      if (i < totalLevels) drawLine = true;
    }
    if (drawLine) {
      const line = document.createElement("div");
      line.className = "line";
      if (i < appState.currentLevelIndex) {
        line.style.backgroundColor = levelColor;
      }
      els.quizProgressScroll.appendChild(line);
    }
  }

  // Regular mode: restore scroll position
  if (!isShortsLayout) {
    els.quizProgressScroll.scrollTop = prevScrollTop;
    els.quizProgressScroll.scrollLeft = prevScrollLeft;
    if (activeStepEl) {
      setTimeout(() => {
        scrollQuizProgressToActiveStep(els.quizProgressScroll, activeStepEl, false);
      }, 10);
    }
  }
}
