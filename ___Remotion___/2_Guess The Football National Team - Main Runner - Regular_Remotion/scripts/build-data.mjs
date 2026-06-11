// Runner 2 — "Guess the National Team by players' club".
// Saves store only a team list (teamsImportText); the squads are assembled here from
// the national squad JSONs in .Storage/Squad Formation/Nationalities/<Continent>/<Country>.json.
// Each player's CLUB crest is the clue (slot front); the national flag + name is the answer.
// Emits src/generated/{saves,audio}.json and syncs assets into <repo>/.remotion-shared/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  norm,
  displayName,
  buildPhotoIndex,
  buildClubCrestIndex,
  buildFlagResolver,
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
const resolveClubCrest = buildClubCrestIndex(P.IMAGES);
const { resolveFlag, usedFlagCodes } = buildFlagResolver(P.FLAGCODES_JSON);
// National-team reveal voices live in "Nationality teams names/<lang>/<phrase>/<Team>.mp3".
const V = makeVoiceHelpers(P.VOICES_SRC, "Nationality teams names");

const DEFAULT_FORMATION = "433";
const GROUPS = ["goalkeepers", "defenders", "midfielders", "attackers"];

// Read a national squad JSON for "<Name> - <Continent>".
const loadNationalSquad = (name, continent) => {
  const file = path.join(P.SQUAD_FORMATION, "Nationalities", continent, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
};

let missingPhotos = 0;
let missingCrests = 0;
let missingFlags = 0;
let missingRevealVoices = 0;
let missingSquads = 0;

const toPlayer = (p, group) => {
  const club = p.club || "";
  const clubCrestPath = resolveClubCrest(club);
  const photoPath = resolvePhoto(club, p.name);
  if (!clubCrestPath) missingCrests += 1;
  if (!photoPath) missingPhotos += 1;
  return {
    name: p.name,
    display: displayName(p.name),
    club,
    group,
    clubCrestPath,
    photoPath,
  };
};

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("2|")) continue;
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
    const parts = line.split(" - ");
    const teamName = parts[0].trim();
    const continent = (parts[1] || "").trim();
    if (!teamName) continue;
    const squad = loadNationalSquad(teamName, continent);
    if (!squad) {
      missingSquads += 1;
      continue;
    }
    const players = [];
    for (const g of GROUPS) for (const p of squad[g] || []) players.push(toPlayer(p, g));
    if (players.length < 11) continue;

    const flagPath = resolveFlag(teamName);
    if (!flagPath) missingFlags += 1;
    const revealVoiceEn = V.resolveTeamVoice(teamName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(teamName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      teamName,
      countryFlagPath: flagPath,
      formationId: DEFAULT_FORMATION,
      players,
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
console.log(`  unresolved: photos ${missingPhotos}, crests ${missingCrests}, flags ${missingFlags}, squads ${missingSquads}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
const quizTitleEn = V.voiceRel(V.findVoiceFile("Game name/Lineups Regular/english", /national team/i));
const quizTitleEs = V.voiceRel(V.findVoiceFile("Game name/Lineups Regular/spanish", /equipo nacional/i));
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`);

// ── sync assets + voices into the shared public folder ────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.countryFlagPath);
    for (const p of lv.players) {
      wanted.add(p.clubCrestPath);
      wanted.add(p.photoPath);
    }
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);

const missingFlagFiles = [...usedFlagCodes].filter((c) => !fs.existsSync(path.join(P.IMAGES, "Flags", `${c}.png`)));
if (missingFlagFiles.length) console.log(`  ⚠ missing local flags in Images/Flags/: ${missingFlagFiles.join(", ")}`);
