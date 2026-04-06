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

/** Delay between each slot starting the logo→player flip (wave / one-by-one). */
const SLOT_FLIP_STAGGER_SEC = 0.09;
/** Must match `.slot-inner` `transition` duration in css/components/pitch.css */
const SLOT_FLIP_DURATION_SEC = 0.6;

/** Time from first flip start until last flip finishes (sync with pitch height transition). */
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

const INTERNATIONAL_POOL_URL = "data/international-club-pool-by-nationality.json";
const AUTO_FETCH_PLAYER_PHOTO_ENDPOINT = "/__player-photo/auto-fetch";
const DELETE_PLAYER_PHOTO_ENDPOINT = "/__player-photo/delete";
const AUTO_365_PHOTO_RE = /(^|\/)auto - 365scores(?: - \d+)?\.(png|jpe?g|webp|avif|gif)$/i;
const AUTO_FUTGG_PHOTO_RE = /(^|\/)auto - fut\.gg(?: - \d+)?\.(png|jpe?g|webp|avif|gif)$/i;
const autoPhotoLastSourceBySlot = new Map();

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
    const pool =
      (appState.internationalClubPool && nat && appState.internationalClubPool[nat]) || [];
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
      const pool =
        (appState.internationalClubPool && nation && appState.internationalClubPool[nation]) || [];
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
function appendSlotBadgeZoomControls(slotEl, slotIndex) {
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
      const wrap = slotEl.querySelector(".slot-badge-scale-wrap");
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
  slotEl.appendChild(controls);
}

function renderSlot(slotEl, player, displayMode, slotIndex, useVideoQuestionLayout) {
  const state = getState();
  slotEl.replaceChildren();
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
    slotEl.appendChild(inner);
    slotEl.title = paths.length > 1 ? "Double-click avatar to cycle photos" : "";
    /* If we add "flipped" in the same frame as insert, the 0.6s rotateY transition is skipped.
       Defer + per-slot transition-delay so slots flip in a cascade (not all at once). */
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
    if (state.videoMode && !appState.isVideoPlaying) {
      appendSlotBadgeZoomControls(slotEl, slotIndex);
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
        appendAutoPhotoFetchButton(slotEl, slotIndex, player);
      };
      avatar.appendChild(img);
      applyPlayerPhotoFramingForSourceRelPath(img, rel);
      img.src = projectAssetUrlFresh(rel);
    } else {
      state.slotPhotoIndexBySlot.delete(slotIndex);
      avatar.classList.add("slot-avatar--no-photo");
      appendAvatarTeamFallback(avatar, player);
      appendAutoPhotoFetchButton(slotEl, slotIndex, player);
    }
    appendAutoPhotoFetchButton(slotEl, slotIndex, player);

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
    slotEl.append(avatar, labelContainer);
  }
}

export function renderPitch() {
  const state = getState();
  const formation = formationById(state.formationId);
  const displayMode = state.displayMode;
  const useVideoQuestionLayout = shouldUseVideoQuestionLayout(state);
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
    state.lastFormationId === state.formationId
  ) {
    xi = state.customXi;
  } else {
    xi = pickStartingXI(formation, state.currentSquad);
    state.customXi = [...xi];
    state.lastFormationId = state.formationId;
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
  const { els } = appState;
  const th = els.teamHeader;
  if (!th) {
    return;
  }
  if (th.hidden || document.body.classList.contains("shorts-mode")) {
    th.style.setProperty("--team-header-name-center-shift", "0px");
    return;
  }
  const img = els.headerLogo;
  const cluster = th.querySelector(".team-header-title-cluster");
  if (!cluster || !img || img.hidden) {
    th.style.setProperty("--team-header-name-center-shift", "0px");
    return;
  }
  const inner = th.querySelector(".team-header-logo-inner");
  if (!inner) {
    th.style.setProperty("--team-header-name-center-shift", "0px");
    return;
  }
  /* Layout width only — ignores transform: scale() so zooming the crest does not move the title */
  const crestW = inner.offsetWidth || inner.getBoundingClientRect().width;
  const cs = getComputedStyle(cluster);
  let gapPx = parseFloat(cs.columnGap);
  if (!Number.isFinite(gapPx)) gapPx = parseFloat(cs.gap);
  if (!Number.isFinite(gapPx)) gapPx = 32;
  const shift = -0.5 * (crestW + gapPx);
  th.style.setProperty("--team-header-name-center-shift", `${shift}px`);
}

/** Centers the team name on the viewport with the crest immediately to its left (regular mode only). */
export function scheduleTeamHeaderNameCenterShift() {
  cancelAnimationFrame(teamHeaderShiftRaf);
  teamHeaderShiftRaf = requestAnimationFrame(() => {
    teamHeaderShiftRaf = 0;
    updateTeamHeaderNameCenterShift();
  });
}

let shortsNameFitRaf = 0;

function fitShortsTeamHeaderNameImpl() {
  const nameEl = appState.els.headerName;
  const th = appState.els.teamHeader;
  if (!nameEl || !th || th.hidden) {
    return;
  }
  if (!document.body.classList.contains("shorts-mode")) {
    nameEl.style.removeProperty("font-size");
    return;
  }
  const cluster = nameEl.closest(".team-header-title-cluster");
  const maxW = Math.max(
    64,
    cluster?.clientWidth ?? th.clientWidth ?? th.getBoundingClientRect().width
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

/** Shorts: keep the title on one line and shrink font until it fits the column. */
export function scheduleShortsTeamNameFit() {
  cancelAnimationFrame(shortsNameFitRaf);
  shortsNameFitRaf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      shortsNameFitRaf = 0;
      fitShortsTeamHeaderNameImpl();
    });
  });
}

export function renderHeader() {
  syncTeamHeaderLogoVarsFromLevel();
  const state = getState();
  const { els } = appState;
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);

  document.body.classList.toggle("video-mode-on", !!state.videoMode);
  document.body.classList.toggle("play-video-active", !!appState.isVideoPlaying);

  if (els.teamHeader) {
    const st = state.squadType;
    els.teamHeader.dataset.squadType = st === "national" ? "national" : "club";
    els.teamHeader.classList.toggle("video-preview-revealed", previewPostTimer);
  }

  if (previewPreTimer) {
    if (!appState.isVideoPlaying || !els.teamHeader.classList.contains("video-revealed")) {
      els.teamHeader.classList.remove("video-revealed");
      els.teamHeader.classList.add("video-hidden");
    }
  } else if (previewPostTimer) {
    els.teamHeader.classList.remove("video-hidden");
    els.teamHeader.classList.add("video-revealed");
  } else if (!state.videoMode) {
    els.teamHeader.classList.remove("video-hidden");
    els.teamHeader.classList.remove("video-revealed");
  }

  const logoBlock = document.getElementById("team-header-logo-block");
  const fetchLogoBtn = document.getElementById("team-header-fetch-logo");
  const swapLogoBtn = document.getElementById("team-header-swap-logo");
  const clearTeamBtn = document.getElementById("team-header-clear-team");
  const pitchSwapBtn = document.getElementById("pitch-swap-logo");

  if (!state.currentSquad) {
    if (els.headerName) els.headerName.textContent = "";
    if (els.headerLogo) els.headerLogo.hidden = true;
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
    scheduleTeamHeaderNameCenterShift();
    scheduleShortsTeamNameFit();
    return;
  }
  if (els.headerName) els.headerName.textContent = state.currentSquad.name || state.selectedEntry.name;
  if (clearTeamBtn) clearTeamBtn.hidden = false;
  syncTeamVoiceControls(
    String(state.currentSquad?.name || state.selectedEntry?.name || ""),
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
      state.selectedEntry?.name
    ).map((u) => withProjectAssetCacheBust(u));
    if (chain.length) {
      const logoImg = els.headerLogo;
      let chainIndex = 0;
      logoImg.onload = () => scheduleTeamHeaderNameCenterShift();
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
      };
      logoImg.src = chain[0];
      logoImg.hidden = false;
      if (logoImg.complete) {
        scheduleTeamHeaderNameCenterShift();
      }
    } else {
      els.headerLogo.hidden = true;
    }
  }
  const quizType = appState.els.inQuizType?.value || "nat-by-club";
  const showSwapLogo =
    state.squadType === "club" &&
    state.currentSquad &&
    quizType !== "club-by-nat";
  const headerCollapsed =
    Boolean(els.teamHeader?.classList.contains("video-hidden"));
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
  scheduleTeamHeaderNameCenterShift();
  scheduleShortsTeamNameFit();
}