/* Voice tab — centralised status + generate/delete UI for every TTS clip this runner
 * produces. Opens via the "Voice" panel tab (between Setup and Saved).
 *
 * Rows are grouped into four sections (displayed in this order):
 *   1. Quiz Intro   — the current quiz-type intro (+ optional specific title suffix) [per-runner]
 *   2. Players      — one row per unique player currently assigned to any level [shared]
 *   3. Endings      — "think you know" / "how many" outro clips [shared]
 *   4. Quiz Sounds  — clips specific to the current quiz type (e.g. fake-stats clips) [per-runner]
 *
 * Each row shows: [Vol] [X] "<full text that will be synthesised>"
 *   • Vol low-opacity when the clip file is missing on disk; full-opacity when it exists.
 *   • X disabled when the clip is missing.
 *
 * Every row talks to the per-runner endpoints already exposed by run_site.py:
 *   /__quiz-title-voice/{status|generate|delete}
 *   /__fake-stats-voice/{status|generate|delete}
 *   /__ending-voice/{status|generate|delete}
 *   /__player-voice/{status|generate|delete}
 * The server stores clips under a runner-scoped subdirectory (RUNNER_VARIANT in run_site.py),
 * so this runner's voices are isolated from Regular / other runners.
 */

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

const FIXED_VOICE = "en-US-AndrewNeural";

/* ── Language state ─────────────────────────────────────────────
     Persisted in localStorage so it survives page reloads. Sent as `language`
     with every voice endpoint call. The server stores clips under a subdir
     matching this value, so switching language doesn't clobber the other pool. */
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];
const LANGUAGE_LABELS = { english: "English", spanish: "Español" };

export function getCurrentLanguage() {
  try {
    const stored = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : "english";
  } catch { return "english"; }
}

function setCurrentLanguage(lang) {
  const next = SUPPORTED_LANGUAGES.includes(lang) ? lang : "english";
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* ignore */ }
}

/* ── Prompts per language. Kept in lock-step with run_site.py's *_PROMPT_BY_*
     maps for this runner. Shown next to each row so the user sees exactly
     what will be synthesised. */
const QUIZ_TYPE_PROMPTS = {
  english: {
    "player-by-career":         "GUESS THE PLAYER BY CAREER PATH",
    "player-by-career-stats":   "GUESS THE PLAYER BY CLUB, POSITION, COUNTRY, AND AGE",
    "player-by-fake-info":      "GUESS THE FAKE INFORMATION ABOUT THE PLAYER",
  },
  spanish: {
    "player-by-career":         "ADIVINA AL JUGADOR POR TRAYECTORIA",
    "player-by-career-stats":   "ADIVINA AL JUGADOR POR CLUB, POSICIÓN, PAÍS Y EDAD",
    "player-by-fake-info":      "ADIVINA LA INFORMACIÓN FALSA DEL JUGADOR",
  },
};

const FAKE_STAT_PROMPTS = {
  english: {
    club:          "The fake stats was the club!",
    position:      "The fake stats was the position!",
    country:       "The fake stats was the country!",
    shirt_number:  "The fake stats was the shirt number!",
  },
  spanish: {
    club:          "¡La información falsa era el club!",
    position:      "¡La información falsa era la posición!",
    country:       "¡La información falsa era el país!",
    shirt_number:  "¡La información falsa era el número de camiseta!",
  },
};

const ENDING_PROMPTS = {
  english: {
    "think-you-know": "Think you know the answer? Let us know in the comments! Don't forget to like and subscribe!",
    "how-many":       "How many did you get? Let us know in the comments! Don't forget to like and subscribe!",
  },
  spanish: {
    "think-you-know": "¿Crees saber la respuesta? ¡Dínoslo en los comentarios! ¡No olvides dar like y suscribirte!",
    "how-many":       "¿Cuántas acertaste? ¡Dínoslo en los comentarios! ¡No olvides dar like y suscribirte!",
  },
};

/* Section titles stay in English regardless of language — only the synthesised
   prompt text switches per language. */
const SECTION_TITLES = {
  quizIntro: "Quiz Intro",
  players: "Players",
  endings: "Endings",
  quizSounds: "Quiz Sounds",
};

/* Row-level play busy tracker — keyed by a string unique to the clip. */
const busyByKey = new Set();
let audioEl = null;

function endpointUrl(relPath) {
  return projectAssetUrl(relPath);
}

function stopPreviewAudio() {
  if (!audioEl) return;
  audioEl.pause();
  audioEl.currentTime = 0;
  audioEl = null;
}

function playClip(src) {
  const clipSrc = String(src || "").trim();
  if (!clipSrc) return;
  stopPreviewAudio();
  const a = new Audio(clipSrc);
  audioEl = a;
  a.addEventListener("ended", () => { if (audioEl === a) audioEl = null; }, { once: true });
  a.play().catch(() => {});
}

function uniquePlayerNames() {
  const seen = new Set();
  const out = [];
  const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  for (const lvl of levels) {
    const name = String(lvl?.careerPlayer?.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function getCurrentQuizType() {
  const raw = String(appState.els?.inQuizType?.value || "").trim();
  const langMap = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english;
  return raw in langMap ? raw : "";
}

function getSpecificTitle() {
  const { els } = appState;
  if (!els?.inSpecificTitleToggle?.checked) return "";
  return String(els?.inSpecificTitleText?.value || "").trim();
}

function quizTitleSynthText(quizType, specificTitle) {
  const langMap = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english;
  const base = langMap[quizType] || "";
  const extra = String(specificTitle || "").trim();
  return extra ? `${base} ${extra}` : base;
}

/* ── Status fetches — each returns { exists, src } so Vol can replay directly from cache.
     All fetchers pass `language` so the server looks in the correct language subdir. */

async function fetchQuizTitleStatus(quizType, specificTitle) {
  try {
    const params = new URLSearchParams({
      quizType,
      specificTitle: specificTitle || "",
      language: getCurrentLanguage(),
    });
    const res = await fetch(`${endpointUrl("__quiz-title-voice/status")}?${params}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { exists: !!body?.exists, src: String(body?.src || "") };
  } catch { return { exists: false, src: "" }; }
}

async function fetchFakeStatsStatus() {
  try {
    const params = new URLSearchParams({ language: getCurrentLanguage() });
    const res = await fetch(`${endpointUrl("__fake-stats-voice/status")}?${params}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return body?.stats || {};
  } catch { return {}; }
}

async function fetchEndingStatus(endingType) {
  try {
    const params = new URLSearchParams({ endingType, language: getCurrentLanguage() });
    const res = await fetch(`${endpointUrl("__ending-voice/status")}?${params}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { exists: !!body?.exists, src: String(body?.src || "") };
  } catch { return { exists: false, src: "" }; }
}

async function fetchPlayerStatus(name) {
  try {
    const params = new URLSearchParams({ name, language: getCurrentLanguage() });
    const res = await fetch(`${endpointUrl("__player-voice/status")}?${params}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { exists: !!body?.exists, src: String(body?.src || "") };
  } catch { return { exists: false, src: "" }; }
}

async function fetchBundledStatus(key) {
  try {
    const params = new URLSearchParams({ key, language: getCurrentLanguage() });
    const res = await fetch(`${endpointUrl("__bundled-voice/status")}?${params}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { exists: !!body?.exists, src: String(body?.src || "") };
  } catch { return { exists: false, src: "" }; }
}

/* ── Row actions — every Vol press plays from the start (cutting any in-flight clip).
     X press stops audio first, then deletes the cached file. */

function playFromStart(src) {
  const clipSrc = String(src || "").trim();
  if (!clipSrc) return;
  /* stopPreviewAudio() inside playClip handles both "not playing" and "already playing". */
  playClip(clipSrc);
}

async function onVolPressed({ rowKey, cachedExists, cachedSrc, generateEndpoint, generateBody }) {
  /* Fast path: clip is on disk — restart it immediately (no status round-trip). */
  if (cachedExists && cachedSrc) {
    playFromStart(cachedSrc);
    return;
  }
  /* Slow path: clip missing — generate, then play the freshly-returned src. */
  if (busyByKey.has(rowKey)) return;
  busyByKey.add(rowKey);
  try {
    const res = await fetch(endpointUrl(generateEndpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...generateBody, voice: FIXED_VOICE, language: getCurrentLanguage() }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) {
      const msg = payload?.error || `Generation failed (${res.status})`;
      throw new Error(msg);
    }
    const generatedSrc =
      (payload.generated && Object.values(payload.generated)[0]?.src) ||
      payload.src ||
      "";
    playFromStart(generatedSrc);
  } catch (err) {
    alert(`Could not generate voice.\n${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busyByKey.delete(rowKey);
    renderVoiceTab();
  }
}

async function onDeletePressed({ rowKey, deleteEndpoint, deleteBody }) {
  /* Always halt any playback first — X should not leave audio running. */
  stopPreviewAudio();
  if (busyByKey.has(rowKey)) return;
  busyByKey.add(rowKey);
  try {
    const res = await fetch(endpointUrl(deleteEndpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...deleteBody, language: getCurrentLanguage() }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) {
      const msg = payload?.error || `Delete failed (${res.status})`;
      throw new Error(msg);
    }
  } catch (err) {
    alert(`Could not delete voice.\n${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busyByKey.delete(rowKey);
    renderVoiceTab();
  }
}

/* ── Bundled voices (Welcome + Level progress). Each language is generated on-demand
     via ElevenLabs and stored under `<dir>/<lang>/<filename>`. Vol generates+plays if
     the clip is missing; X deletes the cached clip for the current language. */
const BUNDLED_VOICES = [
  { key: "welcome",
    text:    { english: "Welcome to the football lab, let's start!!!",    spanish: "¡Bienvenidos al laboratorio de fútbol, empecemos!" },
    src:     "../.Storage/Voices/Welcome/Welcome to the football lab, lets start!!!.mp3",
    playsAt: { english: "Landing",                                        spanish: "Página inicial" } },
  { key: "warm-up",
    text:    { english: "Warm up round — don't mess this one!",           spanish: "Ronda de calentamiento — ¡no la arruines!" },
    src:     "../.Storage/Voices/Levels/Worm up round dont mess this one .mp3",
    playsAt: { english: "Level 1 (Regular only)",                         spanish: "Nivel 1 (solo Regular)" } },
  { key: "serious",
    text:    { english: "OK now it's getting serious.",                   spanish: "Bien, ahora se pone serio." },
    src:     "../.Storage/Voices/Levels/OK now it's getting serious.mp3",
    playsAt: { english: "~30% progress (Regular only)",                   spanish: "~30% de avance (solo Regular)" } },
  { key: "nerds",
    text:    { english: "Only true football nerds know this!!!",          spanish: "¡¡Solo los verdaderos fanáticos del fútbol saben esto!!" },
    src:     "../.Storage/Voices/Levels/Only true football nerd know this!!!.mp3",
    playsAt: { english: "~60% progress (Regular only)",                   spanish: "~60% de avance (solo Regular)" } },
  { key: "genius",
    text:    { english: "If you get this you are basically a genius!!!",  spanish: "¡¡Si aciertas esto eres básicamente un genio!!" },
    src:     "../.Storage/Voices/Levels/If you get this you are basically a genius!!!.mp3",
    playsAt: { english: "~90% progress (Regular only)",                   spanish: "~90% de avance (solo Regular)" } },
];

/* When each non-bundled voice type plays. Used as the default "plays at" pill text.
   Each value is a { english, spanish } pair. */
const PLAYS_AT = {
  quizIntro: { english: "Landing → Level 1",                       spanish: "Inicial → Nivel 1" },
  player:    { english: "Question levels (where assigned)",        spanish: "Niveles de pregunta (donde esté asignado)" },
  ending:    { english: "Last page (outro)",                       spanish: "Última página (outro)" },
  fakeStat:  { english: "Question reveal (fake-info)",             spanish: "Revelación (info falsa)" },
};

function plays(key) {
  const lang = getCurrentLanguage();
  const p = PLAYS_AT[key];
  return (p && (p[lang] || p.english)) || "";
}
function bundledText(entry) {
  const lang = getCurrentLanguage();
  return entry.text[lang] || entry.text.english;
}
function bundledPlaysAt(entry) {
  const lang = getCurrentLanguage();
  return entry.playsAt[lang] || entry.playsAt.english;
}
function levelLabel(indices) {
  const lang = getCurrentLanguage();
  return lang === "spanish" ? `Nivel ${indices.join(", ")}` : `Level ${indices.join(", ")}`;
}

/* ── DOM row builder ─────────────────────────────────────────── */

function buildRow({ text, exists, onPlay, onDelete, playsAt = "", deleteDisabled = null }) {
  const row = document.createElement("div");
  row.className = `voice-tab-row ${exists ? "is-present" : "is-missing"}`;

  const vol = document.createElement("button");
  vol.type = "button";
  vol.className = "voice-tab-btn voice-tab-btn--vol";
  vol.textContent = "Vol";
  vol.title = exists ? "Play" : "Generate and play";
  vol.onclick = (e) => { e.preventDefault(); onPlay(); };

  const del = document.createElement("button");
  del.type = "button";
  del.className = "voice-tab-btn voice-tab-btn--x";
  del.textContent = "X";
  del.title = "Delete cached clip";
  /* Allow explicit override (bundled rows hard-disable X). */
  del.disabled = deleteDisabled !== null ? !!deleteDisabled : !exists;
  del.onclick = (e) => { e.preventDefault(); onDelete?.(); };

  const labelWrap = document.createElement("span");
  labelWrap.className = "voice-tab-row__text";
  const mainText = document.createElement("span");
  mainText.className = "voice-tab-row__text-main";
  mainText.textContent = text;
  labelWrap.appendChild(mainText);
  if (playsAt) {
    const pill = document.createElement("span");
    pill.className = "voice-tab-row__plays-at";
    pill.textContent = playsAt;
    labelWrap.appendChild(pill);
  }

  row.appendChild(vol);
  row.appendChild(del);
  row.appendChild(labelWrap);
  return row;
}

/* Tracks which sections the user has opened so re-renders (after generate/delete)
   don't snap them back to closed. Default is closed. */
const openSections = new Set();

function buildSection(title, rows) {
  const wrap = document.createElement("details");
  wrap.className = "voice-tab-section";
  if (openSections.has(title)) wrap.open = true;
  wrap.addEventListener("toggle", () => {
    if (wrap.open) openSections.add(title); else openSections.delete(title);
  });
  const summary = document.createElement("summary");
  summary.className = "voice-tab-section__title";
  summary.textContent = title;
  wrap.appendChild(summary);
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "voice-tab-section__empty";
    empty.textContent = "— none";
    wrap.appendChild(empty);
  } else {
    rows.forEach((r) => wrap.appendChild(r));
  }
  return wrap;
}

/* ── Main render ─────────────────────────────────────────────── */

let renderToken = 0;

export async function renderVoiceTab() {
  const panel = appState.els?.panelVoice;
  if (!panel) return;
  const root = panel.querySelector(".voice-tab-root");
  if (!root) return;

  /* Simple re-entrancy guard: while statuses load async, skip stale runs. */
  renderToken += 1;
  const myToken = renderToken;

  root.innerHTML = "";
  /* Language toggle is added first so it's immediately interactive during loading. */
  root.appendChild(buildLanguageToggle());
  const loading = document.createElement("div");
  loading.className = "voice-tab-loading";
  loading.textContent = getCurrentLanguage() === "spanish"
    ? "Cargando estado de voz…"
    : "Loading voice status…";
  root.appendChild(loading);

  /* Collect all "jobs" needed for the current view. */
  const quizType = getCurrentQuizType();
  const specificTitle = getSpecificTitle();
  const players = uniquePlayerNames();

  const statusPromises = {
    quizTitle: quizType ? fetchQuizTitleStatus(quizType, specificTitle) : Promise.resolve(false),
    fakeStats: quizType === "player-by-fake-info" ? fetchFakeStatsStatus() : Promise.resolve({}),
    endingThink: fetchEndingStatus("think-you-know"),
    endingHowMany: fetchEndingStatus("how-many"),
    playerNames: Promise.all(players.map((n) => fetchPlayerStatus(n).then(({ exists, src }) => ({ name: n, exists, src })))),
  };

  const [quizTitleStatus, fakeStats, endingThinkStatus, endingHowManyStatus, playerStatuses] = await Promise.all([
    statusPromises.quizTitle,
    statusPromises.fakeStats,
    statusPromises.endingThink,
    statusPromises.endingHowMany,
    statusPromises.playerNames,
  ]);

  if (myToken !== renderToken) return;  /* another render superseded us */

  const lang = getCurrentLanguage();
  const titles = SECTION_TITLES;
  const endingTextMap = ENDING_PROMPTS[lang] || ENDING_PROMPTS.english;
  const fakeStatTextMap = FAKE_STAT_PROMPTS[lang] || FAKE_STAT_PROMPTS.english;

  root.innerHTML = "";
  root.appendChild(buildLanguageToggle());

  /* Compute player → levels map so each Players row can show "Level 3, 7". */
  const playerLevelMap = (() => {
    const map = new Map();
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    levels.forEach((lvl, idx) => {
      const name = String(lvl?.careerPlayer?.name || "").trim();
      if (!name) return;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(idx);
    });
    return map;
  })();

  /* Section 1 — Quiz Intro. */
  const quizRows = [];
  if (quizType) {
    const text = quizTitleSynthText(quizType, specificTitle);
    quizRows.push(buildRow({
      text, exists: quizTitleStatus.exists, playsAt: plays("quizIntro"),
      onPlay: () => onVolPressed({
        rowKey: `quiz:${quizType}:${specificTitle}:${lang}`,
        cachedExists: quizTitleStatus.exists,
        cachedSrc: quizTitleStatus.src,
        generateEndpoint: "__quiz-title-voice/generate",
        generateBody: { quizType, specificTitle },
      }),
      onDelete: () => onDeletePressed({
        rowKey: `quiz:${quizType}:${specificTitle}:${lang}`,
        deleteEndpoint: "__quiz-title-voice/delete",
        deleteBody: { quizType, specificTitle },
      }),
    }));
  }
  root.appendChild(buildSection(titles.quizIntro, quizRows));

  /* Section 2 — Players. */
  const playerRows = playerStatuses.map(({ name, exists, src }) => {
    const indices = playerLevelMap.get(name) || [];
    const playsAt = indices.length ? levelLabel(indices) : plays("player");
    return buildRow({
      text: name, exists, playsAt,
      onPlay: () => onVolPressed({
        rowKey: `player:${name}:${lang}`,
        cachedExists: exists,
        cachedSrc: src,
        generateEndpoint: "__player-voice/generate",
        generateBody: { name },
      }),
      onDelete: () => onDeletePressed({
        rowKey: `player:${name}:${lang}`,
        deleteEndpoint: "__player-voice/delete",
        deleteBody: { name },
      }),
    });
  });
  root.appendChild(buildSection(titles.players, playerRows));

  /* Section 3 — Endings. */
  const endingRows = [
    { type: "think-you-know", status: endingThinkStatus },
    { type: "how-many",       status: endingHowManyStatus },
  ].map(({ type, status }) => buildRow({
    text: endingTextMap[type], exists: status.exists, playsAt: plays("ending"),
    onPlay: () => onVolPressed({
      rowKey: `ending:${type}:${lang}`,
      cachedExists: status.exists,
      cachedSrc: status.src,
      generateEndpoint: "__ending-voice/generate",
      generateBody: { endingType: type },
    }),
    onDelete: () => onDeletePressed({
      rowKey: `ending:${type}:${lang}`,
      deleteEndpoint: "__ending-voice/delete",
      deleteBody: { endingType: type },
    }),
  }));
  root.appendChild(buildSection(titles.endings, endingRows));

  /* Section 4 — Quiz Sounds (Fake Stats, only when fake-info quiz is selected). */
  if (quizType === "player-by-fake-info") {
    const rows = Object.keys(fakeStatTextMap).map((stat) => {
      const exists = !!fakeStats?.[stat]?.exists;
      const src = fakeStats?.[stat]?.src || "";
      return buildRow({
        text: fakeStatTextMap[stat], exists, playsAt: plays("fakeStat"),
        onPlay: () => onVolPressed({
          rowKey: `fake:${stat}:${lang}`,
          cachedExists: exists,
          cachedSrc: src,
          generateEndpoint: "__fake-stats-voice/generate",
          generateBody: { stat },
        }),
        onDelete: () => onDeletePressed({
          rowKey: `fake:${stat}:${lang}`,
          deleteEndpoint: "__fake-stats-voice/delete",
          deleteBody: { stat },
        }),
      });
    });
    root.appendChild(buildSection(titles.quizSounds, rows));
  }

  /* Section 5 — Bundled (Welcome + Level progress voices).
     Both languages are generated on-demand via ElevenLabs through the `__bundled-voice`
     endpoint family and stored under `<dir>/<lang>/<filename>`. Vol generates+plays if
     the clip is missing; X deletes the cached clip for the current language. */
  const bundledStatuses = await Promise.all(
    BUNDLED_VOICES.map((b) => fetchBundledStatus(b.key).then((s) => ({ ...s, key: b.key })))
  );
  if (myToken !== renderToken) return;
  const bundledTitle = "Bundled";
  const bundledRows = BUNDLED_VOICES.map((b, i) => {
    const status = bundledStatuses[i] || { exists: false, src: "" };
    return buildRow({
      text: bundledText(b),
      exists: status.exists,
      playsAt: bundledPlaysAt(b),
      deleteDisabled: !status.exists,
      onPlay: () => onVolPressed({
        rowKey: `bundled:${b.key}:${lang}`,
        cachedExists: status.exists,
        cachedSrc: status.src,
        generateEndpoint: "__bundled-voice/generate",
        generateBody: { key: b.key },
      }),
      onDelete: () => onDeletePressed({
        rowKey: `bundled:${b.key}:${lang}`,
        deleteEndpoint: "__bundled-voice/delete",
        deleteBody: { key: b.key },
      }),
    });
  });
  root.appendChild(buildSection(bundledTitle, bundledRows));
}

/* ── Language toggle (English / Español) at the top of the tab. ─────────────── */

function buildLanguageToggle() {
  const wrap = document.createElement("div");
  wrap.className = "voice-tab-language";
  const label = document.createElement("span");
  label.className = "voice-tab-language__label";
  label.textContent = getCurrentLanguage() === "spanish" ? "Idioma" : "Language";
  wrap.appendChild(label);

  const group = document.createElement("div");
  group.className = "voice-tab-language__group";
  const current = getCurrentLanguage();
  SUPPORTED_LANGUAGES.forEach((langKey) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `voice-tab-language__btn${langKey === current ? " is-active" : ""}`;
    btn.textContent = LANGUAGE_LABELS[langKey];
    btn.onclick = (e) => {
      e.preventDefault();
      if (langKey === getCurrentLanguage()) return;
      /* Any voice currently playing is in the OLD language — stop it. */
      stopPreviewAudio();
      setCurrentLanguage(langKey);
      renderVoiceTab();
    };
    group.appendChild(btn);
  });
  wrap.appendChild(group);
  return wrap;
}
