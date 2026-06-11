// Runner-7 data resolution. A level = ONE club team; the crest is the clue (shown
// obscured during the question), and the team name is revealed at the flip.
import savesData from "./generated/saves.json";

type RawLevel = {
  teamName: string;
  crestPath: string | null;
  revealVoiceEn?: string | null;
  revealVoiceEs?: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  teamName: string;
  crestPath: string | null;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
  // formation is not used for this runner (no pitch), kept for API compatibility
  _formationLabel: string | null,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  return {
    teamName: lvl.teamName,
    crestPath: lvl.crestPath,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
