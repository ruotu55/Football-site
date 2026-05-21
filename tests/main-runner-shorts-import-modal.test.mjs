import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

/** Every Shorts app in the repo (Main Runner + standalone shorts runners). */
const runnerDirs = [
  "1_Guess The Football Team Name - Main Runner - Shorts",
  "2_Guess The Football National Team - Main Runner - Shorts",
  "3_Guess The Player By Carrer Path - Main Runner - Shorts",
  "4_Guess The Player By Carrer Stats - Shorts",
  "5_Guess The Player By Club_Position_Country_Age - Shorts",
  "6_Guess The Fake Informaiton - Shorts",
  "7_Guess The Football Team Logo Name - Main Runner - Shorts",
  "8_Guess The Football Player Name - Main Runner - Shorts",
];

for (const dir of runnerDirs) {
  const css = await readFile(new URL(`../${dir}/css/components/swap-modal.css`, import.meta.url), "utf8");
  const savedScripts = await readFile(new URL(`../${dir}/js/saved-scripts.js`, import.meta.url), "utf8");

  assert.match(
    css,
    /body\.shorts-mode\s+#import-script-modal\s+\.swap-modal-content/,
    `${dir}: import modal needs a shorts-safe-column content rule.`
  );
  assert.match(
    css,
    /body\.shorts-mode\.import-script-modal-open\s+#career-inline-player-picker/,
    `${dir}: No Player Selected picker must be hidden while import modal is open.`
  );
  assert.match(
    savedScripts,
    /document\.body\.appendChild\(els\.importScriptModal\)/,
    `${dir}: import modal must portal to body so it can stack above body-mounted pickers.`
  );
  assert.match(
    savedScripts,
    /document\.body\.classList\.add\("import-script-modal-open"\)/,
    `${dir}: opening import modal must mark the body so the picker disappears.`
  );
  assert.match(
    savedScripts,
    /document\.body\.classList\.remove\("import-script-modal-open"\)/,
    `${dir}: closing import modal must restore normal picker visibility.`
  );
}
