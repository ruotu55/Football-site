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
const displayName = (name) => {
  const words = String(name || "").trim().split(/\s+/);
  if (words.length < 2) return name;
  const last = words[words.length - 1];
  return SUFFIXES.has(last.toLowerCase()) ? words[0] : last;
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
const VOICE_EXT_RE = /\.(mp3|wav|m4a)$/i;
const teamDirIndex = new Map();
const teamIndexFor = (lang, phrase) => {
  const key = `${lang}/${phrase}`;
  if (teamDirIndex.has(key)) return teamDirIndex.get(key);
  const m = new Map();
  try {
    for (const f of fs.readdirSync(path.join(VOICES_SRC, "Team names", lang, phrase))) {
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
// Reveal voice: team display → mp3 under Team names/<lang>/<phrase>/ (first that exists).
const resolveTeamVoice = (display, pairs) => {
  const stems = teamStems(display).map(norm);
  for (const { lang, phrase } of pairs) {
    const idx = teamIndexFor(lang, phrase);
    for (const s of stems) {
      const f = idx.get(s);
      if (f) return voiceRel(`Team names/${lang}/${phrase}/${f}`);
    }
  }
  return null;
};
// EN prefers "plain" (just the name); ES prefers a sentence (never bare "plain" in the runner).
const REVEAL_EN = ["plain", "answer-is", "correct-answer", "and-the-answer"].map((phrase) => ({ lang: "english", phrase }));
const REVEAL_ES = ["answer-is", "and-the-answer", "correct-answer", "plain"].map((phrase) => ({ lang: "spanish", phrase }));
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
      return {
        name: p.name,
        display: displayName(p.name),
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

    const revealVoiceEn = resolveTeamVoice(club, REVEAL_EN);
    const revealVoiceEs = resolveTeamVoice(club, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      teamName: club,
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
  ending: {
    english: {
      "think-you-know": voiceRel(findVoiceFile("Ending Guess/english", /think you know/i)),
      "how-many": voiceRel(findVoiceFile("Ending Guess/english", /how many/i)),
    },
    spanish: {
      "think-you-know": voiceRel(findVoiceFile("Ending Guess/spanish", /crees/i)),
      "how-many": voiceRel(findVoiceFile("Ending Guess/spanish", /cuantas/i)),
    },
  },
  endingDurationSec: {
    english: {
      "think-you-know": audioDurationSec(voiceRel(findVoiceFile("Ending Guess/english", /think you know/i))),
      "how-many": audioDurationSec(voiceRel(findVoiceFile("Ending Guess/english", /how many/i))),
    },
    spanish: {
      "think-you-know": audioDurationSec(voiceRel(findVoiceFile("Ending Guess/spanish", /crees/i))),
      "how-many": audioDurationSec(voiceRel(findVoiceFile("Ending Guess/spanish", /cuantas/i))),
    },
  },
};
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`);

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
