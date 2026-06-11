// Runner 5 — "Guess the Player by Club / Position / Country / Age".
// Saves store "PlayerName - Club" lines (one per level).
// The full player record (position, nationality, age) is resolved from the
// club squad JSON. Emits src/generated/{saves,audio}.json and syncs assets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  displayName,
  buildPhotoIndex,
  buildClubCrestIndex,
  buildFlagResolver,
  buildSquadPlayerIndex,
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

// Position full name → English abbreviation (matches browser runner's SQUAD_POSITION_TO_ABBREV).
const POSITION_TO_ABBREV = {
  Goalkeeper: "GK",
  "Centre-Back": "CB",
  "Left-Back": "LB",
  "Right-Back": "RB",
  "Defensive Midfield": "CDM",
  "Central Midfield": "CM",
  "Attacking Midfield": "CAM",
  "Left Midfield": "LM",
  "Right Midfield": "RM",
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Centre-Forward": "ST",
  "Second Striker": "ST",
  Striker: "ST",
};

const toPositionAbbrev = (raw) => {
  const key = String(raw || "").trim();
  if (!key) return "";
  if (POSITION_TO_ABBREV[key]) return POSITION_TO_ABBREV[key];
  // "Center-" variant fallback
  const centreKey = key.replace(/^Center-/i, "Centre-");
  return POSITION_TO_ABBREV[centreKey] || key;
};

const resolvePhoto = buildPhotoIndex(P.IMAGES);
const resolveClubCrest = buildClubCrestIndex(P.IMAGES);
const { resolveFlag, usedFlagCodes } = buildFlagResolver(P.FLAGCODES_JSON);
const sq = buildSquadPlayerIndex(P.SQUAD_FORMATION);
// Player-name reveal voices live in "Players Names/<lang>/<phrase>/<Name>.mp3".
const V = makeVoiceHelpers(P.VOICES_SRC, "Players Names");

let missingPhotos = 0;
let missingCrests = 0;
let missingFlags = 0;
let missingRevealVoices = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("5|")) continue;
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
    // format: "PlayerName - Club"
    const dashIdx = line.indexOf(" - ");
    if (dashIdx < 0) continue;
    const playerName = line.slice(0, dashIdx).trim();
    const club = line.slice(dashIdx + 3).trim();
    if (!playerName) continue;

    // Try to resolve full player record from squad JSON
    const rec = sq.findPlayer(club, playerName);

    const photo = resolvePhoto(club, playerName);
    const crest = resolveClubCrest(club);
    const position = toPositionAbbrev(rec?.position || "");
    const country = rec?.nationality || "";
    const flagPath = country ? resolveFlag(country) : null;
    const age = rec?.age ?? "";

    if (!photo) missingPhotos += 1;
    if (!crest) missingCrests += 1;
    if (country && !flagPath) missingFlags += 1;

    const revealVoiceEn = V.resolveTeamVoice(playerName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(playerName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      display: displayName(playerName),
      playerName,
      photoPath: photo,
      clubCrestPath: crest,
      position,
      country,
      countryFlagPath: flagPath,
      age,
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
console.log(`  unresolved: photos ${missingPhotos}, crests ${missingCrests}, flags ${missingFlags}, reveal-voices ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
// Quiz title voice: "Guess the player by club position country and age !!!.mp3"
const quizTitleEn = V.voiceRel(
  V.findVoiceFile("Game name/Four Params Regular/english", /club.*position.*country.*age/i),
);
const quizTitleEs = V.voiceRel(
  V.findVoiceFile("Game name/Four Params Regular/spanish", /club.*posici/i),
);
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(
  `  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`,
);

// ── sync assets + voices into the shared public folder ────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.photoPath);
    wanted.add(lv.clubCrestPath);
    wanted.add(lv.countryFlagPath);
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);

const missingFlagFiles = [...usedFlagCodes].filter(
  (c) => !fs.existsSync(path.join(P.IMAGES, "Flags", `${c}.png`)),
);
if (missingFlagFiles.length)
  console.log(`  ⚠ missing local flags in Images/Flags/: ${missingFlagFiles.join(", ")}`);
