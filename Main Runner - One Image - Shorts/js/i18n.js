/* i18n.js — translation map and applier for Four Parameters Shorts. */

import { getCurrentLanguage } from "./voice-tab.js";

const TRANSLATIONS = {
  english: {
    landingTitle: "GUESS THE PLAYER<br>BY CAREER PATH",
    landingSubtitle: "2025/6 SEASON",
    diffEasy: "EASY",
    diffMedium: "MEDIUM",
    diffHard: "HARD",
    diffImpossible: "IMPOSSIBLE",
    progressDiffEasy: "EASY",
    progressDiffHard: "HARD",
    bonus: "BONUS",
    sideText: "ULTIMATE FOOTBALL QUIZ",
    outroThinkYouKnow: "THINK YOU KNOW<br>THE ANSWER?",
    outroHowMany: "HOW MANY<br>DID YOU GET?",
    outroSubtitle: "LET US KNOW IN THE COMMENTS!",
    /* Age unit on the 4th parameter card. */
    ageUnitSingular: "year old",
    ageUnitPlural: "years old",
  },
  spanish: {
    landingTitle: "ADIVINA AL JUGADOR<br>POR 4 PARÁMETROS",
    landingSubtitle: "TEMPORADA 2025/6",
    diffEasy: "FÁCIL",
    diffMedium: "MEDIO",
    diffHard: "DIFÍCIL",
    diffImpossible: "IMPOSIBLE",
    progressDiffEasy: "FÁCIL",
    progressDiffHard: "DIFÍCIL",
    bonus: "BONUS",
    sideText: "El Gran Test de Fútbol",
    outroThinkYouKnow: "¿CREES SABER<br>LA RESPUESTA?",
    outroHowMany: "¿CUÁNTAS<br>ACERTASTE?",
    outroSubtitle: "¡DÍNOSLO EN LOS COMENTARIOS!",
    /* Age unit on the 4th parameter card. */
    ageUnitSingular: "año",
    ageUnitPlural: "años",
  },
};

export function t(key) {
  const lang = getCurrentLanguage();
  const map = TRANSLATIONS[lang] || TRANSLATIONS.english;
  return map[key] != null ? map[key] : (TRANSLATIONS.english[key] || "");
}

export function endingTitleHTML(endingType) {
  if (endingType === "how-many") return t("outroHowMany");
  return t("outroThinkYouKnow");
}

export function applyTranslations() {
  const landingPage = document.getElementById("landing-page");
  if (landingPage) {
    const subtitle = landingPage.querySelector(".landing-subtitle");
    if (subtitle) subtitle.textContent = t("landingSubtitle");
  }

  const labels = document.querySelectorAll("#landing-page .diff-label");
  if (labels.length === 4) {
    labels[0].textContent = t("diffEasy");
    labels[1].textContent = t("diffMedium");
    labels[2].textContent = t("diffHard");
    labels[3].textContent = t("diffImpossible");
  }

  const progressLabels = document.querySelectorAll(".quiz-progress .difficulty-label");
  if (progressLabels.length === 2) {
    progressLabels[0].textContent = t("progressDiffEasy");
    progressLabels[1].textContent = t("progressDiffHard");
  }

  const sideLeft = document.getElementById("side-text-left");
  const sideRight = document.getElementById("side-text-right");
  if (sideLeft) sideLeft.textContent = t("sideText");
  if (sideRight) sideRight.textContent = t("sideText");

  const outroTitle = document.getElementById("outro-title");
  if (outroTitle) {
    const endingType = (typeof window.__getSelectedEndingType === "function"
      ? window.__getSelectedEndingType() : "think-you-know");
    outroTitle.innerHTML = endingTitleHTML(endingType);
  }
  const outroSubtitle = document.getElementById("outro-subtitle");
  if (outroSubtitle) outroSubtitle.textContent = t("outroSubtitle");

  document.querySelectorAll(".bonus-text").forEach((el) => {
    el.textContent = t("bonus");
  });
}

/* Spanish football position abbreviations — exact mapping per project spec.
   Map English abbrev → Spanish abbrev. */
const POSITION_ABBREV_EN_TO_ES = {
  GK:  "POR",   // Portero
  CB:  "DFC",   // Defensa Central
  LB:  "LTI",   // Lateral Izquierdo
  LWB: "CAI",   // Carrilero Izquierdo
  RB:  "LTD",   // Lateral Derecho
  RWB: "CAD",   // Carrilero Derecho
  CDM: "MCD",   // Mediocentro Defensivo
  CM:  "MC",    // Mediocentro
  CAM: "MCO",   // Mediocentro Ofensivo
  LM:  "MI",    // Mediocampista Izquierdo
  RM:  "MD",    // Mediocampista Derecho
  LW:  "EI",    // Extremo Izquierdo
  RW:  "ED",    // Extremo Derecho
  LF:  "SDI",   // Segundo Delantero Izquierdo
  RF:  "SDD",   // Segundo Delantero Derecho
  CF:  "MP",    // Mediapunta
  ST:  "DC",    // Delantero Centro
};

/** Translate an English position abbrev (e.g. "CAM") to Spanish ("MP") when
    the active language is Spanish. Unknown codes pass through unchanged. */
export function translatePositionAbbrev(abbrev) {
  if (!abbrev) return abbrev;
  if (getCurrentLanguage() !== "spanish") return abbrev;
  return POSITION_ABBREV_EN_TO_ES[abbrev] != null
    ? POSITION_ABBREV_EN_TO_ES[abbrev]
    : abbrev;
}

document.addEventListener("voice-language-change", () => {
  applyTranslations();
});
