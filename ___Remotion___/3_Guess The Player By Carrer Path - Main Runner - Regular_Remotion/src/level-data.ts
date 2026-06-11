// Runner-3 data resolution. A level = ONE player; the clues are the career clubs
// shown as a horizontal timeline (crest + year). The revealed answer is the player
// (full-colour photo + name). build-data.mjs emits the full career history per level.
import savesData from "./generated/saves.json";

export type CareerEntry = {
  club: string;
  year: string;
  crestPath: string | null;
};

type RawLevel = {
  display: string;
  playerName: string;
  photoPath: string | null;
  careerHistory: CareerEntry[];
  revealVoiceEn?: string | null;
  revealVoiceEs?: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  display: string;
  playerName: string;
  photoPath: string | null;
  careerHistory: CareerEntry[];
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formationLabel: string | null,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  return {
    display: lvl.display,
    playerName: lvl.playerName,
    photoPath: lvl.photoPath ?? null,
    careerHistory: lvl.careerHistory ?? [],
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
