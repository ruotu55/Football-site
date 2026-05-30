// Shared "Name & Description" generator — produces viral YouTube title,
// description and tag set tailored to the current quiz, the actual teams /
// players in the levels, and the loaded saved-script (if any).
//
// Usage from a runner's app.js:
//
//   import { initNameDescriptionGenerator } from "../../.Storage/shared/name-description-generator/name-description-generator.js";
//   initNameDescriptionGenerator({
//     buttonId: "btn-name-description",
//     quizKey: "team-by-nat",
//     quizTitle: "GUESS THE FOOTBALL TEAM NAME BY PLAYERS NATIONALITY",
//     channelName: "ULTIMATE FOOTBALL QUIZ",
//     isShorts: false,
//     getLevelsData: () => appState.levelsData,
//     getActiveScriptName: () => getActiveScriptName(),
//   });

// Both languages are loaded as namespaces; the generator picks one per call
// based on the requested language ("en" / "es"). Matching-key lists
// (COMPETITION_KEYS etc.) are language-agnostic, taken from the English file.
import { VIRAL_TAGS as TAGS_EN, COMPETITION_KEYS, COUNTRY_KEYS, CLUB_KEYS, PLAYER_KEYS } from "./viral-tags.js";
import { VIRAL_TAGS as TAGS_ES } from "./viral-tags-es.js";
import * as TPL_EN from "./description-templates.js";
import * as TPL_ES from "./description-templates-es.js";

const { pickRandom, pickOne, rng } = TPL_EN; // helpers are language-agnostic

/** Spanish quiz titles per quizKey (the EN title comes from CONFIG.quizTitle,
 *  which each runner passes in). Falls back to CONFIG.quizTitle if a key is
 *  missing. */
const QUIZ_TITLE_ES = {
  "team-by-nat": "ADIVINA EL EQUIPO POR LA NACIONALIDAD DE LOS JUGADORES",
  "nat-by-club": "ADIVINA LA SELECCIÓN POR LOS CLUBES DE LOS JUGADORES",
  "career-path": "ADIVINA EL JUGADOR POR SU TRAYECTORIA",
  "career-stats": "ADIVINA EL JUGADOR POR SUS ESTADÍSTICAS",
  "four-params": "ADIVINA EL JUGADOR POR CLUB, POSICIÓN, PAÍS Y EDAD",
  "fake-info": "ENCUENTRA LA INFORMACIÓN FALSA",
  "logo-name": "ADIVINA EL EQUIPO POR SU ESCUDO",
  "player-name": "ADIVINA EL JUGADOR POR SU FOTO",
};

/** Language-keyed accessors. */
function tpl(lang) { return lang === "es" ? TPL_ES : TPL_EN; }
function tags(lang) { return lang === "es" ? TAGS_ES : TAGS_EN; }
function normLang(language) {
  const v = String(language || "").toLowerCase();
  if (v === "es" || v === "spanish") return "es";
  return "en";
}

const YOUTUBE_TAG_BUDGET = 480; // hard ceiling; YouTube cap is 500
const TAG_COUNT_REGULAR = { min: 12, max: 15 }; // sweet spot per YouTube SEO consensus
const TAG_COUNT_SHORTS = { min: 6, max: 8 };    // shorts rely on #hashtags in desc, not tags
const MODAL_ID = "name-description-modal";

let CONFIG = null;

/** Public entry point: wires the button + builds the modal lazily. */
export function initNameDescriptionGenerator(config) {
  CONFIG = config;
  const btn = document.getElementById(config.buttonId);
  if (!btn) return;
  btn.addEventListener("click", () => openModal());
}

/** Headless variant of the generator — returns { title, description, tags }
 *  for the CURRENT quiz state without opening the modal. Used by the recording
 *  queue to stamp YouTube metadata onto a block when a recording finishes.
 *  `language` is "english"/"en" (default) or "spanish"/"es" — it selects the
 *  Spanish copy + tags + title for the ES channel.
 *  Requires initNameDescriptionGenerator(config) to have run first (CONFIG set).
 *  `tags` is returned as an array. */
export function generateNameDescription(language) {
  if (!CONFIG) {
    return { title: "", description: "", tags: [] };
  }
  const lang = normLang(language);
  const ctx = buildContext();
  const title = buildTitle(ctx, lang);
  const description = CONFIG.isShorts ? buildShortsDescription(ctx, lang) : buildRegularDescription(ctx, lang);
  const tagList = buildTags(ctx, lang);
  return { title, description, tags: tagList };
}

// ---------------------------------------------------------------------------
// Modal construction (lazy + dynamic — no per-runner HTML edits required)
// ---------------------------------------------------------------------------

function ensureModalMounted() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "swap-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="swap-modal-content" style="padding: 0; max-width: 760px; width: 92vw; max-height: 90vh; display: flex; flex-direction: column;">
      <div class="swap-modal-header">
        <h3 style="margin: 0;">Name &amp; Description</h3>
        <button type="button" class="swap-modal-close" data-action="close" aria-label="Close">&times;</button>
      </div>
      <div style="padding: 1.2rem 1.5rem; overflow-y: auto;">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <button type="button" class="panel-toggle" data-action="regenerate" style="flex: 1; background: var(--accent); color: #000; font-weight: 800;">↻ Regenerate</button>
          <button type="button" class="panel-toggle" data-action="copy-all" style="flex: 1;">Copy All</button>
        </div>

        <div style="margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem;">
            <span style="font-weight: 800; color: var(--accent);">Title</span>
            <span data-info="title-meta" style="font-size: 0.75rem; color: #888;"></span>
          </div>
          <textarea data-field="title" rows="2" style="width: 100%; padding: 0.6rem; background: #000; color: #fff; border: 1px solid #333; border-radius: 4px; box-sizing: border-box; font-family: inherit; font-size: 0.9rem; resize: vertical;"></textarea>
          <button type="button" class="panel-toggle" data-action="copy-title" style="margin-top: 0.4rem; width: 100%;">Copy Title</button>
        </div>

        <div style="margin-bottom: 1rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem;">
            <span style="font-weight: 800; color: var(--accent);">Description</span>
            <span data-info="description-meta" style="font-size: 0.75rem; color: #888;"></span>
          </div>
          <textarea data-field="description" rows="14" style="width: 100%; padding: 0.6rem; background: #000; color: #fff; border: 1px solid #333; border-radius: 4px; box-sizing: border-box; font-family: inherit; font-size: 0.85rem; line-height: 1.5; resize: vertical;"></textarea>
          <button type="button" class="panel-toggle" data-action="copy-description" style="margin-top: 0.4rem; width: 100%;">Copy Description</button>
        </div>

        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem;">
            <span style="font-weight: 800; color: var(--accent);">Tags</span>
            <span data-info="tags-meta" style="font-size: 0.75rem; color: #888;"></span>
          </div>
          <textarea data-field="tags" rows="5" style="width: 100%; padding: 0.6rem; background: #000; color: #fff; border: 1px solid #333; border-radius: 4px; box-sizing: border-box; font-family: inherit; font-size: 0.82rem; resize: vertical;"></textarea>
          <button type="button" class="panel-toggle" data-action="copy-tags" style="margin-top: 0.4rem; width: 100%;">Copy Tags</button>
        </div>

        <div data-info="toast" style="margin-top: 1rem; padding: 0.6rem 0.8rem; background: rgba(0, 200, 100, 0.12); border: 1px solid rgba(0, 200, 100, 0.4); border-radius: 4px; color: #4ade80; font-size: 0.8rem; display: none;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (ev) => {
    const target = ev.target;
    if (target === modal) {
      hideModal();
      return;
    }
    const action = target.dataset?.action;
    if (!action) return;
    if (action === "close") hideModal();
    else if (action === "regenerate") renderInto(modal);
    else if (action === "copy-all") copyAll(modal);
    else if (action === "copy-title") copyField(modal, "title", "Title copied");
    else if (action === "copy-description") copyField(modal, "description", "Description copied");
    else if (action === "copy-tags") copyField(modal, "tags", "Tags copied");
  });

  return modal;
}

function openModal() {
  const modal = ensureModalMounted();
  renderInto(modal);
  modal.hidden = false;
}

function hideModal() {
  const modal = document.getElementById(MODAL_ID);
  if (modal) modal.hidden = true;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function renderInto(modal) {
  const lang = "en"; // the manual modal shows English copy
  const ctx = buildContext();
  const title = buildTitle(ctx, lang);
  const description = CONFIG.isShorts ? buildShortsDescription(ctx, lang) : buildRegularDescription(ctx, lang);
  const tags = buildTags(ctx, lang);

  modal.querySelector('[data-field="title"]').value = title;
  modal.querySelector('[data-field="description"]').value = description;
  modal.querySelector('[data-field="tags"]').value = tags.join(", ");

  modal.querySelector('[data-info="title-meta"]').textContent =
    `${title.length} chars` + (title.length > 100 ? "  ⚠ over 100" : "");
  modal.querySelector('[data-info="description-meta"]').textContent =
    `${description.length} chars`;
  modal.querySelector('[data-info="tags-meta"]').textContent =
    `${tags.length} tags · ${tags.join(", ").length}/500 chars`;

  hideToast(modal);
}

// ---------------------------------------------------------------------------
// Context extraction — derives teams/players/leagues from the current quiz
// ---------------------------------------------------------------------------

function buildContext() {
  const levels = (CONFIG.getLevelsData?.() || []).filter(Boolean);
  const teams = new Set();
  const players = new Set();
  const countries = new Set();
  const leagues = new Set();

  for (const lvl of levels) {
    if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro || lvl.isBonus) continue;

    if (lvl.selectedEntry?.name) teams.add(lvl.selectedEntry.name);
    if (lvl.selectedEntry?.country) countries.add(lvl.selectedEntry.country);
    if (lvl.selectedEntry?.league) leagues.add(lvl.selectedEntry.league);

    if (lvl.careerPlayer?.name) players.add(lvl.careerPlayer.name);
    if (lvl.careerPlayer?.country) countries.add(lvl.careerPlayer.country);

    const squadPlayers = lvl.currentSquad?.players;
    if (Array.isArray(squadPlayers)) {
      for (const p of squadPlayers) {
        if (p?.name) players.add(p.name);
        if (p?.country) countries.add(p.country);
        if (p?.nationality) countries.add(p.nationality);
        if (p?.club) teams.add(p.club);
      }
    }

    if (Array.isArray(lvl.careerHistory)) {
      for (const stop of lvl.careerHistory) {
        if (stop?.club) teams.add(stop.club);
        if (stop?.country) countries.add(stop.country);
      }
    }
  }

  return {
    scriptName: (CONFIG.getActiveScriptName?.() || "").trim(),
    teams: [...teams],
    players: [...players],
    countries: [...countries],
    leagues: [...leagues],
    year: new Date().getFullYear(),
  };
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

function buildTitle(ctx, lang = "en") {
  // Shorts get a viral, ever-changing title (see buildShortsTitle).
  if (CONFIG.isShorts) return buildShortsTitle(ctx, lang);

  // ----- REGULAR title: kept 100% identical to the original behaviour. -----
  const baseTitle = (lang === "es" && QUIZ_TITLE_ES[CONFIG.quizKey])
    ? QUIZ_TITLE_ES[CONFIG.quizKey]
    : CONFIG.quizTitle;

  const parts = [];
  parts.push(baseTitle.toUpperCase());

  let title = `${parts.join(" ")} | ${CONFIG.channelName} ${ctx.year}`;

  if (ctx.scriptName) {
    const withScript = `${parts.join(" ")} - ${ctx.scriptName.toUpperCase()} | ${CONFIG.channelName} ${ctx.year}`;
    if (withScript.length <= 100) title = withScript;
  }

  return title;
}

/** Shorts-only viral title. Picks a random hooky frame + per-quiz task phrase
 *  each call, so consecutive generates are near-unique (~28 frames × tails). */
function buildShortsTitle(ctx, lang = "en") {
  const T = tpl(lang);
  const tasks = T.SHORTS_TITLE_TASKS || TPL_EN.SHORTS_TITLE_TASKS;
  const frames = T.SHORTS_TITLE_FRAMES || TPL_EN.SHORTS_TITLE_FRAMES;
  const tails = T.SHORTS_TITLE_TAILS || TPL_EN.SHORTS_TITLE_TAILS;

  const task = tasks[CONFIG.quizKey] || tasks["team-by-nat"] || "Guess the football quiz";
  // {task} = mid-sentence form. ES needs a real infinitive ("adivinar"); EN's
  // lowercased imperative already reads correctly mid-sentence.
  const taskInf = T.SHORTS_TITLE_TASKS_INF && T.SHORTS_TITLE_TASKS_INF[CONFIG.quizKey];
  const taskLower = taskInf || (task.charAt(0).toLowerCase() + task.slice(1));

  const frame = pickOne(frames);
  const line = frame.replace(/\{TASK\}/g, task).replace(/\{task\}/g, taskLower);

  // #shorts is mandatory for Shorts classification; the optional extra hashtag
  // (some tails are empty) varies the ending too.
  let title = `${line} #shorts${pickOne(tails)}`;

  // Safety: keep under YouTube's 100-char title cap.
  if (title.length > 100) {
    title = `${line} #shorts`;
    if (title.length > 100) title = line.slice(0, 100);
  }
  return title;
}

// ---------------------------------------------------------------------------
// Regular description — long-form, structured, lots of variety
// ---------------------------------------------------------------------------

function buildRegularDescription(ctx, lang = "en") {
  const T = tpl(lang);
  const lines = [];

  // 1) Hook
  lines.push(pickOne(T.HOOK_LINES));
  lines.push("");

  // 2) Quiz explanation (random variant)
  const explanationPool = T.QUIZ_EXPLANATION[CONFIG.quizKey] || T.QUIZ_EXPLANATION["team-by-nat"];
  lines.push(pickOne(explanationPool));
  lines.push("");

  // 3) Context line — "This round features ..." (random header + content)
  const featureBits = featureBitsFromContext(ctx, lang);
  if (featureBits.length) {
    lines.push(pickOne(T.FEATURE_HEADERS));
    for (const bit of featureBits) lines.push(`  ${bit}`);
    lines.push("");
  }

  // 4) Saved-script tag (random phrasing)
  if (ctx.scriptName) {
    lines.push(pickOne(T.SPECIAL_EDITION_PHRASES).replace("{NAME}", ctx.scriptName));
    lines.push("");
  }

  // 5) Engagement (3-5 random lines, count varies)
  const engCount = 3 + rng(3); // 3..5
  const eng = pickRandom(T.ENGAGEMENT_LINES, engCount);
  for (const l of eng) lines.push(l);
  lines.push("");

  // 6) Cross-promo (random header + 4-6 random promo lines), skip ~30% of the time
  if (rng(10) >= 3) {
    lines.push(pickOne(T.CROSS_PROMO_HEADERS));
    const promoCount = 4 + rng(3); // 4..6
    for (const l of pickRandom(T.CROSS_PROMO_LINES, promoCount)) lines.push(l);
    lines.push("");
  }

  // 7) Hashtag block — randomized subset of core (10..14 picks)
  const hashCount = 10 + rng(5);
  lines.push(pickRandom(T.HASHTAG_CORE, hashCount).join(" "));
  lines.push("");

  // 8) Sign-off (random variant)
  lines.push(
    pickOne(T.SIGN_OFFS)
      .replace("{CHANNEL}", CONFIG.channelName)
      .replace("{YEAR}", ctx.year),
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Shorts description — compact, punchy, 4-6 lines total
// ---------------------------------------------------------------------------

function buildShortsDescription(ctx, lang = "en") {
  const T = tpl(lang);
  const lines = [];

  // Short punchy hook
  lines.push(pickOne(T.SHORT_HOOKS));

  // Optional very-short tag for context (script name) – occasionally
  if (ctx.scriptName && rng(2) === 0) {
    lines.push(`🔥 ${ctx.scriptName}!`);
  }

  // Single CTA
  lines.push(pickOne(T.SHORT_ENGAGEMENT));

  lines.push("");

  // Hashtag block — Shorts-heavy, 6..9 hashtags total
  const corePicks = pickRandom(T.HASHTAG_CORE, 4 + rng(2));
  const shortsPicks = pickRandom(T.HASHTAG_SHORTS, 3 + rng(2));
  lines.push([...shortsPicks, ...corePicks].join(" "));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Feature bits helper
// ---------------------------------------------------------------------------

function featureBitsFromContext(ctx, lang = "en") {
  const L = lang === "es"
    ? { clubs: "Clubes", teams: "Equipos", featuring: "Con", leagues: "Ligas" }
    : { clubs: "Clubs", teams: "Teams", featuring: "Featuring", leagues: "Leagues" };
  const bits = [];
  const knownClubs = ctx.teams.filter((t) => CLUB_KEYS.includes(t));
  const knownPlayers = ctx.players.filter((p) =>
    PLAYER_KEYS.some((k) => p.toLowerCase().includes(k.toLowerCase())),
  );

  if (knownClubs.length) {
    bits.push(`${L.clubs}: ${knownClubs.slice(0, 6).join(", ")}`);
  } else if (ctx.teams.length) {
    bits.push(`${L.teams}: ${ctx.teams.slice(0, 6).join(", ")}`);
  }
  if (knownPlayers.length) {
    bits.push(`${L.featuring}: ${knownPlayers.slice(0, 6).join(", ")}`);
  }
  if (ctx.leagues.length) {
    bits.push(`${L.leagues}: ${ctx.leagues.slice(0, 4).join(", ")}`);
  }
  return bits;
}

// ---------------------------------------------------------------------------
// Tags — built with shuffled sub-pools so every click yields a different mix
// ---------------------------------------------------------------------------

function buildTags(ctx, lang = "en") {
  // universal/quizType/format come from the language bank; the proper-noun
  // banks (club/country/competition/player) are language-agnostic, so fall
  // back to the English bank if the Spanish one omits them.
  const V = tags(lang);
  const PN = TAGS_EN;
  const picked = new Set();
  const order = [];

  const push = (tag) => {
    const v = String(tag || "").trim().toLowerCase();
    if (!v) return;
    if (picked.has(v)) return;
    picked.add(v);
    order.push(v);
  };

  // Universal football tags - shuffled so different ones rank higher each time
  const universal = (V.universal || PN.universal).slice();
  shuffle(universal);
  for (const t of universal) push(t);

  // Quiz-type tags - shuffled
  const qtBank = V.quizType || PN.quizType;
  const qt = (qtBank[CONFIG.quizKey] || []).slice();
  shuffle(qt);
  for (const t of qt) push(t);

  // Format tags - shuffled
  const fmt = V.format || PN.format;
  const ft = (CONFIG.isShorts ? fmt.shorts : fmt.regular).slice();
  shuffle(ft);
  for (const t of ft) push(t);

  // Saved-script driven tags (competitions matched on name)
  const scriptLow = (ctx.scriptName || "").toLowerCase();
  for (const key of COMPETITION_KEYS) {
    if (scriptLow.includes(key) && PN.competition[key]) {
      const arr = PN.competition[key].slice();
      shuffle(arr);
      for (const t of arr) push(t);
    }
  }

  // Club tags
  for (const team of ctx.teams) {
    const teamLow = team.toLowerCase();
    for (const key of CLUB_KEYS) {
      if (teamLow.includes(key.toLowerCase()) && PN.club[key]) {
        for (const t of PN.club[key]) push(t);
      }
    }
  }

  // Country tags
  for (const c of ctx.countries) {
    for (const key of COUNTRY_KEYS) {
      if (c.toLowerCase().includes(key.toLowerCase()) && PN.country[key]) {
        for (const t of PN.country[key]) push(t);
      }
    }
  }

  // League tags from selectedEntry.league
  for (const league of ctx.leagues) {
    const low = league.toLowerCase();
    for (const key of COMPETITION_KEYS) {
      if (low.includes(key) && PN.competition[key]) {
        for (const t of PN.competition[key]) push(t);
      }
    }
  }

  // Player tags
  for (const p of ctx.players) {
    const pLow = p.toLowerCase();
    for (const key of PLAYER_KEYS) {
      if (pLow.includes(key.toLowerCase()) && PN.player[key]) {
        for (const t of PN.player[key]) push(t);
      }
    }
  }

  // Year tags
  if (lang === "es") {
    push(`quiz de futbol ${ctx.year}`);
    push(`trivia de futbol ${ctx.year}`);
    push(`futbol ${ctx.year}`);
  } else {
    push(`football quiz ${ctx.year}`);
    push(`soccer quiz ${ctx.year}`);
    push(`football ${ctx.year}`);
  }

  // Engagement tags - shuffled so the trailing tags vary every click
  const eng = (V.engagement || PN.engagement).slice();
  shuffle(eng);
  for (const t of eng) push(t);

  // Cap by count (regular vs shorts) and by the 500-char hard ceiling.
  const range = CONFIG.isShorts ? TAG_COUNT_SHORTS : TAG_COUNT_REGULAR;
  const targetCount = range.min + rng(range.max - range.min + 1);
  const out = [];
  let len = 0;
  for (const t of order) {
    if (out.length >= targetCount) break;
    const extra = (out.length === 0 ? 0 : 2) + t.length;
    if (len + extra > YOUTUBE_TAG_BUDGET) break;
    out.push(t);
    len += extra;
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

function copyField(modal, field, label) {
  const ta = modal.querySelector(`[data-field="${field}"]`);
  if (!ta) return;
  ta.select();
  navigator.clipboard.writeText(ta.value).then(
    () => showToast(modal, `✔ ${label}`),
    () => showToast(modal, `Copy failed — selection still ready, press Ctrl+C`),
  );
}

function copyAll(modal) {
  const t = modal.querySelector('[data-field="title"]').value;
  const d = modal.querySelector('[data-field="description"]').value;
  const tags = modal.querySelector('[data-field="tags"]').value;
  const combined = `=== TITLE ===\n${t}\n\n=== DESCRIPTION ===\n${d}\n\n=== TAGS ===\n${tags}\n`;
  navigator.clipboard.writeText(combined).then(
    () => showToast(modal, "✔ Title, description and tags copied"),
    () => showToast(modal, "Copy failed"),
  );
}

let toastTimer = null;
function showToast(modal, msg) {
  const el = modal.querySelector('[data-info="toast"]');
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = "none"), 2000);
}
function hideToast(modal) {
  const el = modal.querySelector('[data-info="toast"]');
  if (el) el.style.display = "none";
}
