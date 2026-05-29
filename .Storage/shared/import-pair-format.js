/**
 * Import format: one line per level as "Left - Right".
 * - Team / club runners: Team - Country
 * - National-team runner: Country - Region
 * - Player runners: Player - Team
 *
 * Legacy `[Name1, Name2, …]` comma lists still parse for import.
 */

import { manualClubForPlayer } from "./import-player-manual-clubs.js";

export function parsePairLine(line) {
  const idx = line.lastIndexOf(" - ");
  if (idx <= 0) return null;
  const left = line.slice(0, idx).trim();
  const right = line.slice(idx + 3).trim();
  if (!left || !right) return null;
  return { left, right };
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function looksLikeLegacyList(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (raw.startsWith("[")) return true;
  const lines = splitLines(raw);
  if (lines.length === 1 && raw.includes(",") && !raw.includes(" - ")) return true;
  return lines.length > 0 && lines.every((l) => !parsePairLine(l));
}

function isPairLineFormat(text) {
  const lines = splitLines(text);
  return lines.length > 0 && lines.every((l) => parsePairLine(l));
}

/**
 * @param {"team-country"|"player-team"} entryType
 */
export function parseImportPairText(text, { entryType = "team-country" } = {}) {
  const raw = String(text || "").trim();
  if (!raw || !isPairLineFormat(raw)) return null;

  const entries = [];
  for (const line of splitLines(raw)) {
    const pair = parsePairLine(line);
    if (!pair) {
      return { error: `Invalid line "${line}". Use "Left - Right", one per line.` };
    }
    entries.push({ type: entryType, left: pair.left, right: pair.right, raw: line });
  }
  if (entries.length === 0) {
    return { error: "No levels found. Use one line per level: Left - Right" };
  }
  return { entries };
}

export function parseLegacyImportList(text, { itemLabel = "items" } = {}) {
  let s = String(text || "").trim().replace(/^\uFEFF/, "");
  if (!s) return { error: "Paste the import text first." };
  if (s.startsWith("[")) s = s.slice(1);
  if (s.endsWith("]")) s = s.slice(0, -1);
  const names = s
    .split(/[\n,，]+/)
    .map((n) => String(n || "").trim())
    .map((n) => n.replace(/^["']+|["']+$/g, "").trim())
    .filter(Boolean);
  if (names.length === 0) {
    return { error: `No ${itemLabel} found.` };
  }
  return { names };
}

/**
 * @param {"teams"|"players"|"names"|"items"} legacyItemLabel
 * @param {"team-country"|"player-team"} entryType
 */
export function parseImportText(text, { legacyItemLabel = "items", entryType = "team-country" } = {}) {
  const pairParsed = parseImportPairText(text, { entryType });
  if (pairParsed) return pairParsed;
  if (looksLikeLegacyList(text)) {
    return parseLegacyImportList(text, { itemLabel: legacyItemLabel });
  }
  const lines = splitLines(text);
  if (lines.length === 1 && parsePairLine(lines[0])) {
    return parseImportPairText(text, { entryType });
  }
  return parseLegacyImportList(text, { itemLabel: legacyItemLabel });
}

/** Team runners: left side is the team / country name to resolve. */
export function teamNamesFromPairEntries(entries) {
  return entries.map((e) => e.left);
}

export function formatPairLines(entries) {
  return entries.map((e) => `${e.left} - ${e.right}`).join("\n");
}

export function namesToPairLines(names, rightForName) {
  return names
    .map((name) => {
      const right = rightForName(name);
      return right ? `${name} - ${right}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

export function matchTeamNameLoose(normalize, playerClub, teamName) {
  const a = normalize(playerClub || "");
  const b = normalize(teamName || "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function matchCountryLoose(normalize, playerNat, countryName) {
  const a = normalize(playerNat || "");
  const b = normalize(countryName || "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function findClubEntryLoose(teamName, clubs, normalize) {
  if (!Array.isArray(clubs) || clubs.length === 0) return null;
  const norm = normalize(teamName || "");
  if (!norm) return null;
  let hit = clubs.find((c) => normalize(c?.name || "") === norm);
  if (hit) return hit;
  hit = clubs.find((c) => {
    const cn = normalize(c?.name || "");
    return cn.includes(norm) || norm.includes(cn);
  });
  return hit || null;
}

export function findNatEntryLoose(name, nationalities, normalize) {
  if (!Array.isArray(nationalities) || nationalities.length === 0) return null;
  const norm = normalize(name || "");
  if (!norm) return null;
  let hit = nationalities.find((n) => normalize(n?.name || "") === norm);
  if (hit) return hit;
  hit = nationalities.find((n) => {
    const nn = normalize(n?.name || "");
    return nn.includes(norm) || norm.includes(nn);
  });
  return hit || null;
}

/**
 * Resolve pair lines to players (Player - Team format).
 */
export async function resolvePairEntriesForPlayers(entries, {
  allPlayers,
  clubs,
  findAllPlayerCandidates,
  normalizeForImport,
  applyImportAliasesToNames,
}) {
  const errors = [];
  const searchableNames = new Set();
  const resolved = [];

  const aliased = [];
  for (const e of entries) {
    const left = (await applyImportAliasesToNames([e.left]))[0];
    const right = (await applyImportAliasesToNames([e.right]))[0];
    aliased.push({ ...e, left, right });
  }

  for (const e of aliased) {
    const manualClub = manualClubForPlayer(e.left);
    const clubName = manualClub || e.right;

    const cands = findAllPlayerCandidates(e.left, allPlayers);
    if (cands.length === 0) {
      errors.push(`❌ ${e.left}: player not found.`);
      searchableNames.add(e.left);
      continue;
    }
    if (cands.length > 1 && !manualClub) {
      errors.push(`❌ ${e.left}: multiple players match — search to disambiguate.`);
      searchableNames.add(e.left);
      continue;
    }
    const player = manualClub && cands.length > 1
      ? cands.find((p) => matchTeamNameLoose(normalizeForImport, p?.club, clubName)) || cands[0]
      : cands[0];
    const clubItem = findClubEntryLoose(clubName, clubs, normalizeForImport);
    if (!clubItem) {
      errors.push(`❌ ${e.left} - ${clubName}: team "${clubName}" not found.`);
      searchableNames.add(`${e.left} - ${clubName}`);
      continue;
    }
    resolved.push({ player: { ...player, club: clubName }, clubItem, label: e.left });
  }

  return { resolved, errors, searchableNames };
}
