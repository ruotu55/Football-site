// Runner-9 data resolution. A level = ONE MCQ question.
// build-data.mjs reads recording-status.json blocks prefixed "9|" and emits
// src/generated/saves.json with the mcq data embedded per level.
import savesData from "./generated/saves.json";

// MCQ answer shape
export type McqAnswer = {
  id: string; // "A" | "B" | "C"
  text: { english: string; spanish: string };
  playerKey: string | null;
  photoPath: string | null; // repo-relative path (already synced to public/)
};

// MCQ question shape (embedded per level in the save)
export type McqData = {
  questionType: "trivia" | "which-player";
  questionText: { english: string; spanish: string };
  answers: McqAnswer[];
  correctAnswerId: string; // "A" | "B" | "C"
  topicImage: string | null; // repo-relative image path (trivia)
};

type RawLevel = {
  mcq: McqData;
  revealVoiceEn?: string | null;
  revealVoiceEs?: string | null;
};

type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  mcq: McqData;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  return {
    mcq: lvl.mcq,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
