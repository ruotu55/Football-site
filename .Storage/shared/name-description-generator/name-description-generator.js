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

import {
  VIRAL_TAGS,
  COMPETITION_KEYS,
  COUNTRY_KEYS,
  CLUB_KEYS,
  PLAYER_KEYS,
} from "./viral-tags.js";
import {
  HOOK_LINES,
  SHORT_HOOKS,
  QUIZ_EXPLANATION,
  FEATURE_HEADERS,
  SPECIAL_EDITION_PHRASES,
  ENGAGEMENT_LINES,
  SHORT_ENGAGEMENT,
  CROSS_PROMO_LINES,
  CROSS_PROMO_HEADERS,
  HASHTAG_CORE,
  HASHTAG_SHORTS,
  SIGN_OFFS,
  pickRandom,
  pickOne,
  rng,
} from "./description-templates.js";

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
  const ctx = buildContext();
  const title = buildTitle(ctx);
  const description = CONFIG.isShorts ? buildShortsDescription(ctx) : buildRegularDescription(ctx);
  const tags = buildTags(ctx);

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

function buildTitle(ctx) {
  const parts = [];
  parts.push(CONFIG.quizTitle.toUpperCase());
  if (CONFIG.isShorts) parts.push("#shorts");

  let title = `${parts.join(" ")} | ${CONFIG.channelName} ${ctx.year}`;

  if (ctx.scriptName) {
    const withScript = `${parts.join(" ")} - ${ctx.scriptName.toUpperCase()} | ${CONFIG.channelName} ${ctx.year}`;
    if (withScript.length <= 100) title = withScript;
  }

  return title;
}

// ---------------------------------------------------------------------------
// Regular description — long-form, structured, lots of variety
// ---------------------------------------------------------------------------

function buildRegularDescription(ctx) {
  const lines = [];

  // 1) Hook
  lines.push(pickOne(HOOK_LINES));
  lines.push("");

  // 2) Quiz explanation (random variant)
  const explanationPool = QUIZ_EXPLANATION[CONFIG.quizKey] || QUIZ_EXPLANATION["team-by-nat"];
  lines.push(pickOne(explanationPool));
  lines.push("");

  // 3) Context line — "This round features ..." (random header + content)
  const featureBits = featureBitsFromContext(ctx);
  if (featureBits.length) {
    lines.push(pickOne(FEATURE_HEADERS));
    for (const bit of featureBits) lines.push(`  ${bit}`);
    lines.push("");
  }

  // 4) Saved-script tag (random phrasing)
  if (ctx.scriptName) {
    lines.push(pickOne(SPECIAL_EDITION_PHRASES).replace("{NAME}", ctx.scriptName));
    lines.push("");
  }

  // 5) Engagement (3-5 random lines, count varies)
  const engCount = 3 + rng(3); // 3..5
  const eng = pickRandom(ENGAGEMENT_LINES, engCount);
  for (const l of eng) lines.push(l);
  lines.push("");

  // 6) Cross-promo (random header + 4-6 random promo lines), skip ~30% of the time
  if (rng(10) >= 3) {
    lines.push(pickOne(CROSS_PROMO_HEADERS));
    const promoCount = 4 + rng(3); // 4..6
    for (const l of pickRandom(CROSS_PROMO_LINES, promoCount)) lines.push(l);
    lines.push("");
  }

  // 7) Hashtag block — randomized subset of core (10..14 picks)
  const hashCount = 10 + rng(5);
  lines.push(pickRandom(HASHTAG_CORE, hashCount).join(" "));
  lines.push("");

  // 8) Sign-off (random variant)
  lines.push(
    pickOne(SIGN_OFFS)
      .replace("{CHANNEL}", CONFIG.channelName)
      .replace("{YEAR}", ctx.year),
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Shorts description — compact, punchy, 4-6 lines total
// ---------------------------------------------------------------------------

function buildShortsDescription(ctx) {
  const lines = [];

  // Short punchy hook
  lines.push(pickOne(SHORT_HOOKS));

  // Optional very-short tag for context (script name) – occasionally
  if (ctx.scriptName && rng(2) === 0) {
    lines.push(`🔥 ${ctx.scriptName}!`);
  }

  // Single CTA
  lines.push(pickOne(SHORT_ENGAGEMENT));

  lines.push("");

  // Hashtag block — Shorts-heavy, 6..9 hashtags total
  const corePicks = pickRandom(HASHTAG_CORE, 4 + rng(2));
  const shortsPicks = pickRandom(HASHTAG_SHORTS, 3 + rng(2));
  lines.push([...shortsPicks, ...corePicks].join(" "));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Feature bits helper
// ---------------------------------------------------------------------------

function featureBitsFromContext(ctx) {
  const bits = [];
  const knownClubs = ctx.teams.filter((t) => CLUB_KEYS.includes(t));
  const knownPlayers = ctx.players.filter((p) =>
    PLAYER_KEYS.some((k) => p.toLowerCase().includes(k.toLowerCase())),
  );

  if (knownClubs.length) {
    bits.push(`Clubs: ${knownClubs.slice(0, 6).join(", ")}`);
  } else if (ctx.teams.length) {
    bits.push(`Teams: ${ctx.teams.slice(0, 6).join(", ")}`);
  }
  if (knownPlayers.length) {
    bits.push(`Featuring: ${knownPlayers.slice(0, 6).join(", ")}`);
  }
  if (ctx.leagues.length) {
    bits.push(`Leagues: ${ctx.leagues.slice(0, 4).join(", ")}`);
  }
  return bits;
}

// ---------------------------------------------------------------------------
// Tags — built with shuffled sub-pools so every click yields a different mix
// ---------------------------------------------------------------------------

function buildTags(ctx) {
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
  const universal = VIRAL_TAGS.universal.slice();
  shuffle(universal);
  for (const t of universal) push(t);

  // Quiz-type tags - shuffled
  const qt = (VIRAL_TAGS.quizType[CONFIG.quizKey] || []).slice();
  shuffle(qt);
  for (const t of qt) push(t);

  // Format tags - shuffled
  const ft = (CONFIG.isShorts ? VIRAL_TAGS.format.shorts : VIRAL_TAGS.format.regular).slice();
  shuffle(ft);
  for (const t of ft) push(t);

  // Saved-script driven tags (competitions matched on name)
  const scriptLow = (ctx.scriptName || "").toLowerCase();
  for (const key of COMPETITION_KEYS) {
    if (scriptLow.includes(key)) {
      const arr = VIRAL_TAGS.competition[key].slice();
      shuffle(arr);
      for (const t of arr) push(t);
    }
  }

  // Club tags
  for (const team of ctx.teams) {
    const teamLow = team.toLowerCase();
    for (const key of CLUB_KEYS) {
      if (teamLow.includes(key.toLowerCase())) {
        for (const t of VIRAL_TAGS.club[key]) push(t);
      }
    }
  }

  // Country tags
  for (const c of ctx.countries) {
    for (const key of COUNTRY_KEYS) {
      if (c.toLowerCase().includes(key.toLowerCase())) {
        for (const t of VIRAL_TAGS.country[key]) push(t);
      }
    }
  }

  // League tags from selectedEntry.league
  for (const league of ctx.leagues) {
    const low = league.toLowerCase();
    for (const key of COMPETITION_KEYS) {
      if (low.includes(key)) {
        for (const t of VIRAL_TAGS.competition[key]) push(t);
      }
    }
  }

  // Player tags
  for (const p of ctx.players) {
    const pLow = p.toLowerCase();
    for (const key of PLAYER_KEYS) {
      if (pLow.includes(key.toLowerCase())) {
        for (const t of VIRAL_TAGS.player[key]) push(t);
      }
    }
  }

  // Year tags
  push(`football quiz ${ctx.year}`);
  push(`soccer quiz ${ctx.year}`);
  push(`football ${ctx.year}`);

  // Engagement tags - shuffled so the trailing tags vary every click
  const eng = VIRAL_TAGS.engagement.slice();
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
