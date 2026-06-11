// Runner 8 — "Guess the Football Player Name".
// Saves store only a player list (teamsImportText: "PlayerName - Club" per line).
// Emits src/generated/{saves,audio}.json and syncs assets into <repo>/.remotion-shared/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  displayName,
  buildPhotoIndex,
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

const resolvePhoto = buildPhotoIndex(P.IMAGES);
// Player reveal voices live in "Players Names/<lang>/<phrase>/<Player>.mp3"
const V = makeVoiceHelpers(P.VOICES_SRC, "Players Names");

let missingPhotos = 0;
let missingRevealVoices = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("8|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue; // unnamed blocks are placeholders
  const lines = String(block.teamsImportText || "")
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) continue;

  const levels = [];
  for (const line of lines) {
    const dashIdx = line.indexOf(" - ");
    const playerName = dashIdx >= 0 ? line.slice(0, dashIdx).trim() : line.trim();
    const club = dashIdx >= 0 ? line.slice(dashIdx + 3).trim() : "";
    if (!playerName) continue;

    const photoPath = resolvePhoto(club, playerName);
    if (!photoPath) missingPhotos += 1;

    const revealVoiceEn = V.resolveTeamVoice(playerName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(playerName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      playerName,
      display: displayName(playerName),
      photoPath,
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
console.log(`  unresolved: photos ${missingPhotos}, reveal voices ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
// Exact filenames confirmed in .Storage/Voices/Game name/Four Params Regular/english/
const quizTitleEn = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/english", /player name/i));
// Spanish "player name" quiz title — may not exist; falls back to null gracefully
const quizTitleEs = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/spanish", /nombre del jugador/i));
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`);

// ── sync assets + voices into the shared public folder ────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.photoPath);
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);
