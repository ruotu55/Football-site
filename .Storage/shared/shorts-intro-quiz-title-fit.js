/** Auto-fit + safe-zone helpers for #shorts-intro-quiz-title (all Shorts runners). */

let fitRaf = 0;
let resizeListenerAttached = false;

function measureIntroTitleMaxLineWidth(titleEl) {
  const lines = titleEl.querySelectorAll(".shorts-intro-quiz-title-line");
  if (lines.length) {
    let max = 0;
    lines.forEach((line) => {
      max = Math.max(max, line.scrollWidth);
    });
    return max;
  }
  return titleEl.scrollWidth;
}

export function renderShortsIntroQuizTitleLines(titleEl, line1, line2) {
  if (!titleEl) return;
  titleEl.innerHTML =
    `<span class="shorts-intro-quiz-title-line">${line1}</span>` +
    `<span class="shorts-intro-quiz-title-line">${line2}</span>`;
}

export function resetShortsIntroQuizTitleFit(titleEl) {
  if (!titleEl) return;
  titleEl.style.removeProperty("font-size");
}

export function cancelShortsIntroQuizTitleFit() {
  cancelAnimationFrame(fitRaf);
  fitRaf = 0;
}

export function fitShortsIntroQuizTitle(titleEl) {
  if (!titleEl || titleEl.hidden) return;
  if (!titleEl.classList.contains("shorts-intro-quiz-title--visible")) return;

  resetShortsIntroQuizTitleFit(titleEl);
  const maxW = titleEl.clientWidth;
  if (maxW <= 0) return;

  let high = parseFloat(getComputedStyle(titleEl).fontSize) || 20;
  titleEl.style.fontSize = `${high}px`;
  void titleEl.offsetWidth;
  if (measureIntroTitleMaxLineWidth(titleEl) <= maxW + 1) {
    resetShortsIntroQuizTitleFit(titleEl);
    return;
  }

  let low = 8;
  while (high - low > 0.25) {
    const mid = (low + high) / 2;
    titleEl.style.fontSize = `${mid}px`;
    void titleEl.offsetWidth;
    if (measureIntroTitleMaxLineWidth(titleEl) > maxW + 1) {
      high = mid;
    } else {
      low = mid;
    }
  }

  let fs = Math.max(8, low);
  titleEl.style.fontSize = `${fs}px`;
  void titleEl.offsetWidth;
  while (measureIntroTitleMaxLineWidth(titleEl) > maxW + 1 && fs > 8) {
    fs -= 0.5;
    titleEl.style.fontSize = `${fs}px`;
    void titleEl.offsetWidth;
  }
}

export function scheduleShortsIntroQuizTitleFit(titleEl) {
  cancelShortsIntroQuizTitleFit();
  fitRaf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitRaf = 0;
      fitShortsIntroQuizTitle(titleEl);
    });
  });
}

function refitVisibleIntroTitle() {
  const titleEl = document.getElementById("shorts-intro-quiz-title");
  if (!titleEl || titleEl.hidden) return;
  if (!titleEl.classList.contains("shorts-intro-quiz-title--visible")) return;
  scheduleShortsIntroQuizTitleFit(titleEl);
}

export function ensureShortsIntroQuizTitleResizeListener() {
  if (resizeListenerAttached) return;
  resizeListenerAttached = true;
  window.addEventListener("resize", refitVisibleIntroTitle);
}

/**
 * Show/hide the intro title without layout jumps during the fade-out.
 * On hide: keep the fitted font-size and DOM until the element is fully hidden.
 */
export function setShortsIntroQuizTitleVisibility(titleEl, isVisible, options = {}, line1, line2, fadeMs = 780) {
  if (!titleEl) return;

  if (isVisible) {
    renderShortsIntroQuizTitleLines(titleEl, line1, line2);
    titleEl.hidden = false;
    titleEl.classList.remove("shorts-intro-quiz-title--visible");
    void titleEl.offsetWidth;
    ensureShortsIntroQuizTitleResizeListener();
    scheduleShortsIntroQuizTitleFit(titleEl);
    titleEl.classList.add("shorts-intro-quiz-title--visible");
    return;
  }

  cancelShortsIntroQuizTitleFit();
  titleEl.classList.remove("shorts-intro-quiz-title--visible");
}

export function finalizeShortsIntroQuizTitleHide(titleEl) {
  if (!titleEl) return;
  titleEl.hidden = true;
  resetShortsIntroQuizTitleFit(titleEl);
}
