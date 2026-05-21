/**
 * Formation presets — flat pitch, x/y as % of the pitch box (left / top).
 * Slot `position` strings match Transfermarkt-style squad JSON (Squad Formation/*.json):
 * Goalkeeper, Centre-Back, Left-Back, Right-Back, Defensive Midfield, Central Midfield,
 * Attacking Midfield, Left Midfield, Right Midfield, Left Winger, Right Winger,
 * Centre-Forward, Second Striker.
 * `role` drives the picker (gk / def / mid / fwd). Slot coordinates avoid overlap of
 * circles, labels, and field lines.
 */
export const FORMATIONS = [
  // --- 3 AT THE BACK ---
  {
    id: "3421",
    label: "3-4-2-1",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      // 3 centre-backs — x order: LCB, CB, RCB
      { role: "def", position: "Centre-Back", x: 22, y: 80 },
      { role: "def", position: "Centre-Back", x: 50, y: 80 },
      { role: "def", position: "Centre-Back", x: 78, y: 80 },
      // Line of 4: wing-backs + double pivot
      { role: "def", position: "Left-Back", x: 12, y: 55 },
      { role: "def", position: "Right-Back", x: 88, y: 55 },
      { role: "mid", position: "Central Midfield", x: 36, y: 60 },
      { role: "mid", position: "Central Midfield", x: 64, y: 60 },
      // Two attacking midfielders behind the striker
      { role: "mid", position: "Attacking Midfield", x: 25, y: 30 },
      { role: "mid", position: "Attacking Midfield", x: 75, y: 30 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 22 },
    ],
  },
  {
    id: "343",
    label: "3-4-3",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Centre-Back", x: 22, y: 80 },
      { role: "def", position: "Centre-Back", x: 50, y: 80 },
      { role: "def", position: "Centre-Back", x: 78, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 50 },
      { role: "def", position: "Right-Back", x: 88, y: 50 },
      { role: "mid", position: "Central Midfield", x: 36, y: 55 },
      { role: "mid", position: "Central Midfield", x: 64, y: 55 },
      { role: "fwd", position: "Left Winger", x: 25, y: 22 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 22 },
      { role: "fwd", position: "Right Winger", x: 75, y: 22 },
    ],
  },
  {
    id: "352",
    label: "3-5-2",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Centre-Back", x: 22, y: 80 },
      { role: "def", position: "Centre-Back", x: 50, y: 80 },
      { role: "def", position: "Centre-Back", x: 78, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 55 },
      { role: "def", position: "Right-Back", x: 88, y: 55 },
      { role: "mid", position: "Defensive Midfield", x: 36, y: 60 },
      { role: "mid", position: "Defensive Midfield", x: 64, y: 60 },
      { role: "mid", position: "Attacking Midfield", x: 50, y: 42 },
      { role: "fwd", position: "Centre-Forward", x: 35, y: 22 },
      { role: "fwd", position: "Centre-Forward", x: 65, y: 22 },
    ],
  },

  // --- 4 AT THE BACK ---
  {
    id: "4141",
    label: "4-1-4-1",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 75 },
      { role: "def", position: "Centre-Back", x: 63, y: 80 },
      { role: "def", position: "Centre-Back", x: 37, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 75 },
      { role: "mid", position: "Defensive Midfield", x: 50, y: 62 },
      { role: "mid", position: "Right Winger", x: 88, y: 45 },
      { role: "mid", position: "Central Midfield", x: 64, y: 45 },
      { role: "mid", position: "Central Midfield", x: 36, y: 45 },
      { role: "mid", position: "Left Winger", x: 12, y: 45 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 18 },
    ],
  },
  {
    id: "433",
    label: "4-3-3",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 75 },
      { role: "def", position: "Centre-Back", x: 63, y: 80 },
      { role: "def", position: "Centre-Back", x: 37, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 75 },
      { role: "mid", position: "Central Midfield", x: 75, y: 52 },
      { role: "mid", position: "Central Midfield", x: 50, y: 52 },
      { role: "mid", position: "Central Midfield", x: 25, y: 52 },
      { role: "fwd", position: "Right Winger", x: 80, y: 22 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 22 },
      { role: "fwd", position: "Left Winger", x: 20, y: 22 },
    ],
  },
  {
    id: "4231",
    label: "4-2-3-1",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 80 },
      { role: "def", position: "Centre-Back", x: 63, y: 85 },
      { role: "def", position: "Centre-Back", x: 37, y: 85 },
      { role: "def", position: "Left-Back", x: 12, y: 80 },
      { role: "mid", position: "Defensive Midfield", x: 35, y: 57 },
      { role: "mid", position: "Defensive Midfield", x: 65, y: 57 },
      { role: "mid", position: "Left Midfield", x: 18, y: 40 },
      { role: "mid", position: "Attacking Midfield", x: 50, y: 42 },
      { role: "mid", position: "Right Midfield", x: 82, y: 40 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 15 },
    ],
  },
  {
    id: "442",
    label: "4-4-2",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 75 },
      { role: "def", position: "Centre-Back", x: 63, y: 80 },
      { role: "def", position: "Centre-Back", x: 37, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 75 },
      { role: "mid", position: "Right Midfield", x: 88, y: 45 },
      { role: "mid", position: "Central Midfield", x: 64, y: 50 },
      { role: "mid", position: "Central Midfield", x: 36, y: 50 },
      { role: "mid", position: "Left Midfield", x: 12, y: 45 },
      { role: "fwd", position: "Centre-Forward", x: 65, y: 22 },
      { role: "fwd", position: "Centre-Forward", x: 35, y: 22 },
    ],
  },
  {
    id: "451",
    label: "4-5-1",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 75 },
      { role: "def", position: "Centre-Back", x: 63, y: 80 },
      { role: "def", position: "Centre-Back", x: 37, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 75 },
      { role: "mid", position: "Attacking Midfield", x: 12, y: 37 },
      { role: "mid", position: "Central Midfield", x: 30, y: 52 },
      { role: "mid", position: "Central Midfield", x: 50, y: 61 },
      { role: "mid", position: "Central Midfield", x: 70, y: 52 },
      { role: "mid", position: "Attacking Midfield", x: 88, y: 37 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 22 },
    ],
  },
  {
    id: "41212",
    label: "4-1-2-1-2",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 75 },
      { role: "def", position: "Centre-Back", x: 63, y: 80 },
      { role: "def", position: "Centre-Back", x: 37, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 75 },
      { role: "mid", position: "Defensive Midfield", x: 50, y: 62 },
      { role: "mid", position: "Central Midfield", x: 75, y: 50 },
      { role: "mid", position: "Central Midfield", x: 25, y: 50 },
      { role: "mid", position: "Attacking Midfield", x: 50, y: 40 },
      { role: "fwd", position: "Centre-Forward", x: 65, y: 22 },
      { role: "fwd", position: "Centre-Forward", x: 35, y: 22 },  
    ],
  },
  {
    id: "4321",
    label: "4-3-2-1",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 75 },
      { role: "def", position: "Centre-Back", x: 63, y: 80 },
      { role: "def", position: "Centre-Back", x: 37, y: 80 },
      { role: "def", position: "Left-Back", x: 12, y: 75 },
      { role: "mid", position: "Central Midfield", x: 73, y: 55 },
      { role: "mid", position: "Central Midfield", x: 50, y: 55 },
      { role: "mid", position: "Central Midfield", x: 27, y: 55 },
      { role: "mid", position: "Attacking Midfield", x: 70, y: 28 },
      { role: "mid", position: "Attacking Midfield", x: 30, y: 28 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 22 },
    ],
  },

  // --- 5 AT THE BACK ---
  {
    id: "532",
    label: "5-3-2",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 64 },
      { role: "def", position: "Centre-Back", x: 74, y: 81 },
      { role: "def", position: "Centre-Back", x: 50, y: 81 },
      { role: "def", position: "Centre-Back", x: 26, y: 81 },
      { role: "def", position: "Left-Back", x: 12, y: 64 },
      { role: "mid", position: "Central Midfield", x: 50, y: 46 },
      { role: "mid", position: "Central Midfield", x: 74, y: 46 },
      { role: "mid", position: "Central Midfield", x: 26, y: 46 },
      { role: "fwd", position: "Centre-Forward", x: 65, y: 18 },
      { role: "fwd", position: "Centre-Forward", x: 35, y: 18 },
    ],
  },
  {
    id: "523",
    label: "5-2-3",
    slots: [
      { role: "gk", position: "Goalkeeper", x: 50, y: 98 },
      { role: "def", position: "Right-Back", x: 88, y: 64 },
      { role: "def", position: "Centre-Back", x: 74, y: 81 },
      { role: "def", position: "Centre-Back", x: 50, y: 81 },
      { role: "def", position: "Centre-Back", x: 26, y: 81 },
      { role: "def", position: "Left-Back", x: 12, y: 64 },
      { role: "mid", position: "Central Midfield", x: 64, y: 50 },
      { role: "mid", position: "Central Midfield", x: 36, y: 50 },
      { role: "fwd", position: "Right Winger", x: 75, y: 22 },
      { role: "fwd", position: "Centre-Forward", x: 50, y: 22 },
      { role: "fwd", position: "Left Winger", x: 25, y: 22 },
    ],
  },
];

export function formationById(id) {
  return (
    FORMATIONS.find((f) => f.id === id) ||
    FORMATIONS.find((f) => f.id === "433") ||
    FORMATIONS[0]
  );
}

/** Shorts 4-2-3-1: nudge the 2+3+1 lines toward own goal (y+), not the back four. */
const SHORTS_4231_MID_FWD_Y_NUDGE = 7;
const SHORTS_4231_MID_FWD_SLOT_START = 5;
const SHORTS_4231_MID_FWD_SLOT_END = 10;

export function effectiveSlotCoords(formationId, slotIndex, slot) {
  if (!slot) return slot;
  const shorts =
    typeof document !== "undefined" &&
    (document.body?.classList.contains("shorts-mode") ||
      document.documentElement?.classList.contains("shorts-mode"));
  if (
    !shorts ||
    formationId !== "4231" ||
    slotIndex < SHORTS_4231_MID_FWD_SLOT_START ||
    slotIndex > SHORTS_4231_MID_FWD_SLOT_END
  ) {
    return slot;
  }
  return { ...slot, y: slot.y + SHORTS_4231_MID_FWD_Y_NUDGE };
}