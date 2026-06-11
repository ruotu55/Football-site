// Runner 9 — "Football Quiz Multiple Choice (A/B/C)".
// MCQ data is EMBEDDED in the save's script.levels[].mcq — no teamsImportText lookup.
// Each level carries questionType, questionText, answers (with optional photoPath), and
// the correct answer id. topicImage paths and answer.photoPath are repo-relative under Images/.
// Emits src/generated/{saves,audio}.json and syncs assets into <repo>/.remotion-shared/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  norm,
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

// MCQ answer voice: .Storage/Voices/MCQ/Football Quiz MCQ/<lang>/answers/<slug>.mp3
// The slug is lowercase ASCII, non-alphanumeric → "-" (matching mcq-mode.js mcqSlug()).
const MCQ_VOICE_BASE = "MCQ/Football Quiz MCQ";
const V = makeVoiceHelpers(P.VOICES_SRC, MCQ_VOICE_BASE);

function mcqSlug(text) {
  const s = String(text || "")
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 80) || "untitled";
}

// Resolve the reveal voice for the correct answer in a given language.
function resolveAnswerVoice(mcq, lang) {
  const ans = (mcq.answers || []).find((a) => a && a.id === mcq.correctAnswerId);
  if (!ans) return null;
  const text = (typeof ans.text === "string" ? ans.text : ans.text?.[lang] || ans.text?.english) || "";
  if (!text) return null;
  const slug = mcqSlug(text);
  const sub = `${MCQ_VOICE_BASE}/${lang}/answers/${slug}.mp3`;
  return V.voiceRel(sub);
}

// Strip leading "Images/" or "/" from a path so it's relative to IMAGES root
// (matching syncAssets which receives paths relative to IMAGES).
function toImagesRel(p) {
  if (!p) return null;
  return String(p).replace(/\\/g, "/").replace(/^[/\\]+/, "").replace(/^Images\//i, "");
}

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

let missingRevealVoices = 0;
let missingImages = 0;

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("9|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue; // unnamed blocks are placeholders

  const rawLevels = (block.script && Array.isArray(block.script.levels)) ? block.script.levels : [];
  const levels = [];

  for (const raw of rawLevels) {
    // Skip intro/logo/outro levels
    if (raw.isLogo || raw.isIntro || raw.isOutro) continue;
    // Only include levels with MCQ data
    if (!raw.mcq || !Array.isArray(raw.mcq.answers) || raw.mcq.answers.length === 0) continue;

    const mcq = raw.mcq;

    // Normalize image paths to be relative to Images/ (for syncAssets)
    const topicImageRel = toImagesRel(mcq.topicImage);
    const normalizedMcq = {
      ...mcq,
      // Keep original paths as stored (build-data normalizes only for syncAssets;
      // the Level component uses staticFile(path) where path is relative to public/).
      topicImage: topicImageRel ? topicImageRel : null,
      answers: (mcq.answers || []).map((a) => ({
        ...a,
        photoPath: toImagesRel(a.photoPath),
      })),
    };

    const revealVoiceEn = resolveAnswerVoice(mcq, "english");
    const revealVoiceEs = resolveAnswerVoice(mcq, "spanish");
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      mcq: normalizedMcq,
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
console.log(`  reveal voices missing: ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
// Quiz title voice: Game name/Football Quiz MCQ/<lang>/<file>.mp3
const GAME_VOICE_BASE = "Game name/Football Quiz MCQ";
const GV = makeVoiceHelpers(P.VOICES_SRC, GAME_VOICE_BASE);
const quizTitleEn = GV.voiceRel(GV.findVoiceFile(`${GAME_VOICE_BASE}/english`, /./));
const quizTitleEs = GV.voiceRel(GV.findVoiceFile(`${GAME_VOICE_BASE}/spanish`, /./));
const bgm = firstBgm(V, P.VOICES_SRC);
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}`);

// ── sync assets ───────────────────────────────────────────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    if (lv.mcq.topicImage) wanted.add(lv.mcq.topicImage);
    for (const a of lv.mcq.answers || []) {
      if (a.photoPath) wanted.add(a.photoPath);
    }
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));

// Check which images actually exist in Images/
for (const rel of wanted) {
  if (!rel) continue;
  if (!fs.existsSync(path.join(P.IMAGES, rel))) missingImages += 1;
}
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);

const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);
