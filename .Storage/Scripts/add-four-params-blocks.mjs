/**
 * Add Guess The Player by club + position + country + age (runner 5) long-form blocks.
 * Run: node .Storage/Scripts/add-four-params-blocks.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_IMPORT_ALIASES, PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");

const RUNNER_ID = 5;
const TYPE = "long";

const COMPETITIONS = [
  {
    episode: 1,
    name: "Mixed players",
    players: [
      "Virgil van Dijk", "Lamine Yamal", "Alexis Mac Allister", "Bukayo Saka", "Kevin De Bruyne", "Rafael Leão",
      "Luis Díaz", "Raphinha", "Florian Wirtz", "Kylian Mbappé", "Vitinha", "Manuel Akanji", "Marcus Rashford",
      "Gabriel Magalhães", "Kyle Walker", "Alejandro Grimaldo", "Achraf Hakimi", "William Saliba", "Kobbie Mainoo",
      "Joselu", "Flynn Downes", "Gianluca Scamacca", "Marcos Senesi", "Bryan Mbeumo", "Viktor Gyökeres",
      "Noni Madueke", "Guglielmo Vicario", "David Neres", "Pedro Porro", "Rasmus Højlund",
    ],
  },
  {
    episode: 2,
    name: "Mixed players",
    players: [
      "Jude Bellingham", "Mohamed Salah", "Bukayo Saka", "Ruben Dias", "Luis Díaz", "Lamine Yamal", "Rafael Leão",
      "Pedri", "Antoine Griezmann", "Vinícius Júnior", "Darwin Núñez", "Douglas Luiz", "John Stones",
      "Theo Hernández", "Cody Gakpo", "Joselu", "Eberechi Eze", "Hakan Çalhanoğlu", "Jeremie Frimpong",
      "Bruno Guimarães", "Marcus Thuram", "Amadou Onana", "Nick Pope", "Emerson Palmieri", "Kurt Zouma",
      "Jarrad Branthwaite", "Yankuba Minteh", "Chris Führich", "Ross Stewart", "Bradley Barcola",
    ],
  },
  {
    episode: 3,
    name: "Mixed players",
    players: [
      "Erling Haaland", "Jamal Musiala", "Thibaut Courtois", "Phil Foden", "Alisson Becker", "Florian Wirtz",
      "Rodri", "Federico Valverde", "Declan Rice", "Rafael Leão", "Kyle Walker", "Christian Pulisic",
      "Nicolò Barella", "Victor Osimhen", "Marquinhos", "Gianluigi Donnarumma", "Alexander Isak", "Joselu",
      "Mike Maignan", "Alejandro Garnacho", "Christopher Nkunku", "Jarrod Bowen", "Federico Chiesa", "Alex Baena",
      "Murillo", "Teun Koopmeiners", "Marc Cucurella", "Micky van de Ven", "Tomáš Souček", "Pedri",
    ],
  },
  {
    episode: 4,
    name: "Mixed players",
    players: [
      "Thibaut Courtois", "Bruno Fernandes", "Kevin De Bruyne", "Mohamed Salah", "Kylian Mbappé", "Nico Williams",
      "Ruben Dias", "Harry Kane", "Rafael Leão", "Vinícius Júnior", "Victor Osimhen", "Dušan Vlahović", "Vitinha",
      "Kyle Walker", "Warren Zaïre-Emery", "Darwin Núñez", "Marquinhos", "Kingsley Coman", "Anthony Gordon",
      "Leroy Sané", "Ben Brereton Díaz", "Kaoru Mitoma", "Conor Gallagher", "Karim Adeyemi", "Sandro Tonali",
      "Aleksandar Pavlović", "Matt O'Riley", "Taylor Harwood-Bellis", "Lucas Paquetá", "Lautaro Martínez",
    ],
  },
  {
    episode: 5,
    name: "Mixed players",
    players: [
      "Bruno Fernandes", "Robert Lewandowski", "Son Heung-min", "Luis Díaz", "Nico Williams", "Mohamed Salah",
      "Kevin De Bruyne", "Declan Rice", "Khvicha Kvaratskhelia", "Alexis Mac Allister", "Ollie Watkins",
      "Joško Gvardiol", "William Saliba", "Douglas Luiz", "Christian Pulisic", "Hakan Çalhanoğlu", "Cody Gakpo",
      "Alexander Isak", "Dominik Szoboszlai", "Alejandro Grimaldo", "Federico Chiesa", "Micky van de Ven",
      "Serhou Guirassy", "Antoine Semenyo", "Igor Julio", "Denzel Dumfries", "Viktor Tsygankov", "Jamie Gittens",
      "Moisés Caicedo", "Alphonso Davies",
    ],
  },
  {
    episode: 6,
    name: "Mixed players",
    players: [
      "Nico Williams", "Harry Kane", "Bruno Fernandes", "Antoine Griezmann", "Khvicha Kvaratskhelia", "Raphinha",
      "Cole Palmer", "Mohamed Salah", "Cristiano Ronaldo", "Jamal Musiala", "Gianluigi Donnarumma", "Mike Maignan",
      "Douglas Luiz", "Leroy Sané", "Joselu", "Alessandro Bastoni", "Marcus Rashford", "Manuel Akanji",
      "Bruno Guimarães", "Nicolò Barella", "Jack Hinshelwood", "Ryan Fraser", "Miguel Gutiérrez", "Igor Thiago",
      "Vladimír Coufal", "Paulo Dybala", "Maxwel Cornet", "Roméo Lavia", "Harvey Barnes", "Rasmus Højlund",
    ],
  },
  {
    episode: 7,
    name: "Mixed players",
    players: [
      "Cole Palmer", "Son Heung-min", "Khvicha Kvaratskhelia", "Erling Haaland", "Pedri", "Harry Kane",
      "Cristiano Ronaldo", "Federico Valverde", "Luis Díaz", "Jude Bellingham", "Bradley Barcola", "Ollie Watkins",
      "Kingsley Coman", "Achraf Hakimi", "Michael Olise", "Marquinhos", "Cody Gakpo", "Warren Zaïre-Emery",
      "Kyle Walker", "Rasmus Højlund", "Evan Ferguson", "Aaron Ramsdale", "Pedro Neto", "Scott McTominay",
      "Gianluca Scamacca", "Romelu Lukaku", "Ferdi Kadıoğlu", "Enzo Fernández", "Joe Willock", "Bernardo Silva",
    ],
  },
  {
    episode: 8,
    name: "Mixed players",
    players: [
      "Mohamed Salah", "Cristiano Ronaldo", "Phil Foden", "Federico Valverde", "Florian Wirtz", "Rodri",
      "Martin Ødegaard", "Raphinha", "Kevin De Bruyne", "Declan Rice", "Michael Olise", "Rasmus Højlund",
      "Achraf Hakimi", "Jeremie Frimpong", "Alessandro Bastoni", "Darwin Núñez", "Anthony Gordon", "Theo Hernández",
      "Hakan Çalhanoğlu", "James Maddison", "Charles De Ketelaere", "Takefusa Kubo", "Loïs Openda", "Jamie Gittens",
      "Mohammed Kudus", "Martin Zubimendi", "João Pedro", "Łukasz Fabiański", "Jadon Sancho", "Lautaro Martínez",
    ],
  },
  {
    episode: 9,
    name: "Mixed players",
    players: [
      "Antoine Griezmann", "Rodri", "Alphonso Davies", "Alisson Becker", "Jude Bellingham", "Luis Díaz", "Rafael Leão",
      "Cole Palmer", "Virgil van Dijk", "Gavi", "Marquinhos", "Christian Pulisic", "Marcus Rashford", "Darwin Núñez",
      "Anthony Gordon", "Dušan Vlahović", "Achraf Hakimi", "Joško Gvardiol", "Dominik Szoboszlai", "James Maddison",
      "Yukinari Sugawara", "James Milner", "Álvaro Morata", "Lloyd Kelly", "Victor Boniface", "Levi Colwill",
      "Joelinton", "Robin Le Normand", "Mats Wieffer", "Trent Alexander-Arnold",
    ],
  },
  {
    episode: 10,
    name: "Mixed players",
    players: [
      "Kevin De Bruyne", "Declan Rice", "Antoine Griezmann", "Gavi", "Bernardo Silva", "Jamal Musiala", "Martin Ødegaard",
      "Bruno Fernandes", "Vinícius Júnior", "Nico Williams", "Kobbie Mainoo", "Marquinhos", "Eberechi Eze",
      "Mike Maignan", "Alejandro Garnacho", "Alejandro Grimaldo", "Theo Hernández", "Achraf Hakimi", "John Stones",
      "Gabriel Magalhães", "Joe Lumley", "Mathys Tel", "David Raum", "Kieran Trippier", "Álvaro Morata",
      "Mats Hummels", "Guido Rodríguez", "Romelu Lukaku", "Yeremy Pino", "Julián Álvarez",
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

async function buildPlayerClubMap(clubs) {
  const map = new Map();
  let scanned = 0;
  for (const club of clubs) {
    const rel = String(club.path || "").replace(/^\.\.\//, "");
    try {
      const squad = JSON.parse(await fs.readFile(path.join(root, rel), "utf8"));
      scanned++;
      for (const p of [
        ...(squad.goalkeepers || []),
        ...(squad.defenders || []),
        ...(squad.midfielders || []),
        ...(squad.attackers || []),
      ]) {
        if (!p?.name) continue;
        const key = normalizeForImport(p.name);
        const row = { club: p.club || club.name, playerName: p.name };
        if (!map.has(key)) map.set(key, []);
        const rows = map.get(key);
        if (!rows.some((r) => r.club === row.club && r.playerName === row.playerName)) rows.push(row);
      }
    } catch { /* skip */ }
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
  if (hits.length === 0) return { club: null, ambiguous: false, options: [] };
  const rawLower = String(rawName).trim().toLowerCase();
  const exactNameHits = hits.filter(
    (h) => normalizeForImport(h.playerName) === norm || h.playerName.trim().toLowerCase() === rawLower,
  );
  const pool = exactNameHits.length > 0 ? exactNameHits : hits;
  const uniqueClubs = [...new Set(pool.map((h) => h.club))];
  if (uniqueClubs.length === 1) return { club: uniqueClubs[0], ambiguous: false, options: uniqueClubs };
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
    if (!ambiguousReport.has(playerName)) ambiguousReport.set(playerName, options);
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
for (const name of [...notFoundReport].sort()) console.log(name);
console.log("\nDone.");
