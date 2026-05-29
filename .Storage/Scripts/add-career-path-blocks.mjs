/**
 * Add Guess The Player By Career Path (runner 3) long-form blocks.
 * Flags ambiguous player→club matches for manual pick.
 * Run: node .Storage/Scripts/add-career-path-blocks.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");

import { PLAYER_IMPORT_ALIASES, PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const RUNNER_ID = 3;
const TYPE = "long";

const COMPETITIONS = [
  {
    episode: 1,
    name: "Mixed players",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Lamine Yamal", "Harry Kane", "Mohamed Salah", "Jude Bellingham",
      "Lionel Messi", "Bukayo Saka", "Jamal Musiala", "Lautaro Martínez", "Federico Valverde", "Martin Ødegaard",
      "Bernardo Silva", "Gavi", "Theo Hernández", "Joshua Kimmich", "William Saliba", "Ruben Dias",
      "Alexander-Arnold", "Cole Palmer", "Dominik Szoboszlai", "Gabriel Magalhães", "James Maddison",
      "Darwin Núñez", "Anthony Gordon", "Victor Boniface", "Nico Williams", "David Raya", "Christian Pulisic",
      "Alexander Isak",
    ],
  },
  {
    episode: 2,
    name: "Mixed players",
    players: [
      "Cristiano Ronaldo", "Rodri", "Robert Lewandowski", "Antoine Griezmann", "Heung-min Son", "Phil Foden",
      "Florian Wirtz", "Bruno Fernandes", "Thibaut Courtois", "Alisson Becker", "Pedri", "Declan Rice",
      "Alessandro Bastoni", "Antonio Rüdiger", "Alexis Mac Allister", "Achraf Hakimi", "Joško Gvardiol",
      "Mike Maignan", "Antoine Semenyo", "Khvicha Kvaratskhelia", "Alejandro Garnacho", "Victor Osimhen",
      "Warren Zaïre-Emery", "Kobbie Mainoo", "Ollie Watkins", "Loïs Openda", "Viktor Gyökeres", "Diogo Jota",
      "Kai Havertz", "Marcus Rashford",
    ],
  },
  {
    episode: 3,
    name: "Mixed players",
    players: [
      "Vinícius Júnior", "Kevin De Bruyne", "Jude Bellingham", "Harry Kane", "Lamine Yamal", "Erling Haaland",
      "Mohamed Salah", "Lionel Messi", "Bukayo Saka", "Kylian Mbappé", "Lautaro Martínez", "Rodri", "Pedri",
      "Bruno Fernandes", "Phil Foden", "Antoine Griezmann", "Virgil van Dijk", "Jamal Musiala", "Martin Ødegaard",
      "Nicolò Barella", "Rafael Leão", "Gabriel Magalhães", "Christian Pulisic", "Julián Alvarez", "Theo Hernández",
      "Rayan Cherki", "Marc Guéhi", "Brennan Johnson", "Takefusa Kubo", "Richarlison",
    ],
  },
  {
    episode: 4,
    name: "Mixed players",
    players: [
      "Cristiano Ronaldo", "Erling Haaland", "Jude Bellingham", "Mohamed Salah", "Lionel Messi", "Kylian Mbappé",
      "Vinícius Júnior", "Lamine Yamal", "Harry Kane", "Bukayo Saka", "Rodri", "Robert Lewandowski", "Declan Rice",
      "Jamal Musiala", "Bruno Fernandes", "Antoine Griezmann", "Virgil van Dijk", "Phil Foden", "Alessandro Bastoni",
      "Federico Valverde", "Pedro Porro", "Mike Maignan", "Antonio Rüdiger", "Alexis Mac Allister", "Joshua Kimmich",
      "Nico Williams", "David Raya", "Pau Cubarsí", "Ousmane Dembélé", "James Maddison",
    ],
  },
  {
    episode: 5,
    name: "Mixed players",
    players: [
      "Kylian Mbappé", "Lionel Messi", "Erling Haaland", "Cristiano Ronaldo", "Jude Bellingham", "Mohamed Salah",
      "Vinícius Júnior", "Bukayo Saka", "Lamine Yamal", "Harry Kane", "Kevin De Bruyne", "Pedri", "William Saliba",
      "Antoine Griezmann", "Lautaro Martínez", "Rodri", "Robert Lewandowski", "Jamal Musiala", "Bruno Fernandes",
      "Alisson Becker", "Guglielmo Vicario", "Éder Militão", "Luis Díaz", "Alexander Isak", "Dominik Szoboszlai",
      "Kai Havertz", "Leroy Sané", "Dušan Vlahović", "Rúben Dias", "Darwin Núñez",
    ],
  },
  {
    episode: 6,
    name: "Mixed players",
    players: [
      "Phil Foden", "Jamal Musiala", "Florian Wirtz", "Kevin De Bruyne", "Rodri", "Declan Rice", "Martin Ødegaard",
      "Virgil van Dijk", "Alisson Becker", "Thibaut Courtois", "Robert Lewandowski", "Antoine Griezmann",
      "Bruno Fernandes", "Lautaro Martínez", "Luis Díaz", "Cole Palmer", "Michael Olise", "Bradley Barcola",
      "Raphinha", "Alexander Isak", "João Neves", "Vitinha", "Viktor Gyökeres", "Serhou Guirassy", "Benjamin Šeško",
      "Moussa Diaby", "Lucas Paquetá", "Bruno Guimarães", "Gabriel Martinelli", "Raheem Sterling",
    ],
  },
  {
    episode: 7,
    name: "Mixed players",
    players: [
      "Heung-min Son", "Alisson Becker", "Rúben Dias", "Bernardo Silva", "Theo Hernández", "Joshua Kimmich",
      "Douglas Luiz", "Ollie Watkins", "Anthony Gordon", "Dominic Solanke", "Harvey Elliott", "Curtis Jones",
      "Ibrahima Konaté", "Cody Gakpo", "Diogo Jota", "Joško Gvardiol", "Mateo Kovačić", "Manuel Akanji",
      "Ederson", "Nathan Aké", "Rico Lewis", "John Stones", "Marc Bernal", "Fermín López", "Dani Olmo",
      "Ferran Torres", "Andreas Christensen", "Alejandro Balde", "Marc Casadó", "Jack Grealish",
    ],
  },
  {
    episode: 8,
    name: "Mixed players",
    players: [
      "Lionel Messi", "Cristiano Ronaldo", "Mohamed Salah", "Lamine Yamal", "Bukayo Saka", "Kylian Mbappé",
      "Erling Haaland", "Jude Bellingham", "Vinícius Júnior", "Harry Kane", "Alexis Mac Allister", "Achraf Hakimi",
      "Antonio Rüdiger", "Marquinhos", "Mike Maignan", "Robert Lewandowski", "Antoine Griezmann", "Bruno Fernandes",
      "Lautaro Martínez", "Luis Díaz", "Takefusa Kubo", "Kaoru Mitoma", "Kim Min-jae", "Hwang Hee-chan",
      "Wataru Endo", "Mehdi Taremi", "Moussa Al-Tamari", "Mohammed Kudus", "Thomas Partey", "Christian Pulisic",
    ],
  },
  {
    episode: 9,
    name: "Mixed players",
    players: [
      "Phil Foden", "Jamal Musiala", "Florian Wirtz", "Kevin De Bruyne", "Rodri", "Declan Rice", "Martin Ødegaard",
      "Virgil van Dijk", "Alisson Becker", "Thibaut Courtois", "Cole Palmer", "Michael Olise", "Bradley Barcola",
      "Raphinha", "Alexander Isak", "Gavi", "Pedri", "Federico Valverde", "Trent Alexander-Arnold", "William Saliba",
      "Brennan Johnson", "Dejan Kulusevski", "James Maddison", "Pedro Porro", "Guglielmo Vicario", "Cristian Romero",
      "Micky van de Ven", "Destiny Udogie", "Rodrigo Bentancur", "Kai Havertz",
    ],
  },
  {
    episode: 10,
    name: "Mixed players",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Jude Bellingham", "Vinícius Júnior", "Harry Kane", "Mohamed Salah",
      "Lionel Messi", "Cristiano Ronaldo", "Lamine Yamal", "Bukayo Saka", "Bruno Guimarães", "Marcus Thuram",
      "Alejandro Garnacho", "Victor Osimhen", "Khvicha Kvaratskhelia", "Heung-min Son", "Alisson Becker", "Rúben Dias",
      "Bernardo Silva", "Theo Hernández", "Leroy Sané", "Kingsley Coman", "Serge Gnabry", "Leon Goretzka",
      "Dayot Upamecano", "Kim Min-jae", "Manuel Neuer", "Konrad Laimer", "João Palhinha", "Bruno Guimarães",
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

/** @returns {Map<string, Array<{club:string, playerName:string}>>} */
async function buildPlayerClubMap(clubs) {
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
      const rows = map.get(key);
      if (!rows.some((r) => r.club === row.club && r.playerName === row.playerName)) {
        rows.push(row);
      }
    }
  }
  console.log(`Scanned ${scanned} squads.`);
  return map;
}

function lookupPlayer(rawName, playerMap) {
  const manualKey = normalizeForImport(rawName);
  if (PLAYER_MANUAL_CLUBS[manualKey]) {
    return { club: PLAYER_MANUAL_CLUBS[manualKey], ambiguous: false, options: [PLAYER_MANUAL_CLUBS[manualKey]] };
  }

  const norm = PLAYER_IMPORT_ALIASES[manualKey] || manualKey;
  let hits = playerMap.get(norm) || [];

  if (hits.length === 0 && !PLAYER_IMPORT_ALIASES[manualKey]) {
    const parts = String(rawName).trim().split(/\s+/);
    if (parts.length >= 2) {
      const surname = normalizeForImport(parts[parts.length - 1]);
      for (const [k, rows] of playerMap) {
        if (k === surname || k.endsWith(` ${surname}`)) hits.push(...rows);
      }
    }
  }

  if (hits.length === 0) {
    return { club: null, ambiguous: false, options: [] };
  }

  const rawLower = String(rawName).trim().toLowerCase();
  const exactNameHits = hits.filter(
    (h) => normalizeForImport(h.playerName) === norm || h.playerName.trim().toLowerCase() === rawLower,
  );
  const pool = exactNameHits.length > 0 ? exactNameHits : hits;

  const uniqueClubs = [...new Set(pool.map((h) => h.club))];
  if (uniqueClubs.length === 1) {
    return { club: uniqueClubs[0], ambiguous: false, options: uniqueClubs };
  }

  return { club: null, ambiguous: true, options: uniqueClubs };
}

const teamsIndex = JSON.parse(await fs.readFile(teamsIndexPath, "utf8"));
const playerMap = await buildPlayerClubMap(teamsIndex.clubs || []);

const ambiguousReport = new Map();
const notFoundReport = new Set();

function toPairLine(playerName) {
  const { club, ambiguous, options } = lookupPlayer(playerName, playerMap);
  if (!club && !ambiguous) {
    notFoundReport.add(playerName);
    return `${playerName} - ?`;
  }
  if (ambiguous) {
    if (!ambiguousReport.has(playerName)) {
      ambiguousReport.set(playerName, options);
    }
    return `${playerName} - ?`;
  }
  return `${playerName} - ${club}`;
}

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
if (!store.blocks || typeof store.blocks !== "object") store.blocks = {};

for (const comp of COMPETITIONS) {
  const key = `${RUNNER_ID}|${TYPE}|${comp.episode}`;
  const previous = store.blocks[key] || {};
  const lines = comp.players.map(toPairLine);
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
  console.log(`Added ${key}: ${comp.name} (${comp.players.length} players, ${missing} need pick)`);
}

await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

console.log("\n--- Ambiguous (multiple clubs) ---");
for (const [name, clubs] of [...ambiguousReport.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`${name}: ${clubs.join(" | ")}`);
}

console.log("\n--- Not found ---");
for (const name of [...notFoundReport].sort()) {
  console.log(name);
}

console.log("\nDone.");
