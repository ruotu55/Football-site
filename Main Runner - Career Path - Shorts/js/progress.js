import { gaugeColors } from "./constants.js";
import { appState } from "./state.js";

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
    scrollEl.scrollTo({ left: next, behavior: "smooth" });
  } else {
    if (scrollEl.clientHeight <= 0) return;
    const sr = scrollEl.getBoundingClientRect();
    const er = stepEl.getBoundingClientRect();
    const delta = er.top + er.height / 2 - (sr.top + sr.height / 2);
    const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const next = Math.min(max, Math.max(0, scrollEl.scrollTop + delta));
    scrollEl.scrollTo({ top: next, behavior: "smooth" });
  }
}

export function renderProgressSteps(totalLevels, switchLevel) {
  const { els } = appState;
  
  const prevScrollTop = els.quizProgressScroll.scrollTop || 0;
  const prevScrollLeft = els.quizProgressScroll.scrollLeft || 0;
  els.quizProgressScroll.innerHTML = "";
  let activeStepEl = null;
  const isShortsLayout = document.body.classList.contains("shorts-mode");
  for (let i = 0; i <= totalLevels; i++) {
    const isLogo = (i === 0);
    const isLanding = (i === 1);
    const isOutro = (i === totalLevels);
    const isBonus = (i === totalLevels - 1);
    if (isShortsLayout && isLanding) {
      continue;
    }
    if (appState.isVideoPlaying && (isLogo || isLanding || isOutro)) {
      continue;
    }
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
      step.innerHTML = "⭐<span class='bonus-step-label'>BONUS</span>"; 
      step.classList.add("bonus-step"); 
      levelColor = "#ffca28"; 
    } else {
      step.textContent = i - 1; 
      const colorIndex = Math.floor(((i - 2) / (totalLevels - 3)) * gaugeColors.length);
      levelColor = gaugeColors[Math.min(colorIndex, gaugeColors.length - 1)];
    }
    step.style.color = levelColor;
    step.style.transition = "all 0.5s ease-in-out";
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
    step.onclick = () => { 
      if (!appState.isVideoPlaying) {
        switchLevel(i);
      }
    };
    els.quizProgressScroll.appendChild(step);
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
  els.quizProgressScroll.scrollTop = prevScrollTop;
  els.quizProgressScroll.scrollLeft = prevScrollLeft;
  if (activeStepEl) {
    setTimeout(() => {
      const isShorts = document.body.classList.contains("shorts-mode");
      scrollQuizProgressToActiveStep(els.quizProgressScroll, activeStepEl, isShorts);
    }, 10);
  }
}