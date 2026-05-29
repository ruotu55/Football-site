/** Remove retired/missing players from runner 4 Mixed 9. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const statusPath = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  ".Storage/storage/recording-status.json",
);

const REMOVE = new Set(["grzegorz krychowiak", "ivan rakitic"]);

function fold(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/-/g, " ");
}

const store = JSON.parse(await fs.readFile(statusPath, "utf8"));
const block = store.blocks?.["4|long|9"];
if (block) {
  const lines = String(block.teamsImportText || "")
    .split(/\r?\n/)
    .filter((line) => {
      const player = line.split(" - ")[0];
      return !REMOVE.has(fold(player));
    });
  block.teamsImportText = lines.join("\n");
  block.updatedAt = Date.now();
  await fs.writeFile(statusPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  console.log(`Mixed 9 now has ${lines.length} players.`);
}
