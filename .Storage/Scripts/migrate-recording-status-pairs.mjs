/**
 * Convert legacy [Name1, Name2, …] teamsImportText to line pairs.
 * Uses the same team alias table + matching as runner 1 saved-scripts.
 * Run: node .Storage/Scripts/migrate-recording-status-pairs.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");
const runnerAliasesPath = path.join(
  root,
  "1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js",
);

const TEAM_RUNNERS = new Set(["1", "7"]);
const NAT_RUNNERS = new Set(["2"]);
const PLAYER_RUNNERS = new Set(["3", "4", "5", "6", "8"]);

function foldTurkishLatinForImport(s) {
  return s
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ç/g, "c").replace(/Ç/g, "c");
}

function normalizeForImport(str) {
  if (!str) return "";
  return foldTurkishLatinForImport(
    String(str).trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/æ/g, "ae")
      .replace(/ð/g, "d")
      .replace(/þ/g, "th")
      .replace(/ß/g, "ss")
      .replace(/ł/g, "l").replace(/Ł/g, "l")
      .replace(/đ/g, "d").replace(/Đ/g, "d")
      .replace(/\//g, " ")
      .replace(/-/g, " ")
      .replace(/[''`´']/g, "")
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function loadTeamAliases() {
  const src = await fs.readFile(runnerAliasesPath, "utf8");
  const m = src.match(/const IMPORT_TEAM_ALIASES = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error("Could not read IMPORT_TEAM_ALIASES from runner saved-scripts.");
  return Function(`"use strict"; return ${m[1]};`)();
}

function resolveTeamAlias(normName, aliases) {
  return aliases[normName] ?? normName;
}

function findTeamEntry(rawName, allEntries, aliases) {
  const normTeam = resolveTeamAlias(normalizeForImport(rawName), aliases);
  let entry = allEntries.find((t) => normalizeForImport(t.name) === normTeam);
  if (!entry) {
    entry = allEntries.find(
      (t) =>
        normalizeForImport(t.name).includes(normTeam)
        || normTeam.includes(normalizeForImport(t.name)),
    );
  }
  return entry || null;
}

function parseLegacyNames(text) {
  let s = String(text || "").trim();
  if (!s) return [];
  if (s.startsWith("[")) s = s.slice(1);
  if (s.endsWith("]")) s = s.slice(0, -1);
  return s
    .split(/[\n,，]+/)
    .map((n) => n.trim().replace(/^["']+|["']+$/g, "").trim())
    .filter(Boolean);
}

function namesFromBlockText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[") || (raw.includes(",") && !raw.includes(" - "))) {
    return parseLegacyNames(raw);
  }
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.lastIndexOf(" - ");
      return idx > 0 ? line.slice(0, idx).trim() : line.trim();
    })
    .filter(Boolean);
}

async function buildPlayerClubMap(clubs) {
  /** @type {Map<string, Array<{club:string, playerName:string}>>} */
  const map = new Map();
  let scanned = 0;
  for (const club of clubs) {
    const rel = String(club.path || "").replace(/^\.\.\//, "");
    const squadPath = path.join(root, rel);
    let squad;
    try {
      squad = JSON.parse(await fs.readFile(squadPath, "utf8"));
    } catch {
      continue;
    }
    scanned++;
    const players = [
      ...(squad.goalkeepers || []),
      ...(squad.defenders || []),
      ...(squad.midfielders || []),
      ...(squad.attackers || []),
    ];
    for (const p of players) {
      if (!p?.name) continue;
      const key = normalizeForImport(p.name);
      const row = { club: p.club || club.name, playerName: p.name };
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  console.log(`Scanned ${scanned} squads for player → club lookup.`);
  return map;
}

function pickPlayerClub(rawName, playerMap) {
  const norm = normalizeForImport(rawName);
  const hits = playerMap.get(norm) || [];
  if (hits.length === 0) {
    const parts = String(rawName).trim().split(/\s+/);
    if (parts.length >= 2) {
      const surname = normalizeForImport(parts[parts.length - 1]);
      for (const [k, rows] of playerMap) {
        if (k.endsWith(` ${surname}`) || k.endsWith(surname)) hits.push(...rows);
      }
    }
  }
  if (hits.length === 0) return null;
  const exact = hits.find((h) => normalizeForImport(h.playerName) === norm);
  if (exact) return exact.club;
  const rawLower = String(rawName).trim().toLowerCase();
  const caseExact = hits.find((h) => h.playerName.trim().toLowerCase() === rawLower);
  if (caseExact) return caseExact.club;
  return hits[0].club;
}

function convertBlock(runnerId, text, { clubs, nats, allTeamEntries, aliases, playerMap }) {
  const names = namesFromBlockText(text);
  if (names.length === 0) return text;

  const lines = [];
  for (const name of names) {
    if (TEAM_RUNNERS.has(runnerId)) {
      const entry = findTeamEntry(name, clubs, aliases);
      lines.push(`${name} - ${entry?.country || "?"}`);
    } else if (NAT_RUNNERS.has(runnerId)) {
      const entry = findTeamEntry(name, nats, aliases);
      lines.push(`${name} - ${entry?.region || entry?.name || "?"}`);
    } else if (PLAYER_RUNNERS.has(runnerId)) {
      const club = pickPlayerClub(name, playerMap);
      lines.push(`${name} - ${club || "?"}`);
    } else {
      lines.push(name);
    }
  }
  return lines.join("\n");
}

const aliases = await loadTeamAliases();
const teamsIndex = JSON.parse(await fs.readFile(teamsIndexPath, "utf8"));
const clubs = teamsIndex.clubs || [];
const nats = teamsIndex.nationalities || [];
const allTeamEntries = [...clubs, ...nats];
const playerMap = await buildPlayerClubMap(clubs);

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
let converted = 0;

for (const [key, block] of Object.entries(store.blocks || {})) {
  const runnerId = String(key.split("|")[0] || "");
  const before = String(block.teamsImportText || "").trim();
  if (!before) continue;
  const after = convertBlock(runnerId, before, { clubs, nats, allTeamEntries, aliases, playerMap });
  if (after !== before) {
    block.teamsImportText = after;
    block.updatedAt = Date.now();
    converted++;
    console.log(`Converted ${key} (${block.name})`);
  }
}

await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Done. Converted ${converted} blocks.`);
