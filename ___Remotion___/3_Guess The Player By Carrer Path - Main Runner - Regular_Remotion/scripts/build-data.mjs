// Runner 3 — "Guess the Player by Career Path".
// Saves store "PlayerName - Club" lines (one per level).
// The career history (transfer_history) is resolved from the club squad JSON.
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

const resolvePhoto = buildPhotoIndex(P.IMAGES);
const resolveClubCrest = buildClubCrestIndex(P.IMAGES);
const sq = buildSquadPlayerIndex(P.SQUAD_FORMATION);
// Player-name reveal voices live in "Players Names/<lang>/<phrase>/<Name>.mp3".
const V = makeVoiceHelpers(P.VOICES_SRC, "Players Names");

// Filter career history: remove youth/reserve clubs and "without club" entries.
// Also collapse consecutive same-club entries.
const isYouth = (name) => {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("youth") ||
    n.includes("yth") ||
    /\bu\d{2}\b/.test(n) ||
    /\bii\b/.test(n) ||
    /\breserves?\b/.test(n) ||
    n.endsWith(" b")
  );
};
const isWithoutClub = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .includes("without club");

function cleanHistory(history) {
  if (!Array.isArray(history) || !history.length) return [];
  // 1 — remove youth + without-club
  const h1 = history.filter((h) => h && !isYouth(h.club) && !isWithoutClub(h.club) && h.club);
  // 2 — collapse consecutive entries with the same year (keep last)
  const h2 = [];
  for (const item of h1) {
    if (h2.length > 0 && String(h2[h2.length - 1].year) === String(item.year)) {
      h2[h2.length - 1] = item;
    } else {
      h2.push(item);
    }
  }
  // 3 — collapse consecutive same-club entries (keep last)
  const h3 = [];
  for (const item of h2) {
    if (h3.length > 0 && norm(h3[h3.length - 1].club) === norm(item.club)) {
      h3[h3.length - 1] = item;
    } else {
      h3.push(item);
    }
  }
  return h3;
}

// Resolve "Ready photos" for career path (Images/Players No Background/Ready photos/)
// Folder pattern: {PlayerName}_{ClubName}/ with {PlayerName}.png or .webp
function buildReadyPhotoIndex(IMAGES) {
  const READY_DIR = path.join(IMAGES, "Players No Background", "Ready photos");
  const byKey = new Map(); // norm(playerName) → absolute path

  if (!fs.existsSync(READY_DIR)) return (playerName, _club) => resolvePhoto("", playerName);

  // Walk ready photos — subdirs like "Lionel Messi_Inter Miami" or flat PNG files
  let entries = [];
  try {
    entries = fs.readdirSync(READY_DIR, { withFileTypes: true });
  } catch {
    return (playerName, _club) => resolvePhoto("", playerName);
  }

  // Try subdirectories first: {player}_{club}/ → look for {player}.png/webp
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dirName = e.name; // e.g. "Lionel Messi_Inter Miami"
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
    // Prefer PNG, then WebP
    for (const ext of ["png", "webp", "PNG", "WebP"]) {
      const candidate = subEntries.find((f) =>
        f.toLowerCase() === `${pName.toLowerCase()}.${ext.toLowerCase()}` ||
        f.toLowerCase().startsWith(norm(pName))
      );
      if (candidate) {
        const rel = path
          .relative(IMAGES, path.join(dirPath, candidate))
          .replace(/\\/g, "/");
        const k = norm(pName);
        if (!byKey.has(k)) byKey.set(k, rel);
        break;
      }
    }
  }

  // Flat files in the Ready photos root: {PlayerName}.png / {PlayerName}.webp
  for (const e of entries) {
    if (!e.isFile()) continue;
    const match = e.name.match(/^(.+)\.(png|webp)$/i);
    if (!match) continue;
    const pName = match[1];
    const k = norm(pName);
    if (!byKey.has(k)) {
      byKey.set(k, path.relative(IMAGES, path.join(READY_DIR, e.name)).replace(/\\/g, "/"));
    }
  }

  return (playerName, club) => {
    const k = norm(playerName);
    if (byKey.has(k)) return byKey.get(k);
    // Fall back to standard club-image folder
    return resolvePhoto(club, playerName);
  };
}

const resolvePlayerPhoto = buildReadyPhotoIndex(P.IMAGES);

let missingPhotos = 0;
let missingCrests = 0;
let missingRevealVoices = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("3|")) continue;
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

    // Resolve full player record (for transfer_history)
    const rec = sq.findPlayer(club, playerName);
    const display = displayName(playerName);

    // Photo: try Ready photos first, then club images
    const photoPath = resolvePlayerPhoto(playerName, club);
    if (!photoPath) missingPhotos += 1;

    // Career history from transfer_history
    const rawHistory = Array.isArray(rec?.transfer_history) ? rec.transfer_history : [];
    const cleanedHistory = cleanHistory(rawHistory);
    const careerHistory = cleanedHistory.map((h) => {
      const crestPath = resolveClubCrest(h.club);
      if (!crestPath) missingCrests += 1;
      return {
        club: h.club,
        year: String(h.year || ""),
        crestPath,
      };
    });

    // Reveal voice = player name
    const revealVoiceEn = V.resolveTeamVoice(playerName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(playerName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      display,
      playerName,
      photoPath,
      careerHistory,
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
console.log(
  `✓ ${saves.length} saves, ${saves.reduce((n, s) => n + s.levels.length, 0)} levels -> src/generated/saves.json (${kb} KB)`,
);
console.log(`  unresolved: photos ${missingPhotos}, crests ${missingCrests}, reveal-voices ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
// Quiz title voice: "Game name/Career Path Regular/{lang}/"
const quizTitleEn = V.voiceRel(
  V.findVoiceFile("Game name/Career Path Regular/english", /career path/i),
);
const quizTitleEs = V.voiceRel(
  V.findVoiceFile("Game name/Career Path Regular/spanish", /trayectoria/i),
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
    for (const h of lv.careerHistory) {
      wanted.add(h.crestPath);
    }
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);
