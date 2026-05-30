/* Voice tab — Lineups Shorts. Uses team voice instead of player voice. */

import { appState } from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { resolveHeaderTeamDisplayName } from "./pitch-render.js";
import { translateCountry } from "./i18n.js";
import {
  BUNDLED_MILESTONES,
  getSelectedBundledVariant,
} from "./bundled-level-voices.js";
import { renderTeamPhrase, getOrAssignRevealPhrase } from "./audio.js";

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
    "nat-by-club": "Hey everyone, let's start. ...\n\nGUESS THE FOOTBALL NATIONAL TEAM NAME BY PLAYERS' CLUB!!",
    "club-by-nat": "Hey everyone, let's start. ...\n\nGUESS THE FOOTBALL TEAM NAME BY PLAYERS NATIONALITY!!",
  },
  spanish: {
    "nat-by-club": "Hola a todos, empecemos. ...\n\n¡¡ADIVINA EL EQUIPO NACIONAL POR EL CLUB DE LOS JUGADORES!!",
    "club-by-nat": "Hola a todos, empecemos. ...\n\n¡¡ADIVINA EL EQUIPO POR LA NACIONALIDAD DE LOS JUGADORES!!",
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

const PLAYS_AT = {
  quizIntro: { english: "Landing → Level 1",                spanish: "Inicial → Nivel 1" },
  team:      { english: "Level where team is revealed",     spanish: "Nivel donde se revela el equipo" },
  ending:    { english: "Last page (outro)",                spanish: "Última página (outro)" },
};
function plays(key) { const p = PLAYS_AT[key]; return (p && p.english) || ""; }
function bundledVariantText(entry) {
  const lang = getCurrentLanguage();
  return entry.text[lang] || entry.text.english;
}
function bundledMilestonePlaysAt(milestone) {
  return milestone.playsAt.english;
}
/* Display indices are 1-based question numbers. levelsData index 0 = logo page, index 1 =
   landing page, so the first question lives at array-index 2; subtract 1 to convert. */
function levelLabel(idx)   { const adj = idx.map(i => i - 1); return `Level ${adj.join(", ")}`; }

const busyByKey = new Set();
let audioEl = null;
let bulkDownloadActive = false;
function endpointUrl(p) { return projectAssetUrl(p); }
function stopPreviewAudio() { if (!audioEl) return; audioEl.pause(); audioEl.currentTime = 0; audioEl = null; }
function playClip(src) { const s = String(src || "").trim(); if (!s) return; stopPreviewAudio(); const a = new Audio(s); audioEl = a; a.addEventListener("ended", () => { if (audioEl === a) audioEl = null; }, { once: true }); a.play().catch(() => {}); }
function playFromStart(src) { if (bulkDownloadActive) return; const s = String(src || "").trim(); if (!s) return; playClip(s); }

/* Collect unique team names currently assigned to levels. Lineups levels hold a team
   as `levelData.team?.name` or similar — fall back to any string that looks like a team. */
function uniqueTeamNames() {
  const seen = new Set();
  const out = [];
  const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  const quizType = String(appState.els?.inQuizType?.value || "").trim();
  for (const lvl of levels) {
    /* Prefer the resolved display name (applies nat-by-club rename overrides) so the
       Teams row here matches the on-screen team name and the voice file keyed to it. */
    let displayName = "";
    try {
      displayName = String(resolveHeaderTeamDisplayName(lvl, quizType) || "").trim();
    } catch {
      displayName = "";
    }
    const fallback = String(
      lvl?.currentSquad?.name ||
      lvl?.team?.name ||
      lvl?.currentSquadName ||
      lvl?.teamName ||
      lvl?.nationalTeamName ||
      lvl?.clubName ||
      ""
    ).trim();
    let name = displayName || fallback;
    /* For national-team mode the team name IS a country (e.g. "Spain") — translate
       it to Spanish ("España") so the voice file is keyed by the localized name and
       matches the on-screen header. Club names pass through unchanged. */
    if (name && lvl?.squadType === "national") {
      name = translateCountry(name);
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function getCurrentQuizType() { const raw = String(appState.els?.inQuizType?.value || "").trim(); const m = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english; return raw in m ? raw : ""; }
function getSpecificTitle() { return ""; }
function quizTitleSynthText(qt, st) { const m = QUIZ_TYPE_PROMPTS[getCurrentLanguage()] || QUIZ_TYPE_PROMPTS.english; const b = m[qt] || ""; const e = String(st || "").trim(); return e ? `${b} ${e}` : b; }

async function fetchQuizTitleStatus(qt, st) { try { const p = new URLSearchParams({ quizType: qt, specificTitle: st || "", language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__quiz-title-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchEndingStatus(et) { try { const p = new URLSearchParams({ endingType: et, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__ending-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchTeamStatus(name, quizType, phrase = "plain") { try { const p = new URLSearchParams({ name, quizType, phrase, language: getCurrentLanguage() }); const r = await fetch(`${endpointUrl("__team-voice/status")}?${p}`, { cache: "no-store" }); const b = await r.json().catch(() => ({})); return { exists: !!b?.exists, src: String(b?.src || "") }; } catch { return { exists: false, src: "" }; } }
async function fetchBundledStatus(key, variant) {
  try {
    const p = new URLSearchParams({ key, variant: String(variant), language: getCurrentLanguage() });
    const r = await fetch(`${endpointUrl("__bundled-voice/status")}?${p}`, { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return { exists: !!b?.exists, src: String(b?.src || "") };
  } catch {
    return { exists: false, src: "" };
  }
}

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


const BULK_TEAMS_KEY = "bulk-teams";

function bulkTeamsButtonLabel(done, total) {
  const lang = getCurrentLanguage();
  if (total > 0 && done < total) {
    return `Creating voice… ${done}/${total}`;
  }
  return "Create voice for all teams";
}

async function onCreateAllTeamVoices(teamItems, quizType, buttonEl) {
  const lang = getCurrentLanguage();
  const bulkKey = `${BULK_TEAMS_KEY}:${lang}`;
  if (busyByKey.has(bulkKey)) return;

  const missing = teamItems.filter((t) => !t.exists);
  if (missing.length === 0) {
    alert("All teams already have a voice.");
    return;
  }

  stopPreviewAudio();
  busyByKey.add(bulkKey);
  const total = missing.length;
  let done = 0;
  let failed = 0;
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = bulkTeamsButtonLabel(done, total);
  }

  for (const { name, phrase } of missing) {
    try {
      const res = await fetch(endpointUrl("__team-voice/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          quizType: quizType || "club-by-nat",
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
    if (buttonEl) buttonEl.textContent = bulkTeamsButtonLabel(done, total);
  }

  busyByKey.delete(bulkKey);
  if (buttonEl) {
    buttonEl.disabled = false;
    buttonEl.textContent = bulkTeamsButtonLabel(0, 0);
  }
  await renderVoiceTab();
  if (failed > 0) {
    alert(
      `Could not create ${failed} of ${total} team voices.`,
    );
  }
}

function buildRow({ text, exists, onPlay, onDelete, playsAt = "", deleteDisabled = null, sessionPick = false }) {
  const row = document.createElement("div");
  row.className = `voice-tab-row ${exists ? "is-present" : "is-missing"}${sessionPick ? " is-session-pick" : ""}`;
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
  const teams = uniqueTeamNames();

  /* Resolve the level + question-index for each unique team so we can ask the audio
     module for the phrase variant that will actually play. The pick is sticky on the
     level object — same value here and at reveal time, fresh roll on saved-script load. */
  const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  const teamFirstLevelIndex = new Map();
  levels.forEach((lvl, idx) => {
    let displayName = "";
    try { displayName = String(resolveHeaderTeamDisplayName(lvl, quizType) || "").trim(); } catch { displayName = ""; }
    const fallback = String(lvl?.currentSquad?.name || lvl?.team?.name || lvl?.currentSquadName || lvl?.teamName || lvl?.nationalTeamName || lvl?.clubName || "").trim();
    let name = displayName || fallback;
    if (name && lvl?.squadType === "national") name = translateCountry(name);
    if (!name) return;
    if (!teamFirstLevelIndex.has(name)) teamFirstLevelIndex.set(name, idx);
  });
  const teamPhraseList = teams.map((name) => {
    const levelIdx = teamFirstLevelIndex.get(name);
    const lvl = Number.isInteger(levelIdx) ? levels[levelIdx] : null;
    const questionIndex = Number.isInteger(levelIdx) ? levelIdx - 1 : null;
    const phrase = getOrAssignRevealPhrase(lvl, questionIndex);
    return { name, phrase };
  });

  const [quizTitleStatus, endingThink, endingHow, teamStatuses] = await Promise.all([
    quizType ? fetchQuizTitleStatus(quizType, specificTitle) : Promise.resolve({ exists: false, src: "" }),
    fetchEndingStatus("think-you-know"),
    fetchEndingStatus("how-many"),
    Promise.all(teamPhraseList.map(({ name, phrase }) =>
      fetchTeamStatus(name, quizType || "club-by-nat", phrase).then(({ exists, src }) => ({ name, phrase, exists, src }))
    )),
  ]);
  if (myToken !== renderToken) return;

  const lang = getCurrentLanguage();
  const endingTextMap = ENDING_PROMPTS[lang] || ENDING_PROMPTS.english;

  root.innerHTML = "";
  root.appendChild(buildLanguageToggle());
  root.appendChild(buildDownloadAllButton());

  // Key the level map under the SAME resolved display name that uniqueTeamNames()
  // produces, otherwise teamLevelMap.get(name) misses and rows fall back to placeholder.
  const teamLevelMap = (() => {
    const map = new Map();
    const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
    levels.forEach((lvl, idx) => {
      let displayName = "";
      try {
        displayName = String(resolveHeaderTeamDisplayName(lvl, quizType) || "").trim();
      } catch {
        displayName = "";
      }
      const fallback = String(
        lvl?.currentSquad?.name ||
        lvl?.team?.name ||
        lvl?.currentSquadName ||
        lvl?.teamName ||
        lvl?.nationalTeamName ||
        lvl?.clubName ||
        ""
      ).trim();
      let name = displayName || fallback;
      if (name && lvl?.squadType === "national") {
        name = translateCountry(name);
      }
      if (!name) return;
      if (!map.has(name)) map.set(name, []);
      if (!map.get(name).includes(idx)) map.get(name).push(idx);
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

  const teamRows = teamStatuses.map(({ name, phrase, exists, src }) => {
    const indices = teamLevelMap.get(name) || [];
    const playsAt = indices.length ? levelLabel(indices) : plays("team");
    const text = renderTeamPhrase(phrase, name, lang);
    return buildRow({
      text, exists, playsAt,
      onPlay: () => onVolPressed({ rowKey: `team:${name}:${phrase}:${lang}`, cachedExists: exists, cachedSrc: src, generateEndpoint: "__team-voice/generate", generateBody: { name, quizType: quizType || "club-by-nat", phrase } }),
      onDelete: () => onDeletePressed({ rowKey: `team:${name}:${phrase}:${lang}`, deleteEndpoint: "__team-voice/delete", deleteBody: { name, quizType: quizType || "club-by-nat", phrase } }),
    });
  });
  const bulkCreateTeamsBtn = document.createElement("button");
  bulkCreateTeamsBtn.type = "button";
  bulkCreateTeamsBtn.className = "voice-tab-bulk-btn";
  bulkCreateTeamsBtn.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:0.2rem 0 0.6rem;padding:0.62rem 0.85rem;border:none;border-radius:0.6rem;background:linear-gradient(180deg,#ffd24a,#f4b000);color:#2a1d00;font-family:inherit;font-size:0.8rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.55)";
  bulkCreateTeamsBtn.textContent = bulkTeamsButtonLabel(0, 0);
  bulkCreateTeamsBtn.disabled = teamStatuses.length === 0 || busyByKey.has(`${BULK_TEAMS_KEY}:${lang}`);
  bulkCreateTeamsBtn.onclick = (e) => {
    e.preventDefault();
    onCreateAllTeamVoices(teamStatuses, quizType, bulkCreateTeamsBtn);
  };
  root.appendChild(buildSection(SECTION_TITLES.teams, teamRows));

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

  const bundledStatusPairs = await Promise.all(
    BUNDLED_MILESTONES.flatMap((milestone) =>
      milestone.variants.map(async (entry) => {
        const status = await fetchBundledStatus(milestone.serverKey, entry.variant);
        return { milestone, entry, status };
      }),
    ),
  );
  if (myToken !== renderToken) return;
  const bundledTitle = "Bundled";
  const sessionVariants = appState.bundledVoiceVariants || {};
  const bundledRows = [];
  for (const milestone of BUNDLED_MILESTONES) {
    const groupHead = document.createElement("div");
    groupHead.className = "voice-tab-bundled-milestone";
    const headLabel = document.createElement("span");
    headLabel.className = "voice-tab-bundled-milestone__label";
    headLabel.textContent = bundledMilestonePlaysAt(milestone);
    const headPick = document.createElement("span");
    headPick.className = "voice-tab-bundled-milestone__pick";
    const picked = getSelectedBundledVariant(milestone.audioKey, sessionVariants);
    headPick.textContent = `In game: #${picked}`;
    groupHead.appendChild(headLabel);
    groupHead.appendChild(headPick);
    bundledRows.push(groupHead);
    for (const { entry, status } of bundledStatusPairs.filter((p) => p.milestone === milestone)) {
      const row = buildRow({
        text: `#${entry.variant} — ${bundledVariantText(entry)}`,
        exists: status.exists,
        sessionPick: getSelectedBundledVariant(milestone.audioKey, sessionVariants) === entry.variant,
        deleteDisabled: !status.exists,
        onPlay: () => onVolPressed({
          rowKey: `bundled:${milestone.serverKey}:${entry.variant}:${lang}`,
          cachedExists: status.exists,
          cachedSrc: status.src,
          generateEndpoint: "__bundled-voice/generate",
          generateBody: { key: milestone.serverKey, variant: entry.variant },
        }),
        onDelete: () => onDeletePressed({
          rowKey: `bundled:${milestone.serverKey}:${entry.variant}:${lang}`,
          deleteEndpoint: "__bundled-voice/delete",
          deleteBody: { key: milestone.serverKey, variant: entry.variant },
        }),
      });
      bundledRows.push(row);
    }
  }
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

document.addEventListener("bundled-voice-variants-change", () => {
  void renderVoiceTab();
});
