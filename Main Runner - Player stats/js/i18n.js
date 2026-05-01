/* i18n.js — translation map and applier for Player Stats Regular. */

import { getCurrentLanguage } from "./voice-tab.js";

const TRANSLATIONS = {
  english: {
    landingTitle: "GUESS THE PLAYER<br>BY CAREER STATS",
    landingTitleShorts: "GUESS THE<br>PLAYER<br>BY CAREER STATS",
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
    /* Player stats info boxes */
    statCareerGames: "Games",
    statPosition: "Position",
    statCareerClubs: "Clubs",
    statCareerGoals: "Goals",
    statCareerAssists: "Assists",
    statGoalsConceded: "Goals conceded",
    statCleanSheets: "Clean sheets",
    posGoalkeeper: "Goalkeeper",
    posDefender: "Defender",
    posMidfielder: "Midfielder",
    posForward: "Forward",
  },
  spanish: {
    landingTitle: "ADIVINA AL JUGADOR<br>POR ESTADÍSTICAS DE CARRERA",
    landingTitleShorts: "ADIVINA AL<br>JUGADOR<br>POR ESTADÍSTICAS",
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
    /* Player stats info boxes */
    statCareerGames: "Partidos",
    statPosition: "Posición",
    statCareerClubs: "Clubes",
    statCareerGoals: "Goles",
    statCareerAssists: "Asistencias",
    statGoalsConceded: "Goles encajados",
    statCleanSheets: "Porterías a cero",
    posGoalkeeper: "Portero",
    posDefender: "Defensa",
    posMidfielder: "Centrocampista",
    posForward: "Delantero",
  },
};

/* Map English position bucket → translated label. */
export function translatePositionBucket(bucket) {
  switch (bucket) {
    case "Goalkeeper": return t("posGoalkeeper");
    case "Defender":   return t("posDefender");
    case "Midfielder": return t("posMidfielder");
    case "Forward":    return t("posForward");
    default: return bucket;
  }
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
