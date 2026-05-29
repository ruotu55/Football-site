import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const calendarJs = await readFile(new URL("../999_Calander/js/calendar.js", import.meta.url), "utf8");
const statusClient = await readFile(new URL("../999_Calander/js/recording-status-client.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../999_Calander/css/styles.css", import.meta.url), "utf8");

assert.match(
  statusClient,
  /async function saveBlock\(/,
  "recording-status-client must expose a calendar write path for recording blocks.",
);

assert.match(
  calendarJs,
  /function openSaveBlockModal\(date,\s*u,\s*block\)/,
  "calendar must open a save/edit modal from an upload pill.",
);

assert.match(
  calendarJs,
  /className = "block-save-btn"/,
  "each calendar upload pill must render a top-right block save button.",
);

assert.match(
  calendarJs,
  /FCRecordingStatus\.saveBlock\(/,
  "calendar save modal must persist through the shared recording status client.",
);

assert.match(
  styles,
  /\.block-save-btn\s*\{/,
  "calendar save button needs explicit styling.",
);

assert.match(
  styles,
  /\.block-modal-textarea\s*\{/,
  "calendar save modal needs a textarea style for team lists.",
);

assert.match(
  calendarJs,
  /teamsImportTextForBlock\(block\)/,
  "calendar save modal must derive levels from legacy script blocks.",
);

assert.doesNotMatch(
  calendarJs,
  /Insert 5\+5 template/,
  "calendar must not show the removed template insert button.",
);

console.log("calendar block-save UI contract passed");
