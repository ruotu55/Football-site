/**
 * Add Guess The Player By Career Stats (runner 4) long-form blocks.
 * Run: node .Storage/Scripts/add-career-stats-blocks.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_IMPORT_ALIASES, PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");
const teamsIndexPath = path.join(root, ".Storage/data/teams-index.json");

const RUNNER_ID = 4;
const TYPE = "long";

const COMPETITIONS = [
  {
    episode: 1,
    name: "Mixed 1",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Lamine Yamal", "Bukayo Saka", "Vinícius Júnior", "Jamal Musiala",
      "Mohamed Salah", "Jude Bellingham", "Rodri", "Florian Wirtz", "Raphinha", "Michael Olise", "Nicolò Barella",
      "Antoine Semenyo", "Bradley Barcola", "Alessandro Bastoni", "Dominik Szoboszlai", "Vitinha", "Ollie Watkins",
      "Lautaro Martínez", "Ibrahim Maza", "Joaquín Panichelli", "Kennet Eichhorn", "Johan Manzambi",
      "Moisés Paniagua", "Rayan", "Esteban Lepaul", "Deniz Undav", "Bazoumana Toure", "Antoine Griezmann",
    ],
  },
  {
    episode: 2,
    name: "Mixed 2",
    players: [
      "Harry Kane", "Pedri", "Cole Palmer", "Bruno Fernandes", "Robert Lewandowski", "Thibaut Courtois",
      "Phil Foden", "Federico Valverde", "Khvicha Kvaratskhelia", "William Saliba", "Donyell Malen",
      "Christian Pulisic", "Marc Guéhi", "Désiré Doué", "Ademola Lookman", "Hakan Çalhanoğlu", "Marcus Rashford",
      "Lucas Paquetá", "Viktor Gyökeres", "Alexander Isak", "Can Uzun", "Robin Risser", "Murillo", "Jorrel Hato",
      "Adam Wharton", "Leny Yoro", "Oscar Bobb", "Mathys Tel", "Archie Gray", "Son Heung-Min",
    ],
  },
  {
    episode: 3,
    name: "Mixed 3",
    players: [
      "Kevin De Bruyne", "Martin Ødegaard", "Alisson Becker", "Rafael Leão", "Rodrygo", "Gavi", "Declan Rice",
      "Bernardo Silva", "Dušan Vlahović", "Ruben Dias", "Benjamin Šeško", "Serhou Guirassy", "Nico Williams",
      "Luis Díaz", "Jeremie Frimpong", "Alejandro Grimaldo", "Warren Zaïre-Emery", "James Maddison", "Darwin Núñez",
      "Gabriel Martinelli", "Valentin Barco", "Claudio Echeverri", "Nestory Irankunda", "Franco Mastantuono",
      "Sverre Nypan", "Assane Diao", "George Ilenikhena", "Jobe Bellingham", "Francesco Camarda", "Virgil van Dijk",
    ],
  },
  {
    episode: 4,
    name: "Mixed 4",
    players: [
      "Luka Modrić", "Ederson", "Theo Hernández", "Bruno Guimarães", "Alphonso Davies", "Marquinhos",
      "Joshua Kimmich", "Ronald Araújo", "Mike Maignan", "Kingsley Coman", "Moussa Diaby", "Amadou Onana",
      "Brennan Johnson", "Jérémy Doku", "Gonçalo Ramos", "Takefusa Kubo", "Karim Adeyemi", "Federico Chiesa",
      "Manuel Locatelli", "Gianluca Scamacca", "Mattéo Guendouzi", "Arthur Vermeeren", "Eliesse Ben Seghir",
      "Pau Cubarsí", "Lewis Hall", "Lewis Miley", "Kobbie Mainoo", "Stefan Bajčetić", "Jamie Gittens",
      "Frenkie de Jong",
    ],
  },
  {
    episode: 5,
    name: "Mixed 5",
    players: [
      "Emiliano Martínez", "Jan Oblak", "Achraf Hakimi", "Christopher Nkunku", "Ousmane Dembélé",
      "Aurélien Tchouaméni", "Eduardo Camavinga", "Julián Álvarez", "Gabriel Magalhães", "Douglas Luiz",
      "Eberechi Eze", "Kaoru Mitoma", "Micky van de Ven", "Bryan Mbeumo", "Lucas Hernandez", "Marcus Thuram",
      "David Alaba", "Serge Gnabry", "Alan Varela", "Santiago Giménez", "Roony Bardghji", "Wilfried Gnonto",
      "Lucas Beltrán", "Gift Orban", "Johan Bakayoko", "Ernest Nuamah", "Antonio Silva", "Piero Hincapié",
      "Aleksandar Pavlović", "Julian Brandt",
    ],
  },
  {
    episode: 6,
    name: "Mixed 6",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Lamine Yamal", "Bukayo Saka", "Vinícius Júnior", "Maximilian Mittelstädt",
      "Angelo Stiller", "Jamie Leweling", "Waldemar Anton", "Hiroki Ito", "Tammy Abraham", "Rodrigo De Paul",
      "Kenneth Taylor", "Abdoul Koné", "Jhon Jhon", "Nilson Angulo", "Robinio Vaz", "Pablo", "Rayan",
      "Lorenzo Lucca", "Kader Meïté", "Jørgen Strand Larsen", "Antoine Semenyo", "Marc Guéhi", "Oscar Bobb",
      "Conor Gallagher", "Lucas Paquetá", "Gerson", "Taty Castellanos", "Antoine Griezmann",
    ],
  },
  {
    episode: 7,
    name: "Mixed 7",
    players: [
      "Harry Kane", "Jamal Musiala", "Mohamed Salah", "Jude Bellingham", "Rodri", "Martin Zubimendi",
      "Alejandro Baena", "Artem Dovbyk", "Savinho", "Victor Boniface", "Loïs Openda", "Xavi Simons", "João Neves",
      "Manuel Ugarte", "Gianluigi Donnarumma", "Lucas Beraldo", "Milan Škriniar", "Warren Zaïre-Emery", "Vitinha",
      "Bradley Barcola", "Elias Saad", "Jan-Niklas Beste", "Tim Kleindienst", "Merlin Röhl", "Brajan Gruda",
      "Paul Wanner", "Frans Krätzig", "Aleksandar Pavlović", "Mathys Tel", "Joshua Kimmich",
    ],
  },
  {
    episode: 8,
    name: "Mixed 8",
    players: [
      "Thibaut Courtois", "Cristiano Ronaldo", "Vinícius Júnior", "Arda Güler", "Endrick", "Dani Carvajal",
      "Ferland Mendy", "Antonio Rüdiger", "Éder Militão", "David Alaba", "Joselu", "Brahim Díaz",
      "Eduardo Camavinga", "Aurélien Tchouaméni", "Jude Bellingham", "Luka Modrić", "Fran García",
      "Kepa Arrizabalaga", "Lucas Vázquez", "Rodrygo", "Nico Paz", "Sergio Arribas", "Takefusa Kubo",
      "Miguel Gutiérrez", "Martin Ødegaard", "Achraf Hakimi", "Theo Hernández", "Mateo Kovačić", "Álvaro Morata",
      "Federico Valverde",
    ],
  },
  {
    episode: 9,
    name: "Mixed 9",
    players: [
      "Lionel Messi", "Sergio Busquets", "Luis Suárez", "Jordi Alba", "Neymar", "Karim Benzema", "Sadio Mané",
      "Riyad Mahrez", "N'Golo Kanté", "Kalidou Koulibaly", "Fabinho", "Roberto Firmino", "Jordan Henderson",
      "Aymeric Laporte", "Marcelo Brozović", "Aleksandar Mitrović", "Sergej Milinković-Savić", "Ruben Neves",
      "Allan Saint-Maximin", "Yannick Carrasco", "Gabri Veiga", "Franck Kessié", "Roger Ibañez", "Merih Demiral",
      "Seko Fofana", "Édouard Mendy", "Yassine Bounou", "David Ospina", "Grzegorz Krychowiak", "Ivan Rakitić",
    ],
  },
  {
    episode: 10,
    name: "Mixed 10",
    players: [
      "Kylian Mbappé", "Erling Haaland", "Jude Bellingham", "Lamine Yamal", "Vinícius Júnior", "Bukayo Saka",
      "Phil Foden", "Harry Kane", "Rodri", "Jamal Musiala", "Malo Gusto", "Levi Colwill", "Axel Disasi",
      "Benoît Badiashile", "Enzo Fernández", "Moisés Caicedo", "Roméo Lavia", "Christopher Nkunku", "Nicolas Jackson",
      "Cole Palmer", "Jorrel Hato", "Devyne Rensch", "Kenneth Taylor", "Brian Brobbey", "Steven Bergwijn",
      "Jordan Henderson", "Chuba Akpom", "Mika Godts", "Kristian Hlynsson", "Son Heung-Min",
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
    const squadPath = path.join(root, rel);
    let squad;
    try {
      squad = JSON.parse(await fs.readFile(squadPath, "utf8"));
    } catch {
      continue;
    }
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
