import savesData from "./generated/saves.json";
import { formationById, formationByLabel, type Role } from "./formations";

type RawPlayer = {
  name: string;
  display: string;
  position: string;
  group: string;
  nationality: string;
  flagPath: string | null;
  photoPath: string | null;
};
type RawLevel = {
  teamName: string;
  crestPath: string | null;
  country: string;
  flagPath: string | null;
  formationId: string;
  // true → players[] is already the saved XI in slot order (player i → formation slot i)
  xiOrdered?: boolean;
  players: RawPlayer[];
  // pre-resolved spoken team-name reveal voice (null when the team has no recording)
  revealVoiceEn?: string | null;
  revealVoiceEs?: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedPlayer = {
  display: string;
  name: string;
  nationality: string;
  flagPath: string | null;
  photoPath: string | null;
  x: number;
  y: number;
};
export type ResolvedLevel = {
  teamName: string;
  crestPath: string | null;
  country: string;
  countryFlagPath: string | null;
  players: ResolvedPlayer[]; // exactly 11
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

const ROLE_GROUP: Record<Role, string> = {
  gk: "goalkeepers",
  def: "defenders",
  mid: "midfielders",
  fwd: "attackers",
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

// Resolve a save + level number (+ optional formation override) into a final XI
// laid out on the formation, preferring players that actually have a photo.
export const resolveLevel = (
  saveName: string,
  levelNumber: number,
  formationLabel: string | null,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  const formation = formationLabel
    ? formationByLabel(formationLabel)
    : formationById(lvl.formationId);

  // SAVED XI: when the level carries its real lineup in slot order (and the formation
  // isn't being overridden), place player i directly at formation slot i — exactly the
  // team/positions from the saved file (the play-video behaviour).
  if (lvl.xiOrdered && !formationLabel) {
    const players: ResolvedPlayer[] = formation.slots.map((slot, i) => {
      const p = lvl.players[i] ?? lvl.players[lvl.players.length - 1];
      return {
        display: p.display,
        name: p.name,
        nationality: p.nationality,
        flagPath: p.flagPath,
        photoPath: p.photoPath,
        x: slot.x,
        y: slot.y,
      };
    });
    return {
      teamName: lvl.teamName,
      crestPath: lvl.crestPath,
      country: lvl.country,
      countryFlagPath: lvl.flagPath,
      players,
      revealVoiceEn: lvl.revealVoiceEn ?? null,
      revealVoiceEs: lvl.revealVoiceEs ?? null,
    };
  }

  // Group players; within each group put ones WITH a photo first (stable order).
  const byGroup: Record<string, RawPlayer[]> = {
    goalkeepers: [],
    defenders: [],
    midfielders: [],
    attackers: [],
  };
  for (const p of lvl.players) (byGroup[p.group] ??= []).push(p);
  for (const g of Object.keys(byGroup)) {
    byGroup[g] = byGroup[g]
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (b.p.photoPath ? 1 : 0) - (a.p.photoPath ? 1 : 0) || a.i - b.i)
      .map((x) => x.p);
  }

  const used = new Set<RawPlayer>();
  const takeFrom = (g: string) => byGroup[g]?.find((p) => !used.has(p));
  const takeAny = () =>
    lvl.players
      .filter((p) => !used.has(p))
      .sort((a, b) => (b.photoPath ? 1 : 0) - (a.photoPath ? 1 : 0))[0];

  const players: ResolvedPlayer[] = formation.slots.map((slot) => {
    const pick = takeFrom(ROLE_GROUP[slot.role]) ?? takeAny();
    used.add(pick);
    return {
      display: pick.display,
      name: pick.name,
      nationality: pick.nationality,
      flagPath: pick.flagPath,
      photoPath: pick.photoPath,
      x: slot.x,
      y: slot.y,
    };
  });

  return {
    teamName: lvl.teamName,
    crestPath: lvl.crestPath,
    country: lvl.country,
    countryFlagPath: lvl.flagPath,
    players,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
