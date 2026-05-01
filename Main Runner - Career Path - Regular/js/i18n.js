/* i18n.js — translation map and applier for Career Path Regular.
   Listens for the `voice-language-change` event dispatched by voice-tab.js
   (via setCurrentLanguage) and updates all visible quiz UI text in place. */

import { getCurrentLanguage } from "./voice-tab.js";

const TRANSLATIONS = {
  english: {
    landingTitle: "GUESS THE&nbsp;PLAYER<br>BY CAREER PATH",
    landingSubtitle: "2025/6 SEASON",
    diffEasy: "EASY",
    diffMedium: "MEDIUM",
    diffHard: "HARD",
    diffImpossible: "IMPOSSIBLE",
    progressDiffEasy: "EASY",
    progressDiffHard: "HARD",
    bonus: "BONUS",
    sideText: "ULTIMATE FOOTBALL QUIZ",
    outroThinkYouKnow: "THINK YOU KNOW THE ANSWER?",
    outroHowMany: "HOW MANY DID YOU GET?",
    outroSubtitle: "LET US KNOW IN THE COMMENTS!",
  },
  spanish: {
    landingTitle: "ADIVINA AL&nbsp;JUGADOR<br>POR SU TRAYECTORIA",
    landingSubtitle: "TEMPORADA 2025/6",
    diffEasy: "FÁCIL",
    diffMedium: "MEDIO",
    diffHard: "DIFÍCIL",
    diffImpossible: "IMPOSIBLE",
    progressDiffEasy: "FÁCIL",
    progressDiffHard: "DIFÍCIL",
    bonus: "BONUS",
    sideText: "El Gran Test de Fútbol",
    outroThinkYouKnow: "¿CREES SABER LA RESPUESTA?",
    outroHowMany: "¿CUÁNTAS ACERTASTE?",
    outroSubtitle: "¡DÍNOSLO EN LOS COMENTARIOS!",
  },
};

export function t(key) {
  const lang = getCurrentLanguage();
  const map = TRANSLATIONS[lang] || TRANSLATIONS.english;
  return map[key] != null ? map[key] : (TRANSLATIONS.english[key] || "");
}

/** Look up the ending-type outro title in the active language. */
export function endingTitleText(endingType) {
  if (endingType === "how-many") return t("outroHowMany");
  return t("outroThinkYouKnow");
}

/** Apply translations to all static UI text. Safe to call repeatedly and
    safe to call before any of the targets exist (missing nodes are skipped). */
export function applyTranslations() {
  /* Landing title — only retranslate if it currently looks like one of our
     known titles. updateLanding() in app.js also writes this, so this just
     covers the initial load before the user clicks Apply. */
  const landingTitle = document.getElementById("landing-title");
  if (landingTitle) {
    landingTitle.innerHTML = t("landingTitle");
  }

  /* Landing subtitle (the "2025/6 SEASON" line). */
  const landingPage = document.getElementById("landing-page");
  if (landingPage) {
    const subtitle = landingPage.querySelector(".landing-subtitle");
    if (subtitle) subtitle.textContent = t("landingSubtitle");
  }

  /* Difficulty labels in the landing difficulty box. Order in the DOM is
     EASY, MEDIUM, HARD, IMPOSSIBLE. */
  const labels = document.querySelectorAll("#landing-page .diff-label");
  if (labels.length === 4) {
    labels[0].textContent = t("diffEasy");
    labels[1].textContent = t("diffMedium");
    labels[2].textContent = t("diffHard");
    labels[3].textContent = t("diffImpossible");
  }

  /* Progress bar EASY / HARD labels at the ends of the progress track. */
  const progressLabels = document.querySelectorAll(".quiz-progress .difficulty-label");
  if (progressLabels.length === 2) {
    progressLabels[0].textContent = t("progressDiffEasy");
    progressLabels[1].textContent = t("progressDiffHard");
  }

  /* Side text (vertical "ULTIMATE FOOTBALL QUIZ" labels on left and right). */
  const sideLeft = document.getElementById("side-text-left");
  const sideRight = document.getElementById("side-text-right");
  if (sideLeft) sideLeft.textContent = t("sideText");
  if (sideRight) sideRight.textContent = t("sideText");

  /* Outro page title and subtitle. */
  const outroTitle = document.getElementById("outro-title");
  if (outroTitle) {
    /* Read the currently selected ending type (set by app.js on load and on
       <select> change). Default to think-you-know if not yet selected. */
    const endingType = (typeof window.__getSelectedEndingType === "function"
      ? window.__getSelectedEndingType() : "think-you-know");
    outroTitle.textContent = endingTitleText(endingType);
  }
  const outroSubtitle = document.getElementById("outro-subtitle");
  if (outroSubtitle) outroSubtitle.textContent = t("outroSubtitle");

  /* BONUS chip in the progress bar (rendered by progress.js). */
  document.querySelectorAll(".bonus-text").forEach((el) => {
    el.textContent = t("bonus");
  });
}

/* Auto-apply on language change so callers don't have to wire it up. */
document.addEventListener("voice-language-change", () => {
  applyTranslations();
});
