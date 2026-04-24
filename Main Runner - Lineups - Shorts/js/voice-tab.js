/* Voice tab — Lineups Shorts. Uses team voice instead of player voice. */

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";

const FIXED_VOICE = "en-US-AndrewNeural";
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
const SUPPORTED_LANGUAGES = ["english", "spanish"];
const LANGUAGE_LABELS = { english: "English", spanish: "Español" };

export function getCurrentLanguage() { try { const s = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase(); return SUPPORTED_LANGUAGES.includes(s) ? s : "english"; } catch { return "english"; } }
function setCurrentLanguage(lang) { const n = SUPPORTED_LANGUAGES.includes(lang) ? lang : "english"; try { localStorage.setItem(LANGUAGE_STORAGE_KEY, n); } catch {} }

const QUIZ_TYPE_PROMPTS = {
  english: {
    "nat-by-club": "GUESS THE FOOTBALL NATIONAL TEAM NAME BY PLAYERS' CLUB",
    "club-by-nat": "GUESS THE FOOTBALL TEAM NAME BY PLAYERS' NATIONALITY",
  },
  spanish: {
    "nat-by-club": "ADIVINA EL EQUIPO NACIONAL POR EL CLUB DE LOS JUGADORES",
    "club-by-nat": "ADIVINA EL EQUIPO POR LA NACIONALIDAD DE LOS JUGADORES",
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
const SECTION_TITLES = { quizIntro: "Quiz Intro", teams: "Teams", endings: "Endings" };

const BUNDLED_VOICES = [
  { key: "welcome",  text: { english: "Welcome to the football lab, let's start!!!",     spanish: "¡Bienvenidos al laboratorio de fútbol, empecemos!" },
    src: "../.Storage/Voices/Welcome/Welcome to the football lab, lets start!!!.mp3",    playsAt: { english: "Landing",                       spanish: "Página inicial" } },
  { key: "warm-up",  text: { english: "Warm up round — don't mess this one!",            spanish: "Ronda de calentamiento — ¡no la arruines!" },
    src: "../.Storage/Voices/Levels/Worm up round dont mess this one .mp3",              playsAt: { english: "Level 1 (Regular only)",        spanish: "Nivel 1 (solo Regular)" } },
  { key: "serious",  text: { english: "OK now it's getting serious.",                    spanish: "Bien, ahora se pone serio." },
    src: "../.Storage/Voices/Levels/OK now it's getting serious.mp3",                    playsAt: { english: "~30% progress (Regular only)",  spanish: "~30% de avance (solo Regular)" } },
  { key: "nerds",    text: { english: "Only true football nerds know this!!!",           spanish: "¡¡Solo los verdaderos fanáticos del fútbol saben esto!!" },
    src: "../.Storage/Voices/Levels/Only true football nerd know this!!!.mp3",           playsAt: { english: "~60% progress (Regular only)",  spanish: "~60% de avance (solo Regular)" } },
  { key: "genius",   text: { english: "If you get this you are basically a genius!!!",   spanish: "¡¡Si aciertas esto eres básicamente un genio!!" },
    src: "../.Storage/Voices/Levels/If you get this you are basically a genius!!!.mp3",  playsAt: { english: "~90% progress (Regular only)",  spanish: "~90% de avance (solo Regular)" } },
];
const PLAYS_AT = {
  quizIntro: { english: "Landing → Level 1",                spanish: "Inicial → Nivel 1" },
  team:      { english: "Level where team is revealed",     spanish: "Nivel donde se revela el equipo" },
  ending:    { english: "Last page (outro)",                spanish: "Última página (outro)" },
};
function plays(key) { const p = PLAYS_AT[key]; const lang = getCurrentLanguage(); return (p && (p[lang] || p.english)) || ""; }
function bundledText(b)    { return b.text[getCurrentLanguage()]    || b.text.english; }
function bundledPlaysAt(b) { return b.playsAt[getCurrentLanguage()] || b.playsAt.english; }
function levelLabel(idx)   { return getCurrentLanguage() === "spanish" ? `Nivel ${idx.join(", ")}` : `Level ${idx.join(", ")}`; }

const busyByKey = new Set();
let audioEl = null;
function endpointUrl(p) { return projectAssetUrl(p); }
function stopPreviewAudio() { if (!audioEl) return; audioEl.pause(); audioEl.currentTime = 0; audioEl = null; }
function playClip(src) { const s = String(src || "").trim(); if (!s) return; stopPreviewAudio(); const a = new Audio(s); audioEl = a; a.addEventListener("ended", () => { if (audioEl === a) audioEl = null; }, { once: true }); a.play().catch(() => {}); }
function playFromStart(src) { const s = String(src || "").trim(); if (!s) return; playClip(s); }

/* Collect unique team names currently assigned to levels. Lineups levels hold a team
   as `levelData.team?.name` or similar — fall back to any string that looks like a team. */
function uniqueTeamNames() {
  const seen = new Set();
  const out = [];
  const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  for (const lvl of levels) {
    const candidates = [
      lvl?.team?.name,
      lvl?.currentSquadName,
      lvl?.teamName,
      lvl?.nationalTeamName,
      lvl?.clubName,
    ];
    for (const c of candidates) {
      const name = String(c || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

function getCurrentQuizType() { const raw = String(appState.els?.inQuizType?.value || "").trim(); const m = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english; return raw in m ? raw : ""; }
function getSpecificTitle() { const { els } = appState; if (!els?.inSpecificTitleToggle?.checked) return ""; return String(els?.inSpecificTitleText?.value || "").trim(); }
function quizTitleSynthText(qt, st) { const m = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english; const b = m[qt] || ""; const e = String(st || "").trim(); return e ? `${b} ${e}` : b; }

async function fetchQuizTitleStatus(qt, st) { try { const p = new URLSearchParams({ quizType: qt, specificTitle: st || "", language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__quiz-title-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchEndingStatus(et) { try { const p = new URLSearchParams({ endingType: et, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__ending-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchTeamStatus(name, quizType) { try { const p = new URLSearchParams({ name, quizType, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__team-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchBundledStatus(key) { try { const p = new URLSearchParams({ key, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__bundled-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }

async function onVolPressed({ rowKey, cachedExists, cachedSrc, generateEndpoint, generateBody }) {
  if (cachedExists && cachedSrc) { playFromStart(cachedSrc); return; }
  if (busyByKey.has(rowKey)) return;
  busyByKey.add(rowKey);
  try {
    const res = await fetch(endpointUrl(generateEndpoint), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...generateBody, voice: FIXED_VOICE, language: getCurrentLanguage() }) });
    const p = await res.json().catch(() => ({}));
    if (!res.ok || !p?.ok) throw new Error(p?.error || `Generation failed (${res.status})`);
    const gs = (p.generated && Object.values(p.generated)[0]?.src) || p.src || "";
    playFromStart(gs);
  } catch (err) { alert(`Could not generate voice.\n${err instanceof Error ? err.message : String(err)}`); }
  finally { busyByKey.delete(rowKey); renderVoiceTab(); }
}
async function onDeletePressed({ rowKey, deleteEndpoint, deleteBody }) {
  stopPreviewAudio();
  if (busyByKey.has(rowKey)) return;
  busyByKey.add(rowKey);
  try {
    const res = await fetch(endpointUrl(deleteEndpoint), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...deleteBody, language: getCurrentLanguage() }) });
    const p = await res.json().catch(() => ({}));
    if (!res.ok || !p?.ok) throw new Error(p?.error || `Delete failed (${res.status})`);
  } catch (err) { alert(`Could not delete voice.\n${err instanceof Error ? err.message : String(err)}`); }
  finally { busyByKey.delete(rowKey); renderVoiceTab(); }
}

function buildRow({ text, exists, onPlay, onDelete, playsAt = "", deleteDisabled = null }) {
  const row = document.createElement("div"); row.className = `voice-tab-row ${exists ? "is-present" : "is-missing"}`;
  const vol = document.createElement("button"); vol.type = "button"; vol.className = "voice-tab-btn voice-tab-btn--vol"; vol.textContent = "Vol"; vol.title = exists ? "Play" : "Generate and play"; vol.onclick = (e) => { e.preventDefault(); onPlay(); };
  const del = document.createElement("button"); del.type = "button"; del.className = "voice-tab-btn voice-tab-btn--x"; del.textContent = "X"; del.title = "Delete cached clip"; del.disabled = deleteDisabled !== null ? !!deleteDisabled : !exists; del.onclick = (e) => { e.preventDefault(); onDelete?.(); };
  const wrap = document.createElement("span"); wrap.className = "voice-tab-row__text";
  const main = document.createElement("span"); main.className = "voice-tab-row__text-main"; main.textContent = text; wrap.appendChild(main);
  if (playsAt) { const p = document.createElement("span"); p.className = "voice-tab-row__plays-at"; p.textContent = playsAt; wrap.appendChild(p); }
  row.appendChild(vol); row.appendChild(del); row.appendChild(wrap); return row;
}
/* Tracks which sections the user has opened so re-renders (after generate/delete)
   don't snap them back to closed. Default is closed. */
const openSections = new Set();

function buildSection(title, rows) {
  const w = document.createElement("details"); w.className = "voice-tab-section";
  if (openSections.has(title)) w.open = true;
  w.addEventListener("toggle", () => { if (w.open) openSections.add(title); else openSections.delete(title); });
  const s = document.createElement("summary"); s.className = "voice-tab-section__title"; s.textContent = title; w.appendChild(s);
  if (rows.length === 0) { const e = document.createElement("div"); e.className = "voice-tab-section__empty"; e.textContent = "— none"; w.appendChild(e); } else rows.forEach((r) => w.appendChild(r));
  return w;
}

let renderToken = 0;
export async function renderVoiceTab() {
  const panel = appState.els?.panelVoice;
  if (!panel) return;
  const root = panel.querySelector(".voice-tab-root");
  if (!root) return;
  renderToken += 1;
  const myToken = renderToken;

  root.innerHTML = "";
  root.appendChild(buildLanguageToggle());
  const loading = document.createElement("div"); loading.className = "voice-tab-loading";
  loading.textContent = getCurrentLanguage() === "spanish" ? "Cargando estado de voz…" : "Loading voice status…";
  root.appendChild(loading);

  const quizType = getCurrentQuizType();
  const specificTitle = getSpecificTitle();
  const teams = uniqueTeamNames();

  const [quizTitleStatus, endingThink, endingHow, teamStatuses] = await Promise.all([
    quizType ? fetchQuizTitleStatus(quizType, specificTitle) : Promise.resolve({ exists: false, src: "" }),
    fetchEndingStatus("think-you-know"),
    fetchEndingStatus("how-many"),
    Promise.all(teams.map((n) => fetchTeamStatus(n, quizType || "club-by-nat").then(({ exists, src }) => ({ name: n, exists, src })))),
  ]);
  if (myToken !== renderToken) return;

  const lang = getCurrentLanguage();
  const endingTextMap = ENDING_PROMPTS[lang] || ENDING_PROMPTS.english;

  root.innerHTML = "";
  root.appendChild(buildLanguageToggle());

  /* Compute team → levels map so each Teams row can show "Level 3, 7". */
  const teamLevelMap = (() => {
    const map = new Map();
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    levels.forEach((lvl, idx) => {
      const candidates = [lvl?.team?.name, lvl?.currentSquadName, lvl?.teamName, lvl?.nationalTeamName, lvl?.clubName];
      for (const c of candidates) {
        const n = String(c || "").trim();
        if (!n) continue;
        if (!map.has(n)) map.set(n, []);
        if (!map.get(n).includes(idx)) map.get(n).push(idx);
      }
    });
    return map;
  })();

  const quizRows = [];
  if (quizType) {
    quizRows.push(buildRow({
      text: quizTitleSynthText(quizType, specificTitle),
      exists: quizTitleStatus.exists,
      playsAt: plays("quizIntro"),
      onPlay: () => onVolPressed({ rowKey: `quiz:${quizType}:${specificTitle}:${lang}`, cachedExists: quizTitleStatus.exists, cachedSrc: quizTitleStatus.src, generateEndpoint: "__quiz-title-voice/generate", generateBody: { quizType, specificTitle } }),
      onDelete: () => onDeletePressed({ rowKey: `quiz:${quizType}:${specificTitle}:${lang}`, deleteEndpoint: "__quiz-title-voice/delete", deleteBody: { quizType, specificTitle } }),
    }));
  }
  root.appendChild(buildSection(SECTION_TITLES.quizIntro, quizRows));

  const teamRows = teamStatuses.map(({ name, exists, src }) => {
    const indices = teamLevelMap.get(name) || [];
    const playsAt = indices.length ? levelLabel(indices) : plays("team");
    return buildRow({
      text: name, exists, playsAt,
      onPlay: () => onVolPressed({ rowKey: `team:${name}:${lang}`, cachedExists: exists, cachedSrc: src, generateEndpoint: "__team-voice/generate", generateBody: { name, quizType: quizType || "club-by-nat" } }),
      onDelete: () => onDeletePressed({ rowKey: `team:${name}:${lang}`, deleteEndpoint: "__team-voice/delete", deleteBody: { name, quizType: quizType || "club-by-nat" } }),
    });
  });
  root.appendChild(buildSection(SECTION_TITLES.teams, teamRows));

  const endingRows = [
    { type: "think-you-know", status: endingThink },
    { type: "how-many",       status: endingHow },
  ].map(({ type, status }) => buildRow({
    text: endingTextMap[type], exists: status.exists, playsAt: plays("ending"),
    onPlay: () => onVolPressed({ rowKey: `ending:${type}:${lang}`, cachedExists: status.exists, cachedSrc: status.src, generateEndpoint: "__ending-voice/generate", generateBody: { endingType: type } }),
    onDelete: () => onDeletePressed({ rowKey: `ending:${type}:${lang}`, deleteEndpoint: "__ending-voice/delete", deleteBody: { endingType: type } }),
  }));
  root.appendChild(buildSection(SECTION_TITLES.endings, endingRows));

  const bundledStatuses = await Promise.all(BUNDLED_VOICES.map((b) => fetchBundledStatus(b.key)));
  if (myToken !== renderToken) return;
  const bundledTitle = "Bundled";
  const bundledRows = BUNDLED_VOICES.map((b, i) => {
    const status = bundledStatuses[i] || { exists: false, src: "" };
    return buildRow({
      text: bundledText(b), exists: status.exists, playsAt: bundledPlaysAt(b),
      deleteDisabled: !status.exists,
      onPlay: () => onVolPressed({
        rowKey: `bundled:${b.key}:${lang}`,
        cachedExists: status.exists, cachedSrc: status.src,
        generateEndpoint: "__bundled-voice/generate", generateBody: { key: b.key },
      }),
      onDelete: () => onDeletePressed({
        rowKey: `bundled:${b.key}:${lang}`,
        deleteEndpoint: "__bundled-voice/delete", deleteBody: { key: b.key },
      }),
    });
  });
  root.appendChild(buildSection(bundledTitle, bundledRows));
}

function buildLanguageToggle() {
  const w = document.createElement("div"); w.className = "voice-tab-language";
  const l = document.createElement("span"); l.className = "voice-tab-language__label";
  l.textContent = getCurrentLanguage() === "spanish" ? "Idioma" : "Language"; w.appendChild(l);
  const g = document.createElement("div"); g.className = "voice-tab-language__group";
  const cur = getCurrentLanguage();
  SUPPORTED_LANGUAGES.forEach((k) => {
    const b = document.createElement("button"); b.type = "button";
    b.className = `voice-tab-language__btn${k === cur ? " is-active" : ""}`;
    b.textContent = LANGUAGE_LABELS[k];
    b.onclick = (e) => { e.preventDefault(); if (k === getCurrentLanguage()) return; stopPreviewAudio(); setCurrentLanguage(k); renderVoiceTab(); };
    g.appendChild(b);
  });
  w.appendChild(g); return w;
}
