// Per-runner config for runner 6 — "Guess the Fake Information About the Player".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Fake-Information-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the fake information about the player"
//   ES "Adivina la información falsa sobre el jugador"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Fake", "Information", "About The Player"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina La", "Información Falsa", "Sobre El Jugador"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
// WATCH-OUT: the Spanish 3rd line is long (was 92) — check it fits.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 72;

// Background default (matches the runner's app.js forcedDefaults for "player-by-fake-info").
export const THEME_DEFAULT = {
  color: "#E57373 - Fake Information",
  effect: "Rising soccer balls",
  opacity: 0.5,
} as const;
