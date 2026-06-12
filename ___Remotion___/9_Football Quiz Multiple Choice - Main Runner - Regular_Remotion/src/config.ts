// Per-runner config for runner 9 — "Football Quiz Multiple Choice (A/B/C)".
// Everything that differs from the shared template lives here (title/season/theme).
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Football-Quiz-Multiple-Choice-Regular";

// Intro title — matches the runner's identity:
//   EN "The Ultimate Football Quiz"
//   ES "El Mejor Quiz De Fútbol"
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["The Ultimate", "Football Quiz"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["El Mejor", "Quiz De Fútbol"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Intro sizes matched to runner 2 (user request 2026-06-11): title 155, season 126.
export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 126;

// Background default — magenta accent matching runner-9 app.js forcedDefaults.
// Color id "quiz-football-mcq" → label "#C2185B - Football Quiz (Multiple Choice)"
// Effect id "rising-soccer-balls" → label "Rising soccer balls"
export const THEME_DEFAULT = {
  color: "#C2185B - Football Quiz (Multiple Choice)",
  effect: "Rising soccer balls",
  opacity: 0.5,
} as const;
