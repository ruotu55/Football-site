// Shared build-data helpers for every runner's scripts/build-data.mjs.
// Reads the repo's Images/ + .Storage/Voices and syncs into the ONE shared public
// folder (<repo>/.remotion-shared/public). Pure helpers — each runner's build script
// supplies its own data source (saves) + which assets it needs.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const stripAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

export const toRel = (p) =>
  String(p || "").replace(/^[/\\]*Images[/\\]/i, "").replace(/\\/g, "/");

const SUFFIXES = new Set(["junior", "jr", "jr.", "ii", "iii"]);
export const displayName = (name) => {
  const words = String(name || "").trim().split(/\s+/);
  if (words.length < 2) return name;
  const last = words[words.length - 1];
  return SUFFIXES.has(last.toLowerCase()) ? words[0] : last;
};

export const walkDirs = (root, fn) => {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  fn(root, entries);
  for (const e of entries) if (e.isDirectory()) walkDirs(path.join(root, e.name), fn);
};

// Build the repo path constants from a project dir. Auto-detects the repo root by
// walking up until it finds the `.Storage` folder — so it works regardless of how
// deeply the Remotion project is nested (root sibling, or under ___Remotion___/).
export const repoPaths = (projectDir) => {
  let repoRoot = path.resolve(projectDir, "..");
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(repoRoot, ".Storage"))) break;
    const up = path.resolve(repoRoot, "..");
    if (up === repoRoot) break;
    repoRoot = up;
  }
  return {
    repoRoot,
    IMAGES: path.join(repoRoot, "Images"),
    VOICES_SRC: path.join(repoRoot, ".Storage", "Voices"),
    SHARED_PUBLIC: path.join(repoRoot, ".remotion-shared", "public"),
    SAVES_JSON: path.join(repoRoot, ".Storage", "storage", "recording-status.json"),
    FLAGCODES_JSON: path.join(repoRoot, ".Storage", "data", "country-to-flagcode.json"),
    SQUAD_FORMATION: path.join(repoRoot, ".Storage", "Squad Formation"),
    LAYOUTS_JSON: path.join(repoRoot, ".Storage", "storage", "runner-blobs", "lineups_runner_team_layouts_shared.json"),
  };
};

// Position name → squad group bucket (same rule the runner uses).
export const positionGroup = (pos) => {
  const p = String(pos || "");
  if (/Goalkeeper/i.test(p)) return "goalkeepers";
  if (/Back/i.test(p)) return "defenders";
  if (/Midfield/i.test(p)) return "midfielders";
  return "attackers";
};

// ── saved team layouts (the EXACT formation + chosen XI per team) ──────────────
// `lineups_runner_team_layouts_shared.json` is keyed by squad path; each entry has
// `formationId` + `customXi` (11 players in slot order). This is the SAME source the
// browser runner + runner-1's Remotion build use, so the lineup matches the save.
export const buildLayoutIndex = (LAYOUTS_JSON) => {
  let L = {};
  try { L = JSON.parse(fs.readFileSync(LAYOUTS_JSON, "utf-8")); } catch {}
  const national = new Map(); // norm(team basename) → { formationId, customXi }
  const club = new Map();
  for (const [k, v] of Object.entries(L)) {
    if (!v || !Array.isArray(v.customXi) || v.customXi.length < 11) continue;
    const base = norm(String(k).replace(/^.*[/\\]/, "").replace(/\.json$/i, ""));
    if (/Nationalit/i.test(k)) { if (!national.has(base)) national.set(base, v); }
    else if (/Teams[/\\]/i.test(k)) { if (!club.has(base)) club.set(base, v); }
  }
  return {
    getNational: (name) => national.get(norm(name)) || null,
    getClub: (name) => club.get(norm(name)) || null,
  };
};

// ── player photo index: Images/Players/Club images/<club>/<player>/<img> ──────
const IMG_RE = /\.(webp|avif|png|jpe?g)$/i;
const imgRank = (n) => (/\.webp$/i.test(n) ? 0 : /\.avif$/i.test(n) ? 1 : /\.png$/i.test(n) ? 2 : 3);
export const buildPhotoIndex = (IMAGES) => {
  const byClubName = new Map();
  const byName = new Map();
  walkDirs(path.join(IMAGES, "Players", "Club images"), (dir, entries) => {
    const imgs = entries.filter((e) => e.isFile() && IMG_RE.test(e.name));
    if (!imgs.length) return;
    imgs.sort((a, b) => imgRank(a.name) - imgRank(b.name));
    const player = path.basename(dir);
    const club = path.basename(path.dirname(dir));
    const rel = path.relative(IMAGES, path.join(dir, imgs[0].name)).replace(/\\/g, "/");
    byClubName.set(`${norm(club)}::${norm(player)}`, rel);
    if (!byName.has(norm(player))) byName.set(norm(player), rel);
  });
  return (club, name) => byClubName.get(`${norm(club)}::${norm(name)}`) || byName.get(norm(name)) || null;
};

// ── club crest index: Images/Teams/<country>/<league>/<club>.png ──────────────
// Used by quizzes whose clue is the player's CLUB (runner 2). Keyed by club basename,
// with common prefix/suffix variants so "Arsenal FC" matches "Arsenal.png" etc.
const clubStems = (name) => {
  const d = String(name || "").trim();
  const out = new Set([d]);
  out.add(d.replace(/^(AC|FC|AS|SSC|RC|SL|SK|FK|CD|CA|SC)\s+/i, ""));
  out.add(d.replace(/\s+(FC|CF|BC|SC|AC|SK|FK|KV|AFC|CD|CA)$/i, ""));
  return [...out];
};
// Transfermarkt-style abbreviations that no amount of token matching can bridge to
// the canonical crest filename (different words entirely). Keyed by norm(shortName)
// → a canonical name that the resolver then matches. Only includes clubs whose crest
// actually exists in Images/Teams (verified) so we never point at a wrong logo.
const CREST_ALIASES = {
  mancity: "Manchester City",
  manutd: "Manchester United",
  wolves: "Wolverhampton Wanderers",
  westbrom: "West Bromwich Albion",
  nottmforest: "Nottingham Forest",
  qpr: "Queens Park Rangers",
  hamburg: "Hamburger SV",
  sporting: "Sporting CP",
  uspalermo: "Palermo FC",
  alhilal: "Al-Hilal SC",
  unionsg: "Union Saint-Gilloise",
};

// Split a club name into significant word-tokens (accent-free, lowercased), e.g.
// "Borussia Dortmund" → ["borussia","dortmund"]. Used for fuzzy crest matching.
const clubTokens = (name) =>
  stripAccents(String(name || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

export const buildClubCrestIndex = (IMAGES) => {
  const byClub = new Map();
  const toksByKey = new Map();
  walkDirs(path.join(IMAGES, "Teams"), (dir, entries) => {
    for (const e of entries) {
      if (!e.isFile() || !/\.(png|webp|jpe?g)$/i.test(e.name)) continue;
      // skip competition logos folder
      if (/Competitions/i.test(dir)) continue;
      const club = e.name.replace(/\.(png|webp|jpe?g)$/i, "");
      const rel = path.relative(IMAGES, path.join(dir, e.name)).replace(/\\/g, "/");
      const k = norm(club);
      if (!byClub.has(k)) {
        byClub.set(k, rel);
        toksByKey.set(k, clubTokens(club));
      }
    }
  });
  // Flat entry list for the fuzzy fallback (one per unique normalised name).
  const entries = [...byClub.entries()].map(([k, rel]) => ({ rel, toks: toksByKey.get(k) || [] }));
  // Token-subset fuzzy match — handles a dropped prefix or added suffix:
  // "Dortmund" → "Borussia Dortmund", "Birmingham" → "Birmingham City". A file
  // matches if every query token is in the file name (or vice versa); we keep the
  // closest one and only accept it when it's UNAMBIGUOUS, so a wrong crest is never
  // shown (ambiguous → null, i.e. a "?" placeholder).
  const fuzzy = (name) => {
    const qt = clubTokens(name);
    if (!qt.length) return null;
    const cands = [];
    for (const en of entries) {
      if (!en.toks.length) continue;
      const allQin = qt.every((t) => en.toks.includes(t));
      const allNin = en.toks.every((t) => qt.includes(t));
      if (allQin || allNin) cands.push({ rel: en.rel, score: Math.abs(en.toks.length - qt.length) });
    }
    if (!cands.length) return null;
    const min = Math.min(...cands.map((c) => c.score));
    const top = cands.filter((c) => c.score === min);
    return top.length === 1 ? top[0].rel : null;
  };
  return (club) => {
    // Try the raw club name first, then a known abbreviation alias if any.
    const aliased = CREST_ALIASES[norm(club)];
    const names = aliased ? [club, aliased] : [club];
    // 1) exact stem match (strips leading/trailing FC/AC/etc.)
    for (const nm of names) {
      for (const s of clubStems(nm)) {
        const hit = byClub.get(norm(s));
        if (hit) return hit;
      }
    }
    // 2) token-subset fuzzy fallback
    for (const nm of names) {
      const hit = fuzzy(nm);
      if (hit) return hit;
    }
    return null;
  };
};

// ── squad player records: resolve a "PlayerName - Club" line → full record ────
// Player quizzes (runners 3/4/5/6/8) store teamsImportText lines "Name - Club"; the
// full player data (position, nationality, age, transfer_history, club_career_totals,
// national_team_career_totals) lives in the club squad JSON under Squad Formation/Teams.
// Returns findPlayer(club, name) → the player object (+ __group), or null.
export const buildSquadPlayerIndex = (SQUAD_FORMATION) => {
  const GROUPS = ["goalkeepers", "defenders", "midfielders", "attackers"];
  const byClub = new Map(); // norm(club basename) → squad json path
  walkDirs(path.join(SQUAD_FORMATION, "Teams"), (dir, entries) => {
    for (const e of entries) {
      if (!e.isFile() || !/\.json$/i.test(e.name)) continue;
      const k = norm(e.name.replace(/\.json$/i, ""));
      if (!byClub.has(k)) byClub.set(k, path.join(dir, e.name));
    }
  });
  const cache = new Map();
  const loadSquad = (file) => {
    if (cache.has(file)) return cache.get(file);
    let j = null;
    try { j = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
    cache.set(file, j);
    return j;
  };
  const playerFromSquad = (j, name) => {
    if (!j) return null;
    for (const g of GROUPS) for (const p of j[g] || []) if (norm(p.name) === norm(name)) return { ...p, __group: g };
    return null;
  };
  // Lazy global by-name index (fallback when the club name doesn't match a file).
  let global = null;
  const buildGlobal = () => {
    if (global) return;
    global = new Map();
    for (const file of byClub.values()) {
      const j = loadSquad(file);
      if (!j) continue;
      for (const g of GROUPS) for (const p of j[g] || []) {
        const k = norm(p.name);
        if (!global.has(k)) global.set(k, { ...p, __group: g });
      }
    }
  };
  const findPlayer = (club, name) => {
    const file = byClub.get(norm(club));
    if (file) {
      const hit = playerFromSquad(loadSquad(file), name);
      if (hit) return hit;
    }
    buildGlobal();
    return global.get(norm(name)) || null;
  };
  return { findPlayer };
};

// ── flags: country → ISO code → Images/Flags/<code>.png (synced locally) ──────
export const buildFlagResolver = (FLAGCODES_JSON) => {
  const FLAGCODES = (JSON.parse(fs.readFileSync(FLAGCODES_JSON, "utf-8")).codes) || {};
  const codeByNorm = new Map(Object.entries(FLAGCODES).map(([k, v]) => [norm(k), v]));
  const usedFlagCodes = new Set();
  const resolveFlag = (nat) => {
    const n = String(nat || "").trim();
    if (!n) return null;
    const code = FLAGCODES[n] || codeByNorm.get(norm(n));
    if (!code) return null;
    usedFlagCodes.add(code);
    return `Flags/${code}.png`;
  };
  return { resolveFlag, usedFlagCodes };
};

// ── voice helpers (sync into shared public under "Voices/..") ──────────────────
const VOICE_EXT_RE = /\.(mp3|wav|m4a)$/i;
export const makeVoiceHelpers = (VOICES_SRC, revealBaseDir = "Team names") => {
  const wantedVoices = new Set();
  const voiceRel = (sub) => {
    if (!sub) return null;
    const rel = String(sub).replace(/\\/g, "/");
    if (!fs.existsSync(path.join(VOICES_SRC, rel))) return null;
    wantedVoices.add(rel);
    return `Voices/${rel}`;
  };
  const findVoiceFile = (subdir, re) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(VOICES_SRC, subdir));
    } catch {
      return null;
    }
    const hit = entries.find((f) => re.test(stripAccents(f)));
    return hit ? `${subdir}/${hit}` : null;
  };
  const audioDurationSec = (voiceRelPath) => {
    if (!voiceRelPath) return null;
    const abs = path.join(VOICES_SRC, voiceRelPath.replace(/^Voices\//, ""));
    if (!fs.existsSync(abs)) return null;
    try {
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${abs}"`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const n = parseFloat(out.trim());
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };
  // Reveal voice: a team/country display → mp3 under Team names/<lang>/<phrase>/.
  const teamDirIndex = new Map();
  const teamIndexFor = (lang, phrase) => {
    const key = `${lang}/${phrase}`;
    if (teamDirIndex.has(key)) return teamDirIndex.get(key);
    const m = new Map();
    try {
      for (const f of fs.readdirSync(path.join(VOICES_SRC, revealBaseDir, lang, phrase))) {
        if (VOICE_EXT_RE.test(f)) m.set(norm(f.replace(VOICE_EXT_RE, "")), f);
      }
    } catch {}
    teamDirIndex.set(key, m);
    return m;
  };
  const teamStems = (display) => {
    const d = String(display || "").trim();
    const out = new Set([d]);
    out.add(d.replace(/^(AC|FC|AS|SSC|RC|SL|SK|FK)\s+/i, ""));
    out.add(d.replace(/\s+(FC|CF|BC|SC|AC|SK|FK|KV|AFC)$/i, ""));
    return [...out];
  };
  const resolveTeamVoice = (display, pairs) => {
    const stems = teamStems(display).map(norm);
    for (const { lang, phrase } of pairs) {
      const idx = teamIndexFor(lang, phrase);
      for (const s of stems) {
        const f = idx.get(s);
        if (f) return voiceRel(`${revealBaseDir}/${lang}/${phrase}/${f}`);
      }
    }
    return null;
  };
  return { wantedVoices, voiceRel, findVoiceFile, audioDurationSec, resolveTeamVoice };
};

// EN prefers "plain" (just the name); ES prefers a sentence (runner never uses bare plain).
export const REVEAL_EN = ["plain", "answer-is", "correct-answer", "and-the-answer"].map((phrase) => ({ lang: "english", phrase }));
export const REVEAL_ES = ["answer-is", "and-the-answer", "correct-answer", "plain"].map((phrase) => ({ lang: "spanish", phrase }));

// Common emoji/logo assets every runner's outro + effects need.
export const COMMON_ASSETS = [
  "Logo/Football Quiz Logo English.png",
  "Logo/Football Quiz Logo Spanish.png",
  "Nationality/Europe/England.png",
  "Emojis/like.png",
  "Emojis/Subscribe.png",
  "Emojis/active-character-dribbling-removebg-preview.png",
  "Emojis/positive-character-with-ball-removebg-preview.png",
  "Emojis/round-characters-playing-football-removebg-preview.png",
  "Emojis/_Pngtree_soccer_ball_in_goal_net_3581900-removebg-preview.png",
  "Emojis/5842fe18a6515b1e0ad75b3d-removebg-preview.png",
  "Emojis/5842fe21a6515b1e0ad75b3e-removebg-preview.png",
  "Emojis/_Pngtree_mens_sports_red_football_shoes_9097428-removebg-preview.png",
];

// Build the fixed-sounds audio manifest. `quizTitle` is {english, spanish} relative
// "Voices/.." paths (already run through voiceRel by the caller, so durations resolve).
export const buildAudioManifest = (V, { bgm, quizTitleEn, quizTitleEs }) => {
  return {
    bgm,
    ticking: V.voiceRel("Ticking sound/ticking sound.mp3"),
    stinger: V.voiceRel("Transitions/mixkit-arcade-bonus-alert-767.wav"),
    quizTitle: { english: quizTitleEn, spanish: quizTitleEs },
    quizTitleDurationSec: {
      english: V.audioDurationSec(quizTitleEn),
      spanish: V.audioDurationSec(quizTitleEs),
    },
    // Outro voice — ALWAYS "How many did you get?".
    ending: {
      english: { "how-many": V.voiceRel(V.findVoiceFile("Ending Guess/english", /how many/i)) },
      spanish: { "how-many": V.voiceRel(V.findVoiceFile("Ending Guess/spanish", /cuantas/i)) },
    },
    endingDurationSec: {
      english: { "how-many": V.audioDurationSec(V.voiceRel(V.findVoiceFile("Ending Guess/english", /how many/i))) },
      spanish: { "how-many": V.audioDurationSec(V.voiceRel(V.findVoiceFile("Ending Guess/spanish", /cuantas/i))) },
    },
    // Mid-quiz break voice ("Think you know the answer? Comment below … let's continue!").
    midBreak: {
      english: V.voiceRel(V.findVoiceFile("Ending Guess/english", /lets continue/i)),
      spanish: V.voiceRel(V.findVoiceFile("Ending Guess/spanish", /seguimos/i)),
    },
    midBreakDurationSec: {
      english: V.audioDurationSec(V.voiceRel(V.findVoiceFile("Ending Guess/english", /lets continue/i))),
      spanish: V.audioDurationSec(V.voiceRel(V.findVoiceFile("Ending Guess/spanish", /seguimos/i))),
    },
    // BONUS-window voice VARIANTS (bonus-01..05): one is picked per save
    // (deterministic hash) so each video gets a random-feeling line.
    bonus: {
      english: bonusVariantPaths(V, "english"),
      spanish: bonusVariantPaths(V, "spanish"),
    },
    bonusDurationSec: {
      english: bonusVariantPaths(V, "english").map((p) => V.audioDurationSec(p)),
      spanish: bonusVariantPaths(V, "spanish").map((p) => V.audioDurationSec(p)),
    },
  };
};

export const BONUS_VOICE_VARIANTS = 5;
const bonusVariantPaths = (V, lang) =>
  Array.from({ length: BONUS_VOICE_VARIANTS }, (_, i) =>
    V.voiceRel(`Bonus/${lang}/bonus-${String(i + 1).padStart(2, "0")}.mp3`),
  );

// Pick a deterministic single BGM track (the runner shuffles 5 per save; one is enough here).
export const firstBgm = (V, VOICES_SRC) => {
  let files = [];
  try {
    files = fs.readdirSync(path.join(VOICES_SRC, "Ringhton")).filter((f) => /\.mp3$/i.test(f)).sort();
  } catch {}
  return V.voiceRel(files.length ? `Ringhton/${files[0]}` : null);
};

// ── sync referenced files into the shared public folder ───────────────────────
export const syncAssets = (wantedRel, IMAGES, SHARED_PUBLIC) => {
  let copied = 0, upToDate = 0, missing = 0;
  for (const rel of wantedRel) {
    if (!rel) continue;
    const src = path.join(IMAGES, rel);
    const dst = path.join(SHARED_PUBLIC, rel);
    if (!fs.existsSync(src)) { missing += 1; continue; }
    if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) { upToDate += 1; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied += 1;
  }
  return { copied, upToDate, missing };
};

export const syncVoices = (wantedVoices, VOICES_SRC, SHARED_PUBLIC) => {
  let copied = 0, upToDate = 0, missing = 0;
  for (const sub of wantedVoices) {
    const src = path.join(VOICES_SRC, sub);
    const dst = path.join(SHARED_PUBLIC, "Voices", sub);
    if (!fs.existsSync(src)) { missing += 1; continue; }
    if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) { upToDate += 1; continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied += 1;
  }
  return { copied, upToDate, missing };
};
