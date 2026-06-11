// Ported/extended from the runner's js/formations.js.
// CANONICAL POSITIONS: every position sits at the SAME spot in EVERY formation.
// - Y (vertical band) is fixed per position name.
// - X depends only on HOW MANY of that position are in the line (2 CBs vs 3 CBs, etc).
// To move a position everywhere at once, edit POS_Y / POS_X below.
// (x: 0 = left … 100 = right, y: 0 = top/attack … 100 = own goal/GK.)
export type Role = "gk" | "def" | "mid" | "fwd";
export type Slot = { role: Role; position: string; x: number; y: number };
export type Formation = { id: string; label: string; slots: Slot[] };

const POS_Y: Record<string, number> = {
  "Goalkeeper": 99,
  "Centre-Back": 86,
  "Left-Back": 80,
  "Right-Back": 80,
  "Left Wing-Back": 60,
  "Right Wing-Back": 60,
  "Defensive Midfield": 68,
  "Central Midfield": 58,
  "Left Midfield": 50,
  "Right Midfield": 50,
  "Attacking Midfield": 23,
  "Left Winger": 17,
  "Right Winger": 17,
  "Centre-Forward": 12,
};

// X spread for a position, keyed by the count of that position in the line.
const POS_X: Record<string, Record<number, number[]>> = {
  "Goalkeeper": { 1: [50] },
  "Centre-Back": { 1: [50], 2: [34, 66], 3: [26, 50, 74] },
  "Left-Back": { 1: [8] },
  "Right-Back": { 1: [92] },
  "Left Wing-Back": { 1: [8] },
  "Right Wing-Back": { 1: [92] },
  "Defensive Midfield": { 1: [50], 2: [34, 66] },
  "Central Midfield": { 1: [50], 2: [36, 64], 3: [28, 50, 72] },
  "Left Midfield": { 1: [7] },
  "Right Midfield": { 1: [93] },
  "Attacking Midfield": { 1: [50], 2: [28, 72] },
  "Left Winger": { 1: [16] },
  "Right Winger": { 1: [84] },
  "Centre-Forward": { 1: [50], 2: [30, 70] },
};

// 3 centre-backs sit FLAT on one line (raised a little vs the 2-CB line so the
// central one still clears the keeper).
const CB3_Y = 81;

const layout = (defs: { role: Role; position: string }[]): Slot[] => {
  const groups: Record<string, number[]> = {};
  defs.forEach((dd, i) => ((groups[dd.position] ??= []).push(i)));
  const slots: Slot[] = new Array(defs.length);
  for (const name of Object.keys(groups)) {
    const idxs = groups[name];
    const xs = POS_X[name]?.[idxs.length] ?? POS_X[name]?.[1] ?? [50];
    idxs.forEach((slotIdx, k) => {
      let y = POS_Y[name] ?? 50;
      if (name === "Centre-Back" && idxs.length === 3) y = CB3_Y; // flat back three
      slots[slotIdx] = { role: defs[slotIdx].role, position: name, x: xs[k] ?? 50, y };
    });
  }
  return slots;
};

const gk = { role: "gk" as Role, position: "Goalkeeper" };
const d = (position: string) => ({ role: "def" as Role, position });
const m = (position: string) => ({ role: "mid" as Role, position });
const fw = (position: string) => ({ role: "fwd" as Role, position });
// Optional per-formation tweaks: override x and/or y for a position WITHOUT changing
// its canonical spot in other formations. A single object applies to every slot of
// that position; an array applies per-slot in order (e.g. the two CMs separately).
type Tweak = { x?: number; y?: number };
type Override = Record<string, Tweak | Tweak[]>;
const make = (
  id: string,
  label: string,
  defs: { role: Role; position: string }[],
  overrides?: Override,
): Formation => {
  const slots = layout(defs);
  if (overrides) {
    const seen: Record<string, number> = {};
    for (const s of slots) {
      const o = overrides[s.position];
      if (!o) continue;
      const i = seen[s.position] ?? 0;
      seen[s.position] = i + 1;
      const t = Array.isArray(o) ? o[i] : o;
      if (t?.x !== undefined) s.x = t.x;
      if (t?.y !== undefined) s.y = t.y;
    }
  }
  return { id, label, slots };
};

export const FORMATIONS: Formation[] = [
  make("3421", "3-4-2-1", [gk,
    d("Centre-Back"), d("Centre-Back"), d("Centre-Back"),
    m("Left Midfield"), m("Right Midfield"),
    m("Central Midfield"), m("Central Midfield"),
    m("Attacking Midfield"), m("Attacking Midfield"),
    fw("Centre-Forward")]),
  make("343", "3-4-3", [gk,
    d("Centre-Back"), d("Centre-Back"), d("Centre-Back"),
    d("Left Wing-Back"), d("Right Wing-Back"),
    m("Central Midfield"), m("Central Midfield"),
    fw("Left Winger"), fw("Centre-Forward"), fw("Right Winger")]),
  make("352", "3-5-2", [gk,
    d("Centre-Back"), d("Centre-Back"), d("Centre-Back"),
    d("Left Wing-Back"), d("Right Wing-Back"),
    m("Defensive Midfield"), m("Defensive Midfield"),
    m("Attacking Midfield"),
    fw("Centre-Forward"), fw("Centre-Forward")],
    { "Defensive Midfield": { y: 58 }, "Attacking Midfield": { y: 38 } }),
  make("4141", "4-1-4-1", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    m("Defensive Midfield"),
    m("Right Midfield"), m("Central Midfield"), m("Central Midfield"), m("Left Midfield"),
    fw("Centre-Forward")],
    // Midfield four moved up a little; the two central mids also spread wider.
    {
      "Right Midfield": { y: 45 },
      "Left Midfield": { y: 45 },
      "Central Midfield": [{ x: 31, y: 53 }, { x: 69, y: 53 }],
    }),
  make("433", "4-3-3", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    m("Central Midfield"), m("Central Midfield"), m("Central Midfield"),
    fw("Right Winger"), fw("Centre-Forward"), fw("Left Winger")]),
  make("4231", "4-2-3-1", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    m("Defensive Midfield"), m("Defensive Midfield"),
    m("Left Midfield"), m("Attacking Midfield"), m("Right Midfield"),
    fw("Centre-Forward")],
    // CDMs up, CAM down into the attacking-mid band.
    { "Defensive Midfield": { y: 60 }, "Attacking Midfield": { y: 48 } }),
  make("442", "4-4-2", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    m("Right Midfield"), m("Central Midfield"), m("Central Midfield"), m("Left Midfield"),
    fw("Centre-Forward"), fw("Centre-Forward")]),
  make("451", "4-5-1", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    // order matches the runner: left wide first, right wide last (so saved customXi maps by index)
    m("Left Midfield"), m("Central Midfield"), m("Central Midfield"), m("Central Midfield"), m("Right Midfield"),
    fw("Centre-Forward")]),
  make("41212", "4-1-2-1-2", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    m("Defensive Midfield"),
    m("Central Midfield"), m("Central Midfield"),
    m("Attacking Midfield"),
    fw("Centre-Forward"), fw("Centre-Forward")],
    // Widen both pairs (the two CMs and the two strikers) to open the diamond.
    {
      "Central Midfield": [{ x: 30 }, { x: 70 }],
      "Centre-Forward": [{ x: 27 }, { x: 73 }],
    }),
  make("4321", "4-3-2-1", [gk,
    d("Right-Back"), d("Centre-Back"), d("Centre-Back"), d("Left-Back"),
    m("Central Midfield"), m("Central Midfield"), m("Central Midfield"),
    m("Attacking Midfield"), m("Attacking Midfield"),
    fw("Centre-Forward")]),
  make("532", "5-3-2", [gk,
    d("Right Wing-Back"), d("Centre-Back"), d("Centre-Back"), d("Centre-Back"), d("Left Wing-Back"),
    m("Central Midfield"), m("Central Midfield"), m("Central Midfield"),
    fw("Centre-Forward"), fw("Centre-Forward")],
    // Midfield three pushed up.
    { "Central Midfield": { y: 51 } }),
  make("523", "5-2-3", [gk,
    d("Right Wing-Back"), d("Centre-Back"), d("Centre-Back"), d("Centre-Back"), d("Left Wing-Back"),
    m("Central Midfield"), m("Central Midfield"),
    fw("Right Winger"), fw("Centre-Forward"), fw("Left Winger")]),
];

export const FORMATION_LABELS = FORMATIONS.map((f) => f.label);
export const formationByLabel = (label: string): Formation =>
  FORMATIONS.find((f) => f.label === label) ?? FORMATIONS[4]; // default 4-3-3
export const formationById = (id: string): Formation =>
  FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[4];
