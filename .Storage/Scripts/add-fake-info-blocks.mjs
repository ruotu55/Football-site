/**
 * Add Guess The Fake Information (runner 6) long-form blocks.
 * Run: node .Storage/Scripts/add-fake-info-blocks.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_IMPORT_ALIASES, PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");

const RUNNER_ID = 6;
const TYPE = "long";

const COMPETITIONS = [
  {
    episode: 1,
    name: "Mixed players",
    players: [
      "Kylian Mbappé", "Mohamed Salah", "Martin Ødegaard", "Rodri", "Robert Lewandowski", "Lamine Yamal",
      "Alisson Becker", "Phil Foden", "Jamal Musiala", "Antoine Griezmann", "William Saliba", "Alexander Isak",
      "Alessandro Bastoni", "Christian Pulisic", "Cody Gakpo", "Dominik Szoboszlai", "Kyle Walker", "Achraf Hakimi",
      "Vitinha", "Gianluigi Donnarumma", "Viktor Gyökeres", "Takefusa Kubo", "Scott McTominay", "Nico Schlotterbeck",
      "Marcus Thuram", "Gianluca Scamacca", "Niclas Füllkrug", "Jordan Pickford", "Jarrad Branthwaite", "Cristiano Ronaldo",
    ],
  },
  {
    episode: 2,
    name: "Mixed players",
    players: [
      "Erling Haaland", "Jude Bellingham", "Gavi", "Federico Valverde", "Rafael Leão", "Bruno Fernandes",
      "Virgil van Dijk", "Khvicha Kvaratskhelia", "Harry Kane", "Bukayo Saka", "Ollie Watkins", "Theo Hernández",
      "Michael Olise", "Hakan Çalhanoğlu", "Marquinhos", "James Maddison", "Joško Gvardiol", "Bradley Barcola",
      "Manuel Akanji", "Kobbie Mainoo", "Victor Boniface", "Xavi Simons", "Artem Dovbyk", "Federico Dimarco",
      "Paulo Dybala", "Fikayo Tomori", "Savinho", "Christopher Nkunku", "Pedro Neto", "Robert Lewandowski",
    ],
  },
  {
    episode: 3,
    name: "Mixed players",
    players: [
      "Vinícius Júnior", "Kevin De Bruyne", "Son Heung-min", "Declan Rice", "Alexis Mac Allister", "Raphinha",
      "Thibaut Courtois", "Lautaro Martínez", "Nico Williams", "Cole Palmer", "Darwin Núñez", "Nicolò Barella",
      "Dušan Vlahović", "Warren Zaïre-Emery", "Alejandro Grimaldo", "Alejandro Garnacho", "Bruno Guimarães",
      "John Stones", "Mike Maignan", "Marcus Rashford", "Benjamin Šeško", "Martin Zubimendi", "Ademola Lookman",
      "Denzel Dumfries", "Álvaro Morata", "Serhou Guirassy", "João Félix", "Noni Madueke", "Moisés Caicedo", "Phil Foden",
    ],
  },
  {
    episode: 4,
    name: "Mixed players",
    players: [
      "Lionel Messi", "Lamine Yamal", "Rodri", "Bukayo Saka", "Trent Alexander-Arnold", "Jamal Musiala", "Pedri",
      "Alisson Becker", "Martin Ødegaard", "Antoine Griezmann", "Jeremie Frimpong", "Anthony Gordon", "Edmond Tapsoba",
      "Micky van de Ven", "Douglas Luiz", "Eberechi Eze", "Leroy Sané", "Gonçalo Ramos", "Lucas Paquetá",
      "Gabriel Magalhães", "Arda Güler", "Kenan Yıldız", "Pau Cubarsí", "Endrick", "Harvey Elliott", "Levi Colwill",
      "Stefan Bajčetić", "Rico Lewis", "Jamie Gittens", "Luka Modrić",
    ],
  },
  {
    episode: 5,
    name: "Mixed players",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Jude Bellingham", "Mohamed Salah", "Virgil van Dijk", "Bruno Fernandes",
      "Federico Valverde", "Phil Foden", "Luis Díaz", "Harry Kane", "Gianluigi Donnarumma", "Alessandro Bastoni",
      "Christian Pulisic", "William Saliba", "Vitinha", "Alexander Isak", "Achraf Hakimi", "Dominik Szoboszlai",
      "Theo Hernández", "James Maddison", "Viktor Gyökeres", "Takefusa Kubo", "Artem Dovbyk", "Nico Schlotterbeck",
      "Marcus Thuram", "David Neres", "Matheus Cunha", "Amadou Onana", "Jarrod Bowen", "Kevin De Bruyne",
    ],
  },
  {
    episode: 6,
    name: "Mixed players",
    players: [
      "Vinícius Júnior", "Lamine Yamal", "Rodri", "Robert Lewandowski", "Cole Palmer", "Lautaro Martínez",
      "Nico Williams", "Alisson Becker", "Jamal Musiala", "Gavi", "Cody Gakpo", "Manuel Akanji", "Marquinhos",
      "Hakan Çalhanoğlu", "Ollie Watkins", "Joško Gvardiol", "Bradley Barcola", "Warren Zaïre-Emery", "Nicolò Barella",
      "Kyle Walker", "Victor Boniface", "Xavi Simons", "Martin Zubimendi", "Federico Dimarco", "Paulo Dybala",
      "Fikayo Tomori", "Savinho", "Pedro Neto", "Moussa Diaby", "Son Heung-min",
    ],
  },
  {
    episode: 7,
    name: "Mixed players",
    players: [
      "Cristiano Ronaldo", "Lionel Messi", "Bukayo Saka", "Phil Foden", "Martin Ødegaard", "Declan Rice", "Pedri",
      "Kevin De Bruyne", "Raphinha", "Alexis Mac Allister", "Bruno Guimarães", "Alejandro Grimaldo", "Anthony Gordon",
      "Jeremie Frimpong", "Dušan Vlahović", "Alejandro Garnacho", "John Stones", "Mike Maignan", "Marcus Rashford",
      "Kobbie Mainoo", "Benjamin Šeško", "Ademola Lookman", "Denzel Dumfries", "Álvaro Morata", "Serhou Guirassy",
      "João Félix", "Noni Madueke", "Moisés Caicedo", "Enzo Fernández", "Thibaut Courtois",
    ],
  },
  {
    episode: 8,
    name: "Mixed players",
    players: [
      "Harry Kane", "Jude Bellingham", "Mohamed Salah", "Vinícius Júnior", "Erling Haaland", "Antoine Griezmann",
      "Rafael Leão", "Khvicha Kvaratskhelia", "Trent Alexander-Arnold", "Federico Valverde", "Theo Hernández",
      "Michael Olise", "James Maddison", "Douglas Luiz", "Eberechi Eze", "Leroy Sané", "Gabriel Magalhães",
      "Edmond Tapsoba", "Micky van de Ven", "Gonçalo Ramos", "Arda Güler", "Kenan Yıldız", "Pau Cubarsí", "Endrick",
      "Harvey Elliott", "Levi Colwill", "Stefan Bajčetić", "Rico Lewis", "Jamie Gittens", "Bernardo Silva",
    ],
  },
  {
    episode: 9,
    name: "Mixed players",
    players: [
      "Kylian Mbappé", "Lamine Yamal", "Rodri", "Alisson Becker", "Jamal Musiala", "Bukayo Saka", "Robert Lewandowski",
      "Bruno Fernandes", "Virgil van Dijk", "Gavi", "William Saliba", "Alexander Isak", "Alessandro Bastoni",
      "Christian Pulisic", "Vitinha", "Achraf Hakimi", "Dominik Szoboszlai", "Manuel Akanji", "Marquinhos",
      "Hakan Çalhanoğlu", "Viktor Gyökeres", "Takefusa Kubo", "Scott McTominay", "Nico Schlotterbeck", "Marcus Thuram",
      "Gianluca Scamacca", "Niclas Füllkrug", "Jordan Pickford", "Jarrad Branthwaite", "Bruno Guimarães",
    ],
  },
  {
    episode: 10,
    name: "Mixed players",
    players: [
      "Cole Palmer", "Phil Foden", "Martin Ødegaard", "Declan Rice", "Pedri", "Kevin De Bruyne", "Raphinha",
      "Alexis Mac Allister", "Nico Williams", "Lautaro Martínez", "Ollie Watkins", "Joško Gvardiol", "Bradley Barcola",
      "Warren Zaïre-Emery", "Nicolò Barella", "Kyle Walker", "Cody Gakpo", "Anthony Gordon", "Jeremie Frimpong",
      "Alejandro Grimaldo", "Victor Boniface", "Xavi Simons", "Martin Zubimendi", "Federico Dimarco", "Paulo Dybala",
      "Fikayo Tomori", "Savinho", "Pedro Neto", "Moussa Diaby", "Alisson Becker",
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
