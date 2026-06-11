// Runner-4 data resolution. A level = ONE player; the clues are career stats
// (games, position, goals/assists or GK-specific stats) + a clubs history grid
// + nationality flag. The player silhouette is shown during the question; the
// full-colour photo + player name is revealed at REVEAL_START.
// build-data.mjs resolves full player records from squad JSONs and emits saves.json.
import savesData from "./generated/saves.json";

type RawClub = {
  club: string;
  crestPath: string | null;
};

type RawLevel = {
  display: string;       // short display name (last name)
  playerName: string;    // full name as typed in the save
  photoPath: string | null;
  isGK: boolean;
  games: number | string;
  position: string;      // human-readable position bucket e.g. "Forward", "Goalkeeper"
  goals: number | string;
  assists: number | string;
  goalsConceded: number | string;
  cleanSheets: number | string;
  clubs: RawClub[];
  country: string;       // nationality, e.g. "England"
  countryFlagPath: string | null;
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
  isGK: boolean;
  games: number | string;
  position: string;
  goals: number | string;
  assists: number | string;
  goalsConceded: number | string;
  cleanSheets: number | string;
  clubs: RawClub[];
  country: string;
  countryFlagPath: string | null;
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
    isGK: lvl.isGK,
    games: lvl.games,
    position: lvl.position,
    goals: lvl.goals,
    assists: lvl.assists,
    goalsConceded: lvl.goalsConceded,
    cleanSheets: lvl.cleanSheets,
    clubs: lvl.clubs,
    country: lvl.country,
    countryFlagPath: lvl.countryFlagPath,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
