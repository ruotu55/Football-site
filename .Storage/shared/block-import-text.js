/**
 * Resolve the levels import text shown in calendar / runner save modals.
 * Prefers stored teamsImportText; falls back to legacy embedded script.levels.
 */

function levelDisplayName(lvl) {
  if (!lvl || typeof lvl !== "object") return "";
  return String(
    lvl.searchText ||
    lvl.currentSquad?.name ||
    lvl.selectedEntry?.name ||
    lvl.playerName ||
    "",
  ).trim();
}

function levelPairRight(lvl) {
  if (!lvl || typeof lvl !== "object") return "";
  return String(
    lvl.selectedEntry?.country ||
    lvl.currentSquad?.country ||
    lvl.selectedEntry?.club ||
    lvl.currentSquad?.club ||
    lvl.country ||
    lvl.club ||
    lvl.region ||
    "",
  ).trim();
}

export function extractTeamsImportTextFromScript(script) {
  if (!script || !Array.isArray(script.levels)) return "";
  const lines = [];
  for (const lvl of script.levels) {
    if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro) continue;
    const name = levelDisplayName(lvl);
    if (!name) continue;
    const right = levelPairRight(lvl);
    lines.push(right ? `${name} - ${right}` : name);
  }
  return lines.join("\n");
}

export function blockTeamsImportText(block) {
  if (!block || typeof block !== "object") return "";
  const stored = String(block.teamsImportText || "").trim();
  if (stored) return stored;
  return extractTeamsImportTextFromScript(block.script);
}

export function hydrateLegacyBlocks(rawBlocks) {
  if (!rawBlocks || typeof rawBlocks !== "object") return;
  for (const block of Object.values(rawBlocks)) {
    if (!block || typeof block !== "object") continue;
    if (!String(block.teamsImportText || "").trim() && block.script) {
      const derived = extractTeamsImportTextFromScript(block.script);
      if (derived) block.teamsImportText = derived;
    }
  }
}
