/**
 * Add Guess The Football National Team (runner 2) long-form blocks to the calendar store.
 * Run: node .Storage/Scripts/add-national-team-blocks.mjs
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

const COMPETITIONS = [
  {
    episode: 1,
    name: "World Cup",
    teams: [
      "Argentina", "Brazil", "France", "England", "Spain", "Germany", "Portugal", "Netherlands",
      "USA", "Ghana", "Belgium", "Uruguay", "Croatia", "Morocco", "Colombia", "Japan", "Senegal",
      "Switzerland", "South Korea", "Australia", "Ivory Coast", "Egypt", "Norway", "Sweden",
      "Türkiye", "Austria", "Scotland", "Ecuador", "South Africa", "Bosnia And Herzegovina",
    ],
  },
  {
    episode: 2,
    name: "Euro",
    teams: [
      "France", "Spain", "England", "Portugal", "Netherlands", "Belgium", "Germany", "Italy",
      "Croatia", "Switzerland", "Denmark", "Austria", "Turkey", "Ukraine", "Poland", "Scotland",
      "Hungary", "Serbia", "Czech Republic", "Romania", "Slovakia", "Norway", "Sweden", "Slovenia",
      "Georgia", "Albania", "Greece", "Wales", "Republic of Ireland", "Iceland",
    ],
  },
  {
    episode: 3,
    name: "Mixed teams",
    teams: [
      "France", "Spain", "Argentina", "England", "Portugal", "Brazil", "Netherlands", "Morocco",
      "Belgium", "Germany", "Croatia", "Italy", "Colombia", "Senegal", "Mexico", "USA", "Uruguay",
      "Japan", "Switzerland", "Denmark", "Iran", "Turkey", "Ecuador", "Austria", "South Korea",
      "Nigeria", "Australia", "Algeria", "Egypt", "Canada",
    ],
  },
  {
    episode: 4,
    name: "Mixed teams",
    teams: [
      "France", "Spain", "Brazil", "England", "Argentina", "Norway", "Ukraine", "Panama",
      "Ivory Coast", "Poland", "Wales", "Sweden", "Serbia", "Paraguay", "Czech Republic", "Hungary",
      "Scotland", "Tunisia", "Cameroon", "DR Congo", "Greece", "Slovakia", "Venezuela", "Uzbekistan",
      "Costa Rica", "Mali", "Peru", "Chile", "Qatar", "Romania",
    ],
  },
  {
    episode: 5,
    name: "Mixed teams",
    teams: [
      "France", "Spain", "Brazil", "England", "Argentina", "South Africa", "Saudi Arabia", "Iraq",
      "Burkina Faso", "Jordan", "Albania", "Bosnia & Herzegovina", "Honduras", "North Macedonia",
      "United Arab Emirates", "Cape Verde", "Northern Ireland", "Jamaica", "Georgia", "Finland",
      "Ghana", "Iceland", "Bolivia", "Israel", "Kosovo", "Oman", "Guinea", "Montenegro", "Curacao",
      "Haiti",
    ],
  },
];

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
  if (!m) throw new Error("Could not read IMPORT_TEAM_ALIASES.");
  return Function(`"use strict"; return ${m[1]};`)();
}

function resolveTeamAlias(normName, aliases) {
  const extra = {
    "dr congo": "democratic republic of the congo",
    "bosnia & herzegovina": "bosnia and herzegovina",
    "bosnia and herzegovina": "bosnia and herzegovina",
    "turkey": "turkiye",
    "usa": "united states",
    "ivory coast": "ivory coast",
    "curacao": "curacao",
  };
  return extra[normName] ?? aliases[normName] ?? normName;
}

function findNatEntry(rawName, nats, aliases) {
  const normTeam = resolveTeamAlias(normalizeForImport(rawName), aliases);
  const exact = nats.filter((t) => normalizeForImport(t.name) === normTeam);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.find((t) => t.region === "Europe") || exact[0];
  }
  let entry = nats.find(
    (t) =>
      normalizeForImport(t.name).includes(normTeam)
      || normTeam.includes(normalizeForImport(t.name)),
  );
  if (!entry && normTeam === "kosovo") {
    return { name: "Kosovo", region: "Europe" };
  }
  return entry || null;
}

function toPairLines(names, nats, aliases) {
  return names
    .map((name) => {
      const entry = findNatEntry(name, nats, aliases);
      return `${name} - ${entry?.region || entry?.name || "?"}`;
    })
    .join("\n");
}

const aliases = await loadTeamAliases();
const teamsIndex = JSON.parse(await fs.readFile(teamsIndexPath, "utf8"));
const nats = teamsIndex.nationalities || [];

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
if (!store.blocks || typeof store.blocks !== "object") store.blocks = {};

for (const comp of COMPETITIONS) {
  const key = `2|long|${comp.episode}`;
  const previous = store.blocks[key] || {};
  store.blocks[key] = {
    ...previous,
    name: comp.name,
    teamsImportText: toPairLines(comp.teams, nats, aliases),
    script: previous.script && typeof previous.script === "object" ? previous.script : {},
    recorded: previous.recorded && typeof previous.recorded === "object"
      ? previous.recorded
      : { english: null, spanish: null },
    video: previous.video && typeof previous.video === "object" ? previous.video : {},
    youtube: previous.youtube && typeof previous.youtube === "object" ? previous.youtube : {},
    updatedAt: Date.now(),
  };
  console.log(`Added ${key}: ${comp.name} (${comp.teams.length} teams)`);
}

await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log("Done — 5 national-team long-form blocks saved.");
