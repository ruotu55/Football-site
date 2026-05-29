import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const statusPath = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  ".Storage/storage/recording-status.json",
);

function fold(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/-/g, " ");
}

const PICKS = [
  ["Alex Baena", PLAYER_MANUAL_CLUBS["alex baena"]],
  ["João Pedro", PLAYER_MANUAL_CLUBS["joao pedro"]],
];

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
let n = 0;
for (const [key, block] of Object.entries(store.blocks || {})) {
  if (!key.startsWith("5|long|")) continue;
  let lines = String(block.teamsImportText || "").split(/\r?\n/);
  lines = lines.map((line) => {
    if (!line.endsWith(" - ?")) return line;
    const player = line.slice(0, -4);
    for (const [name, club] of PICKS) {
      if (fold(player) === fold(name)) {
        n++;
        return `${player} - ${club}`;
      }
    }
    return line;
  });
  block.teamsImportText = lines.join("\n");
}
await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Fixed ${n} runner 5 lines.`);
