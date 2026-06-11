// Runner-2 data resolution. A level = ONE national team; the 11 players are the clues
// (their CLUB crest on the slot front), and the revealed answer is the national team
// (flag + name). build-data.mjs emits the full squad grouped by role; we pick the XI
// onto the formation here (role-fill, preferring players with a photo) — the same
// placement logic runner-1 uses, so the lineup looks like the play video.
import savesData from "./generated/saves.json";
import { formationById, formationByLabel, type Role } from "@shared/formations";
import type { SlotPlayer } from "@shared/components/PlayerSlot";

type RawPlayer = {
  name: string;
  display: string;
  club: string;
  group: string; // goalkeepers | defenders | midfielders | attackers
  clubCrestPath: string | null;
  photoPath: string | null;
};
type RawLevel = {
  teamName: string; // national team, e.g. "Brazil"
  countryFlagPath: string | null;
  formationId: string;
  // true → players[] is the SAVED XI in slot order (player i → formation slot i), so the
  // lineup + formation match the save file exactly (like runner 1's xiOrdered path).
  xiOrdered?: boolean;
  players: RawPlayer[];
  revealVoiceEn?: string | null;
  revealVoiceEs?: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  teamName: string;
  countryFlagPath: string | null;
  players: SlotPlayer[]; // exactly 11, with x/y from the formation
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

const toSlot = (p: RawPlayer, x: number, y: number): SlotPlayer => ({
  display: p.display,
  frontSrc: p.clubCrestPath, // the CLUE: player's club crest
  frontFit: "contain",
  backSrc: p.photoPath, // revealed: player photo
  x,
  y,
});

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
  formationLabel: string | null,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  const formation = formationLabel ? formationByLabel(formationLabel) : formationById(lvl.formationId);

  // SAVED XI: place player i directly at formation slot i — exactly the team + positions
  // from the save file (unless the formation is being overridden in the Studio props).
  if (lvl.xiOrdered && !formationLabel) {
    const players: SlotPlayer[] = formation.slots.map((slot, i) => {
      const p = lvl.players[i] ?? lvl.players[lvl.players.length - 1];
      return toSlot(p, slot.x, slot.y);
    });
    return {
      teamName: lvl.teamName,
      countryFlagPath: lvl.countryFlagPath,
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
    lvl.players.filter((p) => !used.has(p)).sort((a, b) => (b.photoPath ? 1 : 0) - (a.photoPath ? 1 : 0))[0];

  const players: SlotPlayer[] = formation.slots.map((slot) => {
    const pick = takeFrom(ROLE_GROUP[slot.role]) ?? takeAny();
    used.add(pick);
    return toSlot(pick, slot.x, slot.y);
  });

  return {
    teamName: lvl.teamName,
    countryFlagPath: lvl.countryFlagPath,
    players,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
