// Runner-6 data resolution. A level = ONE player. The four-param grid shows
// club crest + position + country flag + shirt number — but one card shows a
// FAKE value, and on reveal that card flips to show the real value.
// build-data.mjs emits the full player data including which stat is fake and what
// both the fake and real values are.
import savesData from "./generated/saves.json";

export type FakeStat = "club" | "position" | "country" | "shirt_number";

export type ResolvedLevel = {
  display: string;
  playerName: string;
  photoPath: string | null;

  // Real values (displayed in normal cells + flip-back face)
  club: string;
  clubCrestPath: string | null;
  position: string;           // abbreviated, e.g. "CB"
  country: string;
  countryFlagPath: string | null;
  shirtNumber: string;        // e.g. "4" or "—"

  // Fake data
  fakeStat: FakeStat;
  fakeValue: string;
  fakeClubCrestPath: string | null;
  fakeCountryFlagPath: string | null;

  // Reveal voices (relative path under public, or null)
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

type RawLevel = {
  display: string;
  playerName: string;
  photoPath: string | null;
  club: string;
  clubCrestPath: string | null;
  position: string;
  country: string;
  countryFlagPath: string | null;
  shirtNumber: string;
  fakeStat: FakeStat;
  fakeValue: string;
  fakeClubCrestPath: string | null;
  fakeCountryFlagPath: string | null;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

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
    club: lvl.club,
    clubCrestPath: lvl.clubCrestPath,
    position: lvl.position,
    country: lvl.country,
    countryFlagPath: lvl.countryFlagPath,
    shirtNumber: lvl.shirtNumber,
    fakeStat: lvl.fakeStat,
    fakeValue: lvl.fakeValue,
    fakeClubCrestPath: lvl.fakeClubCrestPath ?? null,
    fakeCountryFlagPath: lvl.fakeCountryFlagPath ?? null,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
