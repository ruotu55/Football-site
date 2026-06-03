// Ported EXACTLY from the app's audio.js voice filename maps and path templates.

// Quiz title (rules) voice — audio.js:21-28, 45-50
const QUIZ_TITLE_FILENAMES: Record<string, Record<string, string>> = {
  english: { "club-by-nat": "Guess the football team name by players' nationality !!!.mp3" },
  spanish: { "club-by-nat": "Adivina el equipo por la nacionalidad de los jugadores !!!.mp3" },
};
const RUNNER_VARIANT = "Lineups Regular";
export function quizTitleRelPath(quizType: string, lang: string): string {
  const map = QUIZ_TITLE_FILENAMES[lang] || QUIZ_TITLE_FILENAMES.english;
  const filename = map[quizType] || map["club-by-nat"];
  if (!filename) return "";
  return `../.Storage/Voices/Game name/${RUNNER_VARIANT}/${lang}/${filename}`;
}

// Ending voice — audio.js:30-39, 52-57
const ENDING_FILENAMES: Record<string, Record<string, string>> = {
  english: {
    "think-you-know": "Think you know the answer_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
    "how-many": "How many did you get_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
  },
  spanish: {
    "think-you-know": "Crees saber la respuesta_ dinoslo en los comentarios!!! No olvides dar like y suscribirte .mp3",
    "how-many": "Cuantas acertaste_ dinoslo en los comentarios!!! No olvides dar like y suscribirte .mp3",
  },
};
export function endingVoiceRelPath(endingType: string, lang: string): string {
  const map = ENDING_FILENAMES[lang] || ENDING_FILENAMES.english;
  const filename = map[endingType] || map["think-you-know"];
  if (!filename) return "";
  return `../.Storage/Voices/Ending Guess/${lang}/${filename}`;
}

// Static SFX (audio.js:107-108)
export const TICKING_REL = "../.Storage/Voices/Ticking sound/ticking sound.mp3";
export const REVEAL_STINGER_REL = "../.Storage/Voices/Transitions/mixkit-arcade-bonus-alert-767.wav";

// TODO(Phase 5): progress + reveal voice path resolution
