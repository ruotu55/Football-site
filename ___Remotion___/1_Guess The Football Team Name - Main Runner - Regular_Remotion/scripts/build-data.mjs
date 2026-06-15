// Reads the runner-1 saves + walks the shared image library and emits
// src/generated/saves.json, then syncs the referenced assets into the ONE shared
// public folder used by every Remotion project: <repo>/.remotion-shared/public
//
// Flags come from flagcdn.com (same as the runner) keyed by country→ISO code from
// .Storage/data/country-to-flagcode.json — NOT Images/Nationality (which mixes in
// national-team logos, e.g. Italy/Georgia). England uses the local St-George asset.
// Run via `npm run setup` / `npm run build-data`.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
// Auto-detect the repo root (walk up to the folder that holds .Storage) so this works
// regardless of nesting (the project now lives under ___Remotion___/).
const findRepoRoot = (start) => {
  let d = path.resolve(start, "..");
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, ".Storage"))) return d;
    const up = path.resolve(d, "..");
    if (up === d) break;
    d = up;
  }
  return path.resolve(start, "..");
};
const repoRoot = findRepoRoot(projectDir);
const IMAGES = path.join(repoRoot, "Images");
const SAVES_JSON = path.join(repoRoot, ".Storage", "storage", "recording-status.json");
const LAYOUTS_JSON = path.join(repoRoot, ".Storage", "storage", "runner-blobs", "lineups_runner_team_layouts_shared.json");
const FLAGCODES_JSON = path.join(repoRoot, ".Storage", "data", "country-to-flagcode.json");
const OUT = path.join(projectDir, "src", "generated", "saves.json");
const SHARED_PUBLIC = path.join(repoRoot, ".remotion-shared", "public");

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const toRel = (p) =>
  String(p || "").replace(/^[/\\]*Images[/\\]/i, "").replace(/\\/g, "/");

const SUFFIXES = new Set(["junior", "jr", "jr.", "ii", "iii"]);

// Permanent player-name overrides saved from the runner-1 PREP PANEL
// (NAME cube → "save permanently"). Keyed by the canonical squad name;
// the value is the EXACT display name to show on the card.
const PLAYER_NAME_OVERRIDES = (() => {
  try {
    const raw = fs.readFileSync(
      path.join(repoRoot, ".Storage", "storage", "runner-blobs", "player_name_overrides_shared.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
})();

const displayName = (name) => {
  const override = String(PLAYER_NAME_OVERRIDES[String(name || "").trim()] || "").trim();
  if (override) return override;
  const words = String(name || "").trim().split(/\s+/);
  if (words.length < 2) return name;
  const last = words[words.length - 1];
  return SUFFIXES.has(last.toLowerCase()) ? words[0] : last;
};

// Permanent TEAM-name overrides saved from the runner-1 PREP PANEL (panel
// "✎ Rename team" → "save permanently"). Same file the browser runners use.
// Keyed `club-by-nat::<selectedEntry.path | name:<lowercased club>>`.
const TEAM_NAME_OVERRIDES = (() => {
  try {
    const raw = fs.readFileSync(
      path.join(repoRoot, ".Storage", "storage", "runner-blobs", "team_name_overrides_shared.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
})();

// Resolve the DISPLAY team name for a level: per-save override first (rides
// with the saved script), then the shared permanent override, then the club.
const teamDisplayName = (lvl, club) => {
  const perSave = String(lvl?.headerTeamNameOverride || "").trim();
  if (perSave) return perSave;
  const identity =
    String(lvl?.selectedEntry?.path || "").trim() ||
    (club ? `name:${String(club).toLowerCase()}` : "");
  if (identity) {
    const v = String(TEAM_NAME_OVERRIDES[`club-by-nat::${identity}`] || "").trim();
    if (v) return v;
  }
  return club;
};

const walkDirs = (root, fn) => {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  fn(root, entries);
  for (const e of entries) if (e.isDirectory()) walkDirs(path.join(root, e.name), fn);
};

// ── player photo index ───────────────────────────────────────────────────────
const photoByClubName = new Map();
const photoByName = new Map();
// Player photos come in mixed formats (webp / avif / png / jpg). Chrome (Remotion)
// renders all of them; index any image, preferring webp → avif → png → jpg.
const IMG_RE = /\.(webp|avif|png|jpe?g)$/i;
const imgRank = (n) => (/\.webp$/i.test(n) ? 0 : /\.avif$/i.test(n) ? 1 : /\.png$/i.test(n) ? 2 : 3);
walkDirs(path.join(IMAGES, "Players", "Club images"), (dir, entries) => {
  const imgs = entries.filter((e) => e.isFile() && IMG_RE.test(e.name));
  if (!imgs.length) return;
  imgs.sort((a, b) => imgRank(a.name) - imgRank(b.name));
  const player = path.basename(dir);
  const club = path.basename(path.dirname(dir));
  const rel = path.relative(IMAGES, path.join(dir, imgs[0].name)).replace(/\\/g, "/");
  photoByClubName.set(`${norm(club)}::${norm(player)}`, rel);
  if (!photoByName.has(norm(player))) photoByName.set(norm(player), rel);
});
const resolvePhoto = (club, name) =>
  photoByClubName.get(`${norm(club)}::${norm(name)}`) || photoByName.get(norm(name)) || null;

// ── flags: country → ISO code → flag-icons 1x1 (uniform SQUARE, vector SVG) ───
// flag-icons (github.com/lipis/flag-icons) ships every country (+ gb-eng/sct/wls)
// as a 1:1 square SVG, so they all share the exact same size/shape and crop the
// same way in the circle — and SVG stays crisp at any resolution.
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

// ── saved team layouts (per team: formationId + customXi = the exact XI by slot) ──
// Keyed by squad path; we match by the trailing "Teams/<country>/<league>/<team>"
// segment (same as the crest path), preferring the canonical ".Storage" entries.
const groupOf = (pos) => {
  const p = String(pos || "");
  if (/Goalkeeper/i.test(p)) return "goalkeepers";
  if (/Back/i.test(p)) return "defenders";
  if (/Midfield/i.test(p)) return "midfielders";
  return "attackers";
};
const tailOf = (p) => {
  const s = String(p || "").replace(/\\/g, "/");
  const m = s.match(/(Teams|Nationalities)\/.*$/i);
  return m ? norm(m[0].replace(/\.(json|png|webp|jpe?g)$/i, "")) : null;
};
const layoutByTail = new Map();
try {
  const LAYOUTS = JSON.parse(fs.readFileSync(LAYOUTS_JSON, "utf-8"));
  for (const [k, v] of Object.entries(LAYOUTS)) {
    if (!v || !Array.isArray(v.customXi) || v.customXi.length < 11) continue;
    const t = tailOf(k);
    if (!t) continue;
    if (!layoutByTail.has(t) || k.includes(".Storage")) layoutByTail.set(t, v);
  }
} catch (e) {
  console.warn("  (no saved team layouts file — falling back to squad order)", e.message);
}

// ── voice / audio assets (synced into shared public under "Voices/..") ────────
const VOICES_SRC = path.join(repoRoot, ".Storage", "Voices");
const wantedVoices = new Set();
const stripAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const voiceRel = (sub) => {
  if (!sub) return null;
  const rel = String(sub).replace(/\\/g, "/");
  if (!fs.existsSync(path.join(VOICES_SRC, rel))) return null;
  wantedVoices.add(rel);
  return `Voices/${rel}`;
};
const findVoiceFile = (subdir, re) => {
  let entries;
  try { entries = fs.readdirSync(path.join(VOICES_SRC, subdir)); } catch { return null; }
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
/* ── Reveal voice: EXACT mirror of the runner's voice tab (js/audio.js) ─────────
   Phrase pick is DETERMINISTIC (same FNV hash + rules as getOrAssignRevealPhrase):
   EN even question -> plain, EN odd -> sentence, ES always a sentence; seeded by the
   RAW squad name + question index. File stems mirror resolveTeamNameVoiceFileStems
   (alias map + prefix/suffix variants) over the DISPLAY name, so a renamed team uses
   the new name's clip. NO cross-phrase fallback: if the assigned phrase's clip is
   missing the level is silent — generate it in the voice tab. KEEP IN SYNC with
   1_…Regular/js/audio.js (phrase + stem logic). */
const TEAM_SENTENCE_PHRASE_KEYS = ["correct-answer", "right-answer", "and-the-answer", "answer-is", "and-its", "team-is"];
const phraseSeedHash = (seed) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const deterministicSentencePhrase = (seedName, questionIndex, lang) =>
  TEAM_SENTENCE_PHRASE_KEYS[
    phraseSeedHash(`phrase::${lang}::${String(seedName || "").toLowerCase()}::${questionIndex}`) %
      TEAM_SENTENCE_PHRASE_KEYS.length
  ];
const pickRevealPhraseForQuestion = (questionIndex, lang, seedName) => {
  if (lang === "spanish") return deterministicSentencePhrase(seedName, questionIndex, "spanish");
  if (!Number.isFinite(questionIndex)) return "plain";
  if ((questionIndex % 2) === 0) return "plain";
  return deterministicSentencePhrase(seedName, questionIndex, "english");
};

const TEAM_NAME_VOICE_FILE_ALIASES = {
  "arsenal fc": "Arsenal",
  "as monaco": "Monaco",
  "atalanta bc": "Atalanta",
  "ajax amsterdam": "Ajax",
  "atlético de madrid": "Atletico Madrid",
  "bayer 04 leverkusen": "Bayer Leverkusen",
  "chelsea fc": "Chelsea",
  "club brugge kv": "Club Brugge",
  "fc barcelona": "Barcelona",
  "fc copenhagen": "Copenhagen",
  "fk bodø/glimt": "Bodo Glimt",
  "juventus fc": "Juventus",
  "liverpool fc": "Liverpool",
  "olympiacos piraeus": "Olympiacos",
  "pafos fc": "Pafos",
  "qarabağ fk": "Qarabag",
  "sk slavia prague": "Slavia Prague",
  "sl benfica": "Benfica Lisbon",
  "ssc napoli": "Napoli",
  "sporting cp": "Sporting Lisbon",
  "villarreal cf": "Villarreal",
};
const TEAM_NAME_VOICE_PREFIXES = ["FC", "FK", "SK", "SL", "AS", "SSC", "RC"];
const TEAM_NAME_VOICE_SUFFIXES = ["FC", "CF", "BC", "SC", "AC", "SK", "FK", "KV", "AFC"];
const TEAM_NAME_VOICE_TRAILING_LOCATION_WORDS = ["Amsterdam", "Piraeus"];
const normalizeVoiceStemText = (value) =>
  String(value || "")
    .trim()
    .replace(/[Øø]/g, "o")
    .replace(/[Ðð]/g, "d")
    .replace(/[Þþ]/g, "th")
    .replace(/[Ææ]/g, "ae")
    .replace(/[Œœ]/g, "oe")
    .replace(/[Łł]/g, "l")
    .replace(/[Ğğ]/g, "g")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/[\/\\]+/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const pushUniqueExactVoiceStem = (out, value) => {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  if (clean && !out.includes(clean)) out.push(clean);
};
const pushUniqueVoiceStem = (out, value) => {
  const clean = normalizeVoiceStemText(value);
  if (clean && !out.includes(clean)) out.push(clean);
};
const addShortVoiceStemVariants = (out, stem) => {
  const clean = normalizeVoiceStemText(stem);
  if (!clean) return;
  for (const prefix of TEAM_NAME_VOICE_PREFIXES) {
    pushUniqueVoiceStem(out, clean.replace(new RegExp(`^${prefix}\\s+`, "i"), ""));
  }
  for (const suffix of TEAM_NAME_VOICE_SUFFIXES) {
    pushUniqueVoiceStem(out, clean.replace(new RegExp(`\\s+${suffix}$`, "i"), ""));
  }
  for (const word of TEAM_NAME_VOICE_TRAILING_LOCATION_WORDS) {
    pushUniqueVoiceStem(out, clean.replace(new RegExp(`\\s+${word}$`, "i"), ""));
  }
  pushUniqueVoiceStem(out, clean.replace(/\b0+[0-9]+\b/g, "").replace(/\s+/g, " "));
  pushUniqueVoiceStem(out, clean.replace(/\bde\s+/gi, ""));
};
const resolveTeamNameVoiceFileStems = (displayName) => {
  const trimmed = String(displayName || "").trim();
  if (!trimmed) return [];
  const stems = [];
  const alias = TEAM_NAME_VOICE_FILE_ALIASES[trimmed.toLowerCase()];
  if (alias) pushUniqueExactVoiceStem(stems, alias);
  pushUniqueExactVoiceStem(stems, trimmed);
  if (alias) pushUniqueVoiceStem(stems, alias);
  pushUniqueVoiceStem(stems, trimmed);
  const baseCount = stems.length;
  for (let i = 0; i < baseCount; i++) addShortVoiceStemVariants(stems, stems[i]);
  return stems;
};
const TEAM_NAME_VOICE_EXTS = [".mp3", ".wav", ".m4a"];
const findRevealClip = (lang, phrase, stems) => {
  for (const stem of stems) {
    for (const ext of TEAM_NAME_VOICE_EXTS) {
      const rel = `Team names/${lang}/${phrase}/${stem}${ext}`;
      if (fs.existsSync(path.join(VOICES_SRC, rel))) return voiceRel(rel);
    }
  }
  return null;
};
const findLegacyPlainClip = (stems) => {
  for (const stem of stems) {
    for (const ext of TEAM_NAME_VOICE_EXTS) {
      const rel = `Team names/${stem}${ext}`;
      if (fs.existsSync(path.join(VOICES_SRC, rel))) return voiceRel(rel);
    }
  }
  return null;
};
// displayName drives the FILE stem (renamed team -> new name's clip); rawName seeds
// the phrase (a rename never rerolls the sentence). Candidate order = the browser's
// buildRevealVoiceCandidates: EN phrase dir (+ legacy flat for plain); ES = spanish
// phrase dir, then english SAME-phrase dir.
const resolveRevealVoiceExact = (displayName, rawName, questionIndex) => {
  const stems = resolveTeamNameVoiceFileStems(displayName);
  if (!stems.length) return { en: null, es: null };
  const phraseEn = pickRevealPhraseForQuestion(questionIndex, "english", rawName);
  const phraseEs = pickRevealPhraseForQuestion(questionIndex, "spanish", rawName);
  let en = findRevealClip("english", phraseEn, stems);
  if (!en && phraseEn === "plain") en = findLegacyPlainClip(stems);
  const es = findRevealClip("spanish", phraseEs, stems) || findRevealClip("english", phraseEs, stems);
  return { en, es };
};
let missingRevealVoices = 0;

// ── read saves, build output ──────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const GROUPS = ["goalkeepers", "defenders", "midfielders", "attackers"];
let xiFromLayout = 0;
let xiFromSquad = 0;

let missingPhotos = 0;
let missingFlags = 0;
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("1|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue;
  const levelsSrc = (block.script && block.script.levels) || [];

  const levels = [];
  for (const lvl of levelsSrc) {
    const cs = lvl.currentSquad;
    if (!cs || lvl.isLogo || lvl.isIntro || lvl.isOutro) continue;
    const club = cs.name || "";
    const crestParts = String(cs.imagePath || "").split(/[/\\]/);
    const country = crestParts[1] === "Teams" && crestParts[2] !== "Competitions" ? crestParts[2] : "";

    const toPlayer = (p, clubHint, group) => {
      const photoPath = resolvePhoto(p.club || clubHint, p.name);
      const flagPath = resolveFlag(p.nationality);
      if (!photoPath) missingPhotos += 1;
      if (!flagPath) missingFlags += 1;
      // Per-save custom name (NAME cube → "only for THIS save") wins, then the
      // permanent override / short-name. Keeps the video == the prep preview.
      const perSave = lvl.customNames && typeof lvl.customNames === "object"
        ? String(lvl.customNames[p.name] || "").trim()
        : "";
      return {
        name: p.name,
        display: perSave || displayName(p.name),
        position: p.position || "",
        group,
        nationality: p.nationality || "",
        flagPath,
        photoPath,
      };
    };

    // Prefer the SAVED team layout: its formationId + customXi (the real XI, by slot).
    const snap = layoutByTail.get(tailOf(cs.imagePath));
    let players;
    let formationId;
    let xiOrdered;
    if (snap && Array.isArray(snap.customXi) && snap.customXi.length >= 11) {
      formationId = snap.formationId || lvl.formationId || "433";
      xiOrdered = true;
      players = snap.customXi.slice(0, 11).map((p) => toPlayer(p, club, groupOf(p.position)));
      xiFromLayout += 1;
    } else {
      formationId = lvl.formationId || "433";
      xiOrdered = false;
      players = [];
      for (const g of GROUPS) for (const p of cs[g] || []) players.push(toPlayer(p, club, g));
      if (players.length < 11) continue;
      xiFromSquad += 1;
    }

    // questionIndex mirrors the voice tab (levelIdx - 1; the landing level is index 0)
    // = how many question levels were already pushed for this save.
    const reveal = resolveRevealVoiceExact(teamDisplayName(lvl, club), club, levels.length);
    const revealVoiceEn = reveal.en;
    const revealVoiceEs = reveal.es;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      teamName: teamDisplayName(lvl, club),
      crestPath: cs.imagePath ? toRel(cs.imagePath) : null,
      country,
      flagPath: resolveFlag(country),
      formationId,
      xiOrdered,
      players,
      revealVoiceEn,
      revealVoiceEs,
    });
  }
  if (levels.length) saves.push({ name, levels });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ saves }, null, 0));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✓ ${saves.length} saves, ${saves.reduce((n, s) => n + s.levels.length, 0)} levels -> src/generated/saves.json (${kb} KB)`);
console.log(`  unresolved photos: ${missingPhotos}, unresolved flags: ${missingFlags}`);
console.log(`  XI source: ${xiFromLayout} from saved layout, ${xiFromSquad} from squad order (no layout)`);

// ── audio manifest (fixed sounds) → src/generated/audio.json ──────────────────
// BGM: one deterministic Ringhton track (the runner shuffles 5 per save; here we
// loop a single track + duck nothing — good enough, language-agnostic).
const bgmFiles = (() => {
  try { return fs.readdirSync(path.join(VOICES_SRC, "Ringhton")).filter((f) => /\.mp3$/i.test(f)).sort(); }
  catch { return []; }
})();
const BONUS_VOICE_VARIANTS = 5;
const bonusVariantPaths = (lang) =>
  Array.from({ length: BONUS_VOICE_VARIANTS }, (_, i) =>
    voiceRel(`Bonus/${lang}/bonus-${String(i + 1).padStart(2, "0")}.mp3`),
  );
const audio = {
  bgm: voiceRel(bgmFiles.length ? `Ringhton/${bgmFiles[0]}` : null),
  ticking: voiceRel("Ticking sound/ticking sound.mp3"),
  stinger: voiceRel("Transitions/mixkit-arcade-bonus-alert-767.wav"),
  quizTitle: {
    english: voiceRel(findVoiceFile("Game name/Lineups Regular/english", /nationality/i)),
    spanish: voiceRel(findVoiceFile("Game name/Lineups Regular/spanish", /nacionalidad/i)),
  },
  quizTitleDurationSec: {
    english: audioDurationSec(voiceRel(findVoiceFile("Game name/Lineups Regular/english", /nationality/i))),
    spanish: audioDurationSec(voiceRel(findVoiceFile("Game name/Lineups Regular/spanish", /nacionalidad/i))),
  },
  // Outro voice — ALWAYS "How many did you get?".
  ending: {
    english: { "how-many": voiceRel(findVoiceFile("Ending Guess/english", /how many/i)) },
    spanish: { "how-many": voiceRel(findVoiceFile("Ending Guess/spanish", /cuantas/i)) },
  },
  endingDurationSec: {
    english: { "how-many": audioDurationSec(voiceRel(findVoiceFile("Ending Guess/english", /how many/i))) },
    spanish: { "how-many": audioDurationSec(voiceRel(findVoiceFile("Ending Guess/spanish", /cuantas/i))) },
  },
  // Mid-quiz break voice ("Think you know the answer? Comment below … let's continue!").
  midBreak: {
    english: voiceRel(findVoiceFile("Ending Guess/english", /lets continue/i)),
    spanish: voiceRel(findVoiceFile("Ending Guess/spanish", /seguimos/i)),
  },
  midBreakDurationSec: {
    english: audioDurationSec(voiceRel(findVoiceFile("Ending Guess/english", /lets continue/i))),
    spanish: audioDurationSec(voiceRel(findVoiceFile("Ending Guess/spanish", /seguimos/i))),
  },
  // BONUS-window voice VARIANTS (bonus-01..05): one is picked per save
  // (deterministic hash) so each video gets a random-feeling line.
  bonus: {
    english: bonusVariantPaths("english"),
    spanish: bonusVariantPaths("spanish"),
  },
  bonusDurationSec: {
    english: bonusVariantPaths("english").map((p) => audioDurationSec(p)),
    spanish: bonusVariantPaths("spanish").map((p) => audioDurationSec(p)),
  },
};
// Intro greeting voice (combined clip: "Welcome … let's get started. Guess the football
// team name by players' nationality.") — plays over the Ultimate intro, replaces the
// separate quiz-title voice. Stored in .Storage/Voices/Intro Greeting/teamname/<lang>/.
audio.introGreeting = {
  english: voiceRel(findVoiceFile("Intro Greeting/teamname/english", /intro/i)),
  spanish: voiceRel(findVoiceFile("Intro Greeting/teamname/spanish", /intro/i)),
};
audio.introGreetingDurationSec = {
  english: audioDurationSec(voiceRel(findVoiceFile("Intro Greeting/teamname/english", /intro/i))),
  spanish: audioDurationSec(voiceRel(findVoiceFile("Intro Greeting/teamname/spanish", /intro/i))),
};
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, introGreeting EN ${audio.introGreeting.english ? "ok" : "—"}/ES ${audio.introGreeting.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`);

// ── sync referenced library files into the shared public folder (union) ───────
const wanted = new Set();
const add = (p) => { if (p) wanted.add(p); }; // Flags/ now live locally in Images/Flags/ and sync like everything else
for (const s of saves) {
  for (const lv of s.levels) {
    add(lv.crestPath);
    add(lv.flagPath);
    for (const p of lv.players) {
      add(p.photoPath);
      add(p.flagPath);
    }
  }
}
[
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
].forEach((p) => wanted.add(p));

let copied = 0;
let upToDate = 0;
let copyMissing = 0;
for (const rel of wanted) {
  const src = path.join(IMAGES, rel);
  const dst = path.join(SHARED_PUBLIC, rel);
  if (!fs.existsSync(src)) {
    copyMissing += 1;
    continue;
  }
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) {
    upToDate += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied += 1;
}
console.log(`  shared cache: +${copied} copied, ${upToDate} up-to-date, ${copyMissing} missing`);

// ── sync voice/audio files into shared public (from .Storage/Voices → Voices/..) ─
let vCopied = 0;
let vUp = 0;
let vMiss = 0;
for (const sub of wantedVoices) {
  const src = path.join(VOICES_SRC, sub);
  const dst = path.join(SHARED_PUBLIC, "Voices", sub);
  if (!fs.existsSync(src)) { vMiss += 1; continue; }
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) { vUp += 1; continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  vCopied += 1;
}
console.log(`  voices: +${vCopied} copied, ${vUp} up-to-date, ${vMiss} missing -> .remotion-shared/public/Voices`);

// Flags are stored locally as real PNGs in Images/Flags/{code}.png (committed,
// converted once from flag-icons squares) and get copied into the shared cache by
// the sync above — no network needed. To add a country later, drop its png there.
const missingFlagFiles = [...usedFlagCodes].filter(
  (code) => !fs.existsSync(path.join(IMAGES, "Flags", `${code}.png`)),
);
if (missingFlagFiles.length) {
  console.log(`  ⚠ missing local flags in Images/Flags/: ${missingFlagFiles.join(", ")}`);
} else {
  console.log(`  flags: all ${usedFlagCodes.size} from local Images/Flags/ (no download)`);
}
