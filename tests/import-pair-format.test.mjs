import assert from "node:assert/strict";
import {
  parseImportText,
  teamNamesFromPairEntries,
  parseLegacyImportList,
} from "../.Storage/shared/import-pair-format.js";

const teamLines = `Real Madrid - Spain
Manchester City - England
Bayern Munich - Germany`;

const parsed = parseImportText(teamLines, { legacyItemLabel: "teams", entryType: "team-country" });
assert.equal(parsed.entries.length, 3);
assert.equal(parsed.entries[0].left, "Real Madrid");
assert.equal(parsed.entries[0].right, "Spain");

assert.deepEqual(teamNamesFromPairEntries(parsed.entries), [
  "Real Madrid",
  "Manchester City",
  "Bayern Munich",
]);

const playerLines = `Kylian Mbappé - Real Madrid\nErling Haaland - Manchester City`;
const players = parseImportText(playerLines, { legacyItemLabel: "players", entryType: "player-team" });
assert.equal(players.entries[0].type, "player-team");
assert.equal(players.entries[0].right, "Real Madrid");

const legacy = parseImportText("[Team A, Team B]", { legacyItemLabel: "teams", entryType: "team-country" });
assert.deepEqual(legacy.names, ["Team A", "Team B"]);

const legacyPlayers = parseLegacyImportList("Player One, Player Two", { itemLabel: "players" });
assert.deepEqual(legacyPlayers.names, ["Player One", "Player Two"]);

console.log("import-pair-format tests passed");
