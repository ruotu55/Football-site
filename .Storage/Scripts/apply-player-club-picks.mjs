/**
 * Apply manual player→club picks to runner 3 blocks in recording-status.json.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_MANUAL_CLUBS } from "../shared/import-player-manual-clubs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statusPath = path.join(root, ".Storage/storage/recording-status.json");

const PICKS = [
  ["Alisson Becker", PLAYER_MANUAL_CLUBS["alisson becker"]],
  ["Gabriel Magalhães", PLAYER_MANUAL_CLUBS["gabriel magalhaes"]],
  ["Rodri", PLAYER_MANUAL_CLUBS.rodri],
  ["Marquinhos", PLAYER_MANUAL_CLUBS.marquinhos],
  ["Vitinha", PLAYER_MANUAL_CLUBS.vitinha],
  ["Luis Díaz", PLAYER_MANUAL_CLUBS["luis diaz"]],
  ["Cristian Romero", PLAYER_MANUAL_CLUBS["cristian romero"]],
];

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
let fixed = 0;

for (const [key, block] of Object.entries(store.blocks || {})) {
  if (!key.startsWith("3|long|")) continue;
  let text = String(block.teamsImportText || "");
  let changed = false;
  for (const [player, club] of PICKS) {
    const before = `${player} - ?`;
    const after = `${player} - ${club}`;
    if (text.includes(before)) {
      text = text.split(before).join(after);
      changed = true;
      fixed++;
    }
  }
  if (changed) {
    block.teamsImportText = text;
    block.updatedAt = Date.now();
  }
}

await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Updated ${fixed} player lines across runner 3 blocks.`);
