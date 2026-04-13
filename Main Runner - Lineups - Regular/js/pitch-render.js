/* js/pitch-render.js */

import { formationById } from "./formations.js";
import {
  appState,
  DEFAULT_SLOT_FLAG_SCALE,
  DEFAULT_SLOT_TEAM_LOGO_SCALE,
  ensureSlotFrontFaceScales,
  getState,
  sanitizeSlotBadgeScale,
  SLOT_BADGE_SCALE_STEP,
} from "./state.js";

const HEADER_LOGO_NUDGE_ABS_MAX = 4000;

/** Seconds between each slot starting the logo→player flip; `0` = all flip together. */
const SLOT_FLIP_STAGGER_SEC = 0;
/** Must match `.slot-inner` `transition` duration in css/components/pitch.css */
const SLOT_FLIP_DURATION_SEC = 0.78;

/** Stable wrapper: float animation runs here so `renderSlot` can replace only inner content without resetting bob. */
function getOrCreateSlotMount(slotEl) {
  let mount = slotEl.querySelector(":scope > .slot-mount");
  if (!mount) {
    mount = document.createElement("div");
    mount.className = "slot-mount";
    slotEl.appendChild(mount);
  }
  return mount;
}

/** Time from flip start until all flips finish (sync with pitch height transition). */
export function getVideoRevealSyncedPitchTransitionSec(flipSlotCount) {
  const n = Math.max(0, Math.floor(Number(flipSlotCount)) || 0);
  if (n <= 1) return SLOT_FLIP_DURATION_SEC;
  return (n - 1) * SLOT_FLIP_STAGGER_SEC + SLOT_FLIP_DURATION_SEC;
}

export function syncPitchWrapTransitionToVideoReveal(flipSlotCount) {
  const wrap = appState.els.pitchWrap;
  if (!wrap) return;
  wrap.style.setProperty(
    "--pitch-wrap-height-duration",
    `${getVideoRevealSyncedPitchTransitionSec(flipSlotCount)}s`
  );
}

export function clearPitchWrapTransitionOverride() {
  appState.els.pitchWrap?.style.removeProperty("--pitch-wrap-height-duration");
}

/** Apply --header-logo-scale / --header-logo-nudge-x from the current level (per-level; regular + shorts). */
export function syncTeamHeaderLogoVarsFromLevel() {
  const state = getState();
  const th = appState.els.teamHeader;
  if (!state || !th) {
    return;
  }
  let s = Number(state.headerLogoScale);
  if (!Number.isFinite(s) || s < 0.001) {
    s = 1;
  }
  s = Math.round(s * 1000) / 1000;
  let n = Number(state.headerLogoNudgeX);
  if (!Number.isFinite(n)) {
    n = 0;
  }
  n = Math.round(Math.min(HEADER_LOGO_NUDGE_ABS_MAX, Math.max(-HEADER_LOGO_NUDGE_ABS_MAX, n)));
  th.style.setProperty("--header-logo-scale", String(s));
  th.style.setProperty("--header-logo-nudge-x", `${n}px`);
}
import {
  projectAssetUrl,
  projectAssetUrlFresh,
  withProjectAssetCacheBust,
} from "./paths.js";
import { normalizeForSearch } from "./search-normalize.js";
import { getInternationalClubPlayersForNation } from "./nationality-pool-key.js";
import {
  applyTeamHeaderStripesFromFlagImage,
  resetTeamHeaderStripeVars,
} from "./flag-stripe-colors.js";

const INTERNATIONAL_POOL_URL = "data/international-club-pool-by-nationality.json";
const AUTO_FETCH_PLAYER_PHOTO_ENDPOINT = "/__player-photo/auto-fetch";
const DELETE_PLAYER_PHOTO_ENDPOINT = "/__player-photo/delete";
const TEAM_NAME_OVERRIDES_STORAGE_KEY = "lineups-regular:club-by-nat-team-name-overrides:v1";
const AUTO_365_PHOTO_RE = /(^|\/)auto - 365scores(?: - \d+)?\.(png|jpe?g|webp|avif|gif)$/i;
const AUTO_FUTGG_PHOTO_RE = /(^|\/)auto - fut\.gg(?: - \d+)?\.(png|jpe?g|webp|avif|gif)$/i;
const autoPhotoLastSourceBySlot = new Map();
let teamNameOverridesCache = null;

function normalizeQuizTypeForTeamNameOverride(quizType) {
  return quizType === "club-by-nat" ? "club-by-nat" : "nat-by-club";
}

function isClubByNatHeaderEditContext(state = getState(), quizTypeRaw = appState.els.inQuizType?.value) {
  if (!state?.currentSquad) return false;
  if (state.squadType !== "club") return false;
  return normalizeQuizTypeForTeamNameOverride(quizTypeRaw) === "club-by-nat";
}

function getCanonicalTeamIdentity(state = getState()) {
  if (!state) return "";
  const fromPath = String(state.selectedEntry?.path || "").trim();
  if (fromPath) return fromPath;
  const fromEntryName = String(state.selectedEntry?.name || "").trim().toLowerCase();
  if (fromEntryName) return `name:${fromEntryName}`;
  const fromSquadName = String(state.currentSquad?.name || "").trim().toLowerCase();
  if (fromSquadName) return `name:${fromSquadName}`;
  return "";
}

/** Identity for side-panel slide: team, level, and XI so team / player / level changes re-animate. */
function getTeamSidebarSlideKey(state = getState()) {
  if (!state?.currentSquad) return "";
  const id = getCanonicalTeamIdentity(state);
  const xiSig = (appState.currentXi || [])
    .filter(Boolean)
    .map((p) => String(p.name || "").trim())
    .join("\u001f");
  return `${state.squadType}|${id}|L${appState.currentLevelIndex}|${xiSig}`;
}

/**
 * Slide panel out/in with CSS transition (reflow between off → on).
 * When `wantsOpen` is false or `#team-header` is [hidden], panel stays off-screen.
 */
function syncTeamSidebarPanel(els, wantsOpen, slideKey) {
  const th = els.teamHeader;
  if (!th) {
    return;
  }
  if (th.hidden || !wantsOpen) {
    appState.teamSidebarAnimGeneration += 1;
    th.classList.remove("team-header--show");
    appState.teamSidebarLastOpen = false;
    appState.teamSidebarLastKey = "";
    return;
  }
  const key = String(slideKey || "");
  const needSlideIn =
    !appState.teamSidebarLastOpen || key !== appState.teamSidebarLastKey;
  if (needSlideIn) {
    appState.teamSidebarAnimGeneration += 1;
    const gen = appState.teamSidebarAnimGeneration;
    th.classList.remove("team-header--show");
    void th.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== appState.teamSidebarAnimGeneration) {
          return;
        }
        if (th.hidden) {
          return;
        }
        th.classList.add("team-header--show");
        appState.teamSidebarLastOpen = true;
        appState.teamSidebarLastKey = key;
      });
    });
  } else {
    th.classList.add("team-header--show");
    appState.teamSidebarLastOpen = true;
    appState.teamSidebarLastKey = key;
  }
}

function getBaseTeamName(state = getState()) {
  if (!state) return "";
  return String(state.currentSquad?.name || state.selectedEntry?.name || "").trim();
}

function readTeamNameOverrides() {
  if (teamNameOverridesCache) return teamNameOverridesCache;
  let parsed = {};
  try {
    parsed = JSON.parse(localStorage.getItem(TEAM_NAME_OVERRIDES_STORAGE_KEY) || "{}");
  } catch {
    parsed = {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    parsed = {};
  }
  teamNameOverridesCache = parsed;
  return teamNameOverridesCache;
}

function persistTeamNameOverrides() {
  if (!teamNameOverridesCache || typeof teamNameOverridesCache !== "object") {
    teamNameOverridesCache = {};
  }
  try {
    localStorage.setItem(
      TEAM_NAME_OVERRIDES_STORAGE_KEY,
      JSON.stringify(teamNameOverridesCache)
    );
  } catch {
    // Ignore storage quota/privacy failures; current session still works.
  }
}

function getTeamNameOverrideKey(state = getState(), quizTypeRaw = appState.els.inQuizType?.value) {
  const quizType = normalizeQuizTypeForTeamNameOverride(quizTypeRaw);
  const identity = getCanonicalTeamIdentity(state);
  if (!identity) return "";
  return `${quizType}::${identity}`;
}

export function resolveHeaderTeamDisplayName(
  state = getState(),
  quizTypeRaw = appState.els.inQuizType?.value || "nat-by-club"
) {
  const baseName = getBaseTeamName(state);
  if (!baseName) return "";
  if (!isClubByNatHeaderEditContext(state, quizTypeRaw)) {
    return baseName;
  }
  const key = getTeamNameOverrideKey(state, quizTypeRaw);
  if (!key) return baseName;
  const raw = readTeamNameOverrides()[key];
  const custom = String(raw || "").trim();
  return custom || baseName;
}

export function renameCurrentClubByNatTeamName(nextNameRaw) {
  const state = getState();
  if (!isClubByNatHeaderEditContext(state)) return false;
  const key = getTeamNameOverrideKey(state);
  if (!key) return false;
  const baseName = getBaseTeamName(state);
  const nextName = String(nextNameRaw || "").trim();
  const normalizedBase = baseName.toLowerCase();
  const normalizedNext = nextName.toLowerCase();
  const overrides = readTeamNameOverrides();
  if (!nextName || normalizedNext === normalizedBase) {
    delete overrides[key];
  } else {
    overrides[key] = nextName;
  }
  persistTeamNameOverrides();
  renderHeader();
  return true;
}

export function isCurrentHeaderTeamNameEditable() {
  return isClubByNatHeaderEditContext(getState(), appState.els.inQuizType?.value);
}
export function ensureInternationalClubPoolLoaded() {
  if (appState.internationalClubPool != null) {
    return Promise.resolve();
  }
  if (appState.internationalClubPoolLoadPromise) {
    return appState.internationalClubPoolLoadPromise;
  }
  appState.internationalClubPoolLoadPromise = fetch(projectAssetUrl(INTERNATIONAL_POOL_URL), {
    cache: "no-store",
  })
    .then((r) => (r.ok ? r.json() : { byNationality: {} }))
    .then((data) => {
      appState.internationalClubPool = data.byNationality && typeof data.byNationality === "object"
        ? data.byNationality
        : {};
    })
    .catch(() => {
      appState.internationalClubPool = {};
    })
    .finally(() => {
      appState.internationalClubPoolLoadPromise = null;
    });
  return appState.internationalClubPoolLoadPromise;
}

function getSwapBenchMergeContext(state) {
  const allPlayers = [
    ...(state.currentSquad.goalkeepers || []),
    ...(state.currentSquad.defenders || []),
    ...(state.currentSquad.midfielders || []),
    ...(state.currentSquad.attackers || []),
  ];
  const currentNames = appState.currentXi.filter((p) => p).map((p) => p.name);
  const bench = allPlayers.filter((p) => !currentNames.includes(p.name));
  const benchNameSet = new Set(bench.map((p) => p.name));
  return { bench, benchNameSet, currentNames, allPlayers };
}

function mergeSwapPoolIntoBench(bench, benchNameSet, currentNames, extraFromClubPool) {
  const raw = Array.isArray(extraFromClubPool) ? extraFromClubPool : [];
  const extra = raw.filter(
    (p) => p && p.name && !currentNames.includes(p.name) && !benchNameSet.has(p.name)
  );
  appState.swapAvailablePlayers = [...bench, ...extra].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  refreshSwapPlayerListFromSearch();
}

/** Re-apply swap search box filter to `swapAvailablePlayers` and redraw the list. */
export function refreshSwapPlayerListFromSearch() {
  const q = normalizeForSearch(appState.els.swapSearch?.value || "");
  const filtered = appState.swapAvailablePlayers.filter((p) => {
    if (!q) return true;
    const name = normalizeForSearch(p.name || "");
    const club = normalizeForSearch(p.club != null ? String(p.club) : "");
    const pos = normalizeForSearch(p.position || "");
    const nat = normalizeForSearch(p.nationality != null ? String(p.nationality) : "");
    return (
      name.includes(q) ||
      club.includes(q) ||
      pos.includes(q) ||
      nat.includes(q)
    );
  });
  renderSwapList(filtered);
}

/** Bench + club players from `international-club-pool-by-nationality.json` (same nationality string). */
export function applySwapSearchAllNationality() {
  const state = getState();
  if (!state || !state.currentSquad) return;
  const slotIndex = appState.swapActiveSlotIndex;
  if (slotIndex < 0) return;
  const { bench, benchNameSet, currentNames } = getSwapBenchMergeContext(state);
  const slotPlayer = appState.currentXi[slotIndex];
  let nat = (slotPlayer?.nationality && String(slotPlayer.nationality).trim()) || "";
  if (!nat && state.squadType === "national") {
    nat = String(state.currentSquad?.name || state.selectedEntry?.name || "").trim();
  }
  if (!nat) return;
  ensureInternationalClubPoolLoaded().then(() => {
    if (appState.swapActiveSlotIndex !== slotIndex) return;
    appState.els.swapSearch.value = "";
    const pool = getInternationalClubPlayersForNation(appState.internationalClubPool, nat);
    mergeSwapPoolIntoBench(bench, benchNameSet, currentNames, pool);
  });
}
import { pickStartingXI } from "./pick-xi.js";
import {
  getClubLogoOtherTeamsRelPath,
  getClubLogoOtherTeamsUrl,
  getClubLogoUrl,
  getHeaderLogoUrlChain,
  playerPhotoPaths,
  slotPerspectiveScale,
} from "./photo-helpers.js";
import { syncTeamVoiceControls } from "./team-voice-manager.js";

export function shouldUseVideoQuestionLayout(state = getState()) {
  if (!state || !state.currentSquad) return false;
  return appState.currentLevelIndex > 1 && appState.currentLevelIndex < appState.totalLevelsCount;
}

export function getVideoQuestionPreviewState(state = getState()) {
  const useVideoQuestionLayout = shouldUseVideoQuestionLayout(state);
  const previewPostTimer =
    useVideoQuestionLayout &&
    (appState.videoRevealPostTimerActive || (!state.videoMode && !appState.isVideoPlaying));
  const previewPreTimer = useVideoQuestionLayout && state.videoMode && !previewPostTimer;
  return { useVideoQuestionLayout, previewPreTimer, previewPostTimer };
}

function pitchLabelFromPlayerName(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return parts[0].toUpperCase();

  const prefixes = [
    "van", "de", "der", "da", "di", "del", "la", "le",
    "von", "ten", "ter", "mac", "mc", "dos", "das", "do", "do", "du", "el", "al"
  ];

  let startIndex = parts.length - 1;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (prefixes.includes(parts[i].toLowerCase())) {
      startIndex = i;
    } else {
      break;
    }
  }

  return parts.slice(startIndex).join(" ").toUpperCase();
}

/** Red name chip: custom edit, else short name, else club (national XIs), else nationality, else em dash. */
function pitchSlotDisplayLabel(state, player) {
  const nameKey = player?.name != null ? String(player.name) : "";
  const custom = state.customNames[nameKey];
  if (custom != null && String(custom).trim() !== "") {
    return String(custom).trim();
  }
  const trimmedName = nameKey.trim();
  if (trimmedName) {
    const fromName = pitchLabelFromPlayerName(trimmedName);
    if (fromName && fromName.trim()) return fromName;
  }
  const club = (player?.club && String(player.club).trim()) || "";
  if (club) return club.toUpperCase();
  const nat = (player?.nationality && String(player.nationality).trim()) || "";
  if (nat) return nat.toUpperCase();
  return "—";
}

export function openSwapModal(slotIndex) {
  const state = getState();
  if (!state.currentSquad) return;

  appState.swapActiveSlotIndex = slotIndex;

  const { bench, benchNameSet, currentNames } = getSwapBenchMergeContext(state);

  appState.els.swapSearch.value = "";
  appState.swapAvailablePlayers = [...bench].sort((a, b) => a.name.localeCompare(b.name));
  renderSwapList(appState.swapAvailablePlayers);

  appState.els.swapModal.hidden = false;
  appState.els.swapSearch.focus();

  if (state.squadType === "national") {
    const nation = String(state.currentSquad?.name || state.selectedEntry?.name || "").trim();
    ensureInternationalClubPoolLoaded().then(() => {
      if (appState.swapActiveSlotIndex !== slotIndex) return;
      const pool = getInternationalClubPlayersForNation(appState.internationalClubPool, nation);
      mergeSwapPoolIntoBench(bench, benchNameSet, currentNames, pool);
    });
  }
}

export function renderSwapList(players) {
  const { els } = appState;
  els.swapList.replaceChildren();
  players.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "swap-player-item";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;

    const posSpan = document.createElement("span");
    posSpan.className = "pos";
    const pos = p.position || "UNK";
    const clubHint = p.club && String(p.club).trim();
    posSpan.textContent = clubHint ? `${pos} · ${clubHint}` : pos;

    btn.append(nameSpan, posSpan);

    btn.onclick = () => {
      const state = getState();
      appState.suppressPitchSlotFlipAnimation = true;
      const si = appState.swapActiveSlotIndex;
      if (state.slotClubCrestOverrideRelPathBySlot && si >= 0) {
        delete state.slotClubCrestOverrideRelPathBySlot[String(si)];
      }
      state.customXi[si] = p;
      els.swapModal.hidden = true;
      renderPitch();
      appState.suppressPitchSlotFlipAnimation = false;
    };

    els.swapList.appendChild(btn);
  });
}

/** Served by `run_site.py` from disk each request; falls back to static JSON if not using that server. */
const OTHER_TEAMS_LOGOS_LIVE_PATH = "__other-teams-logos.json";
const OTHER_TEAMS_LOGOS_STATIC_FALLBACK = "data/other-teams-logos.json";

async function loadOtherTeamsLogoNamesForModal() {
  const fetchNames = async (rel) => {
    try {
      const res = await fetch(projectAssetUrl(rel), { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.names) ? data.names : [];
    } catch {
      return null;
    }
  };
  let names = await fetchNames(OTHER_TEAMS_LOGOS_LIVE_PATH);
  if (names == null) {
    names = await fetchNames(OTHER_TEAMS_LOGOS_STATIC_FALLBACK);
  }
  appState.otherTeamsLogoNames = names ?? [];
}

export function refreshSwapLogoListFromSearch() {
  const names = appState.otherTeamsLogoNames;
  if (!names) return;
  renderSwapLogoList(names);
}

/**
 * @param {null | { kind: "slot"; slotIndex: number }} pickContext
 *        `null` = team header crest (club XI). `{ kind: "slot", slotIndex }` = national XI front-face club crest.
 */
export async function openSwapLogoModal(pickContext = null) {
  const state = getState();
  if (!state.currentSquad) return;
  if (pickContext?.kind === "slot") {
    if (state.squadType !== "national") return;
  } else if (state.squadType !== "club") {
    return;
  }
  appState.swapLogoPickContext = pickContext;
  appState.swapLogoThumbCacheToken = String(Date.now());
  await loadOtherTeamsLogoNamesForModal();
  const { els } = appState;
  if (!els.swapLogoModal || !els.swapLogoList) return;
  const titleEl = document.getElementById("swap-logo-modal-title");
  if (titleEl) {
    titleEl.textContent =
      pickContext?.kind === "slot" ? "Slot club crest" : "Team header crest";
  }
  if (els.swapLogoReset) {
    els.swapLogoReset.textContent =
      pickContext?.kind === "slot" ? "Use player default" : "Use default";
  }
  els.swapLogoSearch.value = "";
  renderSwapLogoList(appState.otherTeamsLogoNames || []);
  els.swapLogoModal.hidden = false;
  els.swapLogoSearch.focus();
}

function renderSwapLogoList(names) {
  const { els } = appState;
  els.swapLogoList.replaceChildren();
  const q = (els.swapLogoSearch?.value || "").trim().toLowerCase();
  const filtered = names.filter((n) => !q || String(n).toLowerCase().includes(q));
  filtered.sort((a, b) => String(a).localeCompare(String(b)));

  filtered.forEach((name) => {
    const rel = getClubLogoOtherTeamsRelPath(name);
    if (!rel) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swap-logo-item";
    const img = document.createElement("img");
    img.className = "swap-logo-item-img";
    const baseUrl = projectAssetUrl(rel);
    const bust = appState.swapLogoThumbCacheToken || "";
    img.src = bust
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_sb=${encodeURIComponent(bust)}`
      : baseUrl;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    const span = document.createElement("span");
    span.className = "swap-logo-item-label";
    span.textContent = name;
    btn.append(img, span);
    btn.onclick = () => {
      const ctx = appState.swapLogoPickContext;
      const st = getState();
      if (ctx?.kind === "slot") {
        const k = String(ctx.slotIndex);
        if (
          !st.slotClubCrestOverrideRelPathBySlot ||
          typeof st.slotClubCrestOverrideRelPathBySlot !== "object"
        ) {
          st.slotClubCrestOverrideRelPathBySlot = {};
        }
        st.slotClubCrestOverrideRelPathBySlot[k] = rel;
        els.swapLogoModal.hidden = true;
        appState.swapLogoPickContext = null;
        renderPitch();
        return;
      }
      st.headerLogoOverrideRelPath = rel;
      els.swapLogoModal.hidden = true;
      appState.swapLogoPickContext = null;
      renderHeader();
    };
    els.swapLogoList.appendChild(btn);
  });
}

function applyStrictAvatarBounds(avatarEl, options = {}) {
  const clipCircle = options.clipCircle !== false;
  avatarEl.style.display = "flex";
  avatarEl.style.justifyContent = "center";
  avatarEl.style.alignItems = "center";
  avatarEl.style.overflow = clipCircle ? "hidden" : "visible";
  avatarEl.style.width = "100%";
  avatarEl.style.aspectRatio = "1 / 1";
  avatarEl.style.borderRadius = clipCircle ? "50%" : "0";
}

/** Video-mode card front when flag/club image is missing — full name, not initials. */
function appendSlotBadgeTextFallback(badgeWrap, displayText) {
  const el = document.createElement("div");
  el.className = "slot-badge-fallback-text";
  const t = String(displayText ?? "").trim();
  el.textContent = t.length ? t : "—";
  badgeWrap.appendChild(el);
}

/** No player photo: show club (national squads) or nationality (club squads) inside the grey circle. */
function appendAvatarTeamFallback(avatar, player) {
  const club = (player?.club && String(player.club).trim()) || "";
  const nat = (player?.nationality && String(player.nationality).trim()) || "";
  const text = (club || nat || "—").toUpperCase();
  const el = document.createElement("div");
  el.className = "slot-avatar-team-fallback";
  el.textContent = text;
  avatar.appendChild(el);
}

function isAuto365PhotoRelPath(relPath) {
  return AUTO_365_PHOTO_RE.test(String(relPath || "").trim());
}

function autoPhotoSourceFromRelPath(relPath) {
  const v = String(relPath || "").trim();
  if (!v) return "";
  if (AUTO_FUTGG_PHOTO_RE.test(v)) return "fut.gg";
  if (AUTO_365_PHOTO_RE.test(v)) return "365scores";
  return "";
}

export function applyPlayerPhotoFramingForSourceRelPath(imgEl, relPath) {
  if (!imgEl) return;
  void relPath;
  imgEl.style.removeProperty("object-position");
  imgEl.style.removeProperty("transform");
  imgEl.style.removeProperty("transform-origin");
  imgEl.style.removeProperty("background");
  imgEl.style.removeProperty("background-color");
  imgEl.style.removeProperty("border");
  imgEl.style.removeProperty("box-sizing");
}

function appendAutoPhotoFetchButton(containerEl, slotIndex, player) {
  const state = getState();
  if (!containerEl || !player || appState.isVideoPlaying) return;
  if (containerEl.querySelector(".slot-photo-controls")) return;
  const controls = document.createElement("div");
  controls.className = "slot-photo-controls";

  const photoBtn = document.createElement("button");
  photoBtn.type = "button";
  photoBtn.className = "slot-photo-fetch-btn";
  photoBtn.textContent = "PHOTO";
  photoBtn.title = "Fetch another player photo";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "slot-photo-delete-btn";
  deleteBtn.textContent = "X";
  deleteBtn.title = "Delete current photo";

  const getCurrentSlotPhoto = () => {
    const st = getState();
    const paths = playerPhotoPaths(player, st.displayMode);
    if (!paths.length) return { relPath: "", paths: [] };
    let idx = st.slotPhotoIndexBySlot.get(slotIndex) ?? 0;
    idx = ((idx % paths.length) + paths.length) % paths.length;
    st.slotPhotoIndexBySlot.set(slotIndex, idx);
    return { relPath: String(paths[idx] || ""), paths };
  };

  const removeRelPathFromPlayerImagesState = (relPath) => {
    const rel = String(relPath || "").trim();
    if (!rel) return;
    for (const section of ["club", "nationality"]) {
      const sectionMap = appState.playerImages[section];
      if (!sectionMap || typeof sectionMap !== "object") continue;
      for (const key of Object.keys(sectionMap)) {
        const current = sectionMap[key];
        if (Array.isArray(current)) {
          const next = current.filter((x) => String(x || "").trim() && String(x || "").trim() !== rel);
          if (next.length !== current.length) {
            if (next.length) sectionMap[key] = next;
            else delete sectionMap[key];
          }
          continue;
        }
        if (typeof current === "string" && current.trim() === rel) {
          delete sectionMap[key];
        }
      }
    }
  };

  photoBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (photoBtn.disabled) return;
    const st = getState();
    if (!st?.selectedEntry) return;
    const current = getCurrentSlotPhoto();
    const currentSource = autoPhotoSourceFromRelPath(current.relPath);
    const lastSource = autoPhotoLastSourceBySlot.get(slotIndex) || currentSource;
    const preferredSource = lastSource === "fut.gg" ? "365scores" : "fut.gg";
    photoBtn.disabled = true;
    deleteBtn.disabled = true;
    photoBtn.textContent = "...";
    try {
      const res = await fetch(AUTO_FETCH_PLAYER_PHOTO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: player?.name || "",
          playerClub: player?.club || "",
          playerNationality: player?.nationality || "",
          squadType: st?.squadType || "",
          selectedEntry: st?.selectedEntry || {},
          currentSquadName: st?.currentSquad?.name || "",
          preferredSource,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Image not found.");
      }
      const section = data.indexSection;
      const key = data.indexKey;
      const rel = data.relativePath;
      if (!section || !key || !rel) {
        throw new Error("Invalid image index update payload.");
      }
      if (!appState.playerImages[section]) {
        appState.playerImages[section] = {};
      }
      const current = appState.playerImages[section][key];
      const paths = Array.isArray(current)
        ? current.filter((x) => typeof x === "string" && x.trim())
        : typeof current === "string" && current.trim()
          ? [current.trim()]
          : [];
      if (!paths.includes(rel)) {
        paths.unshift(rel);
      }
      appState.playerImages[section][key] = paths;
      autoPhotoLastSourceBySlot.set(slotIndex, String(data?.source || "").trim().toLowerCase());
      st.slotPhotoIndexBySlot.set(slotIndex, 0);
      appState.suppressPitchSlotFlipAnimation = true;
      renderPitch();
      appState.suppressPitchSlotFlipAnimation = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image not found.";
      window.alert(`Could not fetch photo for ${player?.name || "player"}: ${msg}`);
    } finally {
      photoBtn.disabled = false;
      deleteBtn.disabled = false;
      photoBtn.textContent = "PHOTO";
    }
  });

  deleteBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (deleteBtn.disabled) return;
    const current = getCurrentSlotPhoto();
    if (!current.relPath) {
      window.alert("No photo to delete.");
      return;
    }
    photoBtn.disabled = true;
    deleteBtn.disabled = true;
    deleteBtn.textContent = "...";
    try {
      const res = await fetch(DELETE_PLAYER_PHOTO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relPath: current.relPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete photo.");
      }
      removeRelPathFromPlayerImagesState(current.relPath);
      const st = getState();
      st.slotPhotoIndexBySlot.set(slotIndex, 0);
      autoPhotoLastSourceBySlot.delete(slotIndex);
      appState.suppressPitchSlotFlipAnimation = true;
      renderPitch();
      appState.suppressPitchSlotFlipAnimation = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete photo.";
      window.alert(msg);
    } finally {
      photoBtn.disabled = false;
      deleteBtn.disabled = false;
      deleteBtn.textContent = "X";
    }
  });
  controls.append(photoBtn, deleteBtn);
  containerEl.appendChild(controls);
}

function getSlotFrontFaceScale(state, slotIndex) {
  ensureSlotFrontFaceScales(state);
  if (state.squadType === "national") {
    return sanitizeSlotBadgeScale(
      state.slotTeamLogoScales[slotIndex] ?? DEFAULT_SLOT_TEAM_LOGO_SCALE
    );
  }
  // Start slightly zoomed so "-" has an immediate effect while never going below full-fit.
  return sanitizeSlotBadgeScale(state.slotFlagScales[slotIndex] ?? 1.15);
}

/** Video mode only: +/- for front-face flag (club XI) or club logo (national XI); not the player photo. */
/** @param {HTMLElement} rootEl `.slot-mount` (flip-card + badge controls live here). */
function appendSlotBadgeZoomControls(rootEl, slotIndex) {
  const state = getState();
  const controls = document.createElement("div");
  controls.className = "slot-badge-controls";
  const makeBtn = (sign, ariaLabel) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot-badge-zoom-btn";
    b.setAttribute("aria-label", ariaLabel);
    b.textContent = sign < 0 ? "-" : "+";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const st = getState();
      ensureSlotFrontFaceScales(st);
      const isNational = st.squadType === "national";
      const arr = isNational ? st.slotTeamLogoScales : st.slotFlagScales;
      const def = isNational ? DEFAULT_SLOT_TEAM_LOGO_SCALE : DEFAULT_SLOT_FLAG_SCALE;
      const cur = sanitizeSlotBadgeScale(arr[slotIndex] ?? def);

      // Flags: allow real zoom-out (below 1x) so "-" is always meaningful.
      const minScale = isNational ? 0.1 : 0.7;
      const maxScale = isNational ? 3.0 : 3.0;
      const next = Math.min(maxScale, Math.max(minScale, cur + sign * SLOT_BADGE_SCALE_STEP));
      arr[slotIndex] = next;
      const wrap = rootEl.querySelector(".slot-badge-scale-wrap");
      if (wrap) wrap.style.setProperty("--slot-badge-scale", String(next));
    });
    return b;
  };
  const shrinkLabel =
    state.squadType === "national" ? "Zoom out club logo" : "Zoom out nationality flag";
  const growLabel =
    state.squadType === "national" ? "Zoom in club logo" : "Zoom in nationality flag";
  controls.append(makeBtn(-1, shrinkLabel), makeBtn(1, growLabel));
  if (state.squadType === "national") {
    const crestPick = document.createElement("button");
    crestPick.type = "button";
    crestPick.className = "slot-badge-zoom-btn slot-badge-swap-crest-btn";
    crestPick.setAttribute("aria-label", "Pick club crest from Other Teams folder");
    crestPick.title = "Swap crest";
    crestPick.textContent = "⇄";
    crestPick.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      openSwapLogoModal({ kind: "slot", slotIndex });
    });
    controls.appendChild(crestPick);
  }
  rootEl.appendChild(controls);
}

function renderSlot(slotEl, player, displayMode, slotIndex, useVideoQuestionLayout) {
  const state = getState();
  const mount = getOrCreateSlotMount(slotEl);
  mount.replaceChildren();
  slotEl.classList.remove("has-player", "empty");
  if (!player) {
    slotEl.classList.add("empty");
    return;
  }
  slotEl.classList.add("has-player");

  if (useVideoQuestionLayout) {
    const inner = document.createElement("div");
    inner.className = "slot-inner";
    const shouldFlipToPlayers = getVideoQuestionPreviewState(state).previewPostTimer;

    const front = document.createElement("div");
    front.className =
      "slot-face slot-front" +
      (state.squadType === "national" ? " slot-front--national-crest" : "");

    const frontAvatar = document.createElement("div");
    frontAvatar.className = "slot-avatar";
    applyStrictAvatarBounds(
      frontAvatar,
      state.squadType === "national" ? { clipCircle: false } : {}
    );

    const badgeWrap = document.createElement("div");
    badgeWrap.className = "slot-badge-scale-wrap";
    badgeWrap.style.setProperty("--slot-badge-scale", String(getSlotFrontFaceScale(state, slotIndex)));

    if (state.squadType === "club") {
      const code = appState.flagcodes[player.nationality];
      const natLabel = String(player.nationality || "").trim();
      if (code) {
        // England: repo St George asset (not Union Jack / generic CDN crop).
        const flagUrl =
          natLabel === "England"
            ? projectAssetUrl("Nationality images/Europe/England.png")
            : `https://flagcdn.com/w320/${code.toLowerCase()}.png`;
        const img = document.createElement("img");
        img.className = "slot-img";
        img.src = flagUrl;
        img.loading = "lazy";
        img.decoding = "async";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.borderRadius = "50%";
        img.onerror = () => {
          img.remove();
          appendSlotBadgeTextFallback(badgeWrap, player.nationality);
        };
        badgeWrap.appendChild(img);
      } else {
        appendSlotBadgeTextFallback(badgeWrap, player.nationality);
      }
    } else {
      const clubName = player.club || "UNK";
      const primaryLogoUrl = getClubLogoUrl(clubName);
      const otherTeamsLogoUrl = getClubLogoOtherTeamsUrl(player.club);
      const ovKey = String(slotIndex);
      const overrideRel = state.slotClubCrestOverrideRelPathBySlot?.[ovKey];
      const overrideUrl = overrideRel ? projectAssetUrlFresh(overrideRel) : null;
      const urlChain = [];
      const pushUrl = (u) => {
        if (u && !urlChain.includes(u)) urlChain.push(u);
      };
      pushUrl(overrideUrl);
      pushUrl(primaryLogoUrl ? withProjectAssetCacheBust(primaryLogoUrl) : null);
      pushUrl(otherTeamsLogoUrl ? withProjectAssetCacheBust(otherTeamsLogoUrl) : null);
      const firstLogoUrl = urlChain[0] || null;
      const clubLabel = player.club?.trim() ? player.club.trim() : "Unknown club";

      if (!firstLogoUrl) {
        appendSlotBadgeTextFallback(badgeWrap, clubLabel);
      } else {
        const img = document.createElement("img");
        img.className = "slot-img";
        img.decoding = "async";
        img.loading = "eager";

        /* Same box as flags; +/- adjusts --slot-badge-scale on the wrap (clip stays inside black ring) */
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.objectFit = "contain";
        img.style.display = "block";

        let chainIndex = 0;
        img.src = urlChain[chainIndex];
        img.onerror = () => {
          chainIndex += 1;
          if (chainIndex < urlChain.length) {
            img.src = urlChain[chainIndex];
            return;
          }
          img.remove();
          appendSlotBadgeTextFallback(badgeWrap, clubLabel);
        };
        badgeWrap.appendChild(img);
      }
    }
    frontAvatar.appendChild(badgeWrap);
    front.appendChild(frontAvatar);

    const back = document.createElement("div");
    back.className = "slot-face slot-back";

    const backAvatar = document.createElement("div");
    backAvatar.className = "slot-avatar";
    applyStrictAvatarBounds(backAvatar);

    const paths = playerPhotoPaths(player, displayMode);
    if (paths.length) {
      let idx = state.slotPhotoIndexBySlot.get(slotIndex) ?? 0;
      idx = ((idx % paths.length) + paths.length) % paths.length;
      state.slotPhotoIndexBySlot.set(slotIndex, idx);
      const rel = paths[idx];
      const img = document.createElement("img");
      img.className = "slot-img";
      img.alt = "";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.objectFit = "cover";
      img.style.display = "block";
      img.style.borderRadius = "50%"; 
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.remove();
        state.slotPhotoIndexBySlot.delete(slotIndex);
        backAvatar.classList.add("slot-avatar--no-photo");
        appendAvatarTeamFallback(backAvatar, player);
        appendAutoPhotoFetchButton(back, slotIndex, player);
      };
      backAvatar.appendChild(img);
      applyPlayerPhotoFramingForSourceRelPath(img, rel);
      img.src = projectAssetUrlFresh(rel);
    } else {
      state.slotPhotoIndexBySlot.delete(slotIndex);
      backAvatar.classList.add("slot-avatar--no-photo");
      appendAvatarTeamFallback(backAvatar, player);
      appendAutoPhotoFetchButton(back, slotIndex, player);
    }
    appendAutoPhotoFetchButton(back, slotIndex, player);

    const labelContainer = document.createElement("div");
    labelContainer.className = "slot-label-container";
    const label = document.createElement("span");
    label.className = "slot-name";
    label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = pitchSlotDisplayLabel(state, player);

    label.onblur = () => {
      state.customNames[player.name] = label.textContent.trim();
    };
    label.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        label.blur();
      }
    };

    const swapBtn = document.createElement("button");
    swapBtn.className = "slot-swap-btn";
    swapBtn.innerHTML = "⇄";
    swapBtn.title = "Swap player";
    swapBtn.onclick = (e) => {
      e.stopPropagation();
      openSwapModal(slotIndex);
    };

    labelContainer.append(label, swapBtn);
    back.append(backAvatar, labelContainer);

    inner.append(front, back);
    mount.appendChild(inner);
    slotEl.title = paths.length > 1 ? "Double-click avatar to cycle photos" : "";
    /* If we add "flipped" in the same frame as insert, the rotateY transition is skipped.
       Double rAF + optional per-slot delay (see SLOT_FLIP_STAGGER_SEC). */
    if (shouldFlipToPlayers) {
      if (appState.suppressPitchSlotFlipAnimation) {
        inner.style.transition = "none";
        inner.style.transitionDelay = "";
        inner.classList.add("flipped");
        requestAnimationFrame(() => {
          inner.style.removeProperty("transition");
          inner.style.removeProperty("transition-delay");
        });
      } else {
        inner.style.transitionDelay = `${slotIndex * SLOT_FLIP_STAGGER_SEC}s`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            inner.classList.add("flipped");
          });
        });
      }
    }
    if (
      state.videoMode &&
      !appState.isVideoPlaying &&
      !document.body.classList.contains("thumbnail-maker-active")
    ) {
      appendSlotBadgeZoomControls(mount, slotIndex);
    }
  } else {
    const avatar = document.createElement("div");
    avatar.className = "slot-avatar";
    applyStrictAvatarBounds(avatar);

    const paths = playerPhotoPaths(player, displayMode);

    if (paths.length) {
      let idx = state.slotPhotoIndexBySlot.get(slotIndex) ?? 0;
      idx = ((idx % paths.length) + paths.length) % paths.length;
      state.slotPhotoIndexBySlot.set(slotIndex, idx);
      const rel = paths[idx];
      const img = document.createElement("img");
      img.className = "slot-img";
      img.alt = "";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.objectFit = "cover";
      img.style.display = "block";
      img.style.borderRadius = "50%"; 
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.remove();
        state.slotPhotoIndexBySlot.delete(slotIndex);
        avatar.classList.add("slot-avatar--no-photo");
        appendAvatarTeamFallback(avatar, player);
        appendAutoPhotoFetchButton(mount, slotIndex, player);
      };
      avatar.appendChild(img);
      applyPlayerPhotoFramingForSourceRelPath(img, rel);
      img.src = projectAssetUrlFresh(rel);
    } else {
      state.slotPhotoIndexBySlot.delete(slotIndex);
      avatar.classList.add("slot-avatar--no-photo");
      appendAvatarTeamFallback(avatar, player);
      appendAutoPhotoFetchButton(mount, slotIndex, player);
    }
    appendAutoPhotoFetchButton(mount, slotIndex, player);

    const labelContainer = document.createElement("div");
    labelContainer.className = "slot-label-container";

    const label = document.createElement("span");
    label.className = "slot-name";
    label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = pitchSlotDisplayLabel(state, player);

    label.onblur = () => {
      state.customNames[player.name] = label.textContent.trim();
    };
    label.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        label.blur();
      }
    };

    const swapBtn = document.createElement("button");
    swapBtn.className = "slot-swap-btn";
    swapBtn.innerHTML = "⇄";
    swapBtn.title = "Swap player";
    swapBtn.onclick = (e) => {
      e.stopPropagation();
      openSwapModal(slotIndex);
    };

    labelContainer.append(label, swapBtn);
    slotEl.title = paths.length > 1 ? "Double-click avatar to cycle photos" : "";
    mount.append(avatar, labelContainer);
  }
}

export function renderPitch() {
  const state = getState();
  const isThumbnailMakerMode = document.body.classList.contains("thumbnail-maker-active");
  const effectiveFormationId = isThumbnailMakerMode ? "451" : state.formationId;
  const formation = formationById(effectiveFormationId);
  const displayMode = state.displayMode;
  const useVideoQuestionLayout = isThumbnailMakerMode ? true : shouldUseVideoQuestionLayout(state);
  const inlineTeamPicker = document.getElementById("lineups-inline-team-picker");
  if (inlineTeamPicker) {
    inlineTeamPicker.hidden = !!state.currentSquad;
  }

  let xi;
  if (!state.currentSquad) {
    xi = Array(11).fill(null);
  } else if (
    state.customXi &&
    state.customXi.length === formation.slots.length &&
    state.lastFormationId === effectiveFormationId
  ) {
    xi = state.customXi;
  } else {
    xi = pickStartingXI(formation, state.currentSquad);
    state.customXi = [...xi];
    state.lastFormationId = effectiveFormationId;
  }

  appState.currentXi = xi;

  appState.els.pitchSlots.querySelectorAll(".player-slot").forEach((node, i) => {
    const slot = formation.slots[i];
    if (slot) {
      node.style.left = `${slot.x}%`;
      node.style.top = `${slot.y}%`;
      node.style.setProperty("--slot-scale", String(slotPerspectiveScale(slot.y)));
    }
    renderSlot(node, xi[i], displayMode, i, useVideoQuestionLayout);
  });
}

/**
 * Play video: after countdown, do not rebuild pitch (that reloads logos and fights the pitch-height transition).
 * Flip existing flip-cards in place while the field/header layout animates.
 */
export function applyVideoQuestionPostTimerFlip() {
  const state = getState();
  if (!shouldUseVideoQuestionLayout(state) || !appState.els.pitchSlots) {
    return;
  }
  const slots = appState.els.pitchSlots.querySelectorAll(".player-slot.has-player");
  slots.forEach((slotEl) => {
    const inner = slotEl.querySelector(".slot-inner");
    if (!inner || inner.classList.contains("flipped")) {
      return;
    }
    const slotIndex = Number(slotEl.dataset.slotIndex);
    const idx = Number.isFinite(slotIndex) ? slotIndex : 0;
    inner.style.transitionDelay = `${idx * SLOT_FLIP_STAGGER_SEC}s`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inner.classList.add("flipped");
      });
    });
  });
}

let teamHeaderShiftRaf = 0;

function updateTeamHeaderNameCenterShift() {
  const th = appState.els.teamHeader;
  if (!th) {
    return;
  }
  /* Side panel: title is centered in the column; no horizontal shift */
  th.style.setProperty("--team-header-name-center-shift", "0px");
}

function resolveTeamHeaderFlagCountryLabel(state) {
  if (!state?.currentSquad) return "";
  if (state.squadType === "national") {
    return String(state.currentSquad.name || "").trim();
  }
  if (state.squadType === "club") {
    const fromEntry = String(state.selectedEntry?.country || "").trim();
    if (fromEntry) return fromEntry;
    const squadName = String(state.currentSquad?.name || "").trim();
    const hit = appState.teamsIndex?.clubs?.find((c) => c.name === squadName);
    return String(hit?.country || "").trim();
  }
  return "";
}

function getTeamHeaderFlagUrl(countryLabel) {
  const label = String(countryLabel || "").trim();
  if (!label) return null;
  const code = appState.flagcodes[label];
  if (!code) return null;
  if (label === "England") {
    return projectAssetUrl("Nationality images/Europe/England.png");
  }
  return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
}

/** Centers the team name on the viewport with the crest immediately to its left (regular mode only). */
export function scheduleTeamHeaderNameCenterShift() {
  cancelAnimationFrame(teamHeaderShiftRaf);
  teamHeaderShiftRaf = requestAnimationFrame(() => {
    teamHeaderShiftRaf = 0;
    updateTeamHeaderNameCenterShift();
  });
}

let teamHeaderNameFitRaf = 0;

function escapeHtmlForSidePanelName(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extra px toward column center (negative = left in LTR); italic/tracking still read a hair right of bbox math */
const SIDE_PANEL_NAME_CENTER_FINE_PX = -6;

/**
 * Snap each word line to the side column’s horizontal center (logo + title + controls share
 * this width). Uses the column box, not .team-header-name-line, so the target matches the
 * green strip. Double rAF so font-size / grid layout are committed before measuring.
 */
function applySidePanelNameLineCenterNudge(nameEl) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const inners = nameEl.querySelectorAll(".team-header-name-inner");
      if (!inners.length) return;
      inners.forEach((inner) => {
        inner.style.removeProperty("transform");
      });
      void nameEl.offsetWidth;

      const anchor = nameEl.closest(".team-side-panel-column") || nameEl;
      const ar = anchor.getBoundingClientRect();
      const wantX = ar.left + ar.width / 2;

      inners.forEach((inner) => {
        const ir = inner.getBoundingClientRect();
        const haveX = ir.left + ir.width / 2;
        const dx = wantX - haveX;
        const total = dx + SIDE_PANEL_NAME_CENTER_FINE_PX;
        if (Math.abs(total) < 0.005) return;
        inner.style.transform = `translateX(${total}px)`;
      });
    });
  });
}

/** Regular: one word per line when multi-word (nowrap per word); shrink whole title uniformly — never break inside a word. */
function fitRegularSidePanelTeamHeaderNameImpl() {
  const nameEl = appState.els.headerName;
  const th = appState.els.teamHeader;
  if (!nameEl || !th || th.hidden) {
    return;
  }
  if (document.body.classList.contains("shorts-mode")) {
    return;
  }

  const raw = String(nameEl.dataset.headerPlain ?? nameEl.textContent ?? "").trim();
  nameEl.style.removeProperty("font-size");
  nameEl.style.removeProperty("text-align");

  if (!raw) {
    nameEl.textContent = "";
    nameEl.removeAttribute("data-header-plain");
    nameEl.style.removeProperty("white-space");
    return;
  }

  const words = raw.split(/\s+/).filter(Boolean);
  /* Always use line + inner (even one word) so flex/grid centering matches after inline font-size shrink */
  nameEl.innerHTML = words
    .map(
      (w) =>
        `<span class="team-header-name-line"><span class="team-header-name-inner">${escapeHtmlForSidePanelName(
          w
        )}</span></span>`
    )
    .join("");
  nameEl.style.whiteSpace = "normal";

  void nameEl.offsetWidth;

  const clearTitleInnerFontSizes = () => {
    nameEl.querySelectorAll(".team-header-name-inner").forEach((el) => {
      el.style.removeProperty("font-size");
      el.style.removeProperty("transform");
    });
  };
  clearTitleInnerFontSizes();

  const cs = getComputedStyle(nameEl);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const thRect = th.getBoundingClientRect();
  const logoBlock = th.querySelector(".team-header-logo-block");
  const lbRect = logoBlock?.getBoundingClientRect();
  const lbCs = logoBlock ? getComputedStyle(logoBlock) : null;
  const lbPadX = lbCs
    ? (parseFloat(lbCs.paddingLeft) || 0) + (parseFloat(lbCs.paddingRight) || 0)
    : 0;
  /* Prefer the title’s own box; fallback to logo block inner width; avoids narrow intrinsic width */
  const fromName = Math.max(
    nameEl.clientWidth,
    nameEl.getBoundingClientRect().width
  );
  const fromLb = lbRect ? lbRect.width - lbPadX : 0;
  let containerW = Math.max(fromName, fromLb, thRect.width - lbPadX);
  if (containerW < 48) {
    containerW = thRect.width || fromLb || fromName;
  }
  if (containerW < 48) {
    nameEl.style.textAlign = "center";
    applySidePanelNameLineCenterNudge(nameEl);
    return;
  }

  const maxW = Math.max(120, containerW - padX);
  const tol = 12;
  const maxLineScrollWidth = () => {
    const inners = nameEl.querySelectorAll(".team-header-name-inner");
    if (inners.length) {
      let m = 0;
      inners.forEach((el) => {
        m = Math.max(m, el.scrollWidth);
      });
      return m;
    }
    return nameEl.scrollWidth;
  };
  const fits = () => maxLineScrollWidth() <= maxW + tol;

  const hardMinPx = 14;
  /* Shrink font on .team-header-name-inner only — inline h2 font-size throws off grid/em centering vs clamp() */
  const setInnerFontSizesPx = (px) => {
    nameEl.querySelectorAll(".team-header-name-inner").forEach((el) => {
      el.style.removeProperty("transform");
      el.style.fontSize = `${px}px`;
    });
    nameEl.style.textAlign = "center";
    void nameEl.offsetWidth;
  };

  if (fits()) {
    nameEl.style.textAlign = "center";
    applySidePanelNameLineCenterNudge(nameEl);
    return;
  }

  const firstInner = nameEl.querySelector(".team-header-name-inner");
  const hi = Math.max(
    hardMinPx,
    parseFloat(
      firstInner ? getComputedStyle(firstInner).fontSize : getComputedStyle(nameEl).fontSize
    ) || 48
  );

  /* Monotonic: smaller px ⇒ narrower lines. Find largest px in [hardMin, hi] that fits. */
  setInnerFontSizesPx(hardMinPx);
  if (!fits()) {
    setInnerFontSizesPx(hi);
    const w = Math.max(1, maxLineScrollWidth());
    setInnerFontSizesPx(Math.max(hardMinPx, hi * ((maxW + tol) / w)));
    nameEl.style.textAlign = "center";
    applySidePanelNameLineCenterNudge(nameEl);
    return;
  }

  setInnerFontSizesPx(hi);
  if (fits()) {
    nameEl.style.removeProperty("font-size");
    clearTitleInnerFontSizes();
    nameEl.style.textAlign = "center";
    applySidePanelNameLineCenterNudge(nameEl);
    return;
  }

  let goodLo = hardMinPx;
  let badHi = hi;
  while (badHi - goodLo > 0.4) {
    const mid = (goodLo + badHi) / 2;
    setInnerFontSizesPx(mid);
    if (fits()) {
      goodLo = mid;
    } else {
      badHi = mid;
    }
  }
  setInnerFontSizesPx(goodLo);
  if (!fits()) {
    const w = Math.max(1, maxLineScrollWidth());
    const innerEl = nameEl.querySelector(".team-header-name-inner");
    const cur =
      parseFloat(innerEl ? getComputedStyle(innerEl).fontSize : "") || goodLo;
    setInnerFontSizesPx(Math.max(hardMinPx, cur * ((maxW + tol) / w)));
  }
  nameEl.style.textAlign = "center";
  applySidePanelNameLineCenterNudge(nameEl);
}

function fitShortsTeamHeaderNameImpl() {
  const nameEl = appState.els.headerName;
  const th = appState.els.teamHeader;
  if (!nameEl || !th || th.hidden) {
    return;
  }
  if (!document.body.classList.contains("shorts-mode")) {
    nameEl.style.removeProperty("font-size");
    nameEl.querySelectorAll(".team-header-name-inner").forEach((el) => {
      el.style.removeProperty("font-size");
      el.style.removeProperty("transform");
    });
    return;
  }
  const plain = String(nameEl.dataset.headerPlain ?? nameEl.textContent ?? "").trim();
  if (plain) {
    nameEl.textContent = plain;
  }
  const column = nameEl.closest(".team-side-panel-column");
  const maxW = Math.max(
    64,
    column?.clientWidth ?? th.clientWidth ?? th.getBoundingClientRect().width
  );

  nameEl.style.removeProperty("font-size");
  nameEl.style.whiteSpace = "nowrap";
  void nameEl.offsetWidth;

  let high = parseFloat(getComputedStyle(nameEl).fontSize) || 36;
  nameEl.style.fontSize = `${high}px`;
  void nameEl.offsetWidth;
  if (nameEl.scrollWidth <= maxW + 1) {
    nameEl.style.removeProperty("font-size");
    return;
  }

  let low = 6;
  while (high - low > 0.25) {
    const mid = (low + high) / 2;
    nameEl.style.fontSize = `${mid}px`;
    void nameEl.offsetWidth;
    if (nameEl.scrollWidth > maxW + 1) {
      high = mid;
    } else {
      low = mid;
    }
  }

  let fs = Math.max(6, low);
  nameEl.style.fontSize = `${fs}px`;
  void nameEl.offsetWidth;
  while (nameEl.scrollWidth > maxW + 1 && fs > 6) {
    fs -= 0.5;
    nameEl.style.fontSize = `${fs}px`;
    void nameEl.offsetWidth;
  }
}

/** Regular + shorts: refit title after layout / mode. */
export function scheduleTeamHeaderSidePanelNameFit() {
  cancelAnimationFrame(teamHeaderNameFitRaf);
  teamHeaderNameFitRaf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      teamHeaderNameFitRaf = 0;
      if (document.body.classList.contains("shorts-mode")) {
        fitShortsTeamHeaderNameImpl();
      } else {
        fitRegularSidePanelTeamHeaderNameImpl();
      }
    });
  });
}

/** Shorts: one-line shrink fit. Same scheduler as regular side panel (see scheduleTeamHeaderSidePanelNameFit). */
export function scheduleShortsTeamNameFit() {
  scheduleTeamHeaderSidePanelNameFit();
}

export function renderHeader() {
  syncTeamHeaderLogoVarsFromLevel();
  const state = getState();
  const { els } = appState;
  const quizType = appState.els.inQuizType?.value || "nat-by-club";
  const { previewPostTimer } = getVideoQuestionPreviewState(state);

  document.body.classList.toggle("video-mode-on", !!state.videoMode);
  document.body.classList.toggle("play-video-active", !!appState.isVideoPlaying);

  if (els.teamHeader) {
    const st = state.squadType;
    els.teamHeader.dataset.squadType = st === "national" ? "national" : "club";
    els.teamHeader.classList.toggle("video-preview-revealed", previewPostTimer);
    els.teamHeader.classList.remove("video-hidden", "video-revealed");
  }

  const logoBlock = document.getElementById("team-header-logo-block");
  const fetchLogoBtn = document.getElementById("team-header-fetch-logo");
  const swapLogoBtn = document.getElementById("team-header-swap-logo");
  const clearTeamBtn = document.getElementById("team-header-clear-team");
  const pitchSwapBtn = document.getElementById("pitch-swap-logo");
  const flagSectionEl = document.getElementById("team-side-panel-flag-section");

  if (!state.currentSquad) {
    if (els.headerName) {
      els.headerName.textContent = "";
      els.headerName.removeAttribute("data-header-plain");
      els.headerName.style.removeProperty("font-size");
      els.headerName.style.removeProperty("white-space");
    }
    if (els.headerLogo) els.headerLogo.hidden = true;
    if (els.headerFlag) {
      els.headerFlag.hidden = true;
      els.headerFlag.removeAttribute("src");
    }
    resetTeamHeaderStripeVars(els.teamHeader);
    if (flagSectionEl) {
      flagSectionEl.classList.add("team-side-panel-flag-section--empty");
    }
    if (fetchLogoBtn) fetchLogoBtn.hidden = true;
    if (swapLogoBtn) swapLogoBtn.hidden = true;
    if (clearTeamBtn) clearTeamBtn.hidden = true;
    if (pitchSwapBtn) pitchSwapBtn.hidden = true;
    if (els.teamVoiceControls) els.teamVoiceControls.hidden = true;
    syncTeamVoiceControls("", appState.els.inQuizType?.value || "nat-by-club");
    if (logoBlock) {
      logoBlock.classList.add("team-header-logo-block--empty");
      logoBlock.classList.remove("team-header-show-swap-logo");
    }
    syncTeamSidebarPanel(els, false, "");
    scheduleTeamHeaderNameCenterShift();
    scheduleTeamHeaderSidePanelNameFit();
    return;
  }
  const displayedHeaderTeamName = resolveHeaderTeamDisplayName(state, quizType);
  if (els.headerName) {
    els.headerName.textContent = displayedHeaderTeamName;
    els.headerName.dataset.headerPlain = displayedHeaderTeamName;
  }
  if (els.headerFlag) {
    const flagLabel = resolveTeamHeaderFlagCountryLabel(state);
    const flagUrl = getTeamHeaderFlagUrl(flagLabel);
    els.headerFlag.alt = flagLabel ? `Flag for ${flagLabel}` : "";
    if (flagUrl) {
      if (/^https?:\/\//i.test(flagUrl)) {
        els.headerFlag.crossOrigin = "anonymous";
      } else {
        els.headerFlag.removeAttribute("crossorigin");
      }
      els.headerFlag.onload = () => {
        scheduleTeamHeaderNameCenterShift();
        scheduleTeamHeaderSidePanelNameFit();
        applyTeamHeaderStripesFromFlagImage(els.headerFlag, els.teamHeader);
      };
      els.headerFlag.onerror = () => {
        els.headerFlag.hidden = true;
        els.headerFlag.removeAttribute("src");
        resetTeamHeaderStripeVars(els.teamHeader);
        if (flagSectionEl) {
          flagSectionEl.classList.add("team-side-panel-flag-section--empty");
        }
        scheduleTeamHeaderNameCenterShift();
        scheduleTeamHeaderSidePanelNameFit();
      };
      els.headerFlag.src = flagUrl;
      els.headerFlag.hidden = false;
      if (els.headerFlag.complete) {
        scheduleTeamHeaderNameCenterShift();
        scheduleTeamHeaderSidePanelNameFit();
        applyTeamHeaderStripesFromFlagImage(els.headerFlag, els.teamHeader);
      }
    } else {
      els.headerFlag.hidden = true;
      els.headerFlag.removeAttribute("src");
      resetTeamHeaderStripeVars(els.teamHeader);
      scheduleTeamHeaderNameCenterShift();
      scheduleTeamHeaderSidePanelNameFit();
    }
  }
  if (clearTeamBtn) clearTeamBtn.hidden = false;
  syncTeamVoiceControls(
    displayedHeaderTeamName,
    appState.els.inQuizType?.value || "nat-by-club"
  );
  if (els.teamVoiceControls) {
    els.teamVoiceControls.hidden = !state.currentSquad || appState.isVideoPlaying;
  }
  if (els.headerLogo) {
    const chain = getHeaderLogoUrlChain(
      state,
      state.currentSquad,
      state.squadType,
      state.selectedEntry?.name,
      quizType
    ).map((u) => withProjectAssetCacheBust(u));
    if (chain.length) {
      const logoImg = els.headerLogo;
      let chainIndex = 0;
      logoImg.onload = () => {
        scheduleTeamHeaderNameCenterShift();
        scheduleTeamHeaderSidePanelNameFit();
      };
      logoImg.onerror = () => {
        chainIndex += 1;
        if (chainIndex < chain.length) {
          logoImg.src = chain[chainIndex];
          return;
        }
        logoImg.hidden = true;
        logoImg.removeAttribute("src");
        const fetchLogoBtn = document.getElementById("team-header-fetch-logo");
        if (fetchLogoBtn) fetchLogoBtn.hidden = false;
        if (logoBlock) {
          logoBlock.classList.add("team-header-logo-block--empty");
        }
        scheduleTeamHeaderNameCenterShift();
        scheduleTeamHeaderSidePanelNameFit();
      };
      logoImg.src = chain[0];
      logoImg.hidden = false;
      if (logoImg.complete) {
        scheduleTeamHeaderNameCenterShift();
        scheduleTeamHeaderSidePanelNameFit();
      }
    } else {
      els.headerLogo.hidden = true;
    }
  }
  const showSwapLogo =
    state.squadType === "club" &&
    state.currentSquad &&
    quizType !== "club-by-nat";
  const headerCollapsed = !els.teamHeader?.classList.contains("team-header--show");
  if (swapLogoBtn) {
    /* Video mode collapses the header — use pitch-level control instead */
    swapLogoBtn.hidden = !showSwapLogo || (state.videoMode && headerCollapsed);
  }
  if (pitchSwapBtn) {
    pitchSwapBtn.hidden =
      !showSwapLogo || !state.videoMode || !headerCollapsed;
  }
  if (fetchLogoBtn) {
    const empty = Boolean(els.headerLogo?.hidden);
    fetchLogoBtn.hidden = !state.currentSquad || !empty;
  }
  if (logoBlock) {
    const empty = Boolean(els.headerLogo?.hidden);
    logoBlock.classList.toggle("team-header-logo-block--empty", empty);
    logoBlock.classList.toggle(
      "team-header-show-swap-logo",
      showSwapLogo && empty
    );
  }
  if (flagSectionEl && els.headerFlag) {
    const noFlag =
      els.headerFlag.hidden || !els.headerFlag.getAttribute("src");
    flagSectionEl.classList.toggle("team-side-panel-flag-section--empty", noFlag);
  }
  /* Video mode on + question layout: hide side panel until post-reveal (countdown or manual preview).
     Same during Play Video so the strip opens only after the timer, not between levels. */
  const hideSidebarInVideoHold =
    shouldUseVideoQuestionLayout(state) && state.videoMode && !previewPostTimer;
  const sidebarWantsOpen =
    !!state.currentSquad &&
    !els.teamHeader.hidden &&
    !hideSidebarInVideoHold;
  syncTeamSidebarPanel(
    els,
    sidebarWantsOpen,
    sidebarWantsOpen ? getTeamSidebarSlideKey(state) : ""
  );
  scheduleTeamHeaderNameCenterShift();
  scheduleTeamHeaderSidePanelNameFit();
}