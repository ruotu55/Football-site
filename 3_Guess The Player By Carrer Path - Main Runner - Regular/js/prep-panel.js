/**
 * PREP PANEL — runner 3 "Guess the Player by Career Path".
 *
 * Renders EVERY question level of the loaded save as a stacked section:
 *   LEFT  — the career path: the ordered career clubs as crest boxes with
 *           arrows between them (club1 → club2 → …), the SAME cleaned list the
 *           Remotion careerHistory uses. Each crest has a LOGO + X control;
 *           a missing crest shows the club name in a COPYABLE text box.
 *   RIGHT — two player boxes: (1) Hidden = the silhouette (dimmed/obscured
 *           player), (2) Revealed = the full photo + player name. The photo box
 *           carries PHOTO (fetch) + X (remove) + ✎ (name edit) controls.
 *
 * Unlike the lineup runners, renderCareer() targets a single #career-wrap by id
 * and owns many globals, so we DON'T re-use it per section. Instead we build the
 * custom layout here and re-use runner 3's DATA resolvers + edit ENDPOINTS:
 *   - cleaned career list  (state.careerHistory, already cleaned at pick time)
 *   - resolveCareerClubLogoUrls()  → the crest fallback URL chain
 *   - resolveCareerPlayerPhotoUrlForPrep()  → the Ready-photo URL
 *   - /__team-logo/fetch + /__team-logo/delete  (club crest LOGO / X)
 *   - /__ready-photo/from-url + /__ready-photo/delete  (player PHOTO / X)
 *   - player_name_overrides_shared (✎ name edit, shared + Remotion-read)
 *
 * Every edit calls markPrepDirty() so the Saved tab auto-saves block.script.
 */
import { appState, getState } from "./state.js";
import {
  resolveCareerClubLogoUrls,
  resolveCareerPlayerPhotoUrlForPrep,
  markPrepDirty,
  getPlayerNameOverride,
  setPlayerNameOverride,
  resolvePlayerStatsNationalityFlagUrl,
} from "./pitch-render.js";
import {
  projectAssetUrl,
  projectAssetUrlFresh,
  bumpProjectAssetCacheBust,
  careerReadyPhotoClubName,
} from "./paths.js";

const TEAM_LOGO_FETCH_ENDPOINT = "/__team-logo/fetch";
const TEAM_LOGO_DELETE_ENDPOINT = "/__team-logo/delete";
const READY_PHOTO_FROM_URL_ENDPOINT = "/__ready-photo/from-url";
const READY_PHOTO_DELETE_ENDPOINT = "/__ready-photo/delete";
const READY_PHOTO_REMOVE_BG_ENDPOINT = "/__ready-photo/remove-bg";
const READY_PHOTO_SEARCH_CANDIDATES_ENDPOINT = "/__ready-photo/search-candidates";

let root = null;
let sections = []; // [{ levelIndex, sectionEl, headEl }]

function serverActive() {
  return (
    typeof location !== "undefined" &&
    location.protocol === "http:" &&
    location.hostname !== ""
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/* Mirror build-data / renderCareer: drop youth/reserve + "without club". The
   stored careerHistory is already cleaned at pick time (cleanCareerHistory),
   but a freshly imported save resolves it server-side, so filter defensively. */
function isYouthClub(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return (
    n.includes("youth") ||
    n.includes("yth") ||
    /\bu\d{2}\b/.test(n) ||
    /\bii\b/.test(n) ||
    /\breserves?\b/.test(n) ||
    n.endsWith(" b")
  );
}
function isWithoutClub(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim().includes("without club");
}

/** The displayed career clubs for a level, with their ORIGINAL slot index in
 *  state.careerHistory (so edits write back to the right row). */
function displayedCareer(lvl) {
  const hist = Array.isArray(lvl?.careerHistory) ? lvl.careerHistory : [];
  const out = [];
  hist.forEach((row, slotIndex) => {
    if (!row || typeof row !== "object") return;
    const club = String(row.club || "").trim();
    if (!club || isYouthClub(club) || isWithoutClub(club)) return;
    out.push({ slotIndex, club, year: String(row.year || "").trim(), customImage: row.customImage || null });
  });
  return out;
}

function questionLevelIndexes() {
  const out = [];
  (appState.levelsData || []).forEach((lvl, i) => {
    if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isBonus || lvl.isOutro) return;
    if (!lvl.careerPlayer) return; // skip the empty init levels before a save loads
    out.push(i);
  });
  return out;
}

function playerNameFor(lvl) {
  return String(lvl?.careerPlayer?.name || "").trim();
}

function displayPlayerNameFor(lvl) {
  // Runners 3 & 4 ALWAYS show the player's FULL real name — the shared name
  // override (rename) feature is scoped to the lineup runners 1 & 2 only.
  return playerNameFor(lvl);
}

// ── crest box (LEFT, one per career club) ───────────────────────────────────

/** Wire a chained-fallback <img>: tries each URL until one loads, else shows
 *  the copyable club-name box. */
function applyCrestImageChain(img, box, urls, clubName) {
  const chain = urls.slice();
  let i = 0;
  const tryNext = () => {
    if (i >= chain.length) {
      showMissingCrest(box, clubName);
      img.remove();
      return;
    }
    img.src = chain[i++];
  };
  img.onerror = tryNext;
  if (!chain.length) {
    showMissingCrest(box, clubName);
    img.remove();
  } else {
    tryNext();
  }
}

/** Missing crest → copyable text box (mirror R2's appendSlotBadge copy box). */
function showMissingCrest(box, clubName) {
  if (box.querySelector(".prep-crest-missing")) return;
  const copy = document.createElement("div");
  copy.className = "prep-crest-missing slot-badge-fallback-copy";
  copy.tabIndex = 0;
  copy.textContent = clubName || "?";
  copy.title = "Click to select the club name, then download its logo.";
  copy.addEventListener("click", () => {
    const r = document.createRange();
    r.selectNodeContents(copy);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  });
  box.insertBefore(copy, box.firstChild);
}

function buildCrestBox(lvl, levelIndex, entry) {
  const box = document.createElement("div");
  box.className = "prep-crest-box";
  box.dataset.slotIndex = String(entry.slotIndex);

  // ── Top bar: X to REMOVE this team from the career path ──
  const topbar = document.createElement("div");
  topbar.className = "prep-crest-topbar";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "prep-crest-remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove this team from the career path.";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeCareerTeam(lvl, levelIndex, entry.slotIndex);
  });
  topbar.appendChild(removeBtn);
  box.appendChild(topbar);

  // ── Crest LOGO + delete controls — ABOVE the logo image ──
  const imgWrap = document.createElement("div");
  imgWrap.className = "prep-crest-img-wrap";
  const img = document.createElement("img");
  img.className = "prep-crest-img";
  img.alt = "";
  img.decoding = "async";
  imgWrap.appendChild(img);

  const ctrls = document.createElement("div");
  ctrls.className = "prep-crest-controls";
  const logoBtn = document.createElement("button");
  logoBtn.type = "button";
  logoBtn.className = "prep-crest-btn prep-crest-btn--logo";
  logoBtn.textContent = "LOGO";
  logoBtn.title = "Fetch this club crest (auto, or paste a football-logos.cc URL).";
  logoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void fetchCrestLogo(lvl, levelIndex, entry, box, img, imgWrap, logoBtn);
  });
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "prep-crest-btn prep-crest-btn--del";
  delBtn.textContent = "✕";
  delBtn.title = "Delete this crest file (Images/Teams/…).";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void deleteCrestLogo(lvl, levelIndex, entry, box, img, imgWrap, delBtn);
  });
  ctrls.append(logoBtn, delBtn);
  box.appendChild(ctrls);

  // ── Logo image ──
  box.appendChild(imgWrap);
  const urls = resolveCareerClubLogoUrls(entry.club, entry.customImage);
  applyCrestImageChain(img, imgWrap, urls, entry.club);

  // ── Club name ──
  const label = document.createElement("div");
  label.className = "prep-crest-label";
  label.textContent = entry.club;
  box.appendChild(label);

  // ── Year box + change button (year now lives in its own box) ──
  const yearRow = document.createElement("div");
  yearRow.className = "prep-crest-year";
  const yearVal = document.createElement("span");
  yearVal.className = "prep-crest-year__val";
  yearVal.textContent = entry.year || "—";
  const yearBtn = document.createElement("button");
  yearBtn.type = "button";
  yearBtn.className = "prep-crest-year__btn";
  yearBtn.textContent = "✎";
  yearBtn.title = "Change the year for this club.";
  yearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    editCareerYear(lvl, levelIndex, entry.slotIndex, yearVal);
  });
  yearRow.append(yearVal, yearBtn);
  box.appendChild(yearRow);

  return box;
}

// ── add / remove / year edit (operate on lvl.careerHistory directly) ─────────

function removeCareerTeam(lvl, levelIndex, slotIndex) {
  setActiveLevel(levelIndex);
  const list = Array.isArray(lvl?.careerHistory) ? lvl.careerHistory : null;
  const i = Number(slotIndex);
  if (!list || !Number.isInteger(i) || i < 0 || i >= list.length) return;
  list.splice(i, 1);
  lvl.careerClubsCount = list.length;
  lvl.careerPlayerSaved = false;
  markPrepDirty();
  refreshLevelSection(levelIndex);
}

function editCareerYear(lvl, levelIndex, slotIndex, yearValEl) {
  setActiveLevel(levelIndex);
  const list = Array.isArray(lvl?.careerHistory) ? lvl.careerHistory : null;
  const row = list ? list[Number(slotIndex)] : null;
  if (!row) return;
  const next = window.prompt("Enter the year for this club (e.g. 2018):", String(row.year || "").trim());
  if (next === null) return;
  row.year = String(next).trim();
  if (yearValEl) yearValEl.textContent = row.year || "—";
  markLevelUnsaved(levelIndex);
  markPrepDirty();
}

/** Custom crest URL for a freshly-inserted team (matches the runner's resolver). */
function insertTeamCustomImage(team) {
  if (!team) return "";
  if (team.country && team.league) {
    return projectAssetUrl(`Images/Teams/${team.country}/${team.league}/${team.name}.png`);
  }
  if (team.region) {
    return projectAssetUrl(`Images/Nationality/${team.region}/${team.name}.png`);
  }
  return "";
}

/** ALL teams from the loaded JSON index (clubs + national teams), deduped + sorted. */
function careerAllTeamList() {
  const clubs = Array.isArray(appState.teamsIndex?.clubs) ? appState.teamsIndex.clubs : [];
  const nats = Array.isArray(appState.teamsIndex?.nationalities) ? appState.teamsIndex.nationalities : [];
  const map = new Map();
  [...clubs, ...nats].forEach((team) => {
    const nm = String(team?.name || "").trim();
    if (!nm || isWithoutClub(nm)) return;
    const k = nm.toLowerCase();
    if (!map.has(k)) map.set(k, team);
  });
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Just the player's own transfer-history teams (matched to the index). */
function careerPlayerTeamList(lvl) {
  const hist = Array.isArray(lvl?.careerPlayer?.transfer_history) ? lvl.careerPlayer.transfer_history : [];
  if (!hist.length) return [];
  const byName = new Map(careerAllTeamList().map((t) => [String(t.name).toLowerCase(), t]));
  const seen = new Set();
  const out = [];
  hist.forEach((item) => {
    const nm = String(item?.club || "").trim();
    if (!nm || isWithoutClub(nm)) return;
    const k = nm.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(byName.get(k) || { name: nm });
  });
  return out;
}

/** + button → centered picker of teams from the JSON; inserts at `insertRawIndex`. */
function openAddTeamPicker(lvl, levelIndex, insertRawIndex) {
  setActiveLevel(levelIndex);
  document.getElementById("prep-add-team-picker")?.remove();

  const playerTeams = careerPlayerTeamList(lvl);
  const allTeams = careerAllTeamList();
  let mode = playerTeams.length ? "player" : "all";

  const backdrop = document.createElement("div");
  backdrop.id = "prep-add-team-picker";
  backdrop.className = "prep-add-team-backdrop";
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });

  const modal = document.createElement("div");
  modal.className = "prep-add-team-modal";

  const head = document.createElement("div");
  head.className = "prep-add-team-head";
  const title = document.createElement("div");
  title.className = "prep-add-team-title";
  title.textContent = "Add a team";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "prep-add-team-close";
  closeBtn.textContent = "Close";
  closeBtn.onclick = () => backdrop.remove();
  head.append(title, closeBtn);

  const modeBtn = document.createElement("button");
  modeBtn.type = "button";
  modeBtn.className = "prep-add-team-mode";

  const search = document.createElement("input");
  search.type = "text";
  search.className = "prep-add-team-search";
  search.placeholder = "Search team name…";
  search.autocomplete = "off";

  const listEl = document.createElement("div");
  listEl.className = "prep-add-team-list";

  const commit = (team) => {
    if (!Array.isArray(lvl.careerHistory)) lvl.careerHistory = [];
    const list = lvl.careerHistory;
    const item = { club: team.name, year: "" };
    const img = insertTeamCustomImage(team);
    if (img) item.customImage = img;
    const at = Math.min(Math.max(0, Number(insertRawIndex)), list.length);
    list.splice(at, 0, item);
    lvl.careerClubsCount = list.length;
    backdrop.remove();
    lvl.careerPlayerSaved = false;
    markPrepDirty();
    refreshLevelSection(levelIndex);
  };

  const draw = () => {
    listEl.innerHTML = "";
    const isAll = mode === "all";
    modeBtn.textContent = isAll ? "Showing: ALL teams — click for player's teams" : "Showing: player's teams — click for ALL teams";
    const q = String(search.value || "").toLowerCase().trim();
    const source = isAll ? allTeams : playerTeams;
    const filtered = isAll
      ? source.filter((t) => String(t.name).toLowerCase().includes(q)).slice(0, 120)
      : source;
    if (!filtered.length) {
      const hint = document.createElement("div");
      hint.className = "prep-add-team-empty";
      hint.textContent = isAll ? "No teams found." : "Player JSON has no teams — switch to ALL.";
      listEl.appendChild(hint);
      return;
    }
    filtered.forEach((team) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prep-add-team-item";
      b.textContent = team.name;
      b.addEventListener("click", () => commit(team));
      listEl.appendChild(b);
    });
  };

  modeBtn.addEventListener("click", () => {
    if (!playerTeams.length) { mode = "all"; }
    else { mode = mode === "all" ? "player" : "all"; }
    search.parentElement && (search.style.display = mode === "all" ? "" : "none");
    draw();
  });
  search.addEventListener("input", draw);

  modal.append(head, modeBtn, search, listEl);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  search.style.display = mode === "all" ? "" : "none";
  draw();
  if (mode === "all") search.focus();
}

/** Best target rel-path for a club crest (matches renderCareer's logic). */
function crestTargetRelPath(entry) {
  const urls = resolveCareerClubLogoUrls(entry.club, null);
  // First indexed-league URL (Images/Teams/<country>/<league>/<name>.png) or
  // the Other Teams fallback — strip the cache-bust query.
  for (const u of urls) {
    const rel = relFromAssetUrl(u);
    if (rel && rel.startsWith("Images/Teams/")) return rel;
  }
  const safe = String(entry.club || "").replace(/[<>:"/\\|?*-]+/g, "").trim();
  return safe ? `Images/Teams/(1) Other Teams/${safe}.png` : "";
}

/** Recover the repo-relative path from a projectAsset URL. */
function relFromAssetUrl(url) {
  const base = projectAssetUrl("");
  let u = String(url || "");
  const qIdx = u.indexOf("?");
  if (qIdx >= 0) u = u.slice(0, qIdx);
  if (base && u.startsWith(base)) u = u.slice(base.length);
  try {
    u = decodeURIComponent(u);
  } catch {
    /* keep */
  }
  return u.replace(/^\/+/, "");
}

/**
 * Tiny 2-option chooser shown next to the LOGO button. Resolves to
 * "page" (football-logos.cc), "image" (direct image URL), or null (dismissed).
 * Inline-styled so it needs no CSS and stays consistent across runners.
 */
function chooseLogoSource(anchorBtn) {
  return new Promise((resolve) => {
    document.getElementById("prep-logo-source-pop")?.remove();
    const pop = document.createElement("div");
    pop.id = "prep-logo-source-pop";
    pop.style.cssText =
      "position:fixed;z-index:100200;background:#1b1f2a;border:1px solid #3a4256;" +
      "border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.55);min-width:210px;";
    const mkBtn = (label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "appearance:none;border:1px solid #4a5470;background:#262c3b;color:#eef1f8;" +
        "font:600 13px/1.2 system-ui,sans-serif;padding:9px 10px;border-radius:8px;" +
        "cursor:pointer;text-align:left;";
      b.addEventListener("mouseenter", () => { b.style.background = "#323a4e"; });
      b.addEventListener("mouseleave", () => { b.style.background = "#262c3b"; });
      return b;
    };
    const pageBtn = mkBtn("football-logos.cc (3000px)");
    const urlBtn = mkBtn("Image URL");
    pop.append(pageBtn, urlBtn);

    let done = false;
    const cleanup = (val) => {
      if (done) return;
      done = true;
      document.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("resize", onDismiss, true);
      pop.remove();
      resolve(val);
    };
    const onOutside = (ev) => {
      if (!pop.contains(ev.target)) cleanup(null);
    };
    const onDismiss = () => cleanup(null);
    pageBtn.addEventListener("click", (ev) => { ev.stopPropagation(); cleanup("page"); });
    urlBtn.addEventListener("click", (ev) => { ev.stopPropagation(); cleanup("image"); });

    document.body.appendChild(pop);
    // Position near the anchor button (clamped to the viewport).
    const r = anchorBtn?.getBoundingClientRect?.() || { left: 20, bottom: 20 };
    const pw = pop.offsetWidth || 210;
    const ph = pop.offsetHeight || 90;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${Math.max(8, top)}px`;

    setTimeout(() => {
      document.addEventListener("mousedown", onOutside, true);
      window.addEventListener("resize", onDismiss, true);
    }, 0);
  });
}

async function fetchCrestLogo(lvl, levelIndex, entry, box, img, imgWrap, btn) {
  if (!serverActive()) {
    window.alert("Run via run_site.py so the local server can fetch crests.");
    return;
  }
  setActiveLevel(levelIndex);
  // Two ways to set the crest: a football-logos.cc page (3000×3000 PNG) or a
  // direct image URL (downloaded verbatim). Pick via a tiny inline popup.
  const choice = await chooseLogoSource(btn);
  if (!choice) return;
  const targetRel = crestTargetRelPath(entry);
  const payload = {
    teamName: entry.club,
    currentSquadName: entry.club,
    countryHint: "",
    leagueHint: "",
    targetRelativePath: targetRel,
  };
  if (choice === "page") {
    const pasted = window.prompt(
      `Paste a football-logos.cc URL for "${entry.club}"\n` +
        "(e.g. https://football-logos.cc/uae/al-ain/ — downloads the 3000×3000 PNG).\n" +
        "Browse: https://football-logos.cc/collections/   ·   Leave empty to cancel.",
      "",
    );
    const pageUrl = String(pasted || "").trim();
    if (!pageUrl) return;
    payload.pageUrl = pageUrl;
  } else {
    const pasted = window.prompt(
      `Paste a direct image URL for "${entry.club}"\n` +
        "(https://… .png/.jpg/.webp). Leave empty to cancel.",
      "",
    );
    const imageUrl = String(pasted || "").trim();
    if (!imageUrl) return;
    payload.imageUrl = imageUrl;
  }
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const res = await fetch(TEAM_LOGO_FETCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.relativePath) {
      throw new Error(data?.error || "Could not download crest from that URL.");
    }
    const rel = String(data.relativePath);
    // CACHE GOTCHA: bump BEFORE re-pointing the img so the just-downloaded file
    // isn't masked by the dev server's max-age cached 404.
    bumpProjectAssetCacheBust();
    const fresh = projectAssetUrlFresh(rel);
    const dlUrl = `${fresh}${fresh.includes("?") ? "&" : "?"}logoDl=${Date.now()}`;
    // Persist on the level row so the save + video pick it up.
    const row = Array.isArray(lvl?.careerHistory) ? lvl.careerHistory[entry.slotIndex] : null;
    if (row) row.customImage = dlUrl;
    // Repaint the crest box.
    box.querySelector(".prep-crest-missing")?.remove();
    if (!img.isConnected) imgWrap.appendChild(img);
    img.onerror = null;
    img.src = dlUrl;
    markLevelUnsaved(levelIndex);
    markPrepDirty();
  } catch (err) {
    window.alert(err?.message || "Could not fetch crest.");
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function deleteCrestLogo(lvl, levelIndex, entry, box, img, imgWrap, btn) {
  if (!serverActive()) {
    window.alert("Run via run_site.py so the local server can delete crests.");
    return;
  }
  setActiveLevel(levelIndex);
  const targetRel = crestTargetRelPath(entry);
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const res = await fetch(TEAM_LOGO_DELETE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relativePath: targetRel, teamName: entry.club, currentSquadName: entry.club }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not delete crest.");
    const row = Array.isArray(lvl?.careerHistory) ? lvl.careerHistory[entry.slotIndex] : null;
    if (row) delete row.customImage;
    bumpProjectAssetCacheBust();
    // Show the missing copy-box.
    showMissingCrest(imgWrap, entry.club);
    img.remove();
    markLevelUnsaved(levelIndex);
    markPrepDirty();
  } catch (err) {
    window.alert(err?.message || "Could not delete crest.");
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FAITHFUL REMOTION FRAME PREVIEW — a 1:1 replica of the video's level layout,
// scaled into a 16:9 box. Every number/colour below is COPIED VERBATIM from
// ___Remotion___/3_…_Remotion/src/scenes/Level.tsx so the prep panel shows
// EXACTLY what renders: the career-path crest ROW (frosted glass cards + arrow
// discs + year labels), the bottom-anchored player (silhouette for the QUESTION,
// colour photo for the ANSWER), the gold/white name banner (answer), and the
// level badge + timer. The stage is a fixed 1920×1080 div; a ResizeObserver
// scales it to the box width. STATIC — both end states only (no animation).
// ════════════════════════════════════════════════════════════════════════════
const FRAME_W = 1920;
const FRAME_H = 1080;
const ACCENT = "#ffca28"; // COLORS.accent
const WHITE = "#ffffff";

const setStyle = (el, s) => { Object.assign(el.style, s); return el; };
const mkDiv = (s) => setStyle(document.createElement("div"), s || {});

// Career-row sizing — verbatim from Level.tsx.
const CAREER_AVAIL_W = 1740;
const ARROW_FACTOR = 0.42;
const GAP_FACTOR = 0.1;
function careerCrestSize(n) {
  const jointW = ARROW_FACTOR + 2 * GAP_FACTOR;
  return Math.max(78, Math.min(300, CAREER_AVAIL_W / (n + (n - 1) * jointW)));
}

// Player portrait — bottom-anchored, scaled to a FIXED height (PLAYER_H) like the
// video (height:100% width:auto contain, center bottom). Question = theme-tinted
// black silhouette + glow; Answer = colour photo with a soft drop-shadow.
const PLAYER_H = 1044;
const SIL_GLOW = "120, 170, 230"; // cool-blue glow (silhouetteColorsFor at a generic theme)
const SIL_FILTER =
  `brightness(0) saturate(0) drop-shadow(0 0 5px rgba(${SIL_GLOW},0.55)) drop-shadow(0 0 16px rgba(${SIL_GLOW},0.42))`;
const COLOR_FILTER = "drop-shadow(0 -2px 26px rgba(0,0,0,0.45))";

/** Set a crest <img> from a fallback chain; on total failure show a "?" glyph
 *  (matches CrestCard's "?" placeholder). */
function previewCrestImage(holder, urls, size) {
  const chain = (urls || []).slice();
  const img = setStyle(document.createElement("img"), {
    position: "relative", maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
    filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.3))",
  });
  img.alt = "";
  let i = 0;
  const tryNext = () => {
    if (i >= chain.length) {
      img.remove();
      const q = setStyle(document.createElement("div"), {
        position: "relative", fontFamily: "'Barlow Condensed', system-ui, sans-serif",
        fontWeight: "800", fontSize: `${Math.floor(size * 0.34)}px`, color: "rgba(255,255,255,0.55)",
      });
      q.textContent = "?";
      holder.appendChild(q);
      return;
    }
    img.src = chain[i++];
  };
  img.onerror = tryNext;
  holder.appendChild(img);
  tryNext();
}

/** One crest card (frosted glass + year label) — replicates Level.tsx <CrestCard>. */
function previewCrestCard(entry, size) {
  const card = mkDiv({
    flex: "0 0 auto", width: `${size}px`, display: "flex", flexDirection: "column",
    alignItems: "center", gap: `${size * 0.11}px`,
  });
  const glass = mkDiv({
    position: "relative", width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.2}px`,
    background: "rgba(255,255,255,0.15)",
    backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)",
    border: "1.5px solid rgba(255,255,255,0.45)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: `${size * 0.07}px`, overflow: "hidden",
  });
  previewCrestImage(glass, resolveCareerClubLogoUrls(entry.club, entry.customImage), size);
  card.appendChild(glass);
  if (entry.year) {
    const yr = setStyle(document.createElement("div"), {
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: "800",
      fontSize: `${Math.max(20, size * 0.21)}px`, color: WHITE, letterSpacing: "0.03em",
      whiteSpace: "nowrap", textShadow: "0 3px 10px rgba(0,0,0,0.75), 0 1px 0 rgba(0,0,0,0.5)",
    });
    yr.textContent = entry.year;
    card.appendChild(yr);
  }
  return card;
}

/** Arrow disc between two crests — replicates Level.tsx <ArrowDisc>. */
function previewArrowDisc(size) {
  const d = size * 0.34;
  const wrap = mkDiv({
    width: `${size * ARROW_FACTOR}px`, height: `${size}px`, display: "flex",
    alignItems: "center", justifyContent: "center", flex: "0 0 auto",
  });
  const disc = mkDiv({
    width: `${d}px`, height: `${d}px`, borderRadius: "50%",
    background: "radial-gradient(circle at 50% 34%, #1a2430 0%, #0a1119 100%)",
    border: "2px solid rgba(255,255,255,0.16)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
    display: "flex", alignItems: "center", justifyContent: "center",
  });
  disc.innerHTML =
    `<svg width="${d * 0.5}" height="${d * 0.5}" viewBox="0 0 24 24" style="overflow:visible">` +
    `<polyline points="8,5 16,12 8,19" fill="none" stroke="${ACCENT}" stroke-width="3.4" ` +
    `stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px rgba(255,202,40,0.4))"></polyline>` +
    "</svg>";
  wrap.appendChild(disc);
  return wrap;
}

/** The whole career-path crest ROW (Level.tsx <CareerRow>). */
function previewCareerRow(entries) {
  const n = entries.length;
  const row = mkDiv({
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    maxWidth: `${CAREER_AVAIL_W}px`,
  });
  if (!n) return row;
  const size = careerCrestSize(n);
  row.style.gap = `${size * GAP_FACTOR}px`;
  entries.forEach((entry, i) => {
    row.appendChild(previewCrestCard(entry, size));
    if (i < n - 1) row.appendChild(previewArrowDisc(size));
  });
  return row;
}

/** Level badge disc (Level.tsx <LevelBadge>) — static. */
function previewLevelBadge(n) {
  const wrap = mkDiv({ position: "absolute", top: "34px", left: "40px", zIndex: "40" });
  const disc = setStyle(document.createElement("div"), {
    width: "156px", height: "156px", borderRadius: "50%",
    background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
    border: "7px solid rgba(255,255,255,0.94)",
    boxShadow: "0 18px 38px rgba(0,0,0,0.55), inset 0 -8px 18px rgba(0,0,0,0.18)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "93px",
    lineHeight: "1", color: "#241500", textShadow: "0 2px 0 rgba(255,255,255,0.25)",
  });
  disc.textContent = String(n);
  wrap.appendChild(disc);
  return wrap;
}

/** Timer disc (Level.tsx <Timer>) — static; `secs` is the number shown. */
function previewTimer(secs) {
  const wrap = mkDiv({ position: "absolute", top: "34px", right: "40px", width: "162px", height: "162px", zIndex: "40" });
  wrap.innerHTML =
    '<svg width="162" height="162" style="display:block;filter:drop-shadow(0 14px 28px rgba(0,0,0,0.5))">' +
    '<circle cx="81" cy="81" r="66" fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" stroke-width="14"></circle>' +
    `<circle cx="81" cy="81" r="66" fill="none" stroke="${ACCENT}" stroke-width="14" stroke-linecap="round" transform="rotate(-90 81 81)"></circle>` +
    "</svg>";
  const num = setStyle(document.createElement("div"), {
    position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontWeight: "800", fontSize: "72px",
    color: WHITE, textShadow: "0 2px 6px rgba(0,0,0,0.6)",
  });
  num.textContent = String(secs == null ? 3 : secs);
  wrap.appendChild(num);
  return wrap;
}

/** Name banner (Level.tsx <NameReveal>) — white first name(s) + gold surname, static. */
function previewNameBanner(lvl) {
  const name = (displayPlayerNameFor(lvl) || playerNameFor(lvl) || "").trim().toUpperCase();
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return mkDiv({ display: "none" });
  const firstPart = words.slice(0, -1).join(" ");
  const lastWord = words[words.length - 1] || "";
  const wrap = mkDiv({
    position: "absolute", left: "0", right: "0", bottom: "6%",
    display: "flex", flexDirection: "column", alignItems: "center", zIndex: "30",
  });
  if (firstPart) {
    const first = setStyle(document.createElement("div"), {
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: "700", fontSize: "64px",
      lineHeight: "0.95", letterSpacing: "0.16em", color: WHITE,
      textShadow: "0 4px 18px rgba(0,0,0,0.85)", whiteSpace: "nowrap",
    });
    first.textContent = firstPart;
    wrap.appendChild(first);
  }
  const last = setStyle(document.createElement("div"), {
    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: "900", fontSize: "150px",
    lineHeight: "0.86", letterSpacing: "0.01em", color: ACCENT,
    textShadow: "0 6px 26px rgba(0,0,0,0.9), 0 0 22px rgba(255,202,40,0.35)", whiteSpace: "nowrap",
  });
  last.textContent = lastWord;
  wrap.appendChild(last);
  return wrap;
}

/** Bottom-anchored player (Level.tsx <PlayerPortrait>): a silhouette for the
 *  QUESTION, the colour photo for the ANSWER. zIndex 12 (behind row) for the
 *  question, 26 (in front) for the answer — matching the video's z-flip. */
function previewPlayer(lvl, state) {
  const answer = state === "answer";
  const container = mkDiv({
    position: "absolute", left: "0", right: "0", bottom: "0", height: `${PLAYER_H}px`,
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    zIndex: answer ? "26" : "12",
  });
  // ground shadow (anchors the player to the floor)
  container.appendChild(mkDiv({
    position: "absolute", bottom: "1.5%", left: "50%", transform: "translateX(-50%)",
    width: "760px", height: "120px", borderRadius: "50%",
    background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 72%)",
    filter: "blur(6px)",
  }));
  // soft backlight behind (question state only — fades out on reveal)
  if (!answer) {
    container.appendChild(mkDiv({
      position: "absolute", bottom: "6%", left: "50%", transform: "translateX(-50%)",
      width: "720px", height: "880px", borderRadius: "50%",
      background: `radial-gradient(ellipse 50% 55% at 50% 42%, rgba(${SIL_GLOW},0.5) 0%, rgba(${SIL_GLOW},0.24) 38%, rgba(${SIL_GLOW},0.08) 60%, rgba(${SIL_GLOW},0) 75%)`,
      filter: "blur(14px)",
    }));
  }

  const holder = mkDiv({ position: "relative", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" });
  const img = setStyle(document.createElement("img"), {
    height: "100%", width: "auto", objectFit: "contain", objectPosition: "center bottom", display: "block",
    filter: answer ? COLOR_FILTER : SIL_FILTER,
  });
  img.alt = "";
  const showQ = () => {
    img.remove();
    if (holder.querySelector(".prep-frame-q")) return;
    const q = setStyle(document.createElement("div"), {
      height: "92%", display: "flex", alignItems: "flex-end", justifyContent: "center",
    });
    q.className = "prep-frame-q";
    q.innerHTML =
      `<svg viewBox="0 0 200 280" style="height:100%;width:auto;filter:drop-shadow(0 0 24px rgba(${SIL_GLOW},0.3))">` +
      `<path fill="rgba(${SIL_GLOW},0.18)" d="M100 18c26 0 46 21 46 49 0 20-10 37-26 46 30 9 52 30 60 60 5 18 8 41 9 69H11c1-28 4-51 9-69 8-30 30-51 60-60-16-9-26-26-26-46 0-28 20-49 46-49z"></path>` +
      "</svg>";
    holder.appendChild(q);
  };
  img.onerror = showQ;
  holder.appendChild(img);
  container.appendChild(holder);

  const playerName = playerNameFor(lvl);
  const clubName = careerReadyPhotoClubName(lvl);
  const variant = Math.max(1, Math.floor(Number(lvl?.careerReadyPhotoVariantIndex) || 1));
  if (playerName) {
    resolveCareerPlayerPhotoUrlForPrep(playerName, clubName, variant)
      .then((url) => { if (url) img.src = url; else showQ(); })
      .catch(showQ);
  } else {
    showQ();
  }
  return container;
}

// One shared observer keeps every preview stage scaled to its box width.
let prepFrameRO = null;
function scalePrepFrame(frameEl) {
  const stage = frameEl.querySelector(".prep-frame__stage");
  if (!stage) return;
  const w = frameEl.clientWidth;
  if (!w) return;
  stage.style.transform = `scale(${w / FRAME_W})`;
}
function observePrepFrame(frameEl) {
  if (typeof ResizeObserver === "undefined") { scalePrepFrame(frameEl); return; }
  if (!prepFrameRO) {
    prepFrameRO = new ResizeObserver((entries) => { for (const e of entries) scalePrepFrame(e.target); });
  }
  prepFrameRO.observe(frameEl);
  scalePrepFrame(frameEl);
}

/** The faithful 16:9 video-frame preview for one level. state = "question" (hidden
 *  silhouette, crest row sharp, timer ticking) or "answer" (revealed colour player
 *  + gold name banner, crest row dimmed/blurred behind). Both are STATIC. */
function buildRemotionFramePreview(lvl, levelIndex, ordinal, state) {
  const answer = state === "answer";

  const frame = document.createElement("div");
  frame.className = "prep-frame";
  const stage = document.createElement("div");
  stage.className = "prep-frame__stage";

  // soft vignette so the row/player read on any (here, neutral dark) background
  stage.appendChild(mkDiv({
    position: "absolute", inset: "0",
    background: "radial-gradient(ellipse 60% 70% at 50% 64%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0) 72%)",
  }));

  // ── player (silhouette for question, colour for answer) ──
  stage.appendChild(previewPlayer(lvl, answer ? "answer" : "question"));

  // ── career-path crest ROW (top:52%, zIndex 20). On answer it stays VISIBLE but
  //    dims to 0.5 + blur(13px) + scale(0.97), behind the revealed player. ──
  const rowWrap = mkDiv({
    position: "absolute", left: "0", right: "0", top: "52%",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: "20",
  });
  if (answer) {
    rowWrap.style.opacity = "0.5";
    rowWrap.style.filter = "blur(13px)";
    rowWrap.style.transform = "scale(0.97)";
  }
  rowWrap.appendChild(previewCareerRow(displayedCareer(lvl)));
  stage.appendChild(rowWrap);

  // ── name banner (answer only) ──
  if (answer) stage.appendChild(previewNameBanner(lvl));

  // ── badge + timer (answer shows 0, question shows a mid countdown) ──
  stage.appendChild(previewLevelBadge(ordinal || 1));
  stage.appendChild(previewTimer(answer ? 0 : 3));

  frame.appendChild(stage);
  requestAnimationFrame(() => observePrepFrame(frame));
  return frame;
}

// ════════════════════════════════════════════════════════════════════════════
// 3-TAB level view: Assets · Questions · Answer.
// ════════════════════════════════════════════════════════════════════════════

/** A small framed "asset" card with a title + content (image/text). */
function buildAssetCard(title, contentEl) {
  const card = document.createElement("div");
  card.className = "prep-asset-card";
  const t = document.createElement("div");
  t.className = "prep-asset-card__title";
  t.textContent = title;
  const body = document.createElement("div");
  body.className = "prep-asset-card__body";
  if (contentEl) body.appendChild(contentEl); else body.textContent = "—";
  card.append(t, body);
  return card;
}

/** ASSETS tab — the EXISTING editable per-level content (player photo box + the
 *  editable career-path crest editor) PLUS a flag asset + a small Data card. */
function buildAssetsPane(lvl, levelIndex) {
  const pane = document.createElement("div");
  pane.className = "prep-assets";
  const player = lvl?.careerPlayer || null;

  // Top row: player box + flag + data — centred, all the SAME height.
  const top = document.createElement("div");
  top.className = "prep-assets-row";

  top.appendChild(buildPlayerBoxes(lvl, levelIndex));

  // Flag card — nationality name ABOVE the flag (Data box removed).
  const flagUrl = resolvePlayerStatsNationalityFlagUrl(player?.nationality);
  const flagWrap = document.createElement("div");
  flagWrap.className = "prep-flag-with-nat";
  const natLabel = document.createElement("div");
  natLabel.className = "prep-flag-nat";
  natLabel.textContent = player?.nationality || "—";
  flagWrap.appendChild(natLabel);
  if (flagUrl) {
    const fImg = document.createElement("img");
    fImg.className = "prep-asset-flag";
    fImg.alt = "";
    fImg.src = flagUrl;
    flagWrap.appendChild(fImg);
  }
  top.appendChild(buildAssetCard("Flag", flagWrap));

  pane.appendChild(top);

  // The EXISTING editable career path (crest editor + add/remove/year/logo).
  const career = document.createElement("div");
  career.className = "prep-assets-career";
  const careerTitle = document.createElement("div");
  careerTitle.className = "prep-assets-career-title";
  careerTitle.textContent = "Career path — edit";
  career.append(careerTitle, buildCareerPath(lvl, levelIndex));
  pane.appendChild(career);

  return pane;
}

// ── GLOBAL view switch (ONE bar at the top controls ALL levels) ──────────────
// Every level renders all three panes (Assets/Questions/Answer); only the panes
// matching `prepView` are shown. The single top bar flips `prepView` for every
// level at once.
const PREP_VIEWS = [
  { view: "assets", label: "Assets" },
  { view: "questions", label: "Questions" },
  { view: "answer", label: "Answer" },
];
let prepView = "assets";

/** Show only the panes for the active view across EVERY level + sync the bar. */
function applyPrepView() {
  if (!root) return;
  root.querySelectorAll(".prep-pane").forEach((p) => {
    p.hidden = p.dataset.view !== prepView;
  });
  root.querySelectorAll(".prep-globaltab").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.view === prepView);
  });
}

/** The single top tab bar (built once per render, at the top of #prep-root). */
function buildGlobalTabBar() {
  const bar = document.createElement("div");
  bar.className = "prep-globaltabbar";
  for (const { view, label } of PREP_VIEWS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prep-globaltab";
    btn.dataset.view = view;
    btn.textContent = label;
    if (view === prepView) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      prepView = view;
      applyPrepView();
    });
    bar.appendChild(btn);
  }
  return bar;
}

/** The per-level body = the 3 panes (no bar). Visibility follows the global view. */
function buildLevelView(lvl, levelIndex, ordinal) {
  const bodyEl = document.createElement("div");
  bodyEl.className = "prep-tabbody";
  const panes = [
    { view: "assets", el: buildAssetsPane(lvl, levelIndex) },
    { view: "questions", el: buildRemotionFramePreview(lvl, levelIndex, ordinal, "question") },
    { view: "answer", el: buildRemotionFramePreview(lvl, levelIndex, ordinal, "answer") },
  ];
  for (const p of panes) {
    const pane = document.createElement("div");
    pane.className = "prep-pane";
    pane.dataset.view = p.view;
    pane.hidden = p.view !== prepView;
    pane.appendChild(p.el);
    bodyEl.appendChild(pane);
  }
  return bodyEl;
}

function buildCareerPath(lvl, levelIndex) {
  const wrap = document.createElement("div");
  wrap.className = "prep-career-path";
  const entries = displayedCareer(lvl);

  // A "+" that opens the team picker, inserting at a raw careerHistory index.
  const plus = (rawIndex) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "prep-career-plus";
    b.textContent = "+";
    b.title = "Add a team here";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      openAddTeamPicker(lvl, levelIndex, rawIndex);
    });
    return b;
  };

  // + before the first team.
  wrap.appendChild(plus(entries.length ? entries[0].slotIndex : 0));

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "prep-career-empty";
    empty.textContent = "No career clubs — use + to add teams.";
    wrap.appendChild(empty);
    wrap.appendChild(plus(0));
    return wrap;
  }

  entries.forEach((entry, i) => {
    wrap.appendChild(buildCrestBox(lvl, levelIndex, entry));
    if (i < entries.length - 1) {
      // Connector between teams: arrow + a "+" to insert here.
      const conn = document.createElement("div");
      conn.className = "prep-career-conn";
      const arrow = document.createElement("div");
      arrow.className = "prep-career-arrow";
      arrow.textContent = "→";
      conn.append(arrow, plus(entry.slotIndex + 1));
      wrap.appendChild(conn);
    }
  });

  // + after the last team.
  wrap.appendChild(plus(entries[entries.length - 1].slotIndex + 1));
  return wrap;
}

// ── player boxes (RIGHT): Hidden silhouette + Revealed photo + name ──────────

function buildPlayerBoxes(lvl, levelIndex) {
  const wrap = document.createElement("div");
  wrap.className = "prep-player-boxes";

  const playerName = playerNameFor(lvl);
  const clubName = careerReadyPhotoClubName(lvl);
  const variant = Math.max(1, Math.floor(Number(lvl?.careerReadyPhotoVariantIndex) || 1));

  // Revealed (photo + name) box — the only player box; it previews the player
  // exactly as the Remotion full-screen render does (16:9 frame, bottom-anchored).
  const revealBox = document.createElement("div");
  revealBox.className = "prep-player-box prep-player-box--reveal";
  const revealTitle = document.createElement("div");
  revealTitle.className = "prep-player-box__title";
  revealTitle.textContent = "Revealed";
  const revealImgWrap = document.createElement("div");
  revealImgWrap.className = "prep-player-img-wrap";
  const revealImg = document.createElement("img");
  revealImg.className = "prep-player-img prep-player-img--reveal";
  revealImg.alt = "";
  revealImgWrap.appendChild(revealImg);
  revealBox.append(revealTitle, revealImgWrap);
  // (Player name under the Revealed box removed per request.)

  // Resolve the photo for the reveal box.
  const applyPhoto = (url) => {
    const missing = !url;
    revealImgWrap.classList.toggle("prep-player-img-wrap--missing", missing);
    if (missing) {
      revealImg.removeAttribute("src");
      return;
    }
    revealImg.src = url;
  };
  if (playerName) {
    resolveCareerPlayerPhotoUrlForPrep(playerName, clubName, variant)
      .then(applyPhoto)
      .catch(() => applyPhoto(""));
  } else {
    applyPhoto("");
  }

  // Controls: PHOTO · X · ✎ name
  const ctrls = document.createElement("div");
  ctrls.className = "prep-player-controls";

  const photoBtn = document.createElement("button");
  photoBtn.type = "button";
  photoBtn.className = "prep-player-btn prep-player-btn--photo";
  photoBtn.textContent = "PHOTO";
  photoBtn.title = "Paste a portrait image URL to download as the player's Ready photo.";
  photoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void fetchPlayerPhoto(lvl, levelIndex, applyPhoto, photoBtn);
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "prep-player-btn prep-player-btn--del";
  delBtn.textContent = "✕";
  delBtn.title = "Remove the current Ready photo variant.";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void deletePlayerPhoto(lvl, levelIndex, applyPhoto, delBtn);
  });

  const rbBtn = document.createElement("button");
  rbBtn.type = "button";
  rbBtn.className = "prep-player-btn prep-player-btn--rb";
  rbBtn.textContent = "RB";
  rbBtn.title = "Remove the background of the current photo (best-quality model) and replace it.";
  rbBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void removeBgPhoto(lvl, levelIndex, applyPhoto, rbBtn);
  });

  // No ✎ NAME button here — runners 3 & 4 always show the FULL real name; the
  // rename/override feature is scoped to the lineup runners 1 & 2.
  ctrls.append(photoBtn, delBtn, rbBtn);

  // Photo controls go INSIDE the reveal box (at the bottom) so the box is one
  // complete unit, the same height as the Flag box.
  ctrls.classList.add("prep-player-box__ctrls");
  revealBox.append(ctrls);

  const boxesRow = document.createElement("div");
  boxesRow.className = "prep-player-boxes-row";
  boxesRow.append(revealBox);

  wrap.append(boxesRow);
  return wrap;
}

/** POST a chosen image URL to /__ready-photo/from-url, then bump the cache BEFORE
 *  re-resolving so the dev server's max-age-cached 404 can't mask the new file,
 *  re-point both <img>s, and mark the level dirty/unsaved. Throws on failure. */
async function saveReadyPhotoFromUrl(lvl, levelIndex, applyPhoto, playerName, clubName, imageUrl) {
  const res = await fetch(READY_PHOTO_FROM_URL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName, clubName: clubName ?? "", imageUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not download photo.");
  if (data.variantIndex != null) {
    const vi = Math.floor(Number(data.variantIndex));
    if (Number.isFinite(vi) && vi >= 1) lvl.careerReadyPhotoVariantIndex = vi;
  }
  // Cache MUST be bumped before re-resolving (a stale 404 with max-age masks the new file).
  bumpProjectAssetCacheBust();
  const variant = Math.max(1, Math.floor(Number(lvl?.careerReadyPhotoVariantIndex) || 1));
  const url = await resolveCareerPlayerPhotoUrlForPrep(playerName, clubName, variant);
  applyPhoto(url);
  markLevelUnsaved(levelIndex);
  markPrepDirty();
}

/** Ask the server for Champions League (uefa) / Sorare (sorare) candidate photos
 *  for a player name. Returns [{ url, dataUrl }]; never throws (UI shows status). */
async function requestPhotoSearchCandidates(playerName, source) {
  const res = await fetch(READY_PHOTO_SEARCH_CANDIDATES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName, source }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Search failed.");
  return Array.isArray(data.candidates) ? data.candidates : [];
}

function fetchPlayerPhoto(lvl, levelIndex, applyPhoto, btn) {
  if (!serverActive()) {
    window.alert("Run via run_site.py so the local server can save Ready photos.");
    return;
  }
  setActiveLevel(levelIndex);
  const playerName = playerNameFor(lvl);
  if (!playerName) {
    window.alert("This level has no player.");
    return;
  }
  const clubName = careerReadyPhotoClubName(lvl);
  openPhotoPickerModal(lvl, levelIndex, applyPhoto, playerName, clubName);
}

/** Centered modal: three sources — Champions League (UEFA), Sorare, Paste URL.
 *  CL/Sorare search by player name and render clickable candidate thumbnails;
 *  clicking one (or pasting a URL) saves it via /__ready-photo/from-url. */
function openPhotoPickerModal(lvl, levelIndex, applyPhoto, playerName, clubName) {
  const backdrop = document.createElement("div");
  backdrop.className = "prep-add-team-backdrop prep-photo-pick-backdrop";

  const modal = document.createElement("div");
  modal.className = "prep-add-team-modal prep-photo-pick-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const head = document.createElement("div");
  head.className = "prep-add-team-head";
  const title = document.createElement("div");
  title.className = "prep-add-team-title";
  title.textContent = "Add player photo";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "prep-add-team-close";
  closeBtn.textContent = "✕";
  head.append(title, closeBtn);

  const sub = document.createElement("div");
  sub.className = "prep-photo-pick-sub";
  sub.textContent = playerName;

  const srcRow = document.createElement("div");
  srcRow.className = "prep-photo-pick-sources";
  const btnUefa = document.createElement("button");
  btnUefa.type = "button";
  btnUefa.className = "prep-add-team-mode prep-photo-pick-source";
  btnUefa.textContent = "Champions League";
  const btnSorare = document.createElement("button");
  btnSorare.type = "button";
  btnSorare.className = "prep-add-team-mode prep-photo-pick-source";
  btnSorare.textContent = "Sorare";
  const btnUrl = document.createElement("button");
  btnUrl.type = "button";
  btnUrl.className = "prep-add-team-mode prep-photo-pick-source";
  btnUrl.textContent = "Paste URL";
  srcRow.append(btnUefa, btnSorare, btnUrl);

  const status = document.createElement("div");
  status.className = "prep-photo-pick-status";
  status.hidden = true;

  const list = document.createElement("div");
  list.className = "prep-photo-pick-list";

  modal.append(head, sub, srcRow, status, list);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
  };
  const onKey = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  modal.addEventListener("click", (e) => e.stopPropagation());
  closeBtn.addEventListener("click", close);

  const setBusy = (busy) => {
    [btnUefa, btnSorare, btnUrl].forEach((b) => (b.disabled = busy));
  };

  const renderCandidates = (candidates) => {
    list.innerHTML = "";
    if (!candidates.length) {
      status.hidden = false;
      status.textContent = "No photos found.";
      return;
    }
    status.hidden = true;
    candidates.forEach((c) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "prep-photo-pick-option";
      const img = document.createElement("img");
      img.className = "prep-photo-pick-option__img";
      img.alt = "";
      img.decoding = "async";
      img.src = c.dataUrl;
      opt.appendChild(img);
      opt.addEventListener("click", async () => {
        if (opt.disabled) return;
        const allOpts = list.querySelectorAll(".prep-photo-pick-option");
        allOpts.forEach((b) => (b.disabled = true));
        opt.classList.add("prep-photo-pick-option--current");
        status.hidden = true;
        try {
          await saveReadyPhotoFromUrl(lvl, levelIndex, applyPhoto, playerName, clubName, c.url);
          close();
        } catch (err) {
          status.hidden = false;
          status.textContent = err?.message || "Could not save photo.";
          allOpts.forEach((b) => (b.disabled = false));
          opt.classList.remove("prep-photo-pick-option--current");
        }
      });
      list.appendChild(opt);
    });
  };

  const loadSource = async (source) => {
    list.innerHTML = "";
    status.hidden = false;
    status.textContent = "Searching…";
    setBusy(true);
    try {
      const candidates = await requestPhotoSearchCandidates(playerName, source);
      renderCandidates(candidates);
    } catch (err) {
      status.hidden = false;
      status.textContent = err?.message || "Search failed.";
    } finally {
      setBusy(false);
    }
  };

  btnUefa.addEventListener("click", () => void loadSource("uefa"));
  btnSorare.addEventListener("click", () => void loadSource("sorare"));
  btnUrl.addEventListener("click", async () => {
    const imageUrl = String(window.prompt("Paste a portrait image URL (https://…):", "") || "").trim();
    if (!imageUrl) return;
    list.innerHTML = "";
    status.hidden = false;
    status.textContent = "Downloading…";
    setBusy(true);
    try {
      await saveReadyPhotoFromUrl(lvl, levelIndex, applyPhoto, playerName, clubName, imageUrl);
      close();
    } catch (err) {
      status.hidden = false;
      status.textContent = err?.message || "Could not download photo.";
      setBusy(false);
    }
  });
}

async function deletePlayerPhoto(lvl, levelIndex, applyPhoto, btn) {
  if (!serverActive()) {
    window.alert("Run via run_site.py so the local server can edit Ready photos.");
    return;
  }
  setActiveLevel(levelIndex);
  const playerName = playerNameFor(lvl);
  if (!playerName) return;
  const clubName = careerReadyPhotoClubName(lvl);
  const variant = Math.max(1, Math.floor(Number(lvl?.careerReadyPhotoVariantIndex) || 1));
  if (!window.confirm("Remove the current Ready photo for this player?")) return;
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const res = await fetch(READY_PHOTO_DELETE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, clubName: clubName ?? "", variantIndex: variant }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not remove photo.");
    bumpProjectAssetCacheBust();
    const url = await resolveCareerPlayerPhotoUrlForPrep(playerName, clubName, 1);
    if (url) lvl.careerReadyPhotoVariantIndex = 1;
    applyPhoto(url);
    markLevelUnsaved(levelIndex);
    markPrepDirty();
  } catch (err) {
    window.alert(err?.message || "Could not remove photo.");
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

/** RB — remove the background of the current photo (best-quality model on the
 *  server) and replace it in place. */
async function removeBgPhoto(lvl, levelIndex, applyPhoto, btn) {
  if (!serverActive()) {
    window.alert("Run via run_site.py so the local server can remove backgrounds.");
    return;
  }
  setActiveLevel(levelIndex);
  const playerName = playerNameFor(lvl);
  if (!playerName) {
    window.alert("This level has no player.");
    return;
  }
  const clubName = careerReadyPhotoClubName(lvl);
  const variant = Math.max(1, Math.floor(Number(lvl?.careerReadyPhotoVariantIndex) || 1));
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";

  // Re-resolve + repaint the photo with a fresh cache-bust. Picks up the new
  // transparent PNG the instant the server overwrites it (in place).
  const repaint = async () => {
    bumpProjectAssetCacheBust();
    const v = Math.max(1, Math.floor(Number(lvl?.careerReadyPhotoVariantIndex) || 1));
    const url = await resolveCareerPlayerPhotoUrlForPrep(playerName, clubName, v).catch(() => "");
    if (url) applyPhoto(url);
    return url;
  };

  // Background removal (BiRefNet) is SLOW on CPU — the long request's connection
  // can drop even though the server finishes + saves the file. So we ALSO poll
  // the photo while it runs: the moment the new file lands, the card switches —
  // no manual refresh, and a dropped connection is no longer a hard error.
  let finished = false;
  let pollTimer = null;
  const POLL_MS = [4000, 6000, 8000, 10000, 14000, 18000, 24000, 30000, 30000];
  let pollIdx = 0;
  const schedulePoll = () => {
    if (finished || pollIdx >= POLL_MS.length) return;
    pollTimer = setTimeout(async () => {
      if (finished) return;
      await repaint();
      schedulePoll();
    }, POLL_MS[pollIdx++]);
  };
  schedulePoll();

  try {
    const res = await fetch(READY_PHOTO_REMOVE_BG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, clubName: clubName ?? "", variantIndex: variant }),
    });
    const data = await res.json().catch(() => ({}));
    finished = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Background removal failed.");
    if (data.variantIndex != null) {
      const vi = Math.floor(Number(data.variantIndex));
      if (Number.isFinite(vi) && vi >= 1) lvl.careerReadyPhotoVariantIndex = vi;
    }
    await repaint();
    markLevelUnsaved(levelIndex);
    markPrepDirty();
  } catch (err) {
    finished = true;
    if (pollTimer) clearTimeout(pollTimer);
    const dropped =
      err instanceof TypeError || /failed to fetch|network|load failed/i.test(String(err?.message || ""));
    if (!dropped) {
      window.alert(err?.message || "Background removal failed.");
    } else {
      // Connection dropped mid-job — keep polling a while so the result still
      // appears, and don't scare the user with an error (it's still working).
      console.warn("[prep] RB request dropped; polling for the result…", err);
      for (const ms of [4000, 6000, 8000, 12000, 16000, 22000, 30000]) {
        await new Promise((r) => setTimeout(r, ms));
        await repaint();
      }
      markLevelUnsaved(levelIndex);
      markPrepDirty();
    }
  } finally {
    finished = true;
    if (pollTimer) clearTimeout(pollTimer);
    btn.disabled = false;
    btn.textContent = prev;
  }
}

function editPlayerName(lvl, levelIndex, nameEl) {
  setActiveLevel(levelIndex);
  const canonical = playerNameFor(lvl);
  if (!canonical) return;
  const current = displayPlayerNameFor(lvl);
  const next = window.prompt(
    "Enter a custom player name.\nLeave empty to reset to the original.\n\n" +
      "Saved PERMANENTLY (shared across runners + used by the rendered video).",
    current,
  );
  if (next === null) return;
  const clean = String(next).trim();
  setPlayerNameOverride(canonical, clean); // "" clears it
  nameEl.textContent = clean || canonical;
  // Reflect in the section head too.
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  lvl.careerPlayerSaved = false;
  if (sec) {
    sec.headEl.innerHTML = sectionHeadText(lvl, sections.indexOf(sec) + 1);
    sec.saveBtn = buildSavePlayerBtn(lvl, levelIndex);
    sec.headEl.appendChild(sec.saveBtn);
  }
  markPrepDirty();
}

// ── Save Player (validate + mark the level ready for PROD) ───────────────────

/** "" when the career path is OK to save; else a human reason. Requires: ≥2 clubs,
 *  every club has a loaded logo (no missing copy-box), every club has a year, and
 *  the years are ascending (equal years next to each other are allowed). */
function careerSaveValidationError(lvl, sectionEl) {
  const entries = displayedCareer(lvl);
  if (entries.length < 2) return "Add at least 2 clubs to the career path.";
  const boxes = sectionEl ? sectionEl.querySelectorAll(".prep-crest-box") : [];
  for (const box of boxes) {
    if (box.querySelector(".prep-crest-missing")) {
      const nm = box.querySelector(".prep-crest-label")?.textContent || "A club";
      return `"${nm}" has no logo — use its LOGO button first.`;
    }
  }
  let prev = -Infinity;
  for (const entry of entries) {
    const yStr = String(entry.year || "").trim();
    const y = parseInt(yStr, 10);
    if (!yStr || !Number.isFinite(y)) return `"${entry.club}" has no year — set a year for every club.`;
    if (y < prev) return `Years must go oldest → newest. "${entry.club}" (${yStr}) is earlier than the club before it.`;
    prev = y;
  }
  return "";
}

/** Reset a level to "not saved" and repaint its Save-player button (call after
 *  ANY edit that changes the career path / player). */
function markLevelUnsaved(levelIndex) {
  const lvl = appState.levelsData[levelIndex];
  if (lvl) lvl.careerPlayerSaved = false;
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  if (sec?.saveBtn) {
    sec.saveBtn.classList.remove("is-saved");
    sec.saveBtn.textContent = "Save Level";
  }
}

function buildSavePlayerBtn(lvl, levelIndex) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "prep-save-player";
  const paint = () => {
    const saved = !!lvl.careerPlayerSaved;
    btn.classList.toggle("is-saved", saved);
    btn.textContent = saved ? "✓ Level saved" : "Save Level";
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setActiveLevel(levelIndex);
    const sec = sections.find((s) => s.levelIndex === levelIndex);
    const err = careerSaveValidationError(lvl, sec?.sectionEl);
    if (err) {
      window.alert("Can't save this player yet:\n\n" + err);
      return;
    }
    lvl.careerPlayerSaved = true;
    paint();
    markPrepDirty();
  });
  paint();
  return btn;
}

// ── section / panel ──────────────────────────────────────────────────────────

export function setActiveLevel(levelIndex) {
  appState.currentLevelIndex = levelIndex;
  sections.forEach((s) =>
    s.sectionEl.classList.toggle("prep-section--active", s.levelIndex === levelIndex),
  );
}

function sectionHeadText(lvl, ordinal) {
  const name = displayPlayerNameFor(lvl) || "(no player)";
  const clubs = displayedCareer(lvl).length;
  return (
    `<span class="prep-section__level">Level ${ordinal}</span>` +
    `<span class="prep-section__team">${escapeHtml(name)}</span>` +
    `<span class="prep-section__meta">${clubs} club${clubs === 1 ? "" : "s"}</span>`
  );
}

export function renderPrepPanel() {
  if (!root) return;
  const prevLevel = appState.currentLevelIndex;
  sections = [];
  root.innerHTML = "";

  const indexes = questionLevelIndexes();
  if (!indexes.length) {
    const empty = document.createElement("div");
    empty.className = "prep-empty";
    empty.textContent = "Pick a save in the Saved tab to load its levels here.";
    root.appendChild(empty);
    return;
  }

  // ONE global tab bar at the top — switches the view for ALL levels at once.
  root.appendChild(buildGlobalTabBar());

  let ordinal = 0;
  for (const levelIndex of indexes) {
    const lvl = appState.levelsData[levelIndex];
    ordinal += 1;

    const sectionEl = document.createElement("section");
    sectionEl.className = "prep-section";
    sectionEl.dataset.levelIndex = String(levelIndex);

    const head = document.createElement("div");
    head.className = "prep-section__head";
    head.innerHTML = sectionHeadText(lvl, ordinal);
    const saveBtn = buildSavePlayerBtn(lvl, levelIndex);
    head.appendChild(saveBtn);
    sectionEl.appendChild(head);

    const body = document.createElement("div");
    body.className = "prep-section__body";
    body.append(buildLevelView(lvl, levelIndex, ordinal));
    sectionEl.appendChild(body);

    root.appendChild(sectionEl);
    sections.push({ levelIndex, sectionEl, headEl: head, saveBtn });
  }

  const keep = sections.find((s) => s.levelIndex === prevLevel) || sections[0];
  setActiveLevel(keep.levelIndex);
  applyPrepView();
}

/** Re-render ONE section in place (after edits that change its layout). */
function refreshLevelSection(levelIndex) {
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  if (!sec) return;
  const lvl = appState.levelsData[levelIndex];
  if (!lvl) return;
  const body = sec.sectionEl.querySelector(".prep-section__body");
  if (!body) return;
  body.innerHTML = "";
  body.append(buildLevelView(lvl, levelIndex, sections.indexOf(sec) + 1));
  sec.headEl.innerHTML = sectionHeadText(lvl, sections.indexOf(sec) + 1);
  // The head innerHTML reset dropped the Save-player button — rebuild it.
  sec.saveBtn = buildSavePlayerBtn(lvl, levelIndex);
  sec.headEl.appendChild(sec.saveBtn);
}

export function initPrepPanel() {
  root = document.getElementById("prep-root");
  if (!root) {
    console.error("[prep] missing #prep-root");
    return;
  }

  // Context switch BEFORE any click handler fires (capture phase).
  root.addEventListener(
    "pointerdown",
    (e) => {
      const sec = e.target?.closest?.(".prep-section");
      if (!sec) return;
      const idx = Number(sec.dataset.levelIndex);
      if (Number.isFinite(idx) && idx !== appState.currentLevelIndex) setActiveLevel(idx);
    },
    true,
  );

  document.addEventListener("recording-queue:script-applied", () => {
    renderPrepPanel();
    const scroller = root.closest(".stage");
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  document.addEventListener("prep:levels-changed", () => renderPrepPanel());
  document.addEventListener("prep:refresh-level", (e) => {
    const idx = e.detail?.index;
    if (Number.isFinite(idx)) refreshLevelSection(idx);
  });
  document.addEventListener("prep:level-switched", (e) => {
    const sec = sections.find((s) => s.levelIndex === e.detail?.index);
    if (!sec) return;
    setActiveLevel(sec.levelIndex);
    if (sec === sections[0]) {
      const scroller = root.closest(".stage");
      if (scroller) scroller.scrollTop = 0;
      window.scrollTo(0, 0);
    } else {
      sec.sectionEl.scrollIntoView({ behavior: "auto", block: "start" });
    }
  });

  renderPrepPanel();
}
