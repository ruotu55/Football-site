// Runner-5 data resolution. A level = ONE player; the four clues are
// club crest / position abbreviation / country flag / age.
// The reveal is the player's name + full-colour photo.
// build-data.mjs resolves the full player record from the squad JSONs and emits saves.json.
import savesData from "./generated/saves.json";

type RawLevel = {
  display: string;       // short display name (last name)
  playerName: string;    // full name as typed in the save
  photoPath: string | null;
  clubCrestPath: string | null;
  position: string;      // English abbreviation e.g. "ST", "CB", "GK"
  country: string;       // nationality, e.g. "England"
  countryFlagPath: string | null;
  age: number | string;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  display: string;
  playerName: string;
  photoPath: string | null;
  clubCrestPath: string | null;
  position: string;
  country: string;
  countryFlagPath: string | null;
  age: number | string;
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
    display: lvl.display,
    playerName: lvl.playerName,
    photoPath: lvl.photoPath,
    clubCrestPath: lvl.clubCrestPath,
    position: lvl.position,
    country: lvl.country,
    countryFlagPath: lvl.countryFlagPath,
    age: lvl.age,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
