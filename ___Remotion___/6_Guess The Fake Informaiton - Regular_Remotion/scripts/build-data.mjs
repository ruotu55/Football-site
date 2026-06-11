// Runner 6 — "Guess the Fake Information About the Player".
// Saves store "PlayerName - Club" lines; the player data (position, nationality,
// shirt_number) comes from the club squad JSONs under Squad Formation/Teams.
// One stat per level is FAKE (deterministic per player name); build-data computes
// both fake and real values so Level.tsx can show fake-then-flip-to-real.
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
  buildSquadPlayerIndex,
  makeVoiceHelpers,
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
const { findPlayer } = buildSquadPlayerIndex(P.SQUAD_FORMATION);

// Reveal voices: "Fake Stats/Four Params Regular/<lang>/<filename>.mp3"
const V = makeVoiceHelpers(P.VOICES_SRC, "Fake Stats/Four Params Regular");

// ── Position abbreviation table ────────────────────────────────────────────────
const POSITION_ABBREV = {
  "Goalkeeper": "GK",
  "Centre-Back": "CB",
  "Left-Back": "LB",
  "Right-Back": "RB",
  "Left Wing-Back": "LWB",
  "Right Wing-Back": "RWB",
  "Defensive Midfield": "DM",
  "Central Midfield": "CM",
  "Attacking Midfield": "CAM",
  "Left Midfield": "LM",
  "Right Midfield": "RM",
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Centre-Forward": "ST",
  "Second Striker": "ST",
  "Striker": "ST",
};
const posAbbrev = (pos) =>
  POSITION_ABBREV[String(pos || "").trim()] || (pos ? String(pos).slice(0, 3).toUpperCase() : "—");

// ── Deterministic PRNG (Mulberry32, matching the browser runner) ──────────────
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function pickOne(arr, rand) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(rand() * arr.length)];
}

// ── Position category for fake picker ─────────────────────────────────────────
const POSITION_BY_CATEGORY = {
  goalkeeper: ["Goalkeeper"],
  defender: ["Centre-Back", "Left-Back", "Right-Back", "Left Wing-Back", "Right Wing-Back"],
  midfielder: ["Defensive Midfield", "Central Midfield", "Attacking Midfield", "Left Midfield", "Right Midfield"],
  attacker: ["Left Winger", "Right Winger", "Centre-Forward", "Second Striker", "Striker"],
};
function positionCategoryOf(pos) {
  const raw = String(pos || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("goal")) return "goalkeeper";
  if (raw.includes("back")) return "defender";
  if (raw.includes("midfield")) return "midfielder";
  if (raw.includes("winger") || raw.includes("forward") || raw.includes("striker") || raw.includes("attack")) return "attacker";
  return null;
}

// ── Country → continent table ─────────────────────────────────────────────────
const COUNTRY_CONTINENT = {
  England: "Europe", Scotland: "Europe", Wales: "Europe", France: "Europe", Germany: "Europe",
  Spain: "Europe", Italy: "Europe", Portugal: "Europe", Netherlands: "Europe", Belgium: "Europe",
  Croatia: "Europe", Poland: "Europe", Serbia: "Europe", Denmark: "Europe", Sweden: "Europe",
  Norway: "Europe", Switzerland: "Europe", Austria: "Europe", Ukraine: "Europe", Turkey: "Europe",
  Greece: "Europe", Russia: "Europe", Romania: "Europe", Hungary: "Europe",
  "Czech Republic": "Europe", "Republic of Ireland": "Europe", "Bosnia and Herzegovina": "Europe",
  Slovakia: "Europe", Slovenia: "Europe", Albania: "Europe", "North Macedonia": "Europe",
  Finland: "Europe", Iceland: "Europe", Montenegro: "Europe", Bulgaria: "Europe", Kosovo: "Europe",
  Belarus: "Europe", Luxembourg: "Europe", Georgia: "Europe", Armenia: "Europe", Azerbaijan: "Europe",
  Ireland: "Europe",
  Brazil: "South America", Argentina: "South America", Uruguay: "South America",
  Colombia: "South America", Chile: "South America", Peru: "South America",
  Paraguay: "South America", Ecuador: "South America", Venezuela: "South America", Bolivia: "South America",
  "United States": "North America", "United States of America": "North America", USA: "North America",
  Mexico: "North America", Canada: "North America", "Costa Rica": "North America",
  Honduras: "North America", Jamaica: "North America", Panama: "North America",
  "El Salvador": "North America", "Trinidad and Tobago": "North America",
  Nigeria: "Africa", Senegal: "Africa", Egypt: "Africa", Morocco: "Africa", Algeria: "Africa",
  Cameroon: "Africa", "Ivory Coast": "Africa", Ghana: "Africa", Tunisia: "Africa",
  "South Africa": "Africa", Mali: "Africa", "Democratic Republic of the Congo": "Africa",
  Congo: "Africa", Guinea: "Africa", "Burkina Faso": "Africa", Gabon: "Africa", "Cape Verde": "Africa",
  "Cote d'Ivoire": "Africa",
  Japan: "Asia", "South Korea": "Asia", Australia: "Asia", Iran: "Asia",
  "Saudi Arabia": "Asia", Iraq: "Asia", Qatar: "Asia", China: "Asia",
  Uzbekistan: "Asia", Jordan: "Asia", "United Arab Emirates": "Asia",
};
const CONTINENT_COUNTRIES = {};
for (const [country, continent] of Object.entries(COUNTRY_CONTINENT)) {
  (CONTINENT_COUNTRIES[continent] ||= []).push(country);
}

// ── Club → league table ───────────────────────────────────────────────────────
const CLUB_LEAGUE = {
  "Arsenal": "Premier League", "Aston Villa": "Premier League", "Chelsea": "Premier League",
  "Crystal Palace": "Premier League", "Everton": "Premier League", "Fulham": "Premier League",
  "Leicester City": "Premier League", "Liverpool FC": "Premier League", "Liverpool": "Premier League",
  "Manchester City": "Premier League", "Manchester United": "Premier League",
  "Newcastle United": "Premier League", "Nottingham Forest": "Premier League",
  "Southampton": "Premier League", "Tottenham Hotspur": "Premier League",
  "West Ham United": "Premier League", "Wolverhampton Wanderers": "Premier League",
  "Ipswich Town": "Premier League", "Sunderland": "Premier League", "Brentford": "Premier League",
  "Brighton & Hove Albion": "Premier League", "Brighton": "Premier League",
  "Real Madrid": "LaLiga", "FC Barcelona": "LaLiga", "Barcelona": "LaLiga",
  "Atletico Madrid": "LaLiga", "Atlético Madrid": "LaLiga", "Athletic Bilbao": "LaLiga",
  "Real Sociedad": "LaLiga", "Real Betis": "LaLiga", "Sevilla": "LaLiga", "Sevilla FC": "LaLiga",
  "Villarreal": "LaLiga", "Villarreal CF": "LaLiga", "Valencia": "LaLiga", "Valencia CF": "LaLiga",
  "Celta Vigo": "LaLiga", "Girona": "LaLiga", "Mallorca": "LaLiga", "Getafe": "LaLiga",
  "Juventus": "Serie A", "Inter": "Serie A", "Inter Milan": "Serie A", "Milan": "Serie A",
  "AC Milan": "Serie A", "Napoli": "Serie A", "AS Roma": "Serie A", "Roma": "Serie A",
  "Lazio": "Serie A", "Atalanta": "Serie A", "Fiorentina": "Serie A", "Bologna": "Serie A",
  "Bayern Munich": "Bundesliga", "FC Bayern Munich": "Bundesliga", "Bayern": "Bundesliga",
  "Borussia Dortmund": "Bundesliga", "RB Leipzig": "Bundesliga", "Bayer Leverkusen": "Bundesliga",
  "Eintracht Frankfurt": "Bundesliga", "VfB Stuttgart": "Bundesliga", "Werder Bremen": "Bundesliga",
  "Paris Saint-Germain": "Ligue 1", "PSG": "Ligue 1", "Marseille": "Ligue 1",
  "Olympique Marseille": "Ligue 1", "Lyon": "Ligue 1", "Monaco": "Ligue 1", "AS Monaco": "Ligue 1",
  "Lille": "Ligue 1", "Nice": "Ligue 1", "Rennes": "Ligue 1", "Lens": "Ligue 1",
};
const LEAGUE_CLUBS = {};
for (const [club, league] of Object.entries(CLUB_LEAGUE)) {
  (LEAGUE_CLUBS[league] ||= []).push(club);
}

// ── Fake stat computation (deterministic, mirroring fake-info-mode.js) ─────────
const FAKE_STAT_KEYS = ["club", "position", "country", "shirt_number"];

function computeFakeForStat(stat, player, rand) {
  if (stat === "shirt_number") {
    const current = Number(player.shirt_number);
    let n;
    let guard = 0;
    do {
      n = 1 + Math.floor(rand() * 99);
      guard++;
    } while (Number.isFinite(current) && n === current && guard < 10);
    return String(n);
  }
  if (stat === "position") {
    const currentCat = positionCategoryOf(player.position);
    if (currentCat === "goalkeeper") return null;
    const cats = Object.keys(POSITION_BY_CATEGORY).filter((c) => c !== currentCat && c !== "goalkeeper");
    const cat = pickOne(cats, rand) || "midfielder";
    return pickOne(POSITION_BY_CATEGORY[cat], rand);
  }
  if (stat === "country") {
    const current = String(player.nationality || "").trim();
    const continent = COUNTRY_CONTINENT[current];
    if (!continent) return null;
    const pool = (CONTINENT_COUNTRIES[continent] || []).filter((c) => c !== current);
    return pickOne(pool, rand);
  }
  if (stat === "club") {
    const current = String(player.club || "").trim();
    const league = CLUB_LEAGUE[current];
    if (!league) return null;
    const pool = (LEAGUE_CLUBS[league] || []).filter((c) => c !== current);
    return pickOne(pool, rand);
  }
  return null;
}

function pickFakeStat(player) {
  if (!player?.name) return null;
  const seed = hashString(player.name);
  const rand = mulberry32(seed);
  let order = [...FAKE_STAT_KEYS].sort(() => rand() - 0.5);
  for (const stat of order) {
    const fake = computeFakeForStat(stat, player, rand);
    if (fake) return { stat, value: fake };
  }
  return null;
}

// ── Voice file resolvers ───────────────────────────────────────────────────────
// Fake stat reveal voices: "Fake Stats/Four Params Regular/<lang>/<filename>.mp3"
// The "revealBaseDir" passed to makeVoiceHelpers is "Fake Stats/Four Params Regular"
// but the voiceRel helper prefixes with the revealBaseDir ONLY via resolveTeamVoice.
// We directly use V.voiceRel() with the full relative path from VOICES_SRC root.
const FAKE_STAT_FILES = {
  english: {
    club: "Fake Stats/Four Params Regular/english/The fake stats was - club.mp3",
    position: "Fake Stats/Four Params Regular/english/The fake stats was - position.mp3",
    country: "Fake Stats/Four Params Regular/english/The fake stats was - country.mp3",
    shirt_number: "Fake Stats/Four Params Regular/english/The fake stats was - shirt number.mp3",
  },
  spanish: {
    club: "Fake Stats/Four Params Regular/spanish/La informacion falsa era - el club.mp3",
    position: "Fake Stats/Four Params Regular/spanish/La informacion falsa era - la posicion.mp3",
    country: "Fake Stats/Four Params Regular/spanish/La informacion falsa era - el pais.mp3",
    shirt_number: "Fake Stats/Four Params Regular/spanish/La informacion falsa era - el numero de camiseta.mp3",
  },
};

// ── Build saves ────────────────────────────────────────────────────────────────
let missingPhotos = 0, missingCrests = 0, missingFlags = 0, missingPlayers = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("6|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue;
  const lines = String(block.teamsImportText || "")
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) continue;

  const levels = [];
  for (const line of lines) {
    const parts = line.split(" - ");
    const playerName = parts[0].trim();
    const clubHint = (parts[1] || "").trim();
    if (!playerName) continue;

    // Look up the player in squad JSONs
    const player = findPlayer(clubHint, playerName);
    if (!player) {
      missingPlayers++;
      continue;
    }

    const club = String(player.club || clubHint || "").trim();
    const position = String(player.position || "").trim();
    const nationality = String(player.nationality || "").trim();
    const shirtNumber = player.shirt_number != null ? String(player.shirt_number) : "—";

    // Photo
    const photoPath = resolvePhoto(club, playerName) || resolvePhoto(clubHint, playerName);
    if (!photoPath) missingPhotos++;

    // Club crest (real)
    const clubCrestPath = resolveClubCrest(club) || resolveClubCrest(clubHint);
    if (!clubCrestPath) missingCrests++;

    // Country flag (real)
    const countryFlagPath = resolveFlag(nationality);
    if (!countryFlagPath) missingFlags++;

    // Abbreviated position
    const positionAbbrev = posAbbrev(position);

    // Deterministic fake
    const fakePick = pickFakeStat({ ...player, club, shirt_number: player.shirt_number });
    if (!fakePick) continue; // no valid fake possible → skip level

    const { stat: fakeStat, value: fakeValue } = fakePick;

    // Fake club crest (if fakeStat === "club")
    let fakeClubCrestPath = null;
    if (fakeStat === "club") {
      fakeClubCrestPath = resolveClubCrest(fakeValue);
    }

    // Fake country flag (if fakeStat === "country")
    let fakeCountryFlagPath = null;
    if (fakeStat === "country") {
      fakeCountryFlagPath = resolveFlag(fakeValue);
    }

    // Reveal voices: the FAKE-STAT announcement voice
    const revealVoiceEn = V.voiceRel(FAKE_STAT_FILES.english[fakeStat]);
    const revealVoiceEs = V.voiceRel(FAKE_STAT_FILES.spanish[fakeStat]) || revealVoiceEn;

    levels.push({
      display: displayName(playerName),
      playerName,
      photoPath,
      club,
      clubCrestPath,
      position: positionAbbrev,
      country: nationality,
      countryFlagPath,
      shirtNumber,
      fakeStat,
      fakeValue: fakeStat === "position" ? posAbbrev(fakeValue) : fakeValue,
      fakeClubCrestPath,
      fakeCountryFlagPath,
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
console.log(`  unresolved: photos ${missingPhotos}, crests ${missingCrests}, flags ${missingFlags}, missing-players ${missingPlayers}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
const quizTitleEn = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/english", /fake.*information/i));
const quizTitleEs = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/spanish", /falsa/i));
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}`);

// ── sync assets + voices into shared public ───────────────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.photoPath);
    wanted.add(lv.clubCrestPath);
    wanted.add(lv.countryFlagPath);
    wanted.add(lv.fakeClubCrestPath);
    wanted.add(lv.fakeCountryFlagPath);
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);

// Report level 1 fakeStat for verification
if (saves.length && saves[0].levels.length) {
  const lv1 = saves[0].levels[0];
  console.log(`  level-1 (${lv1.playerName}): fakeStat=${lv1.fakeStat}, fakeValue=${lv1.fakeValue}, real club=${lv1.club}`);
}

const missingFlagFiles = [...usedFlagCodes].filter((c) => !fs.existsSync(path.join(P.IMAGES, "Flags", `${c}.png`)));
if (missingFlagFiles.length) console.log(`  ⚠ missing local flags in Images/Flags/: ${missingFlagFiles.join(", ")}`);
