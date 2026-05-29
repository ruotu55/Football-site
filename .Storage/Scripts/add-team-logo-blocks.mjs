/**
 * Add Guess The Team Logo (runner 7) long-form blocks.
 * Run: node .Storage/Scripts/add-team-logo-blocks.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");
const runnerAliasesPath = path.join(
  root,
  "7_Guess The Football Team Logo Name - Main Runner - Regular/js/saved-scripts.js",
);

const RUNNER_ID = 7;
const TYPE = "long";

/** Extra aliases for seed script (DB name differs from import label). */
const SEED_EXTRA_ALIASES = {
  "rb salzburg": "red bull salzburg",
  "legia warsaw": "legia warszawa",
  "qpr": "queens park rangers",
  "rapid wien": "rapid vienna",
  "steaua bucharest": "fcsb",
};

/** Teams not in squad DB — country only. */
const SEED_MANUAL_COUNTRIES = {
  bordeaux: "France",
  maribor: "Slovenia",
  tenerife: "Spain",
};

const COMPETITIONS = [
  {
    episode: 1,
    name: "Mixed",
    teams: [
      "Real Madrid", "Manchester City", "Paris Saint-Germain", "Bayern Munich", "Inter Milan", "Manchester United",
      "AC Milan", "River Plate", "Sporting CP", "Juventus", "Brighton", "Athletic Bilbao", "Wolfsburg", "Torino",
      "Lille", "Everton", "Celta Vigo", "Borussia Mönchengladbach", "Monza", "OGC Nice", "Wolverhampton",
      "Real Betis", "Hoffenheim", "Bologna", "Lyon", "Crystal Palace", "Getafe", "Freiburg", "Sassuolo", "Fulham",
      "Valencia", "Mainz", "Genoa", "Stade Rennais", "Brentford", "Mallorca", "Udinese", "Leicester City",
      "Boca Juniors", "Al Nassr", "Bodo/Glimt", "Celtic", "Besiktas", "RB Salzburg", "Shakhtar Donetsk",
      "Slavia Prague", "Young Boys", "Rangers", "Sparta Prague", "Dinamo Zagreb",
    ],
  },
  {
    episode: 2,
    name: "Mixed",
    teams: [
      "Barcelona", "Liverpool", "Bayern Munich", "Atletico Madrid", "Chelsea", "Porto", "Al Hilal", "Arsenal",
      "Borussia Dortmund", "Tottenham", "Newcastle", "Sevilla", "Atalanta", "Marseille", "RB Leipzig", "Espanyol",
      "Braga", "Schalke", "Vitoria Guimarães", "Alaves", "Union Berlin", "Hellas Verona", "Montpellier",
      "Leeds United", "Osasuna", "Werder Bremen", "Empoli", "Strasbourg", "Southampton", "Granada", "FC Köln",
      "Parma", "Flamengo", "Bournemouth", "Rayo Vallecano", "Heidenheim", "Lecce", "Palmeiras", "Burnley",
      "Las Palmas", "Dynamo Kyiv", "Panathinaikos", "Anderlecht", "AEK Athens", "Basel", "Ferencvaros",
      "Legia Warsaw", "Feyenoord", "Olympiacos", "Steaua Bucharest",
    ],
  },
  {
    episode: 3,
    name: "Mixed",
    teams: [
      "Inter Milan", "Arsenal", "Juventus", "Tottenham", "Bayer Leverkusen", "Ajax", "Inter Miami", "Napoli",
      "Real Sociedad", "Manchester United", "West Ham", "Monaco", "Stuttgart", "Aston Villa", "Villarreal",
      "Feyenoord", "Lyon", "Newcastle", "Lazio", "Athletic Bilbao", "Wolfsburg", "Sheffield United",
      "Real Valladolid", "Bordeaux", "Augsburg", "Lorient", "Watford", "Leganes", "Palermo", "Nantes", "Hull City",
      "Tenerife", "Dusseldorf", "Corinthians", "Sunderland", "Eibar", "Hamburg", "QPR", "Peñarol", "Roma",
      "Sheriff Tiraspol", "Red Star Belgrade", "Hajduk Split", "Maccabi Haifa", "Partizan Belgrade", "Sturm Graz",
      "Malmö FF", "Rosenborg", "Copenhagen", "HJK Helsinki",
    ],
  },
  {
    episode: 4,
    name: "Mixed",
    teams: [
      "Paris Saint-Germain", "Borussia Dortmund", "Real Madrid", "Manchester City", "Barcelona", "Liverpool", "Roma",
      "Al Ittihad", "Chelsea", "AC Milan", "Sporting CP", "Villarreal", "RB Leipzig", "Lazio", "West Ham",
      "Monaco", "Galatasaray", "Fiorentina", "Real Sociedad", "Eintracht Frankfurt", "Norwich", "St. Pauli",
      "Venezia", "Brest", "Coventry", "Paderborn", "Toulouse", "Millwall", "Saint-Etienne", "Sampdoria", "Blackburn",
      "Parma", "Middlesbrough", "Girona", "Stoke City", "Sao Paulo", "Brighton", "Udinese", "Burnley",
      "Independiente", "Djurgården", "Brøndby", "LASK", "Midtjylland", "Molde", "Rapid Wien", "Sparta Prague",
      "Gent", "Viktoria Plzeň", "Maribor",
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
  return SEED_EXTRA_ALIASES[normName] ?? aliases[normName] ?? normName;
}

function findTeamEntry(rawName, clubs, aliases) {
  const raw = String(rawName || "").trim();
  let normTeam = resolveTeamAlias(normalizeForImport(raw), aliases);
  if (/^rb\s+salzburg$/i.test(raw)) {
    normTeam = resolveTeamAlias(normalizeForImport(raw.replace(/^\s*rb\s+/i, "Red Bull ")), aliases);
  }
  let entry = clubs.find((t) => normalizeForImport(t.name) === normTeam);
  if (!entry) {
    entry = clubs.find(
      (t) =>
        normalizeForImport(t.name).includes(normTeam)
        || normTeam.includes(normalizeForImport(t.name)),
    );
  }
  return entry || null;
}

function toPairLine(teamName, clubs, aliases, notFoundReport) {
  const manual = SEED_MANUAL_COUNTRIES[normalizeForImport(teamName)];
  if (manual) return `${teamName} - ${manual}`;
  const entry = findTeamEntry(teamName, clubs, aliases);
  if (!entry?.country) {
    notFoundReport.add(teamName);
    return `${teamName} - ?`;
  }
  return `${teamName} - ${entry.country}`;
}

const aliases = await loadTeamAliases();
const teamsIndex = JSON.parse(await fs.readFile(teamsIndexPath, "utf8"));
const clubs = teamsIndex.clubs || [];
const notFoundReport = new Set();

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
if (!store.blocks || typeof store.blocks !== "object") store.blocks = {};

for (const comp of COMPETITIONS) {
  const key = `${RUNNER_ID}|${TYPE}|${comp.episode}`;
  const previous = store.blocks[key] || {};
  const lines = comp.teams.map((t) => toPairLine(t, clubs, aliases, notFoundReport));
  store.blocks[key] = {
    ...previous,
    name: comp.name,
    teamsImportText: lines.join("\n"),
    script: previous.script && typeof previous.script === "object" ? previous.script : {},
    recorded: previous.recorded && typeof previous.recorded === "object"
      ? previous.recorded
      : { english: null, spanish: null },
    video: previous.video && typeof previous.video === "object" ? previous.video : {},
    youtube: previous.youtube && typeof previous.youtube === "object" ? previous.youtube : {},
    updatedAt: Date.now(),
  };
  const missing = lines.filter((l) => l.endsWith(" - ?")).length;
  console.log(`Added ${key}: ${comp.name} (${comp.teams.length} teams, ${missing} unresolved)`);
}

await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

console.log("\n--- Not found ---");
for (const name of [...notFoundReport].sort()) console.log(name);
console.log("\nDone.");
