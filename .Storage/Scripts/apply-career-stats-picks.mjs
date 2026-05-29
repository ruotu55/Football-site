/**
 * Apply manual player→club picks to runner 4 blocks; remove retired Jordi Alba from Mixed 9.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");

function fold(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/-/g, " ");
}

const PICKS = Object.entries({
  "Emiliano Martínez": PLAYER_MANUAL_CLUBS["emiliano martinez"],
  "Lucas Hernandez": PLAYER_MANUAL_CLUBS["lucas hernandez"],
  "Pablo": PLAYER_MANUAL_CLUBS.pablo,
  "Alejandro Baena": PLAYER_MANUAL_CLUBS["alejandro baena"],
  "Dani Carvajal": PLAYER_MANUAL_CLUBS["dani carvajal"],
  "Endrick": PLAYER_MANUAL_CLUBS.endrick,
  "Enzo Fernández": PLAYER_MANUAL_CLUBS["enzo fernandez"],
  "Fabinho": PLAYER_MANUAL_CLUBS.fabinho,
  "Gerson": PLAYER_MANUAL_CLUBS.gerson,
  "Luis Suárez": PLAYER_MANUAL_CLUBS["luis suarez"],
  "Sergio Arribas": PLAYER_MANUAL_CLUBS["sergio arribas"],
});

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
let fixed = 0;

for (const [key, block] of Object.entries(store.blocks || {})) {
  if (!key.startsWith("4|long|")) continue;
  let lines = String(block.teamsImportText || "").split(/\r?\n/).filter(Boolean);

  if (key === "4|long|9") {
    const before = lines.length;
    lines = lines.filter((line) => fold(line.split(" - ")[0]) !== "jordi alba");
    if (lines.length < before) console.log("Removed Jordi Alba from Mixed 9.");
  }

  lines = lines.map((line) => {
    const idx = line.lastIndexOf(" - ");
    if (idx <= 0) return line;
    const player = line.slice(0, idx);
    const right = line.slice(idx + 3);
    if (right !== "?") return line;
    for (const [name, club] of PICKS) {
      if (fold(player) === fold(name)) {
        fixed++;
        return `${player} - ${club}`;
      }
    }
    return line;
  });

  block.teamsImportText = lines.join("\n");
  block.updatedAt = Date.now();
}

await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Updated ${fixed} player lines in runner 4 blocks.`);

const mixed9 = store.blocks["4|long|9"]?.teamsImportText || "";
const remaining = mixed9.split("\n").filter((l) => l.endsWith(" - ?"));
if (remaining.length) {
  console.log("Still need pick:", remaining.map((l) => l.replace(" - ?", "")).join(", "));
}
