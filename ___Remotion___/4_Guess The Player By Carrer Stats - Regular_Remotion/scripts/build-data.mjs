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
  norm,
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

// Shared across ALL runners: canonical squad player name → EXACT display name,
// NOTE: the shared player-name overrides (player_name_overrides_shared.json) are
// INTENTIONALLY NOT applied here. That rename feature is scoped to the lineup
// runners 1 & 2 (where short card names matter). Runners 3 & 4 ALWAYS show the
// player's FULL real name on the reveal, so the override must not reach them.
const playerDisplay = (name) => name; // FULL real name — no override

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

// Resolve the NO-BACKGROUND "Ready photos" the prep panel manages
// (Images/Players No Background/Ready photos/{Player}_{Club}/{Player}.png|webp),
// falling back to the standard club-image folder. This MUST match what the prep
// panel + the silhouette/reveal expect — the same resolver runner 3 uses.
function buildReadyPhotoIndex(IMAGES) {
  const READY_DIR = path.join(IMAGES, "Players No Background", "Ready photos");
  const byKey = new Map(); // norm(playerName) → relative path
  if (!fs.existsSync(READY_DIR)) return (playerName, club) => resolvePhoto(club, playerName);
  let entries = [];
  try {
    entries = fs.readdirSync(READY_DIR, { withFileTypes: true });
  } catch {
    return (playerName, club) => resolvePhoto(club, playerName);
  }
  // Subdirectories: "{Player}_{Club}/" → look for {Player}.png/webp
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dirName = e.name;
    const underscoreIdx = dirName.lastIndexOf("_");
    if (underscoreIdx < 1) continue;
    const pName = dirName.slice(0, underscoreIdx).trim();
    if (!pName) continue;
    const dirPath = path.join(READY_DIR, dirName);
    let subEntries = [];
    try {
      subEntries = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const ext of ["png", "webp", "PNG", "WebP"]) {
      const candidate = subEntries.find(
        (f) => f.toLowerCase() === `${pName.toLowerCase()}.${ext.toLowerCase()}` || norm(f).startsWith(norm(pName)),
      );
      if (candidate) {
        const k = norm(pName);
        if (!byKey.has(k)) byKey.set(k, path.relative(IMAGES, path.join(dirPath, candidate)).replace(/\\/g, "/"));
        break;
      }
    }
  }
  // Flat files in the Ready photos root: "{Player}.png/webp"
  for (const e of entries) {
    if (!e.isFile()) continue;
    const match = e.name.match(/^(.+)\.(png|webp)$/i);
    if (!match) continue;
    const k = norm(match[1]);
    if (!byKey.has(k)) byKey.set(k, path.relative(IMAGES, path.join(READY_DIR, e.name)).replace(/\\/g, "/"));
  }
  return (playerName, club) => {
    const k = norm(playerName);
    if (byKey.has(k)) return byKey.get(k);
    return resolvePhoto(club, playerName);
  };
}
const resolvePlayerPhoto = buildReadyPhotoIndex(P.IMAGES);

const resolveClubCrest = buildClubCrestIndex(P.IMAGES);

// Best-effort crest fallback. `buildClubCrestIndex` rejects AMBIGUOUS names (e.g.
// "Al-Ittihad" matches both Saudi "Al-Ittihad Club" + Libya "Al-Ittihad SC") →
// "?". The browser prep still shows a crest via findBestCareerClubEntry's SCORING
// (ties → first), so mirror that here so the video doesn't show "?" where the prep
// shows a logo. (Crests the user fetches in the prep override the auto-pick.)
function buildBestEffortCrest(IMAGES) {
  const TEAMS = path.join(IMAGES, "Teams");
  const files = []; // { low, nrm, rel }
  const walk = (dir) => {
    let ents = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!/Competitions/i.test(p)) walk(p);
      } else if (/\.(png|webp|jpe?g)$/i.test(e.name)) {
        const stem = e.name.replace(/\.(png|webp|jpe?g)$/i, "");
        files.push({ low: stem.toLowerCase().trim(), nrm: norm(stem), rel: path.relative(IMAGES, p).replace(/\\/g, "/") });
      }
    }
  };
  if (fs.existsSync(TEAMS)) walk(TEAMS);
  // Tie-break by COUNTRY PROMINENCE (path = Teams/<country>/<league>/<club>) so an
  // ambiguous name picks the major-football-nation club (e.g. "Al-Ittihad" → Saudi
  // Arabia, not Libya). NOTE: don't match league names by substring — "Libyan
  // Premier League" contains "Premier League".
  const TOP = new Set(["england", "spain", "italy", "germany", "france", "saudi arabia"]);
  const BIG = new Set(["portugal", "netherlands", "türkiye", "turkey", "united states", "brazil", "argentina", "belgium", "mexico", "qatar", "uae", "united arab emirates"]);
  const countryPrio = (rel) => {
    const parts = rel.split("/");
    const country = (parts[1] || "").toLowerCase();
    if (country.includes("other teams")) return 8; // curated prominent set
    if (TOP.has(country)) return 6;
    if (BIG.has(country)) return 4;
    return 2;
  };
  return (clubName) => {
    const t = String(clubName || "").toLowerCase().trim();
    if (!t) return null;
    const tn = norm(clubName);
    let best = null;
    let bestScore = -1;
    for (const f of files) {
      let s = -1;
      if (f.low === t) s = 100;
      else if (f.nrm && tn && f.nrm === tn) s = 95;
      else if (f.low === `${t} fc`) s = 92;
      else if (f.low.startsWith(`${t} `)) s = 88;
      else if (t.startsWith(`${f.low} `)) s = 84;
      else if (f.low.includes(t)) s = 72;
      else if (t.includes(f.low)) s = 68;
      else if (f.nrm && tn && (f.nrm.includes(tn) || tn.includes(f.nrm))) s = 60;
      if (s < 60) continue;
      const combined = s * 10 + countryPrio(f.rel); // major-nation wins ties
      if (combined > bestScore) {
        best = f;
        bestScore = combined;
      }
    }
    return best ? best.rel : null;
  };
}
const resolveClubCrestBest = buildBestEffortCrest(P.IMAGES);

// Youth / reserve / "without club" entries are noise (and have no crest → "?").
// Mirror the prep's cleanCareerHistory filter so the video's clubs match the prep.
const isJunkClub = (name) => {
  const n = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!n) return true;
  if (/without\s*club/.test(n)) return true;
  if (n.includes("youth") || n.includes("yth") || n.includes("jugend") || n.includes("academy")) return true;
  if (/\bu\d{2}\b/.test(n)) return true; // U15, U19, U21…
  if (/\bii\b/.test(n)) return true; // reserve "II"
  if (/\breserves?\b/.test(n)) return true;
  if (n.endsWith(" b")) return true; // reserve "B" team
  return false;
};

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

  // Prep-edited career history (block.script.levels[i].careerHistory) keyed by
  // player name — the prep panel auto-saves the cleaned clubs there.
  const editedCareerByPlayer = new Map();
  for (const lvl of Array.isArray(block.script?.levels) ? block.script.levels : []) {
    const pn = String(lvl?.careerPlayer?.name || "").trim().toLowerCase();
    if (pn && Array.isArray(lvl?.careerHistory) && !editedCareerByPlayer.has(pn)) {
      editedCareerByPlayer.set(pn, lvl.careerHistory);
    }
  }

  const levels = [];
  for (const line of lines) {
    // format: "PlayerName - Club"
    const dashIdx = line.indexOf(" - ");
    if (dashIdx < 0) continue;
    const playerName = line.slice(0, dashIdx).trim();
    const club = line.slice(dashIdx + 3).trim();
    if (!playerName) continue;

    const rec = sq.findPlayer(club, playerName);
    const photo = resolvePlayerPhoto(playerName, club);
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

    // Clubs: PREFER the prep's edited careerHistory (block.script — already cleaned,
    // deduped, youth/reserve removed → matches what the prep's clubs grid shows);
    // else fall back to the raw squad transfer_history with the same junk filter.
    const editedHist = editedCareerByPlayer.get(playerName.toLowerCase());
    const rawHist = Array.isArray(editedHist) && editedHist.length ? editedHist : rec?.transfer_history || [];
    const clubs = rawHist
      .filter((h) => h && h.club && !isJunkClub(h.club))
      .map((h) => ({
        club: h.club,
        crestPath: resolveClubCrest(h.club) || resolveClubCrestBest(h.club),
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
      display: playerDisplay(playerName),
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
// Intro greeting voice ("Welcome to the Ultimate Football Quiz") — runner-4-only,
// plays over the Ultimate intro before the quiz-title voice. Stored in
// .Storage/Voices/Intro Greeting/careerstats/<lang>/.
const introGreetingEn = V.voiceRel(V.findVoiceFile("Intro Greeting/careerstats/english", /intro/i));
const introGreetingEs = V.voiceRel(V.findVoiceFile("Intro Greeting/careerstats/spanish", /intro/i));
audio.introGreeting = { english: introGreetingEn, spanish: introGreetingEs };
audio.introGreetingDurationSec = {
  english: V.audioDurationSec(introGreetingEn),
  spanish: V.audioDurationSec(introGreetingEs),
};
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
