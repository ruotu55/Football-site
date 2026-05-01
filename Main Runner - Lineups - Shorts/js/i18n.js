/* i18n.js — translation map and applier for Lineups Shorts. */

import { getCurrentLanguage } from "./voice-tab.js";

const TRANSLATIONS = {
  english: {
    landingTitleClubByNat: "GUESS THE FOOTBALL<br>TEAM NAME BY<br>PLAYERS NATIONALITY",
    landingTitleClubByNatShorts: "Guess the football <br>team name by <br>players' nationality",
    landingTitleNatByClub: "GUESS THE FOOTBALL<br>NATIONAL TEAM NAME<br>BY PLAYERS' CLUB",
    landingTitleNatByClubShorts: "Guess the football <br>national team name<br>by players' club",
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
  },
  spanish: {
    landingTitleClubByNat: "ADIVINA EL EQUIPO<br>DE FÚTBOL POR LA<br>NACIONALIDAD DE LOS JUGADORES",
    landingTitleClubByNatShorts: "Adivina el equipo <br>de fútbol por la <br>nacionalidad de los jugadores",
    landingTitleNatByClub: "ADIVINA EL EQUIPO<br>NACIONAL POR EL<br>CLUB DE LOS JUGADORES",
    landingTitleNatByClubShorts: "Adivina el equipo<br>nacional por el<br>club de los jugadores",
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

/* English country/nation name → Spanish. Keys match the squad-folder names
   under .Storage/Squad Formation/Teams/. Used for the team header in
   Lineups' "national team" mode. Unknown names pass through unchanged. */
const COUNTRY_EN_TO_ES = {
  "Albania": "Albania",
  "Algeria": "Argelia",
  "Andorra": "Andorra",
  "Argentina": "Argentina",
  "Armenia": "Armenia",
  "Australia": "Australia",
  "Austria": "Austria",
  "Azerbaijan": "Azerbaiyán",
  "Bangladesh": "Bangladés",
  "Belarus": "Bielorrusia",
  "Belgium": "Bélgica",
  "Bolivia": "Bolivia",
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  "Brazil": "Brasil",
  "Bulgaria": "Bulgaria",
  "Cambodia": "Camboya",
  "Canada": "Canadá",
  "Chile": "Chile",
  "China": "China",
  "Chinese Taipei": "Taipéi Chino",
  "Colombia": "Colombia",
  "Comoros": "Comoras",
  "Costa Rica": "Costa Rica",
  "Croatia": "Croacia",
  "Cyprus": "Chipre",
  "Czech Republic": "República Checa",
  "Denmark": "Dinamarca",
  "Dominican Republic": "República Dominicana",
  "Ecuador": "Ecuador",
  "Egypt": "Egipto",
  "El Salvador": "El Salvador",
  "England": "Inglaterra",
  "Estonia": "Estonia",
  "Ethiopia": "Etiopía",
  "Faroe Islands": "Islas Feroe",
  "Fiji": "Fiyi",
  "Finland": "Finlandia",
  "France": "Francia",
  "Georgia": "Georgia",
  "Germany": "Alemania",
  "Ghana": "Ghana",
  "Gibraltar": "Gibraltar",
  "Greece": "Grecia",
  "Guatemala": "Guatemala",
  "Honduras": "Honduras",
  "Hongkong": "Hong Kong",
  "Hong Kong": "Hong Kong",
  "Hungary": "Hungría",
  "Iceland": "Islandia",
  "India": "India",
  "Indonesia": "Indonesia",
  "Iran": "Irán",
  "Iraq": "Irak",
  "Ireland": "Irlanda",
  "Israel": "Israel",
  "Italy": "Italia",
  "Jamaica": "Jamaica",
  "Japan": "Japón",
  "Jordan": "Jordania",
  "Kazakhstan": "Kazajistán",
  "Korea, South": "Corea del Sur",
  "South Korea": "Corea del Sur",
  "Kosovo": "Kosovo",
  "Kyrgyzstan": "Kirguistán",
  "Laos": "Laos",
  "Latvia": "Letonia",
  "Lebanon": "Líbano",
  "Libya": "Libia",
  "Liechtenstein": "Liechtenstein",
  "Lithuania": "Lituania",
  "Luxembourg": "Luxemburgo",
  "Malaysia": "Malasia",
  "Malta": "Malta",
  "Mexico": "México",
  "Moldova": "Moldavia",
  "Montenegro": "Montenegro",
  "Morocco": "Marruecos",
  "Myanmar": "Myanmar",
  "Netherlands": "Países Bajos",
  "New Zealand": "Nueva Zelanda",
  "Nicaragua": "Nicaragua",
  "Nigeria": "Nigeria",
  "North Macedonia": "Macedonia del Norte",
  "Northern Ireland": "Irlanda del Norte",
  "Norway": "Noruega",
  "Oman": "Omán",
  "Panama": "Panamá",
  "Paraguay": "Paraguay",
  "Peru": "Perú",
  "Philippines": "Filipinas",
  "Poland": "Polonia",
  "Portugal": "Portugal",
  "Puerto Rico": "Puerto Rico",
  "Qatar": "Catar",
  "Romania": "Rumanía",
  "Russia": "Rusia",
  "San Marino": "San Marino",
  "Saudi Arabia": "Arabia Saudita",
  "Scotland": "Escocia",
  "Senegal": "Senegal",
  "Serbia": "Serbia",
  "Singapore": "Singapur",
  "Slovakia": "Eslovaquia",
  "Slovenia": "Eslovenia",
  "South Africa": "Sudáfrica",
  "Spain": "España",
  "Sweden": "Suecia",
  "Switzerland": "Suiza",
  "Tajikistan": "Tayikistán",
  "Thailand": "Tailandia",
  "Tunisia": "Túnez",
  "Türkiye": "Turquía",
  "Turkey": "Turquía",
  "Uganda": "Uganda",
  "Ukraine": "Ucrania",
  "United Arab Emirates": "Emiratos Árabes Unidos",
  "United States": "Estados Unidos",
  "USA": "Estados Unidos",
  "Uruguay": "Uruguay",
  "Uzbekistan": "Uzbekistán",
  "Venezuela": "Venezuela",
  "Vietnam": "Vietnam",
  "Wales": "Gales",
};

/** Translate an English country/nation name to Spanish when the active
    language is Spanish. Unknown names pass through unchanged. */
export function translateCountry(name) {
  if (!name) return name;
  if (getCurrentLanguage() !== "spanish") return name;
  const trimmed = String(name).trim();
  return COUNTRY_EN_TO_ES[trimmed] != null ? COUNTRY_EN_TO_ES[trimmed] : trimmed;
}

document.addEventListener("voice-language-change", () => {
  applyTranslations();
});
