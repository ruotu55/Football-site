/**
 * Add Guess The Football Player Name (runner 8) long-form blocks.
 * Run: node .Storage/Scripts/add-player-name-blocks.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_IMPORT_ALIASES, PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");

const RUNNER_ID = 8;
const TYPE = "long";

const COMPETITIONS = [
  {
    episode: 1,
    name: "Mixed",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Jude Bellingham", "Bukayo Saka", "Jan Oblak", "Jamal Musiala",
      "Achraf Hakimi", "Luis Diaz", "Federico Valverde", "Alexander Mitrovic", "Christian Pulisic",
      "Frenkie de Jong", "Rafael Leão", "Rúben Dias", "Victor Osimhen", "Julián Álvarez", "Serge Gnabry",
      "James Rodríguez", "Thibaut Courtois", "Sadio Mané", "Darwin Núñez", "Kyle Walker", "Phil Foden",
      "Theo Hernández", "Granit Xhaka", "Alexis Mac Allister", "Riyad Mahrez", "Takefusa Kubo",
      "Gabriel Martinelli", "Nicolò Barella", "Lucas Hernández", "Memphis Depay", "Ederson", "Enzo Fernández",
      "Richarlison", "Ángel Di María", "Kieran Trippier", "Marco Reus", "Dani Carvajal", "Dušan Vlahović",
      "Weston McKennie", "Lucas Paquetá", "Gregor Kobel", "Iñaki Williams", "Alejandro Grimaldo",
      "Jonathan David", "Vitinha", "Warren Zaïre-Emery", "Viktor Gyökeres", "Cole Palmer",
    ],
  },
  {
    episode: 2,
    name: "Mixed",
    players: [
      "Cristiano Ronaldo", "Lionel Messi", "Kevin De Bruyne", "Harry Kane", "Martin Ødegaard", "Virgil van Dijk",
      "Pedri", "Bernardo Silva", "Rodri", "Khvicha Kvaratskhelia", "Florian Wirtz", "Eduardo Camavinga",
      "N'Golo Kanté", "Manuel Neuer", "Paulo Dybala", "Gavi", "Leroy Sané", "Emiliano Martínez", "Marquinhos",
      "Casemiro", "Alejandro Garnacho", "Luka Modrić", "Luis Suárez", "Diogo Jota", "Aurélien Tchouaméni",
      "Edin Džeko", "David Alaba", "William Saliba", "Romelu Lukaku", "João Félix", "Declan Rice",
      "Roberto Firmino", "Ousmane Dembélé", "Hakan Çalhanoğlu", "Joshua Kimmich", "Enner Valencia", "Marcus Thuram",
      "Gleison Bremer", "Anthony Gordon", "Domenico Berardi", "Cristian Romero", "Ivan Perišić", "Federico Chiesa",
      "Nicolás González", "Mike Maignan", "Jules Koundé", "Bruno Guimarães", "Jeremie Frimpong", "Lamine Yamal",
      "Kobbie Mainoo",
    ],
  },
  {
    episode: 3,
    name: "Mixed",
    players: [
      "Robert Lewandowski", "Bruno Fernandes", "Mohamed Salah", "Neymar Jr", "Alexander Isak", "Gianluigi Donnarumma",
      "Alphonso Davies", "Karim Benzema", "Ronald Araújo", "Dominik Szoboszlai", "Kai Havertz", "Kalidou Koulibaly",
      "Serhou Guirassy", "Nico Williams", "Alessandro Bastoni", "André Onana", "Ollie Watkins", "Sergej Milinković-Savić",
      "Xavi Simons", "Gabriel Jesus", "Aymeric Laporte", "Loïs Openda", "Douglas Luiz", "Álvaro Morata",
      "Leon Goretzka", "James Maddison", "Gonçalo Ramos", "Pedro Porro", "Victor Boniface", "Moussa Diaby",
      "Rodrigo De Paul", "Yeremy Pino", "Takehiro Tomiyasu", "Jarrod Bowen", "Manuel Locatelli", "Randal Kolo Muani",
      "Ferland Mendy", "Andreas Christensen", "Guglielmo Vicario", "Mohammed Kudus", "Kim Min-jae", "Matthijs de Ligt",
      "Harvey Elliott", "Brahim Díaz", "Mauro Icardi", "Franck Kessié", "Joško Gvardiol", "Yann Sommer", "Arda Güler",
      "Artem Dovbyk",
    ],
  },
  {
    episode: 4,
    name: "Mixed",
    players: [
      "Alisson Becker", "Rodrygo", "Trent Alexander-Arnold", "Marc-André ter Stegen", "Rúben Neves", "Pierre-Emerick Aubameyang",
      "Micky van de Ven", "Antoine Griezmann", "Raheem Sterling", "Éder Militão", "Ivan Toney", "Marcelo Brozović",
      "Joselu", "Bradley Barcola", "Keylor Navas", "Christian Eriksen", "Victor Lindelöf", "Hirving Lozano",
      "Wissam Ben Yedder", "Sébastien Haller", "Geoffrey Kondogbia", "Wilfried Zaha", "Sofyan Amrabat", "Jordan Henderson",
      "Fabinho", "David de Gea", "Sergio Busquets", "Jordi Alba", "Nicolas Pépé", "Isco", "Iago Aspas", "Gerard Moreno",
      "Unai Simón", "Pau Torres", "Fabián Ruiz", "Mikel Oyarzabal", "Bryan Mbeumo", "Patrik Schick", "Harry Maguire",
      "Scott McTominay", "John Stones", "Jack Grealish", "Kalvin Phillips", "Aaron Ramsdale", "Bernd Leno",
      "Nico Schlotterbeck", "Mats Hummels", "Julian Brandt", "Karim Adeyemi", "Donyell Malen",
    ],
  },
  {
    episode: 5,
    name: "Mixed",
    players: [
      "Antonio Rüdiger", "Raphinha", "Federico Dimarco", "Cody Gakpo", "Thomas Müller", "Endrick", "Lisandro Martínez",
      "Leandro Trossard", "Michael Olise", "Kaoru Mitoma", "Kenan Yıldız", "Nicolas Jackson", "Savinho", "Dani Olmo",
      "Rasmus Højlund", "Ibrahima Konaté", "Joshua Zirkzee", "Gabriel Magalhães", "Tijjani Reijnders", "David Raya",
      "Amadou Onana", "Riccardo Calafiori", "Jhon Durán", "Kingsley Coman", "Sandro Tonali", "Ferdi Kadıoğlu",
      "Christopher Nkunku", "Hee-chan Hwang", "Destiny Udogie", "Manuel Akanji", "Marc Cucurella", "Mario Lemina",
      "Jérémy Doku", "Eberechi Eze", "Diogo Dalot", "Dayot Upamecano", "Dominic Solanke", "Aleix García",
      "Moisés Caicedo", "Mateo Kovačić", "Alejandro Balde", "Jonathan Tah", "Ian Maatsen", "Edson Álvarez",
      "Dejan Kulusevski", "Benjamin Pavard", "Leon Bailey", "Pedro Neto", "Ryan Gravenberch", "Malo Gusto",
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
