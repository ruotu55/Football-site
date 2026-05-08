/* i18n.js — translation map and applier for Four Parameters Regular. */

import { getCurrentLanguage } from "./voice-tab.js";

const TRANSLATIONS = {
  english: {
    landingTitleFakeInfo: "GUESS THE FAKE <br>INFORMATION <br>ABOUT THE PLAYER",
    landingTitleFourParams: "GUESS THE PLAYER by <br>club + position + country + age",
    landingSubtitle: "2025/6 SEASON",
    landingQuestionsLabel: "QUESTIONS",
    progressDiffEasy: "EASY",
    progressDiffHard: "HARD",
    bonus: "BONUS",
    sideText: "ULTIMATE FOOTBALL QUIZ",
    outroThinkYouKnow: "THINK YOU KNOW THE ANSWER?",
    outroHowMany: "HOW MANY DID YOU GET?",
    outroSubtitle: "LET US KNOW IN THE COMMENTS!",
    /* Age unit on the 4th parameter card. */
    ageUnitSingular: "year old",
    ageUnitPlural: "years old",
  },
  spanish: {
    landingTitleFakeInfo: "ADIVINA LA <br>INFORMACIÓN FALSA<br>SOBRE EL JUGADOR",
    landingTitleFourParams: "ADIVINA AL JUGADOR por <br>club + posición + país + edad",
    landingSubtitle: "TEMPORADA 2025/6",
    landingQuestionsLabel: "PREGUNTAS",
    progressDiffEasy: "FÁCIL",
    progressDiffHard: "DIFÍCIL",
    bonus: "BONUS",
    sideText: "El Gran Test de Fútbol",
    outroThinkYouKnow: "¿CREES SABER LA RESPUESTA?",
    outroHowMany: "¿CUÁNTAS ACERTASTE?",
    outroSubtitle: "¡DÍNOSLO EN LOS COMENTARIOS!",
    /* Age unit on the 4th parameter card. */
    ageUnitSingular: "año",
    ageUnitPlural: "años",
  },
};

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
  CF:  "MP",    // Mediapunta
  ST:  "DC",    // Delantero Centro
};

/** Translate an English position abbrev (e.g. "CAM") to Spanish ("MCO") when
    the active language is Spanish. Unknown codes pass through unchanged. */
export function translatePositionAbbrev(abbrev) {
  if (!abbrev) return abbrev;
  if (getCurrentLanguage() !== "spanish") return abbrev;
  return POSITION_ABBREV_EN_TO_ES[abbrev] != null
    ? POSITION_ABBREV_EN_TO_ES[abbrev]
    : abbrev;
}

export function t(key) {
  const lang = getCurrentLanguage();
  const map = TRANSLATIONS[lang] || TRANSLATIONS.english;
  return map[key] != null ? map[key] : (TRANSLATIONS.english[key] || "");
}

export function endingTitleText(endingType) {
  if (endingType === "how-many") return t("outroHowMany");
  return t("outroThinkYouKnow");
}

export function applyTranslations() {
  const landingPage = document.getElementById("landing-page");
  if (landingPage) {
    const subtitle = landingPage.querySelector(".landing-subtitle");
    if (subtitle) subtitle.textContent = t("landingSubtitle");
  }

  const landingQuestionsLabel = document.getElementById("landing-questions-label");
  if (landingQuestionsLabel) landingQuestionsLabel.textContent = t("landingQuestionsLabel");
  const landingQuestionsBonus = document.getElementById("landing-questions-bonus");
  if (landingQuestionsBonus) landingQuestionsBonus.textContent = t("bonus");

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
    outroTitle.textContent = endingTitleText(endingType);
  }
  const outroSubtitle = document.getElementById("outro-subtitle");
  if (outroSubtitle) outroSubtitle.textContent = t("outroSubtitle");

  document.querySelectorAll(".bonus-text").forEach((el) => {
    el.textContent = t("bonus");
  });
}

document.addEventListener("voice-language-change", () => {
  applyTranslations();
});
