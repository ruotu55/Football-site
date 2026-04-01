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
import { projectAssetUrl, projectAssetUrlFresh } from "./paths.js";
import { pickStartingXI } from "./pick-xi.js";
import { getClubLogoUrl, playerPhotoPaths, slotPerspectiveScale } from "./photo-helpers.js";

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

  const allPlayers = [
    ...(state.currentSquad.goalkeepers || []),
    ...(state.currentSquad.defenders || []),
    ...(state.currentSquad.midfielders || []),
    ...(state.currentSquad.attackers || []),
  ];

  const currentNames = appState.currentXi.filter((p) => p).map((p) => p.name);
  appState.swapAvailablePlayers = allPlayers.filter((p) => !currentNames.includes(p.name));
  appState.swapAvailablePlayers.sort((a, b) => a.name.localeCompare(b.name));

  appState.els.swapSearch.value = "";
  renderSwapList(appState.swapAvailablePlayers);

  appState.els.swapModal.hidden = false;
  appState.els.swapSearch.focus();
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
    posSpan.textContent = p.position || "UNK";

    btn.append(nameSpan, posSpan);

    btn.onclick = () => {
      const state = getState();
      state.customXi[appState.swapActiveSlotIndex] = p;
      els.swapModal.hidden = true;
      renderPitch();
    };

    els.swapList.appendChild(btn);
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
      if (code) {
        // Higher-resolution PNG keeps flags sharp while remaining performant.
        const flagUrl = `https://flagcdn.com/w320/${code.toLowerCase()}.png`;
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
      const logoUrl = getClubLogoUrl(clubName);
      const clubLabel = player.club?.trim() ? player.club.trim() : "Unknown club";

      if (!logoUrl) {
        appendSlotBadgeTextFallback(badgeWrap, clubLabel);
      } else {
        const img = document.createElement("img");
        img.className = "slot-img";
        img.loading = "lazy";
        img.decoding = "async";

        /* Same box as flags; +/- adjusts --slot-badge-scale on the wrap (clip stays inside black ring) */
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.objectFit = "contain";
        img.style.display = "block";

        img.src = logoUrl;
        img.onerror = () => {
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
      img.src = projectAssetUrlFresh(rel);
      img.onerror = () => {
        img.remove();
        state.slotPhotoIndexBySlot.delete(slotIndex);
        backAvatar.classList.add("slot-avatar--no-photo");
        appendAvatarTeamFallback(backAvatar, player);
      };
      backAvatar.appendChild(img);
    } else {
      state.slotPhotoIndexBySlot.delete(slotIndex);
      backAvatar.classList.add("slot-avatar--no-photo");
      appendAvatarTeamFallback(backAvatar, player);
    }

    const labelContainer = document.createElement("div");
    labelContainer.className = "slot-label-container";
    const label = document.createElement("span");
    label.className = "slot-name";
    label.contentEditable = "false";
    label.spellcheck = false;
    label.textContent = pitchSlotDisplayLabel(state, player);

    labelContainer.appendChild(label);
    back.append(backAvatar, labelContainer);

    inner.append(front, back);
    slotEl.appendChild(inner);
    /* If we add "flipped" in the same frame as insert, the 0.6s rotateY transition is skipped.
       Defer + per-slot transition-delay so slots flip in a cascade (not all at once). */
    if (shouldFlipToPlayers) {
      inner.style.transitionDelay = `${slotIndex * SLOT_FLIP_STAGGER_SEC}s`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inner.classList.add("flipped");
        });
      });
    }
    if (state.videoMode) {
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
      img.src = projectAssetUrlFresh(rel);
      img.onerror = () => {
        img.remove();
        state.slotPhotoIndexBySlot.delete(slotIndex);
        avatar.classList.add("slot-avatar--no-photo");
        appendAvatarTeamFallback(avatar, player);
      };
      avatar.appendChild(img);
    } else {
      state.slotPhotoIndexBySlot.delete(slotIndex);
      avatar.classList.add("slot-avatar--no-photo");
      appendAvatarTeamFallback(avatar, player);
    }

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

  if (!state.currentSquad) {
    if (els.headerName) els.headerName.textContent = "";
    if (els.headerLogo) els.headerLogo.hidden = true;
    if (logoBlock) logoBlock.classList.add("team-header-logo-block--empty");
    scheduleTeamHeaderNameCenterShift();
    scheduleShortsTeamNameFit();
    return;
  }
  if (els.headerName) els.headerName.textContent = state.currentSquad.name || state.selectedEntry.name;
  if (els.headerLogo) {
    if (state.currentSquad.imagePath) {
      const logoImg = els.headerLogo;
      logoImg.onload = () => scheduleTeamHeaderNameCenterShift();
      logoImg.onerror = () => scheduleTeamHeaderNameCenterShift();
      logoImg.src = projectAssetUrl(state.currentSquad.imagePath);
      logoImg.hidden = false;
      if (logoImg.complete) {
        scheduleTeamHeaderNameCenterShift();
      }
    } else {
      els.headerLogo.hidden = true;
    }
  }
  if (logoBlock) {
    logoBlock.classList.toggle("team-header-logo-block--empty", Boolean(els.headerLogo?.hidden));
  }
  scheduleTeamHeaderNameCenterShift();
  scheduleShortsTeamNameFit();
}