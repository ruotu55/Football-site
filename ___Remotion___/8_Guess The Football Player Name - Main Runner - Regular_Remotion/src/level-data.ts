// Runner-8 data resolution. A level = ONE player; the answer is the player's NAME.
// build-data.mjs emits the player photo path + reveal voice paths per level.
import savesData from "./generated/saves.json";

type RawLevel = {
  playerName: string;
  display: string;
  photoPath: string | null;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  playerName: string;
  display: string;
  photoPath: string | null;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
  _formationLabel: string | null,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  return {
    playerName: lvl.playerName,
    display: lvl.display,
    photoPath: lvl.photoPath,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
