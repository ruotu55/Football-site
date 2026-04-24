/* Guess-the-fake-info quiz mode.
 *
 * One stat per level is replaced with a plausible but wrong value:
 *   club         → different team from the same league (if known)
 *   position     → different category (def → mid/att, etc.)
 *   country      → different country from the same continent
 *   shirt_number → any other number
 *
 * The choice is deterministic per (player, levelIndex) so it stays stable across re-renders
 * (e.g. renderCareer firing twice for the same level doesn't flip the fake stat).
 */

import { appState } from "./state.js";

export const FAKE_INFO_QUIZ_TYPE = "player-by-fake-info";

export function isFakeInfoQuiz() {
  return String(appState.els?.inQuizType?.value || "") === FAKE_INFO_QUIZ_TYPE;
}

/* ── Position categories ─────────────────────────────────────────────
 * Swap hops categories (defender → midfielder/attacker), never same-category (LW → RW).
 */
const POSITION_BY_CATEGORY = {
  goalkeeper: ["Goalkeeper"],
  defender: ["Centre-Back", "Left-Back", "Right-Back", "Left Wing-Back", "Right Wing-Back"],
  midfielder: [
    "Defensive Midfield",
    "Central Midfield",
    "Attacking Midfield",
    "Left Midfield",
    "Right Midfield",
  ],
  attacker: [
    "Left Winger",
    "Right Winger",
    "Centre-Forward",
    "Second Striker",
    "Striker",
  ],
};

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
  "Centre-Forward": "CF",
  "Second Striker": "SS",
  "Striker": "ST",
};

function positionCategoryOf(position) {
  const raw = String(position || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("goal")) return "goalkeeper";
  if (raw.includes("back")) return "defender";
  if (raw.includes("midfield")) return "midfielder";
  if (
    raw.includes("winger") ||
    raw.includes("forward") ||
    raw.includes("striker") ||
    raw.includes("attack")
  ) {
    return "attacker";
  }
  return null;
}

export function fakeInfoPositionAbbrev(posName) {
  return POSITION_ABBREV[posName] || (posName ? posName.slice(0, 3).toUpperCase() : "—");
}

/* ── Country → continent table ──────────────────────────────────────── */
const COUNTRY_CONTINENT = {
  /* Europe */
  England: "Europe", Scotland: "Europe", Wales: "Europe", Ireland: "Europe",
  France: "Europe", Germany: "Europe", Spain: "Europe", Italy: "Europe",
  Portugal: "Europe", Netherlands: "Europe", Belgium: "Europe", Croatia: "Europe",
  Poland: "Europe", Serbia: "Europe", Denmark: "Europe", Sweden: "Europe",
  Norway: "Europe", Switzerland: "Europe", Austria: "Europe", Ukraine: "Europe",
  Turkey: "Europe", Greece: "Europe", Russia: "Europe", Romania: "Europe",
  Hungary: "Europe", "Czech Republic": "Europe", "Republic of Ireland": "Europe",
  "Bosnia and Herzegovina": "Europe", Slovakia: "Europe", Slovenia: "Europe",
  Albania: "Europe", "North Macedonia": "Europe", Finland: "Europe",
  Iceland: "Europe", Montenegro: "Europe", Bulgaria: "Europe", Kosovo: "Europe",
  Belarus: "Europe", Luxembourg: "Europe", Georgia: "Europe", Armenia: "Europe",
  Azerbaijan: "Europe",

  /* South America */
  Brazil: "South America", Argentina: "South America", Uruguay: "South America",
  Colombia: "South America", Chile: "South America", Peru: "South America",
  Paraguay: "South America", Ecuador: "South America", Venezuela: "South America",
  Bolivia: "South America",

  /* North America */
  "United States": "North America", "United States of America": "North America",
  USA: "North America", Mexico: "North America", Canada: "North America",
  "Costa Rica": "North America", Honduras: "North America", Jamaica: "North America",
  Panama: "North America", "El Salvador": "North America", "Trinidad and Tobago": "North America",
  Haiti: "North America", "Dominican Republic": "North America",

  /* Africa */
  Nigeria: "Africa", Senegal: "Africa", Egypt: "Africa", Morocco: "Africa",
  Algeria: "Africa", Cameroon: "Africa", "Ivory Coast": "Africa", Ghana: "Africa",
  Tunisia: "Africa", "South Africa": "Africa", Mali: "Africa",
  "Democratic Republic of the Congo": "Africa", Congo: "Africa", Guinea: "Africa",
  Kenya: "Africa", Uganda: "Africa", Zambia: "Africa", Zimbabwe: "Africa",
  Angola: "Africa", Ethiopia: "Africa", Sudan: "Africa", Libya: "Africa",
  "Burkina Faso": "Africa", Gabon: "Africa", "Cape Verde": "Africa",
  "Cote d'Ivoire": "Africa",

  /* Asia */
  Japan: "Asia", "South Korea": "Asia", Australia: "Asia", Iran: "Asia",
  "Saudi Arabia": "Asia", Iraq: "Asia", Qatar: "Asia", China: "Asia",
  Uzbekistan: "Asia", Jordan: "Asia", "United Arab Emirates": "Asia",
  Bahrain: "Asia", Kuwait: "Asia", Oman: "Asia", Lebanon: "Asia",
  Syria: "Asia", Palestine: "Asia", India: "Asia", Thailand: "Asia",
  Vietnam: "Asia", Indonesia: "Asia", Malaysia: "Asia", "North Korea": "Asia",
  Singapore: "Asia", Philippines: "Asia", Kazakhstan: "Asia",

  /* Oceania */
  "New Zealand": "Oceania", Fiji: "Oceania", "Papua New Guinea": "Oceania",
  "Solomon Islands": "Oceania", Vanuatu: "Oceania",
};

const CONTINENT_COUNTRIES = {};
for (const [country, continent] of Object.entries(COUNTRY_CONTINENT)) {
  (CONTINENT_COUNTRIES[continent] ||= []).push(country);
}

/* ── Club → league table ────────────────────────────────────────────
 * Hand-curated for the major leagues the quiz features most. If a club isn't listed, the
 * club-swap stat is skipped for that level (the picker falls through to position/country/shirt).
 */
const CLUB_LEAGUE = {
  /* Premier League */
  "Arsenal": "Premier League", "Aston Villa": "Premier League", "Bournemouth": "Premier League",
  "Brentford": "Premier League", "Brighton & Hove Albion": "Premier League",
  "Brighton": "Premier League", "Burnley": "Premier League", "Chelsea": "Premier League",
  "Crystal Palace": "Premier League", "Everton": "Premier League", "Fulham": "Premier League",
  "Leeds United": "Premier League", "Leicester City": "Premier League", "Liverpool": "Premier League",
  "Luton Town": "Premier League", "Manchester City": "Premier League",
  "Manchester United": "Premier League", "Newcastle United": "Premier League",
  "Nottingham Forest": "Premier League", "Sheffield United": "Premier League",
  "Southampton": "Premier League", "Tottenham Hotspur": "Premier League",
  "Tottenham": "Premier League", "West Ham United": "Premier League", "West Ham": "Premier League",
  "Wolverhampton Wanderers": "Premier League", "Wolves": "Premier League",
  "Ipswich Town": "Premier League", "Sunderland": "Premier League",

  /* LaLiga */
  "Real Madrid": "LaLiga", "FC Barcelona": "LaLiga", "Barcelona": "LaLiga",
  "Atletico Madrid": "LaLiga", "Atlético Madrid": "LaLiga", "Athletic Bilbao": "LaLiga",
  "Athletic Club": "LaLiga", "Real Sociedad": "LaLiga", "Real Betis": "LaLiga",
  "Sevilla": "LaLiga", "Sevilla FC": "LaLiga", "Villarreal": "LaLiga", "Villarreal CF": "LaLiga",
  "Valencia": "LaLiga", "Valencia CF": "LaLiga", "Celta Vigo": "LaLiga", "RC Celta": "LaLiga",
  "Osasuna": "LaLiga", "Girona": "LaLiga", "Mallorca": "LaLiga", "Getafe": "LaLiga",
  "Rayo Vallecano": "LaLiga", "Las Palmas": "LaLiga", "Leganes": "LaLiga",
  "Alaves": "LaLiga", "Valladolid": "LaLiga", "Espanyol": "LaLiga", "Elche": "LaLiga",

  /* Serie A */
  "Juventus": "Serie A", "Inter": "Serie A", "Inter Milan": "Serie A", "Milan": "Serie A",
  "AC Milan": "Serie A", "Napoli": "Serie A", "AS Roma": "Serie A", "Roma": "Serie A",
  "Lazio": "Serie A", "Atalanta": "Serie A", "Fiorentina": "Serie A", "Bologna": "Serie A",
  "Torino": "Serie A", "Genoa": "Serie A", "Udinese": "Serie A", "Monza": "Serie A",
  "Lecce": "Serie A", "Cagliari": "Serie A", "Empoli": "Serie A", "Parma": "Serie A",
  "Hellas Verona": "Serie A", "Como": "Serie A", "Venezia": "Serie A",

  /* Bundesliga */
  "Bayern Munich": "Bundesliga", "FC Bayern Munich": "Bundesliga", "Bayern": "Bundesliga",
  "Borussia Dortmund": "Bundesliga", "RB Leipzig": "Bundesliga",
  "Bayer Leverkusen": "Bundesliga", "Eintracht Frankfurt": "Bundesliga",
  "VfB Stuttgart": "Bundesliga", "Werder Bremen": "Bundesliga", "Hoffenheim": "Bundesliga",
  "Borussia Monchengladbach": "Bundesliga", "Borussia Mönchengladbach": "Bundesliga",
  "Wolfsburg": "Bundesliga", "Mainz 05": "Bundesliga", "Augsburg": "Bundesliga",
  "Union Berlin": "Bundesliga", "Freiburg": "Bundesliga", "Heidenheim": "Bundesliga",
  "Bochum": "Bundesliga", "FC Koln": "Bundesliga", "FC Köln": "Bundesliga",
  "Holstein Kiel": "Bundesliga", "St. Pauli": "Bundesliga",

  /* Ligue 1 */
  "Paris Saint-Germain": "Ligue 1", "PSG": "Ligue 1", "Marseille": "Ligue 1",
  "Olympique Marseille": "Ligue 1", "Lyon": "Ligue 1", "Olympique Lyonnais": "Ligue 1",
  "Monaco": "Ligue 1", "AS Monaco": "Ligue 1", "Lille": "Ligue 1", "OSC Lille": "Ligue 1",
  "Nice": "Ligue 1", "OGC Nice": "Ligue 1", "Rennes": "Ligue 1", "Lens": "Ligue 1",
  "Nantes": "Ligue 1", "Strasbourg": "Ligue 1", "Toulouse": "Ligue 1", "Reims": "Ligue 1",
  "Montpellier": "Ligue 1", "Brest": "Ligue 1", "Auxerre": "Ligue 1", "Saint-Etienne": "Ligue 1",
  "Angers": "Ligue 1", "Le Havre": "Ligue 1",
};

const LEAGUE_CLUBS = {};
for (const [club, league] of Object.entries(CLUB_LEAGUE)) {
  (LEAGUE_CLUBS[league] ||= []).push(club);
}

/* ── Deterministic PRNG ─────────────────────────────────────────────
 * Mulberry32: same (player, levelIndex) → same fake choice, stable across re-renders. */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
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

/* ── Stat picker ─────────────────────────────────────────────────────
 * Deterministic per (player name, level index). Returns null if the player has incomplete data.
 */
const FAKE_STAT_KEYS = ["club", "position", "country", "shirt_number"];

export function fakeInfoPickForLevel(state, levelIndex) {
  const player = state?.careerPlayer;
  if (!player?.name) return null;
  const seed = hashString(`${player.name}|${levelIndex}`);
  const rand = mulberry32(seed);

  /* Try stats in a randomized order; skip any that can't produce a fake for this player. */
  const order = [...FAKE_STAT_KEYS].sort(() => rand() - 0.5);
  for (const stat of order) {
    const fake = computeFakeForStat(stat, player, rand);
    if (fake) return { stat, value: fake };
  }
  return null;
}

function computeFakeForStat(stat, player, rand) {
  if (stat === "shirt_number") {
    const current = Number(player.shirt_number);
    let n;
    let guard = 0;
    do {
      n = 1 + Math.floor(rand() * 99);
      guard += 1;
    } while (Number.isFinite(current) && n === current && guard < 10);
    return String(n);
  }

  if (stat === "position") {
    const currentCategory = positionCategoryOf(player.position);
    const categories = Object.keys(POSITION_BY_CATEGORY).filter((c) => c !== currentCategory);
    const cat = pickOne(categories, rand) || "midfielder";
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

/* ── Voice playback. Per-runner clips live under
     `.Storage/Voices/Fake Stats/<RUNNER_VARIANT>/<lang>/<filename>.mp3`
     (generated from the Voice tab). Regular mode has its own folder, so Shorts
     and Regular no longer share the same recordings. The user picks the
     language via the Voice tab; filenames differ per language. */
const RUNNER_VARIANT = "Four Params Shorts";
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];

const FAKE_STAT_VOICE_FILE_BY_LANG = {
  english: {
    club: "The fake stats was - club.mp3",
    position: "The fake stats was - position.mp3",
    country: "The fake stats was - country.mp3",
    shirt_number: "The fake stats was - shirt number.mp3",
  },
  spanish: {
    club: "La informacion falsa era - el club.mp3",
    position: "La informacion falsa era - la posicion.mp3",
    country: "La informacion falsa era - el pais.mp3",
    shirt_number: "La informacion falsa era - el numero de camiseta.mp3",
  },
};

function getCurrentLanguage() {
  try {
    const stored = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : "english";
  } catch { return "english"; }
}

function fakeInfoVoiceUrlForStatInLang(stat, lang) {
  const map = FAKE_STAT_VOICE_FILE_BY_LANG[lang] || FAKE_STAT_VOICE_FILE_BY_LANG.english;
  const filename = map[stat];
  if (!filename) return "";
  const segments = [".Storage", "Voices", "Fake Stats", RUNNER_VARIANT, lang, filename];
  return "../" + segments.map(encodeURIComponent).join("/");
}

export function fakeInfoVoiceUrlForStat(stat) {
  return fakeInfoVoiceUrlForStatInLang(stat, getCurrentLanguage());
}

/** Language-aware candidate list: preferred language first, English as safety net. */
export function fakeInfoVoiceUrlCandidatesForStat(stat) {
  const lang = getCurrentLanguage();
  if (lang === "english") {
    const only = fakeInfoVoiceUrlForStatInLang(stat, "english");
    return only ? [only] : [];
  }
  const primary = fakeInfoVoiceUrlForStatInLang(stat, lang);
  const fallback = fakeInfoVoiceUrlForStatInLang(stat, "english");
  const out = [];
  if (primary) out.push(primary);
  if (fallback && fallback !== primary) out.push(fallback);
  return out;
}
