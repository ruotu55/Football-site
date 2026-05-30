/* Voice tab — Player Stats Shorts. */
import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { renderPlayerPhrase, getOrAssignRevealPhrase } from "./audio.js";

const FIXED_VOICE = "en-US-AndrewNeural";
const LANGUAGE_STORAGE_KEY = "voice-tab.language";
// Always open a freshly-loaded runner in English. Resets ONLY the persisted
// choice on each page load; runtime switches (Spanish recording phase, the
// Language toggle, headless render) still work via setCurrentLanguage().
try { localStorage.setItem(LANGUAGE_STORAGE_KEY, "english"); } catch {}
const SUPPORTED_LANGUAGES = ["english", "spanish"];
const LANGUAGE_LABELS = { english: "English", spanish: "Español" };


export function getCurrentLanguage() { try { const s = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").toLowerCase(); return SUPPORTED_LANGUAGES.includes(s) ? s : "english"; } catch { return "english"; } }
export function setCurrentLanguage(lang) { const n = SUPPORTED_LANGUAGES.includes(lang) ? lang : "english"; try { localStorage.setItem(LANGUAGE_STORAGE_KEY, n); } catch {} document.dispatchEvent(new CustomEvent('voice-language-change')); }

const QUIZ_TYPE_PROMPTS = {
  english: {
    "player-by-career-stats":   "GUESS THE PLAYER BY CAREER STATS",
    "player-by-career":         "GUESS THE FOOTBALL PLAYER BY CAREER PATH",
  },
  spanish: {
    "player-by-career-stats":   "ADIVINA AL JUGADOR POR ESTADÍSTICAS DE CARRERA",
    "player-by-career":         "ADIVINA AL JUGADOR POR TRAYECTORIA",
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
const SECTION_TITLES = { quizIntro: "Quiz Intro", players: "Players", endings: "Endings" };

const BUNDLED_VOICES = [
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
  player:    { english: "Question levels (where assigned)", spanish: "Niveles de pregunta (donde esté asignado)" },
  ending:    { english: "Last page (outro)",                spanish: "Última página (outro)" },
};
function plays(key) { const p = PLAYS_AT[key]; return (p && p.english) || ""; }
function bundledText(b)    { return b.text[getCurrentLanguage()]    || b.text.english; }
function bundledPlaysAt(b) { return b.playsAt[getCurrentLanguage()] || b.playsAt.english; }
function levelLabel(idx)   { return `Level ${idx.join(", ")}`; }

const busyByKey = new Set();
let audioEl = null;
let bulkDownloadActive = false;
function endpointUrl(p) { return projectAssetUrl(p); }
function stopPreviewAudio() { if (!audioEl) return; audioEl.pause(); audioEl.currentTime = 0; audioEl = null; }
function playClip(src) { const s = String(src || "").trim(); if (!s) return; stopPreviewAudio(); const a = new Audio(s); audioEl = a; a.addEventListener("ended", () => { if (audioEl === a) audioEl = null; }, { once: true }); a.play().catch(() => {}); }
function uniquePlayerNames() { const seen = new Set(); const out = []; const levels = Array.isArray(appState.levelsData) ? appState.levelsData : []; for (const lvl of levels) { const n = String(lvl?.careerPlayer?.name || "").trim(); if (!n || seen.has(n)) continue; seen.add(n); out.push(n); } return out; }
function getCurrentQuizType() { const raw = String(appState.els?.inQuizType?.value || "").trim(); const m = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english; return raw in m ? raw : ""; }
function getSpecificTitle() { return ""; }
function quizTitleSynthText(qt, st) { const m = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english; const b = m[qt] || ""; const e = String(st || "").trim(); return e ? `${b} ${e}` : b; }

async function fetchQuizTitleStatus(qt, st) { try { const p = new URLSearchParams({ quizType: qt, specificTitle: st || "", language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__quiz-title-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchEndingStatus(et) { try { const p = new URLSearchParams({ endingType: et, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__ending-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchPlayerStatus(name, phrase = "plain") { try { const p = new URLSearchParams({ name, phrase, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__player-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchBundledStatus(key) { try { const p = new URLSearchParams({ key, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__bundled-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
function playFromStart(src) { if (bulkDownloadActive) return; const s = String(src || "").trim(); if (!s) return; playClip(s); }

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
  } catch (err) { if (!bulkDownloadActive) alert(`Could not generate voice.\n${err instanceof Error ? err.message : String(err)}`); }
  finally { busyByKey.delete(rowKey); if (!bulkDownloadActive) renderVoiceTab(); }
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
  finally { busyByKey.delete(rowKey); if (!bulkDownloadActive) renderVoiceTab(); }
}


const BULK_PLAYERS_KEY = "bulk-players";

function bulkPlayersButtonLabel(done, total) {
  const lang = getCurrentLanguage();
  if (total > 0 && done < total) {
    return `Creating voice… ${done}/${total}`;
  }
  return "Create voice for all players";
}

async function onCreateAllPlayerVoices(playerItems, buttonEl) {
  const lang = getCurrentLanguage();
  const bulkKey = `${BULK_PLAYERS_KEY}:${lang}`;
  if (busyByKey.has(bulkKey)) return;

  const missing = playerItems.filter((t) => !t.exists);
  if (missing.length === 0) {
    alert("All players already have a voice.");
    return;
  }

  stopPreviewAudio();
  busyByKey.add(bulkKey);
  const total = missing.length;
  let done = 0;
  let failed = 0;
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = bulkPlayersButtonLabel(done, total);
  }

  for (const { name, phrase } of missing) {
    try {
      const res = await fetch(endpointUrl("__player-voice/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phrase,
          voice: FIXED_VOICE,
          language: lang,
        }),
      });
      const p = await res.json().catch(() => ({}));
      if (!res.ok || !p?.ok) throw new Error(p?.error || `Generation failed (${res.status})`);
    } catch {
      failed += 1;
    }
    done += 1;
    if (buttonEl) buttonEl.textContent = bulkPlayersButtonLabel(done, total);
  }

  busyByKey.delete(bulkKey);
  if (buttonEl) {
    buttonEl.disabled = false;
    buttonEl.textContent = bulkPlayersButtonLabel(0, 0);
  }
  await renderVoiceTab();
  if (failed > 0) {
    alert(
      `Could not create ${failed} of ${total} player voices.`,
    );
  }
}

function buildRow({ text, exists, onPlay, onDelete, playsAt = "", deleteDisabled = null }) {
  const row = document.createElement("div"); row.className = `voice-tab-row ${exists ? "is-present" : "is-missing"}`;
  const vol = document.createElement("button"); vol.type = "button"; vol.className = "voice-tab-btn voice-tab-btn--vol"; vol.textContent = "Vol"; vol.title = exists ? "Play" : "Generate and play"; vol.onclick = (e) => { e.preventDefault(); onPlay(); };
  vol.__voiceGen = onPlay;
  const del = document.createElement("button"); del.type = "button"; del.className = "voice-tab-btn voice-tab-btn--x"; del.textContent = "X"; del.title = "Delete cached clip"; del.disabled = deleteDisabled !== null ? !!deleteDisabled : !exists; del.onclick = (e) => { e.preventDefault(); onDelete?.(); };
  const wrap = document.createElement("span"); wrap.className = "voice-tab-row__text";
  const main = document.createElement("span"); main.className = "voice-tab-row__text-main"; main.textContent = text; wrap.appendChild(main);
  if (playsAt) { const p = document.createElement("span"); p.className = "voice-tab-row__plays-at"; p.textContent = playsAt; wrap.appendChild(p); }
  row.appendChild(vol); row.appendChild(del); row.appendChild(wrap); return row;
}
/* Tracks which sections the user has opened so re-renders (after generate/delete)
   don't snap them back to closed. Default is closed. */
const openSections = new Set();

function buildSection(title, rows, { prepend } = {}) {
  const w = document.createElement("details"); w.className = "voice-tab-section";
  if (openSections.has(title)) w.open = true;
  w.addEventListener("toggle", () => { if (w.open) openSections.add(title); else openSections.delete(title); });
  const s = document.createElement("summary"); s.className = "voice-tab-section__title"; s.textContent = title; w.appendChild(s);
  if (prepend) w.appendChild(prepend);
  if (rows.length === 0) { const e = document.createElement("div"); e.className = "voice-tab-section__empty"; e.textContent = "— none"; w.appendChild(e); } else rows.forEach((r) => w.appendChild(r));
  return w;
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

  /* Resolve the level + question-index for each unique player so we can ask the audio
     module for the phrase variant that will actually play. Sticky on the level object. */
  const levelsForPhrase = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  const playerFirstLevelIndex = new Map();
  levelsForPhrase.forEach((lvl, idx) => {
    const n = String(lvl?.careerPlayer?.name || "").trim();
    if (!n) return;
    if (!playerFirstLevelIndex.has(n)) playerFirstLevelIndex.set(n, idx);
  });
  const playerPhraseList = players.map((name) => {
    const levelIdx = playerFirstLevelIndex.get(name);
    const lvl = Number.isInteger(levelIdx) ? levelsForPhrase[levelIdx] : null;
    const questionIndex = Number.isInteger(levelIdx) ? levelIdx - 1 : null;
    const phrase = getOrAssignRevealPhrase(lvl, questionIndex);
    return { name, phrase };
  });

  const [quizTitleStatus, endingThink, endingHow, playerStatuses] = await Promise.all([
    quizType ? fetchQuizTitleStatus(quizType, specificTitle) : Promise.resolve({ exists: false, src: "" }),
    fetchEndingStatus("think-you-know"),
    fetchEndingStatus("how-many"),
    Promise.all(playerPhraseList.map(({ name, phrase }) =>
      fetchPlayerStatus(name, phrase).then(({ exists, src }) => ({ name, phrase, exists, src }))
    )),
  ]);
  if (myToken !== renderToken) return;

  const lang = getCurrentLanguage();
  const endingTextMap = ENDING_PROMPTS[lang] || ENDING_PROMPTS.english;

  root.innerHTML = "";
  root.appendChild(buildLanguageToggle());
  root.appendChild(buildDownloadAllButton());

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

  const playerRows = playerStatuses.map(({ name, phrase, exists, src }) => {
    const indices = playerLevelMap.get(name) || [];
    const playsAt = indices.length ? levelLabel(indices) : plays("player");
    const text = renderPlayerPhrase(phrase, name, lang);
    return buildRow({
      text, exists, playsAt,
      onPlay: () => onVolPressed({ rowKey: `player:${name}:${phrase}:${lang}`, cachedExists: exists, cachedSrc: src, generateEndpoint: "__player-voice/generate", generateBody: { name, phrase } }),
      onDelete: () => onDeletePressed({ rowKey: `player:${name}:${phrase}:${lang}`, deleteEndpoint: "__player-voice/delete", deleteBody: { name, phrase } }),
    });
  });
  const bulkCreatePlayersBtn = document.createElement("button");
  bulkCreatePlayersBtn.type = "button";
  bulkCreatePlayersBtn.className = "voice-tab-bulk-btn";
  bulkCreatePlayersBtn.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:0.2rem 0 0.6rem;padding:0.62rem 0.85rem;border:none;border-radius:0.6rem;background:linear-gradient(180deg,#ffd24a,#f4b000);color:#2a1d00;font-family:inherit;font-size:0.8rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.55)";
  bulkCreatePlayersBtn.textContent = bulkPlayersButtonLabel(0, 0);
  bulkCreatePlayersBtn.disabled = playerStatuses.length === 0 || busyByKey.has(`${BULK_PLAYERS_KEY}:${lang}`);
  bulkCreatePlayersBtn.onclick = (e) => {
    e.preventDefault();
    onCreateAllPlayerVoices(playerStatuses, bulkCreatePlayersBtn);
  };
  root.appendChild(buildSection(SECTION_TITLES.players, playerRows));

  /* Only show the ending row matching the Ending type select on the Quiz (Landing) tab.
     If no valid ending is selected yet, show both so the user can still generate either. */
  const selectedEnding = String(appState.els?.inEndingType?.value || "").trim();
  const endingRows = [
    { type: "think-you-know", status: endingThink },
    { type: "how-many",       status: endingHow },
  ]
    .filter(({ type }) => !selectedEnding || selectedEnding === "random" || type === selectedEnding)
    .map(({ type, status }) => buildRow({
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
  __restoreScroll();
  /* requestAnimationFrame helps when layout settles after async appends. */
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(__restoreScroll);
}

/* === "Download all voices" — generate every MISSING voice for BOTH languages,
   across every section the tab renders (quiz intro, teams/players, endings,
   bundled). Generic: it just drives each missing row's generate handler with
   playback + per-click re-render suppressed (bulkDownloadActive). === */
function buildDownloadAllButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "voice-tab-download-all-btn";
  btn.textContent = "Create all voices (EN + ES)";
  btn.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:0.1rem 0 0.7rem;padding:0.62rem 0.85rem;border:none;border-radius:0.6rem;background:linear-gradient(180deg,#5ec1ff,#2f7fd6);color:#06203a;font-family:inherit;font-size:0.82rem;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.45)";
  btn.onclick = (e) => { e.preventDefault(); downloadAllVoices(); };
  return btn;
}

async function downloadAllVoices() {
  if (bulkDownloadActive) return;
  const panel = appState.els && appState.els.panelVoice;
  const root = panel && panel.querySelector(".voice-tab-root");
  if (!root) return;
  const liveBtn = () => root.querySelector(".voice-tab-download-all-btn");
  const orig = getCurrentLanguage();
  const setLabel = (txt) => { const b = liveBtn(); if (b) { b.disabled = true; b.textContent = txt; } };
  bulkDownloadActive = true;
  stopPreviewAudio();
  let total = 0, failed = 0;
  try {
    for (const lang of SUPPORTED_LANGUAGES) {
      setCurrentLanguage(lang);
      const code = lang === "spanish" ? "ES" : "EN";
      // Loop until no missing voices remain for this language. A single pass can
      // miss a few (a status race / the tab re-rendering mid-run), which is why a
      // second click used to be needed — re-check and retry automatically. Stop
      // if a pass makes no progress so it can never loop forever.
      let prevMissing = Infinity;
      for (let pass = 0; pass < 8; pass++) {
        await renderVoiceTab();
        const missing = Array.from(root.querySelectorAll(".voice-tab-row.is-missing .voice-tab-btn--vol"));
        if (missing.length === 0) break;
        if (missing.length >= prevMissing) break;
        prevMissing = missing.length;
        for (let i = 0; i < missing.length; i++) {
          const gen = missing[i].__voiceGen;
          if (typeof gen !== "function") continue;
          setLabel("Generating " + code + " " + (i + 1) + "/" + missing.length + "...");
          try { await gen(); } catch (e) { failed += 1; }
          total += 1;
        }
      }
    }
  } finally {
    bulkDownloadActive = false;
    setCurrentLanguage(orig);
    await renderVoiceTab();
    const b = liveBtn();
    if (b) {
      b.disabled = false;
      b.textContent = total === 0
        ? "All voices already generated"
        : (failed > 0 ? ("Done: " + (total - failed) + "/" + total + " ok") : "Create all voices (EN + ES)");
    }
  }
}

function buildLanguageToggle() {
  const w = document.createElement("div"); w.className = "voice-tab-language";
  const l = document.createElement("span"); l.className = "voice-tab-language__label";
  l.textContent = "Language"; w.appendChild(l);
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
