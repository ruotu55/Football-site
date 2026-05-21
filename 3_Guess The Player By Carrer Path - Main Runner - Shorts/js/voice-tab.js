/* Voice tab — centralised status + generate/delete UI for every TTS clip this runner
 * produces. Opens via the "Voice" panel tab (between Setup and Saved).
 *
 * Rows are grouped into sections (displayed in this order):
 *   1. Quiz Intro   — the current quiz-type intro (+ optional specific title suffix) [per-runner]
 *   2. Players      — one row per unique player currently assigned to any level [shared]
 *   3. Endings      — "think you know" / "how many" outro clips [shared, per language]
 *
 * Each row shows: [Vol] [X] "<full text that will be synthesised>"
 *   • Vol low-opacity when the clip file is missing on disk; full-opacity when it exists.
 *   • X disabled when the clip is missing.
 */

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

const FIXED_VOICE = "en-US-AndrewNeural";

/* ── Language state ───────────────────────────────────────────── */
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];
const LANGUAGE_LABELS = { english: "English", spanish: "Español" };


export function getCurrentLanguage() {
  try {
    const stored = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase();
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : "english";
  } catch { return "english"; }
}

export function setCurrentLanguage(lang) {
  const next = SUPPORTED_LANGUAGES.includes(lang) ? lang : "english";
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* ignore */ }
  document.dispatchEvent(new CustomEvent('voice-language-change'));
}

/* ── Prompts per language — in lock-step with run_site.py for this runner. */
const QUIZ_TYPE_PROMPTS = {
  english: {
    "player-by-career":         "GUESS THE PLAYER BY CAREER PATH",
    "player-by-career-stats":   "GUESS THE PLAYER BY CAREER PATH",
  },
  spanish: {
    "player-by-career":         "ADIVINA AL JUGADOR POR TRAYECTORIA",
    "player-by-career-stats":   "ADIVINA AL JUGADOR POR TRAYECTORIA",
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

const SECTION_TITLES = {
  quizIntro: "Quiz Intro",
  players: "Players",
  endings: "Endings",
};

const PLAYS_AT = {
  quizIntro: { english: "Landing → Level 1",                spanish: "Inicial → Nivel 1" },
  player:    { english: "Question levels (where assigned)", spanish: "Niveles de pregunta (donde esté asignado)" },
  ending:    { english: "Last page (outro)",                spanish: "Última página (outro)" },
};
function plays(key) { const p = PLAYS_AT[key]; const lang = getCurrentLanguage(); return (p && (p[lang] || p.english)) || ""; }
function levelLabel(idx)   { return getCurrentLanguage() === "spanish" ? `Nivel ${idx.join(", ")}` : `Level ${idx.join(", ")}`; }

const busyByKey = new Set();
let audioEl = null;

function endpointUrl(relPath) { return projectAssetUrl(relPath); }

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

function getSpecificTitle() { return ""; }

function quizTitleSynthText(quizType, specificTitle) {
  const langMap = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english;
  const base = langMap[quizType] || "";
  const extra = String(specificTitle || "").trim();
  return extra ? `${base} ${extra}` : base;
}

async function fetchQuizTitleStatus(quizType, specificTitle) {
  try {
    const params = new URLSearchParams({ quizType, specificTitle: specificTitle || "", language: getCurrentLanguage() });
    const res = await fetch(`${endpointUrl("__quiz-title-voice/status")}?${params}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { exists: !!body?.exists, src: String(body?.src || "") };
  } catch { return { exists: false, src: "" }; }
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

function playFromStart(src) {
  const clipSrc = String(src || "").trim();
  if (!clipSrc) return;
  playClip(clipSrc);
}

async function onVolPressed({ rowKey, cachedExists, cachedSrc, generateEndpoint, generateBody }) {
  if (cachedExists && cachedSrc) { playFromStart(cachedSrc); return; }
  if (busyByKey.has(rowKey)) return;
  busyByKey.add(rowKey);
  try {
    const res = await fetch(endpointUrl(generateEndpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...generateBody, voice: FIXED_VOICE, language: getCurrentLanguage() }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) throw new Error(payload?.error || `Generation failed (${res.status})`);
    const generatedSrc = (payload.generated && Object.values(payload.generated)[0]?.src) || payload.src || "";
    playFromStart(generatedSrc);
  } catch (err) {
    alert(`Could not generate voice.\n${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busyByKey.delete(rowKey);
    renderVoiceTab();
  }
}

async function onDeletePressed({ rowKey, deleteEndpoint, deleteBody }) {
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
    if (!res.ok || !payload?.ok) throw new Error(payload?.error || `Delete failed (${res.status})`);
  } catch (err) {
    alert(`Could not delete voice.\n${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busyByKey.delete(rowKey);
    renderVoiceTab();
  }
}

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
  del.disabled = deleteDisabled !== null ? !!deleteDisabled : !exists;
  del.onclick = (e) => { e.preventDefault(); onDelete?.(); };
  const wrap = document.createElement("span");
  wrap.className = "voice-tab-row__text";
  const main = document.createElement("span");
  main.className = "voice-tab-row__text-main";
  main.textContent = text;
  wrap.appendChild(main);
  if (playsAt) {
    const p = document.createElement("span");
    p.className = "voice-tab-row__plays-at";
    p.textContent = playsAt;
    wrap.appendChild(p);
  }
  row.appendChild(vol);
  row.appendChild(del);
  row.appendChild(wrap);
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

let renderToken = 0;

export async function renderVoiceTab() {
  const panel = appState.els?.panelVoice;
  if (!panel) return;
  const root = panel.querySelector(".voice-tab-root");
  if (!root) return;

  // Preserve scroll position across re-render so clicking Vol/X on a row near
  // the bottom of the panel doesn't snap the viewport back to the top.
  const __scrollPanel = panel.scrollTop || 0;
  const __scrollRoot = root.scrollTop || 0;
  const __scrollAncestor = (() => {
    let el = panel.parentElement;
    while (el && el !== document.body) {
      const cs = window.getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
        return { el, top: el.scrollTop };
      }
      el = el.parentElement;
    }
    return null;
  })();
  const __restoreScroll = () => {
    try {
      panel.scrollTop = __scrollPanel;
      root.scrollTop = __scrollRoot;
      if (__scrollAncestor) __scrollAncestor.el.scrollTop = __scrollAncestor.top;
    } catch {}
  };
  renderToken += 1;
  const myToken = renderToken;
  // Defer wiping the panel until the new content is ready (built below) so the
  // existing rows stay visible during the brief async status fetch — no flicker.
  const quizType = getCurrentQuizType();
  const specificTitle = getSpecificTitle();
  const players = uniquePlayerNames();

  const [quizTitleStatus, endingThinkStatus, endingHowManyStatus, playerStatuses] = await Promise.all([
    quizType ? fetchQuizTitleStatus(quizType, specificTitle) : Promise.resolve({ exists: false, src: "" }),
    fetchEndingStatus("think-you-know"),
    fetchEndingStatus("how-many"),
    Promise.all(players.map((n) => fetchPlayerStatus(n).then(({ exists, src }) => ({ name: n, exists, src })))),
  ]);

  if (myToken !== renderToken) return;

  const lang = getCurrentLanguage();
  const endingTextMap = ENDING_PROMPTS[lang] || ENDING_PROMPTS.english;

  root.innerHTML = "";
  root.appendChild(buildLanguageToggle());

  const quizRows = [];
  const playerLevelMap = (() => {
    const map = new Map();
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    levels.forEach((lvl, idx) => {
      const n = String(lvl?.careerPlayer?.name || "").trim();
      if (!n) return;
      if (!map.has(n)) map.set(n, []);
      map.get(n).push(idx);
    });
    return map;
  })();

  if (quizType) {
    const text = quizTitleSynthText(quizType, specificTitle);
    quizRows.push(buildRow({
      text,
      exists: quizTitleStatus.exists,
      playsAt: plays("quizIntro"),
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
  root.appendChild(buildSection(SECTION_TITLES.quizIntro, quizRows));

  const playerRows = playerStatuses.map(({ name, exists, src }) => {
    const indices = playerLevelMap.get(name) || [];
    const playsAt = indices.length ? levelLabel(indices) : plays("player");
    return buildRow({
      text: name,
      exists, playsAt,
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
  root.appendChild(buildSection(SECTION_TITLES.players, playerRows));

  /* Only show the ending row matching the Ending type select on the Quiz (Landing) tab.
     If no valid ending is selected yet, show both so the user can still generate either. */
  const selectedEnding = String(appState.els?.inEndingType?.value || "").trim();
  const endingRows = [
    { type: "think-you-know", status: endingThinkStatus },
    { type: "how-many",       status: endingHowManyStatus },
  ]
    .filter(({ type }) => !selectedEnding || selectedEnding === "random" || type === selectedEnding)
    .map(({ type, status }) => buildRow({
      text: endingTextMap[type],
      exists: status.exists,
      playsAt: plays("ending"),
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
  root.appendChild(buildSection(SECTION_TITLES.endings, endingRows));

  __restoreScroll();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(__restoreScroll);
}

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
      stopPreviewAudio();
      setCurrentLanguage(langKey);
      renderVoiceTab();
    };
    group.appendChild(btn);
  });
  wrap.appendChild(group);
  return wrap;
}
