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
  positionGroup,
  buildPhotoIndex,
  buildClubCrestIndex,
  buildFlagResolver,
  buildLayoutIndex,
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
// Saved team layouts = the EXACT formation + chosen XI per national team (same source the
// browser runner uses), so the lineup matches the save file (like runner 1).
const Lay = buildLayoutIndex(P.LAYOUTS_JSON);
// National-team reveal voices live in "Nationality teams names/<lang>/<phrase>/<Team>.mp3".
const V = makeVoiceHelpers(P.VOICES_SRC, "Nationality teams names");

// National-team LOGOS (the reveal panel's main image) live in Images/National Team Logos/<Team>.png.
const LOGOS_DIR = path.join(P.IMAGES, "National Team Logos");
const logoByNorm = new Map();
if (fs.existsSync(LOGOS_DIR)) {
  for (const f of fs.readdirSync(LOGOS_DIR)) {
    if (!/\.(png|webp|jpg|jpeg)$/i.test(f)) continue;
    logoByNorm.set(norm(f.replace(/\.[^.]+$/, "")), `National Team Logos/${f}`);
  }
}
const resolveNationalLogo = (team) => logoByNorm.get(norm(team)) || null;

// ── prep-panel name overrides (same buckets the browser prep panel writes) ───
// Permanent PLAYER-name overrides (NAME cube → "save permanently"): canonical
// squad name → EXACT display name. Shared across all runners.
const PLAYER_NAME_OVERRIDES = (() => {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(P.repoRoot, ".Storage", "storage", "runner-blobs", "player_name_overrides_shared.json"), "utf-8"),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
})();
const playerDisplay = (name) => {
  const o = String(PLAYER_NAME_OVERRIDES[String(name || "").trim()] || "").trim();
  return o || displayName(name);
};

// Permanent TEAM-name overrides ("✎ Rename team" → save permanently). Runner 2's
// national bucket: team_name_overrides_shared_national.json, keyed
// `nat-by-club::<selectedEntry.path | name:<lowercased name>>` — index by the
// lowercased team/country name (path keys match by file basename).
const teamOverrideByName = (() => {
  const map = new Map();
  let raw = {};
  try {
    raw = JSON.parse(
      fs.readFileSync(path.join(P.repoRoot, ".Storage", "storage", "runner-blobs", "team_name_overrides_shared_national.json"), "utf-8"),
    );
  } catch {
    return map;
  }
  for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    if (!String(k).startsWith("nat-by-club::")) continue;
    const val = String(v || "").trim();
    if (!val) continue;
    const id = String(k).slice("nat-by-club::".length);
    if (id.startsWith("name:")) {
      map.set(id.slice(5).trim().toLowerCase(), val);
    } else {
      const base = id.replace(/\\/g, "/").split("/").pop().replace(/\.(json|png|webp|jpe?g)$/i, "").trim().toLowerCase();
      if (base && !map.has(base)) map.set(base, val);
    }
  }
  return map;
})();
// Display precedence (mirrors the runner header): per-save override (rides in
// block.script) → shared permanent override → the country name itself.
const teamDisplay = (teamName, perSaveOverride) => {
  const ps = String(perSaveOverride || "").trim();
  if (ps) return ps;
  return teamOverrideByName.get(String(teamName || "").trim().toLowerCase()) || teamName;
};

const DEFAULT_FORMATION = "433";
const GROUPS = ["goalkeepers", "defenders", "midfielders", "attackers"];
let xiFromLayout = 0;
let xiFromSquad = 0;

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
let missingLogos = 0;
let missingRevealVoices = 0;
let missingSquads = 0;

const toPlayer = (p, group, customNames) => {
  const club = p.club || "";
  const clubCrestPath = resolveClubCrest(club);
  const photoPath = resolvePhoto(club, p.name);
  if (!clubCrestPath) missingCrests += 1;
  if (!photoPath) missingPhotos += 1;
  // Per-save custom name (NAME cube → "only for THIS save") wins, then the
  // permanent override / short-name. Keeps the video == the prep preview.
  const perSave = customNames && typeof customNames === "object"
    ? String(customNames[p.name] || "").trim()
    : "";
  return {
    name: p.name,
    display: perSave || playerDisplay(p.name),
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

  // Per-save team renames ride inside block.script (the prep panel auto-saves
  // them there): currentSquad.name → headerTeamNameOverride.
  const perSaveTeamOverride = new Map();
  // Per-save PLAYER-name edits (NAME cube → "only for THIS save") also ride in
  // block.script as level.customNames; index them by the team's country name.
  const perSaveCustomNames = new Map();
  for (const lvl of Array.isArray(block.script?.levels) ? block.script.levels : []) {
    const nm = String(lvl?.currentSquad?.name || "").trim().toLowerCase();
    const ov = String(lvl?.headerTeamNameOverride || "").trim();
    if (nm && ov && !perSaveTeamOverride.has(nm)) perSaveTeamOverride.set(nm, ov);
    if (nm && lvl?.customNames && typeof lvl.customNames === "object" && !perSaveCustomNames.has(nm)) {
      perSaveCustomNames.set(nm, lvl.customNames);
    }
  }

  const levels = [];
  for (const line of lines) {
    const parts = line.split(" - ");
    const teamName = parts[0].trim();
    const continent = (parts[1] || "").trim();
    if (!teamName) continue;
    const teamCustomNames = perSaveCustomNames.get(teamName.toLowerCase()) || null;
    // Prefer the SAVED team layout (its formationId + customXi = the exact XI in slot
    // order — the same lineup the save shows). Fall back to assembling from the squad.
    const layout = Lay.getNational(teamName);
    let players;
    let formationId;
    let xiOrdered;
    if (layout && Array.isArray(layout.customXi) && layout.customXi.length >= 11) {
      formationId = layout.formationId || DEFAULT_FORMATION;
      xiOrdered = true;
      players = layout.customXi.slice(0, 11).map((p) => toPlayer(p, positionGroup(p.position), teamCustomNames));
      xiFromLayout += 1;
    } else {
      const squad = loadNationalSquad(teamName, continent);
      if (!squad) {
        missingSquads += 1;
        continue;
      }
      players = [];
      for (const g of GROUPS) for (const p of squad[g] || []) players.push(toPlayer(p, g, teamCustomNames));
      if (players.length < 11) continue;
      formationId = DEFAULT_FORMATION;
      xiOrdered = false;
      xiFromSquad += 1;
    }

    const flagPath = resolveFlag(teamName);
    if (!flagPath) missingFlags += 1;
    const nationalLogoPath = resolveNationalLogo(teamName);
    if (!nationalLogoPath) missingLogos += 1;
    // Display name (override-aware) is what the reveal panel SHOWS; flag/logo
    // stay keyed by the real country. Voice prefers the display name's clip
    // (renamed team → new name's recording), falling back to the original.
    const displayTeam = teamDisplay(teamName, perSaveTeamOverride.get(teamName.toLowerCase()));
    const revealVoiceEn =
      V.resolveTeamVoice(displayTeam, REVEAL_EN) || V.resolveTeamVoice(teamName, REVEAL_EN);
    const revealVoiceEs =
      V.resolveTeamVoice(displayTeam, REVEAL_ES) || V.resolveTeamVoice(teamName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      teamName: displayTeam,
      countryFlagPath: flagPath,
      nationalLogoPath,
      formationId,
      xiOrdered,
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
console.log(`  unresolved: photos ${missingPhotos}, crests ${missingCrests}, flags ${missingFlags}, national logos ${missingLogos}, squads ${missingSquads}`);
console.log(`  XI source: ${xiFromLayout} from saved layout (exact formation + XI), ${xiFromSquad} from squad fallback`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
const quizTitleEn = V.voiceRel(V.findVoiceFile("Game name/Lineups Regular/english", /national team/i));
const quizTitleEs = V.voiceRel(V.findVoiceFile("Game name/Lineups Regular/spanish", /equipo nacional/i));
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
// Intro greeting voice ("Welcome to the Ultimate Football Quiz / Guess the National Team") —
// plays over the Ultimate intro before the quiz-title screen. Stored in
// .Storage/Voices/Intro Greeting/nationalteam/<lang>/.
const introGreetingEn = V.voiceRel(V.findVoiceFile("Intro Greeting/nationalteam/english", /intro/i));
const introGreetingEs = V.voiceRel(V.findVoiceFile("Intro Greeting/nationalteam/spanish", /intro/i));
audio.introGreeting = { english: introGreetingEn, spanish: introGreetingEs };
audio.introGreetingDurationSec = {
  english: V.audioDurationSec(introGreetingEn),
  spanish: V.audioDurationSec(introGreetingEs),
};
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, introGreeting EN ${audio.introGreeting.english ? "ok" : "MISSING"}/ES ${audio.introGreeting.spanish ? "ok" : "MISSING"}, reveal-voice missing: ${missingRevealVoices}`);

// ── sync assets + voices into the shared public folder ────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.countryFlagPath);
    wanted.add(lv.nationalLogoPath);
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
