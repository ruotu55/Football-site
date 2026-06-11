// Runner 7 — "Guess the Football Team Logo Name".
// Each save block (prefix "7|") has teamsImportText lines "TeamName - Country".
// The clue is the team crest (obscured); the answer is the team name.
// Emits src/generated/{saves,audio}.json and syncs assets into <repo>/.remotion-shared/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  buildClubCrestIndex,
  makeVoiceHelpers,
  REVEAL_EN,
  REVEAL_ES,
  COMMON_ASSETS,
  buildAudioManifest,
  firstBgm,
  syncAssets,
  syncVoices,
} from "../../../.remotion-shared/src/build-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const P = repoPaths(projectDir);

const resolveClubCrest = buildClubCrestIndex(P.IMAGES);
// Team name reveal voices live in "Team names/<lang>/<phrase>/<Team>.mp3"
const V = makeVoiceHelpers(P.VOICES_SRC, "Team names");

let missingCrests = 0;
let missingRevealVoices = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("7|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue; // unnamed blocks are placeholders (shorts)
  const lines = String(block.teamsImportText || "")
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) continue;

  const levels = [];
  for (const line of lines) {
    const parts = line.split(" - ");
    const teamName = parts[0].trim();
    if (!teamName) continue;

    const crestPath = resolveClubCrest(teamName);
    if (!crestPath) missingCrests += 1;

    const revealVoiceEn = V.resolveTeamVoice(teamName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(teamName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      teamName,
      crestPath,
      revealVoiceEn,
      revealVoiceEs,
    });
  }
  if (levels.length) saves.push({ name, levels });
}

const OUT = path.join(projectDir, "src", "generated", "saves.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ saves }, null, 0));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✓ ${saves.length} saves, ${saves.reduce((n, s) => n + s.levels.length, 0)} levels -> src/generated/saves.json (${kb} KB)`);
console.log(`  unresolved: crests ${missingCrests}, reveal voices ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);

// Quiz title voice — "Guess the football team name !!!.mp3" in Four Params Regular/english
// Spanish version does not exist in this folder (only EN "Guess the football team name"
// was recorded); we pass null for ES and let the duration fall back.
const quizTitleEn = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/english", /team name/i));
const quizTitleEs = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/spanish", /equipo/i));

const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`);

// ── sync assets + voices into the shared public folder ────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.crestPath);
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);
