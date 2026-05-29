import assert from "node:assert/strict";
import {
  blockTeamsImportText,
  extractTeamsImportTextFromScript,
  hydrateLegacyBlocks,
} from "../.Storage/shared/block-import-text.js";

const script = {
  levels: [
    { isLogo: true },
    { searchText: "Real Madrid", selectedEntry: { name: "Real Madrid", country: "Spain" } },
    { searchText: "Manchester City", selectedEntry: { name: "Manchester City", country: "England" } },
    { isOutro: true },
  ],
};

assert.equal(
  extractTeamsImportTextFromScript(script),
  "Real Madrid - Spain\nManchester City - England",
);

const block = { name: "Champion League", script };
assert.equal(blockTeamsImportText(block), "Real Madrid - Spain\nManchester City - England");

const blocks = { "1|long|1": { ...block } };
hydrateLegacyBlocks(blocks);
assert.match(blocks["1|long|1"].teamsImportText, /Real Madrid - Spain/);

assert.equal(blockTeamsImportText({ teamsImportText: "Barcelona - Spain" }), "Barcelona - Spain");

console.log("block-import-text tests passed");
