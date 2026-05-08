function sideForSlotIndex(i, n, role) {
  if (n === 1) return "center";
  if (role === "fwd" && n === 2) return "center";
  if (i === 0) return "left";
  if (i === n - 1) return "right";
  return "center";
}

function normalizeDefPos(p) {
  const s = (p.position || "").toLowerCase();
  if (s.includes("left") && (s.includes("back") || s.includes("wing"))) return "left";
  if (s.includes("right") && (s.includes("back") || s.includes("wing"))) return "right";
  if (s.includes("centre") || s.includes("center")) return "center";
  return "flex";
}

function normalizeMidPos(p) {
  const s = (p.position || "").toLowerCase();
  if (s.includes("left")) return "left";
  if (s.includes("right")) return "right";
  return "center";
}

function normalizeFwdPos(p) {
  const s = (p.position || "").toLowerCase();
  if (s.includes("left") && s.includes("wing")) return "left";
  if (s.includes("right") && s.includes("wing")) return "right";
  if (s.includes("centre") || s.includes("center") || s.includes("forward") || s.includes("striker"))
    return "center";
  return "flex";
}

function defMatches(p, side) {
  const c = normalizeDefPos(p);
  if (c === "flex") return false;
  return c === side;
}

function midMatches(p, side) {
  const c = normalizeMidPos(p);
  if (c === "center" && (side === "left" || side === "right")) {
    return false;
  }
  return c === side;
}

function fwdMatches(p, side) {
  const c = normalizeFwdPos(p);
  if (c === "flex") return false;
  return c === side;
}

function defMatchesSlot(p, side, slotPosition) {
  const slot = String(slotPosition || "").trim();
  const playerPos = String(p.position || "").trim();
  if (slot && playerPos === slot) {
    if (slot === "Centre-Back") return defMatches(p, side);
    return true;
  }
  return defMatches(p, side);
}

function midMatchesSlot(p, side, slotPosition) {
  const slot = String(slotPosition || "").trim();
  const playerPos = String(p.position || "").trim();
  if (slot && playerPos === slot) {
    return true;
  }
  if (slot === "Central Midfield") {
    if (playerPos !== "Central Midfield") return false;
    return midMatches(p, side);
  }
  if (slot === "Left Midfield" || slot === "Right Midfield") {
    return midMatches(p, side);
  }
  return false;
}

function midBandMatch(p, slotPosition) {
  const slot = String(slotPosition || "").trim();
  const pos = String(p.position || "").trim();
  if (slot === "Defensive Midfield") return pos === "Defensive Midfield";
  if (slot === "Attacking Midfield") return pos === "Attacking Midfield";
  if (slot === "Central Midfield") return pos === "Central Midfield";
  if (slot === "Left Midfield") return pos === "Left Midfield";
  if (slot === "Right Midfield") return pos === "Right Midfield";
  return false;
}

function fwdMatchesSlot(p, side, slotPosition) {
  const slot = String(slotPosition || "").trim();
  const playerPos = String(p.position || "").trim();
  if (slot && playerPos === slot) {
    if (slot === "Centre-Forward") return fwdMatches(p, side);
    return true;
  }
  return fwdMatches(p, side);
}

function assignRoleToSlots(pool, slotInfos, role, matchStrict, matchFlex) {
  const sorted = [...pool].sort((a, b) => (b.appearances || 0) - (a.appearances || 0));
  const used = new Set();
  const out = [];
  const n = slotInfos.length;

  for (let si = 0; si < n; si++) {
    const { i: slotIndex, position: slotPos } = slotInfos[si];
    const side = sideForSlotIndex(si, n, role);
    let cand = sorted.filter((p) => !used.has(p) && matchStrict(p, side, slotPos));
    if (!cand.length && role === "mid") {
      cand = sorted.filter((p) => !used.has(p) && midBandMatch(p, slotPos));
    }
    if (!cand.length) cand = sorted.filter((p) => !used.has(p) && matchFlex(p));
    if (!cand.length) cand = sorted.filter((p) => !used.has(p));
    const pick = cand[0] ?? null;
    if (pick) used.add(pick);
    out.push({ slotIndex, player: pick });
  }
  return out;
}

export function pickStartingXI(formation, squad) {
  const pools = {
    gk: [...(squad.goalkeepers || [])],
    def: [...(squad.defenders || [])],
    mid: [...(squad.midfielders || [])],
    fwd: [...(squad.attackers || [])],
  };
  const xi = new Array(formation.slots.length).fill(null);

  const collectSlots = (role) =>
    formation.slots
      .map((s, i) => ({ i, x: s.x, y: s.y, r: s.role, position: s.position }))
      .filter((s) => s.r === role)
      .sort((a, b) => a.x - b.x || b.y - a.y);

  const apply = (role, matchStrict, matchFlex) => {
    const slotInfos = collectSlots(role);
    const picked = assignRoleToSlots(pools[role], slotInfos, role, matchStrict, matchFlex);
    for (const { slotIndex, player } of picked) {
      xi[slotIndex] = player;
    }
  };

  apply("gk", () => true, () => true);
  apply("def", defMatchesSlot, (p) => normalizeDefPos(p) === "flex");
  apply("mid", midMatchesSlot, () => false);
  apply("fwd", fwdMatchesSlot, (p) => normalizeFwdPos(p) === "flex");
  return xi;
}
