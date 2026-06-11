// Per-runner config for runner 2 — "Guess the Football National Team by players' club".
// Everything that differs from the shared template lives here (title/season/theme/voice).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Football-National-Team-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the football national team name by players' club"
//   ES "Adivina el equipo nacional por el club de los jugadores"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Football", "National Team Name", "By Players' Club"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina El Nombre Del", "Equipo Nacional Por", "El Club De Los Jugadores"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// The Spanish 3rd line is long → slightly smaller title than the default 104.
export const TITLE_FONT_SIZE = 94;

// Background default (matches the runner's app.js forcedDefaults for "nat-by-club").
export const THEME_DEFAULT = {
  color: "#1B5E20 - National Team by Club",
  effect: "YouTube thumbnails",
  opacity: 0.5,
} as const;
