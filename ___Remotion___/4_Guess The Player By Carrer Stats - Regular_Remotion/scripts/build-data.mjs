// Runner 4 — "Guess the Player by Career Stats".
// Saves store "PlayerName - Club" lines (one player per level).
// The full player record (club_career_totals, national_team_career_totals,
// transfer_history, position, nationality) is resolved from the club squad JSON.
// Stats shown: appearances (Games), position bucket, goals/assists (or GK: goals_conceded/clean_sheets).
// The clubs card shows club crests from transfer_history.
// Emits src/generated/{saves,audio}.json and syncs assets into the shared public folder.
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

// ── Position mapping (matches browser runner's SQUAD_POSITION_TO_BUCKET) ──────
const POSITION_TO_BUCKET = {
  Goalkeeper: "Goalkeeper",
  "Centre-Back": "Defender",
  "Left-Back": "Defender",
  "Right-Back": "Defender",
  "Left Wing-Back": "Defender",
  "Right Wing-Back": "Defender",
  "Defensive Midfield": "Midfielder",
  "Central Midfield": "Midfielder",
  "Attacking Midfield": "Midfielder",
  "Left Midfield": "Midfielder",
  "Right Midfield": "Midfielder",
  "Left Winger": "Forward",
  "Right Winger": "Forward",
  "Centre-Forward": "Forward",
  "Second Striker": "Forward",
  Striker: "Forward",
};

const GROUP_TO_BUCKET = {
  goalkeepers: "Goalkeeper",
  defenders: "Defender",
  midfielders: "Midfielder",
  attackers: "Forward",
};

const toPositionBucket = (positionRaw, group) => {
  const key = String(positionRaw || "").trim();
  if (POSITION_TO_BUCKET[key]) return POSITION_TO_BUCKET[key];
  if (group && GROUP_TO_BUCKET[group]) return GROUP_TO_BUCKET[group];
  return key;
};

// Sum a stat field from club + national career totals (matches browser formatPlayerCareerTotalStat).
const sumCareerStat = (rec, key) => {
  const club = rec?.club_career_totals;
  const nat = rec?.national_team_career_totals;
  const vClub = club?.[key];
  const vNat = nat?.[key];
  const nClub = vClub != null && Number.isFinite(Number(vClub)) ? Number(vClub) : null;
  const nNat = vNat != null && Number.isFinite(Number(vNat)) ? Number(vNat) : null;
  if (nClub === null && nNat === null) return "";
  return (nClub ?? 0) + (nNat ?? 0);
};

const resolvePhoto = buildPhotoIndex(P.IMAGES);
const resolveClubCrest = buildClubCrestIndex(P.IMAGES);
const { resolveFlag, usedFlagCodes } = buildFlagResolver(P.FLAGCODES_JSON);
const sq = buildSquadPlayerIndex(P.SQUAD_FORMATION);
// Player-name reveal voices live in "Players Names/<lang>/<phrase>/<Name>.mp3".
const V = makeVoiceHelpers(P.VOICES_SRC, "Players Names");

let missingPhotos = 0;
let missingFlags = 0;
let missingRevealVoices = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("4|")) continue;
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

    const rec = sq.findPlayer(club, playerName);
    const photo = resolvePhoto(club, playerName);
    if (!photo) missingPhotos += 1;

    // Position bucket
    const positionBucket = toPositionBucket(rec?.position, rec?.__group);
    const isGK = positionBucket === "Goalkeeper";

    // Career totals
    const games = sumCareerStat(rec, "appearances");
    const goals = sumCareerStat(rec, "goals");
    const assists = sumCareerStat(rec, "assists");
    const goalsConceded = sumCareerStat(rec, "goals_conceded");
    const cleanSheets = sumCareerStat(rec, "clean_sheets");

    // Clubs from transfer_history (filter out "Without Club" entries)
    const transferHistory = rec?.transfer_history || [];
    const clubs = transferHistory
      .filter((h) => h.club && !/without\s*club/i.test(h.club))
      .map((h) => ({
        club: h.club,
        crestPath: resolveClubCrest(h.club),
      }));

    // Nationality + flag
    const country = rec?.nationality || "";
    const flagPath = country ? resolveFlag(country) : null;
    if (country && !flagPath) missingFlags += 1;

    // Reveal voice
    const revealVoiceEn = V.resolveTeamVoice(playerName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(playerName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      display: displayName(playerName),
      playerName,
      photoPath: photo,
      isGK,
      games,
      position: positionBucket,
      goals,
      assists,
      goalsConceded,
      cleanSheets,
      clubs,
      country,
      countryFlagPath: flagPath,
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
console.log(`  unresolved: photos ${missingPhotos}, flags ${missingFlags}, reveal-voices ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
// Quiz title voice: "Guess the football player by career stats !!!"  (Player Stats folder)
const quizTitleEn = V.voiceRel(
  V.findVoiceFile("Game name/Player Stats/english", /career stats/i),
);
const quizTitleEs = V.voiceRel(
  V.findVoiceFile("Game name/Player Stats/spanish", /estadisticas/i),
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
    wanted.add(lv.countryFlagPath);
    for (const c of lv.clubs) {
      wanted.add(c.crestPath);
    }
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
