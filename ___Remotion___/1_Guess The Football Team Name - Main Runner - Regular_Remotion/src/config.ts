// Per-runner Intro config for runner 1 — "Guess the Football Team Name by players' nationality".
// Title text MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "Guess the football team name by players' nationality"
//   ES "Adivina el equipo por la nacionalidad de los jugadores"
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Football", "Team Name By", "Players Nationality"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina el Equipo de Fútbol", "Por la Nacionalidad", "de los Jugadores"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

export const TITLE_FONT_SIZE = 155;
export const SEASON_FONT_SIZE = 72;
