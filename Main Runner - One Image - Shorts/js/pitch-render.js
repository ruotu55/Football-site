/* js/pitch-render.js — career path mode */

import {
  appState,
  DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X,
  DEFAULT_SHORTS_VIDEO_SILHOUETTE_Y_OFFSET,
  DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_Y_OFFSET,
  DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_X,
  DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
  DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
  DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
  getDefaultPlayerPictureValues,
  getState,
} from "./state.js";
import {
  projectAssetUrl,
  projectAssetUrlFresh,
  bumpProjectAssetCacheBust,
  careerReadyPhotoClubName,
  careerReadyPhotoRelCandidates,
  careerReadyPhotoRelCandidatesForStem,
  careerReadyPhotoStemForVariant,
  CAREER_NO_PHOTO_LABEL,
  CAREER_NO_PLAYER_LABEL,
} from "./paths.js";
import {
  clearCareerClubFavorite,
  clearCareerPictureFavorite,
  getCareerClubFavoriteSize,
  getCareerPictureFavoriteKey,
  getCareerPictureFavoriteSize,
  hasCareerClubFavorite,
  hasCareerPictureFavorite,
  saveCareerClubFavorite,
  saveCareerPictureFavorite,
} from "./career-size-favorites.js";
import { getClubLogoOtherTeamsRelPath } from "./photo-helpers.js";
import { preloadImage, preloadImages, getCachedImage, putCachedImage, applyCachedSrc, applyCachedSrcChain, isImageCached } from "../../.Storage/shared/image-cache.js";
import { STAGE_VIDEO_LEVEL_ENTER_MS } from "./constants.js";
import { t, translatePositionAbbrev } from "./i18n.js";
import { syncPlayerVoiceControls as syncPlayerVoiceControlsForActivePlayer } from "./player-voice-manager.js";
import {
  isFakeInfoQuiz,
  fakeInfoPickForLevel,
  fakeInfoPositionAbbrev,
} from "./fake-info-mode.js";

const READY_PHOTO_FROM_URL_ENDPOINT = "/__ready-photo/from-url";
const READY_PHOTO_FROM_URL_FETCH_MS = 120000;

async function pickLoadableReadyPhotoUrlForVariant(playerName, clubName, variantIndex) {
  if (!playerName) return "";
  const v = Math.max(1, Math.floor(Number(variantIndex) || 1));
  const tryStem = async (stem) => {
    for (const rel of careerReadyPhotoRelCandidatesForStem(playerName, clubName ?? "", stem)) {
      const url = projectAssetUrlFresh(rel);
      const img = await preloadImage(url);
      if (img.naturalWidth) return url;
    }
    return "";
  };
  let url = await tryStem(careerReadyPhotoStemForVariant(playerName, v));
  if (url) return url;
  if (v !== 1) url = await tryStem(careerReadyPhotoStemForVariant(playerName, 1));
  return url || "";
}

async function readyPhotoVariantExists(playerName, clubName, variantIndex) {
  if (!playerName) return false;
  const v = Math.max(1, Math.floor(Number(variantIndex) || 1));
  const stem = careerReadyPhotoStemForVariant(playerName, v);
  for (const rel of careerReadyPhotoRelCandidatesForStem(playerName, clubName ?? "", stem)) {
    const url = projectAssetUrlFresh(rel);
    if (getCachedImage(url)?.naturalWidth) return true;
    try {
      const r = await fetch(url, { method: "HEAD", mode: "same-origin", cache: "no-store" });
      if (r.ok) return true;
    } catch {
      /* ignore */
    }
    try {
      const img = await preloadImage(url);
      if (img.naturalWidth) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

const CAREER_READY_PHOTO_VARIANT_PROBE_MAX = 24;

async function listExistingReadyPhotoVariantIndices(playerName, clubName) {
  const out = [];
  for (let v = 1; v <= CAREER_READY_PHOTO_VARIANT_PROBE_MAX; v += 1) {
    if (await readyPhotoVariantExists(playerName, clubName, v)) out.push(v);
  }
  return out;
}

function careerReadyPhotoFetchServerActive() {
  return typeof location !== "undefined" && location.protocol === "http:" && location.hostname !== "";
}

async function requestReadyPhotoFromUrl(playerName, clubName, imageUrl) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    ctrl &&
    setTimeout(() => {
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
    }, READY_PHOTO_FROM_URL_FETCH_MS);
  let response;
  try {
    response = await fetch(READY_PHOTO_FROM_URL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, clubName: clubName ?? "", imageUrl }),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new Error(
        `The download took longer than ${READY_PHOTO_FROM_URL_FETCH_MS / 1000}s and was cancelled.`,
      );
    }
    throw new Error(
      e && e.message
        ? String(e.message)
        : "Could not reach the local server. Open the runner with run_site.py (same port as this page).",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const err = data && data.error ? String(data.error) : `Request failed (${response.status})`;
    throw new Error(err);
  }
  return data;
}

function createCareerGetPhotoControls(playerName, clubName) {
  const host = document.createElement("div");
  host.className = "career-get-photo-actions";
  host.hidden = true;
  const btnRow = document.createElement("div");
  btnRow.className = "career-get-photo-buttons-row";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "career-get-photo-btn";
  btn.textContent = "Get photo";
  btn.title =
    "Paste a portrait image URL; the local server saves it under Ready photos in a folder named after the player and current club.";
  const hint = document.createElement("div");
  hint.className = "career-get-photo-hint";
  hint.hidden = true;

  const modal = document.createElement("div");
  modal.className = "career-ready-photo-url-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "false");

  const panel = document.createElement("div");
  panel.className = "career-ready-photo-url-modal__panel";

  const title = document.createElement("div");
  title.className = "career-ready-photo-url-modal__title";
  title.textContent = "Paste image URL";

  const input = document.createElement("input");
  input.type = "url";
  input.className = "career-ready-photo-url-modal__input";
  input.placeholder = "https://…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      btnDl.click();
    }
  });

  const rowErr = document.createElement("div");
  rowErr.className = "career-ready-photo-url-modal__err";
  rowErr.hidden = true;

  const rowBtns = document.createElement("div");
  rowBtns.className = "career-ready-photo-url-modal__buttons";

  const btnDl = document.createElement("button");
  btnDl.type = "button";
  btnDl.className =
    "career-ready-photo-url-modal__btn career-ready-photo-url-modal__btn--primary";
  btnDl.textContent = "Download";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "career-ready-photo-url-modal__btn";
  btnCancel.textContent = "Cancel";

  rowBtns.appendChild(btnDl);
  rowBtns.appendChild(btnCancel);
  panel.appendChild(title);
  panel.appendChild(input);
  panel.appendChild(rowErr);
  panel.appendChild(rowBtns);
  modal.appendChild(panel);

  const switchModal = document.createElement("div");
  switchModal.className = "career-ready-photo-switch-modal";
  switchModal.hidden = true;
  switchModal.setAttribute("role", "dialog");
  switchModal.setAttribute("aria-label", "Choose Ready photo");
  const switchPanel = document.createElement("div");
  switchPanel.className = "career-ready-photo-switch-modal__panel";
  const switchTitle = document.createElement("div");
  switchTitle.className = "career-ready-photo-switch-modal__title";
  switchTitle.textContent = "Choose Ready photo";
  const switchList = document.createElement("div");
  switchList.className = "career-ready-photo-switch-modal__list";
  const switchCloseRow = document.createElement("div");
  switchCloseRow.className = "career-ready-photo-switch-modal__footer";
  const switchBtnClose = document.createElement("button");
  switchBtnClose.type = "button";
  switchBtnClose.className = "career-ready-photo-switch-modal__btn-close";
  switchBtnClose.textContent = "Close";
  switchCloseRow.appendChild(switchBtnClose);
  switchPanel.appendChild(switchTitle);
  switchPanel.appendChild(switchList);
  switchPanel.appendChild(switchCloseRow);
  switchModal.appendChild(switchPanel);

  let switchKeyHandler = null;

  const closeSwitchModal = () => {
    switchModal.classList.remove("career-ready-photo-switch-modal--portal");
    if (switchModal.parentElement === document.body) {
      host.appendChild(switchModal);
    }
    switchModal.hidden = true;
    switchList.innerHTML = "";
    if (switchKeyHandler) {
      document.removeEventListener("keydown", switchKeyHandler);
      switchKeyHandler = null;
    }
  };

  const openSwitchModal = async () => {
    closeModal();
    switchList.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "career-ready-photo-switch-modal__loading";
    loading.textContent = "Loading…";
    switchList.appendChild(loading);
    switchModal.classList.add("career-ready-photo-switch-modal--portal");
    if (switchModal.parentElement !== document.body) {
      document.body.appendChild(switchModal);
    }
    switchModal.hidden = false;
    switchKeyHandler = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeSwitchModal();
      }
    };
    document.addEventListener("keydown", switchKeyHandler);

    const indices = await listExistingReadyPhotoVariantIndices(playerName, clubName);
    switchList.innerHTML = "";
    if (!indices.length) {
      const empty = document.createElement("div");
      empty.className = "career-ready-photo-switch-modal__empty";
      empty.textContent =
        "No Ready photos found for this player (check folder name matches career club).";
      switchList.appendChild(empty);
      return;
    }

    const st = getState();
    const cur = Math.max(1, Math.floor(Number(st?.careerReadyPhotoVariantIndex) || 1));

    for (const v of indices) {
      const url = await pickLoadableReadyPhotoUrlForVariant(playerName, clubName, v);
      if (!url) continue;
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "career-ready-photo-switch-option";
      if (v === cur) opt.classList.add("career-ready-photo-switch-option--current");
      const stem = careerReadyPhotoStemForVariant(playerName, v);
      const thumb = document.createElement("img");
      thumb.className = "career-ready-photo-switch-option__img";
      thumb.alt = stem || `Variant ${v}`;
      thumb.decoding = "async";
      thumb.src = url;
      const cap = document.createElement("span");
      cap.className = "career-ready-photo-switch-option__label";
      cap.textContent = v === 1 ? "Primary" : `Variant ${v}`;
      opt.appendChild(thumb);
      opt.appendChild(cap);
      opt.addEventListener("click", () => {
        const st2 = getState();
        if (st2) st2.careerReadyPhotoVariantIndex = v;
        bumpProjectAssetCacheBust();
        closeSwitchModal();
        renderCareer();
      });
      switchList.appendChild(opt);
    }
  };

  switchPanel.addEventListener("click", (e) => e.stopPropagation());
  switchModal.addEventListener("click", () => {
    closeSwitchModal();
  });
  switchBtnClose.addEventListener("click", closeSwitchModal);

  btnRow.appendChild(btn);
  const btnSwitch = document.createElement("button");
  btnSwitch.type = "button";
  btnSwitch.className = "career-get-photo-btn career-get-photo-btn--switch";
  btnSwitch.textContent = "Switch";
  btnSwitch.title = "Choose which saved Ready photo to display.";
  btnSwitch.addEventListener("click", () => {
    void openSwitchModal();
  });
  btnRow.appendChild(btnSwitch);
  host.appendChild(btnRow);
  host.appendChild(hint);
  host.appendChild(modal);
  host.appendChild(switchModal);

  const showHint = (text, isErr) => {
    hint.hidden = !text;
    hint.textContent = text || "";
    hint.classList.toggle("career-get-photo-hint--error", !!isErr);
  };

  let keyHandler = null;

  const closeModal = () => {
    modal.classList.remove("career-ready-photo-url-modal--portal");
    if (modal.parentElement === document.body) {
      host.appendChild(modal);
    }
    modal.hidden = true;
    rowErr.hidden = true;
    rowErr.textContent = "";
    btnDl.disabled = false;
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
  };

  const openModal = () => {
    closeSwitchModal();
    modal.classList.add("career-ready-photo-url-modal--portal");
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    input.focus();
    if (typeof input.select === "function") input.select();
    keyHandler = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeModal();
      }
    };
    document.addEventListener("keydown", keyHandler);
  };

  btnCancel.addEventListener("click", closeModal);

  btn.addEventListener("click", () => {
    if (!careerReadyPhotoFetchServerActive()) {
      showHint(
        "Run the runner via run_site.py (http://127.0.0.1:…) so the local server can save files into Ready photos.",
        true,
      );
      return;
    }
    showHint("", false);
    openModal();
  });

  btnDl.addEventListener("click", async () => {
    const imageUrl = String(input.value || "").trim();
    if (!imageUrl) {
      rowErr.textContent = "Paste an image URL.";
      rowErr.hidden = false;
      return;
    }
    btnDl.disabled = true;
    rowErr.hidden = true;
    try {
      const data = await requestReadyPhotoFromUrl(playerName, clubName, imageUrl);
      const st = getState();
      if (st && data && data.variantIndex != null) {
        const vi = Math.floor(Number(data.variantIndex));
        if (Number.isFinite(vi) && vi >= 1) st.careerReadyPhotoVariantIndex = vi;
      }
      bumpProjectAssetCacheBust();
      showHint("", false);
      closeModal();
      input.value = "";
      renderCareer();
    } catch (e) {
      rowErr.textContent = e?.message || "Could not download photo.";
      rowErr.hidden = false;
    } finally {
      btnDl.disabled = false;
    }
  });

  return {
    host,
    show() {
      host.hidden = false;
    },
    hide() {
      host.hidden = true;
      closeModal();
      closeSwitchModal();
      showHint("", false);
    },
  };
}

/** Set true to hide the on-level inline player search (stat cards are omitted separately in regular layout). */
const FOUR_PARAMS_HIDE_INLINE_PLAYER_PICKER = false;

/** No player photo in silhouette, shorts reveal, or regular overlay (video mode on or off). */
const FOUR_PARAMS_HIDE_PLAYER_IMAGES = true;

/** No Three.js nationality flag on regular layout. */
const FOUR_PARAMS_HIDE_NATIONALITY_FLAG = true;

/** One shared fade for `#player-stats-panel` + `#career-wrap` after silhouette/flag gate (regular + player). */
function runCareerTeamUnifiedRevealFade() {
  const stats = document.getElementById("player-stats-panel");
  const career = document.getElementById("career-wrap");
  stats?.classList.remove("stage-exit-video-anim-panel", "stage-enter-video-anim-panel");
  career?.classList.remove(
    "video-question-enter-anim",
    "stage-exit-video-anim",
    "stage-enter-video-anim",
    "stage-exit-video-anim-panel",
    "stage-enter-video-anim-panel",
  );
  stats?.classList.add("career-team-unified-reveal-in");
  career?.classList.add("career-team-unified-reveal-in");
  if (appState._careerTeamUnifiedRevealTimeoutId != null) {
    clearTimeout(appState._careerTeamUnifiedRevealTimeoutId);
  }
  appState._careerTeamUnifiedRevealTimeoutId = window.setTimeout(() => {
    stats?.classList.remove("career-team-unified-reveal-in");
    career?.classList.remove("career-team-unified-reveal-in");
    appState.careerTeamVisualGateDone = false;
    appState._careerTeamUnifiedRevealTimeoutId = null;
  }, STAGE_VIDEO_LEVEL_ENTER_MS);
}

/** Map demonyms / variants to `data/country-to-flagcode.json` keys (same idea as Lineups club slots). */
function playerStatsNationalityLabelForFlagcode(nationalityRaw) {
  const raw = String(nationalityRaw || "").trim();
  if (!raw) return "";
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (n === "portuguese") return "Portugal";
  if (n === "english") return "England";
  return raw;
}

/** Regular flag image URL: repo England asset or flagcdn (regular layout, centered overlay). */
function resolvePlayerStatsNationalityFlagUrl(nationalityRaw) {
  const natLabel = playerStatsNationalityLabelForFlagcode(nationalityRaw);
  if (!natLabel) return null;
  if (natLabel === "England") {
    return projectAssetUrl("Images/Nationality/Europe/England.png");
  }
  const code = appState.flagcodes[natLabel];
  if (!code) return null;
  return `https://flagcdn.com/w320/${String(code).toLowerCase()}.png`;
}

export const CAREER_BADGE_SCALE_MIN = 0.5;
export const CAREER_BADGE_SCALE_MAX = 2.25;
export const CAREER_BADGE_SCALE_STEP = 0.08;

export function clampCareerBadgeScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(CAREER_BADGE_SCALE_MAX, Math.max(CAREER_BADGE_SCALE_MIN, n));
}

export const CAREER_YEAR_NUDGE_STEP = 2;
const appliedFavoritePictureKeyByState = new WeakMap();

const CAREER_IMAGE_REFRESH_TOKEN = String(Date.now());
const careerResolvedClubLogoSrcByKey = new Map();
const TEAM_LOGO_MASK_BRUSH_RADIUS_PX = 16;
function freshenCareerImageUrl(url) {
  const src = String(url || "").trim();
  if (!src) return "";
  if (/^(blob:|data:)/i.test(src)) return src;
  const joiner = src.includes("?") ? "&" : "?";
  return `${src}${joiner}v=${encodeURIComponent(CAREER_IMAGE_REFRESH_TOKEN)}`;
}

/** ResizeObserver per reveal bar so team name font re-fits when the bar width changes. */
const careerTeamRevealFitObserverByBar = new WeakMap();

function disconnectCareerTeamRevealFitObserver(revealBar) {
  const ro = revealBar && careerTeamRevealFitObserverByBar.get(revealBar);
  if (ro) {
    ro.disconnect();
    careerTeamRevealFitObserverByBar.delete(revealBar);
  }
}

function ensureCareerTeamRevealFitObserver(revealBar, textEl) {
  if (!revealBar || !textEl || typeof ResizeObserver === "undefined") return;
  disconnectCareerTeamRevealFitObserver(revealBar);
  const ro = new ResizeObserver(() => {
    if (!textEl.isConnected || !textEl.classList.contains("career-team-quiz-card__reveal-text--name")) {
      disconnectCareerTeamRevealFitObserver(revealBar);
      return;
    }
    fitCareerTeamRevealNameText(textEl);
  });
  careerTeamRevealFitObserverByBar.set(revealBar, ro);
  ro.observe(revealBar);
}

/** Largest font-size (px) so the team name fits inside the fixed reveal bar (width + height). */
function fitCareerTeamRevealNameText(textEl) {
  if (!textEl || !textEl.classList.contains("career-team-quiz-card__reveal-text--name")) {
    if (textEl) textEl.style.fontSize = "";
    return;
  }
  const label = String(textEl.textContent || "").trim();
  if (!label) {
    textEl.style.fontSize = "";
    return;
  }
  const bar = textEl.closest(".career-team-quiz-card__reveal");
  if (!bar) return;

  const csBar = getComputedStyle(bar);
  const padX =
    parseFloat(csBar.paddingLeft || "0") + parseFloat(csBar.paddingRight || "0");
  const padY =
    parseFloat(csBar.paddingTop || "0") + parseFloat(csBar.paddingBottom || "0");
  const maxW = Math.max(1, Math.floor(bar.clientWidth - padX));
  const maxH = Math.max(1, Math.floor(bar.clientHeight - padY));
  if (maxW < 6 || maxH < 6) return;

  const fits = (sizePx) => {
    textEl.style.fontSize = `${sizePx}px`;
    void textEl.offsetHeight;
    return textEl.scrollHeight <= maxH + 1.5 && textEl.scrollWidth <= maxW + 2;
  };

  let lo = 6;
  let hi = Math.min(120, Math.max(10, Math.floor(maxH / 1.05)));
  if (!fits(lo)) {
    textEl.style.fontSize = `${lo}px`;
    return;
  }
  let best = lo;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  textEl.style.fontSize = `${best}px`;
}

function clearCareerTeamRevealNameFit(textEl) {
  if (!textEl) return;
  const bar = textEl.closest(".career-team-quiz-card__reveal");
  disconnectCareerTeamRevealFitObserver(bar);
  textEl.style.fontSize = "";
}

function scheduleFitCareerTeamRevealNameText(textEl) {
  if (!textEl) return;
  const bar = textEl.closest(".career-team-quiz-card__reveal");
  const run = () => {
    if (!textEl.isConnected || !textEl.classList.contains("career-team-quiz-card__reveal-text--name")) return;
    fitCareerTeamRevealNameText(textEl);
    if (bar?.isConnected) ensureCareerTeamRevealFitObserver(bar, textEl);
  };
  const kick = () => requestAnimationFrame(run);
  if (document.fonts && document.fonts.ready) {
    void document.fonts.ready.then(kick).catch(kick);
  } else {
    kick();
  }
}

function ensureFakeInfoLogoMaskByTeam(state) {
  if (!state || typeof state !== "object") return {};
  if (
    !state.fakeInfoLogoMaskByTeam ||
    typeof state.fakeInfoLogoMaskByTeam !== "object" ||
    Array.isArray(state.fakeInfoLogoMaskByTeam)
  ) {
    state.fakeInfoLogoMaskByTeam = {};
  }
  return state.fakeInfoLogoMaskByTeam;
}

function getFakeInfoLogoMaskDataUrl(state, maskKey) {
  const key = String(maskKey || "").trim();
  if (!key) return "";
  const store = ensureFakeInfoLogoMaskByTeam(state);
  return String(store[key] || "").trim();
}

function setFakeInfoLogoMaskDataUrl(state, maskKey, dataUrl) {
  const key = String(maskKey || "").trim();
  if (!key) return;
  const store = ensureFakeInfoLogoMaskByTeam(state);
  const next = String(dataUrl || "").trim();
  if (!next) {
    delete store[key];
    return;
  }
  store[key] = next;
}

function ensureFakeInfoLogoPunchByTeam(state) {
  if (!state || typeof state !== "object") return {};
  if (
    !state.fakeInfoLogoPunchByTeam ||
    typeof state.fakeInfoLogoPunchByTeam !== "object" ||
    Array.isArray(state.fakeInfoLogoPunchByTeam)
  ) {
    state.fakeInfoLogoPunchByTeam = {};
  }
  return state.fakeInfoLogoPunchByTeam;
}

function getFakeInfoLogoPunchDataUrl(state, punchKey) {
  const key = String(punchKey || "").trim();
  if (!key) return "";
  const store = ensureFakeInfoLogoPunchByTeam(state);
  return String(store[key] || "").trim();
}

function setFakeInfoLogoPunchDataUrl(state, punchKey, dataUrl) {
  const key = String(punchKey || "").trim();
  if (!key) return;
  const store = ensureFakeInfoLogoPunchByTeam(state);
  const next = String(dataUrl || "").trim();
  if (!next) {
    delete store[key];
    return;
  }
  store[key] = next;
}

/** object-fit: contain rect for drawing `logoEl` into a w×h canvas (same math as sampleLogoPixelColor). */
function getLogoContainDrawRect(logoEl, width, height) {
  const logo = logoEl;
  const naturalW = Number(logo?.naturalWidth || 0);
  const naturalH = Number(logo?.naturalHeight || 0);
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  if (!logo || !naturalW || !naturalH || !w || !h) return null;
  const fit = Math.min(w / naturalW, h / naturalH);
  const drawW = naturalW * fit;
  const drawH = naturalH * fit;
  const drawX = (w - drawW) / 2;
  const drawY = (h - drawH) / 2;
  return { drawX, drawY, drawW, drawH };
}

/** Prefer RAM-cached decoded bitmap — DOM <img> can fail drawImage while [hidden] or mid-decode. */
function resolveLogoDrawSource(logoEl) {
  const el = logoEl;
  if (!el) return null;
  const src = String(el.currentSrc || el.getAttribute("src") || el.src || "").trim();
  if (src) {
    const cached = getCachedImage(src);
    if (cached && cached.naturalWidth && cached.naturalHeight) return cached;
  }
  return el;
}

function isPunchCanvasBlank(ctx, w, h) {
  if (!ctx || !w || !h) return true;
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 8) return false;
    }
  } catch {
    return false;
  }
  return true;
}

function tryDrawLogoIntoCtx(ctx, logoEl, width, height) {
  const source = resolveLogoDrawSource(logoEl);
  if (!source) return false;
  const r = getLogoContainDrawRect(source, width, height);
  if (!r || !ctx) return false;
  try {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(source, r.drawX, r.drawY, r.drawW, r.drawH);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

function sampleLogoPixelColor(logoEl, width, height, x, y) {
  const source = resolveLogoDrawSource(logoEl);
  if (!source) return "rgba(248, 250, 252, 0.98)";
  const naturalW = Number(source.naturalWidth || 0);
  const naturalH = Number(source.naturalHeight || 0);
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  if (!naturalW || !naturalH || !w || !h) return "rgba(248, 250, 252, 0.98)";

  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d");
  if (!pctx) return "rgba(248, 250, 252, 0.98)";

  const fit = Math.min(w / naturalW, h / naturalH);
  const drawW = naturalW * fit;
  const drawH = naturalH * fit;
  const drawX = (w - drawW) / 2;
  const drawY = (h - drawH) / 2;
  pctx.clearRect(0, 0, w, h);
  try {
    pctx.drawImage(source, drawX, drawY, drawW, drawH);
  } catch {
    return "rgba(248, 250, 252, 0.98)";
  }

  const px = Math.max(0, Math.min(w - 1, Math.round(Number(x) || 0)));
  const py = Math.max(0, Math.min(h - 1, Math.round(Number(y) || 0)));
  let rgba;
  try {
    rgba = pctx.getImageData(px, py, 1, 1).data;
  } catch {
    return "rgba(248, 250, 252, 0.98)";
  }
  const alpha = Number(rgba[3] || 0) / 255;
  if (alpha <= 0.05) return "rgba(248, 250, 252, 0.98)";
  return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${Math.max(0.75, alpha).toFixed(3)})`;
}

/** Comprehensive lookup for a saved punch snap — used by both attach (so the punch is visible
 *  from pre-timer) and restore (timer-end). Returns "" if nothing matches. */
function findFakeInfoLogoPunchSnap(state, punchCanvas) {
  if (!state) return { snap: "", usedKey: "" };
  let snap = "";
  let usedKey = "";
  const canonicalKey = String(resolveFakeInfoTeamQuizMaskKey(state) || "").trim();
  for (const punchKey of collectFakeInfoTeamQuizPunchLookupKeys(state, punchCanvas)) {
    const s = getFakeInfoLogoPunchDataUrl(state, punchKey);
    if (s) {
      snap = s;
      usedKey = punchKey;
      break;
    }
  }
  if (!snap) {
    const store = ensureFakeInfoLogoPunchByTeam(state);
    const entries = Object.entries(store).filter(([, v]) => String(v || "").trim());
    if (entries.length === 1) {
      usedKey = String(entries[0][0] || "").trim();
      snap = String(entries[0][1] || "").trim();
    } else if (entries.length > 1 && canonicalKey) {
      let best = "";
      let bestScore = -1;
      for (const [k, v] of entries) {
        const key = String(k || "").trim();
        const val = String(v || "").trim();
        if (!key || !val) continue;
        let score = 0;
        if (key === canonicalKey) score = 100;
        else if (key.includes(canonicalKey) || canonicalKey.includes(key)) score = 80;
        else {
          const keyNorm = normalizeClubLookupKey(key);
          const canonicalNorm = normalizeClubLookupKey(canonicalKey);
          if (keyNorm && canonicalNorm && keyNorm === canonicalNorm) score = 70;
          else if (keyNorm && canonicalNorm && (keyNorm.includes(canonicalNorm) || canonicalNorm.includes(keyNorm))) {
            score = 55;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = key;
        }
      }
      if (bestScore > 0 && best) {
        usedKey = best;
        snap = String(store[best] || "").trim();
      }
    }
  }
  return { snap, usedKey };
}

function restoreTeamLogoPunchCanvasFromState(state, punchCanvas, logoImg) {
  if (!state || !punchCanvas) return false;
  const { snap, usedKey } = findFakeInfoLogoPunchSnap(state, punchCanvas);
  if (!snap) return false;
  if (usedKey) punchCanvas.dataset.maskKey = usedKey;
  const wrap = punchCanvas.parentElement;
  const rect = wrap ? wrap.getBoundingClientRect() : null;
  const w = Math.max(1, Math.round(rect?.width || punchCanvas.clientWidth || punchCanvas.width || 0));
  const h = Math.max(1, Math.round(rect?.height || punchCanvas.clientHeight || punchCanvas.height || 0));
  // If the canvas was already drawn (pre-timer attach already painted it) at the same
  // size and is visible, keep the existing pixels — re-setting width/height clears the
  // bitmap, which makes the punch look like it "pops out" during the timer-end opacity fade.
  if (
    punchCanvas.width === w &&
    punchCanvas.height === h &&
    punchCanvas.dataset.hasUserEdits === "1" &&
    punchCanvas.dataset.snapSrc === snap &&
    !punchCanvas.hidden
  ) {
    if (logoImg) logoImg.style.opacity = "0";
    return true;
  }
  punchCanvas.width = w;
  punchCanvas.height = h;
  const ctx = punchCanvas.getContext("2d");
  if (!ctx) return false;
  punchCanvas.dataset.hasUserEdits = "1";
  punchCanvas.dataset.snapSrc = snap;
  punchCanvas.hidden = false;
  if (logoImg) logoImg.style.opacity = "0";
  const im = new Image();
  im.onload = () => {
    if (!punchCanvas.isConnected) return;
    ctx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
    ctx.drawImage(im, 0, 0, punchCanvas.width, punchCanvas.height);
  };
  im.onerror = () => {
    if (logoImg) logoImg.style.opacity = "";
    punchCanvas.hidden = true;
    punchCanvas.dataset.hasUserEdits = "0";
  };
  im.src = snap;
  if (im.complete && im.naturalWidth) {
    ctx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
    ctx.drawImage(im, 0, 0, punchCanvas.width, punchCanvas.height);
  }
  return true;
}

function attachFakeInfoTeamLogoMaskEditor({
  state,
  teamQuizCard,
  logoWrap,
  logoImg,
  teamFallbackEl,
  previewPostTimer,
}) {
  const maskKey = resolveFakeInfoTeamQuizMaskKey(state);
  if (!teamQuizCard || !logoWrap || !maskKey) return;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.className = "career-team-quiz-card__logo-mask";
  maskCanvas.classList.toggle("is-revealed", !!previewPostTimer);
  const punchCanvas = document.createElement("canvas");
  punchCanvas.className = "career-team-quiz-card__logo-punch";
  punchCanvas.hidden = true;
  punchCanvas.setAttribute("aria-hidden", "true");
  punchCanvas.dataset.maskKey = String(maskKey || "").trim();
  logoWrap.appendChild(punchCanvas);
  logoWrap.appendChild(maskCanvas);

  let savedDataUrl = getFakeInfoLogoMaskDataUrl(state, maskKey);
  // Comprehensive lookup so the punch is visible from pre-timer if a snap is saved under
  // any related key. Otherwise the canonical-key miss leaves it hidden=true during pre-timer
  // and the timer-end display:none → block flips re-fires the fade-in keyframe animation,
  // which reads as the punch "flashing" instead of fading like the regular mask.
  let savedPunchDataUrl = getFakeInfoLogoPunchDataUrl(state, maskKey);
  if (!String(savedPunchDataUrl || "").trim()) {
    savedPunchDataUrl = findFakeInfoLogoPunchSnap(state, punchCanvas).snap;
  }
  let drawCtx = null;
  let punchCtx = null;
  let punchModeOn = false;
  let punchLayerActive = false;
  let punchDrawing = false;
  let punchLastPoint = null;
  let punchHasUserEdits = !!String(savedPunchDataUrl || "").trim();
  let drawing = false;
  let lastPoint = null;
  let brushColor = "rgba(248, 250, 252, 0.98)";
  let brushRadiusPx = TEAM_LOGO_MASK_BRUSH_RADIUS_PX;
  /** @type {"circle" | "square"} */
  let brushShape = "circle";
  let sampleColorArmed = false;
  let punchPrepareInFlight = false;
  let punchGen = 0;

  const syncMaskCanvasSize = () => {
    const rect = logoWrap.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width || 0));
    const nextH = Math.max(1, Math.round(rect.height || 0));
    if (!nextW || !nextH) return;
    if (maskCanvas.width === nextW && maskCanvas.height === nextH && drawCtx) return;
    maskCanvas.width = nextW;
    maskCanvas.height = nextH;
    drawCtx = maskCanvas.getContext("2d");
    if (!drawCtx) return;
    drawCtx.clearRect(0, 0, nextW, nextH);
    if (!savedDataUrl) return;
    const img = new Image();
    img.onload = () => {
      if (!drawCtx || !maskCanvas.isConnected) return;
      drawCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      drawCtx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
    };
    img.src = savedDataUrl;
  };

  const syncPunchCanvasSize = () => {
    if (!punchLayerActive) return;
    const rect = logoWrap.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width || 0));
    const nextH = Math.max(1, Math.round(rect.height || 0));
    if (!nextW || !nextH) return;
    if (punchCanvas.width === nextW && punchCanvas.height === nextH && punchCtx) return;
    punchCanvas.width = nextW;
    punchCanvas.height = nextH;
    punchCtx = punchCanvas.getContext("2d");
    if (!punchCtx) return;
    punchCtx.clearRect(0, 0, nextW, nextH);
    const redrawFromSavedOrLogo = () => {
      if (!punchCtx || !punchCanvas.isConnected) return;
      punchCtx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
      const snap = String(savedPunchDataUrl || "").trim();
      if (snap) {
        const im = new Image();
        im.onload = () => {
          if (!punchCtx || !punchCanvas.isConnected) return;
          punchCtx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
          punchCtx.drawImage(im, 0, 0, punchCanvas.width, punchCanvas.height);
        };
        im.src = snap;
      } else {
        void tryDrawLogoIntoCtx(punchCtx, logoImg, punchCanvas.width, punchCanvas.height);
      }
    };
    redrawFromSavedOrLogo();
  };

  const syncAllLogoLayers = () => {
    syncMaskCanvasSize();
    syncPunchCanvasSize();
  };
  const setPunchLayerVisible = (visible) => {
    punchLayerActive = !!visible;
    punchCanvas.dataset.hasUserEdits = punchHasUserEdits ? "1" : "0";
    if (punchLayerActive) {
      logoImg.style.opacity = "0";
      punchCanvas.hidden = false;
      syncPunchCanvasSize();
    } else {
      logoImg.style.opacity = "";
      punchCanvas.hidden = true;
    }
  };
  syncAllLogoLayers();
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => syncAllLogoLayers());
    ro.observe(logoWrap);
  }

  if (appState.isVideoPlaying || !!previewPostTimer) {
    punchModeOn = false;
    setPunchLayerVisible(punchHasUserEdits);
    maskCanvas.classList.remove("career-team-quiz-card__logo-mask--punch-edit");
    maskCanvas.style.pointerEvents = "none";
    punchCanvas.style.pointerEvents = "none";
    return;
  }
  setPunchLayerVisible(punchHasUserEdits);

  const brushCursor = document.createElement("div");
  brushCursor.className = "career-team-quiz-card__brush-cursor";
  brushCursor.setAttribute("aria-hidden", "true");
  logoWrap.appendChild(brushCursor);

  let brushHoverWrapX = 0;
  let brushHoverWrapY = 0;
  let brushHoverActive = false;

  const updateBrushCursorLayout = () => {
    const brushUiOn = (editModeOn || punchModeOn) && !sampleColorArmed;
    if (!brushUiOn || !brushHoverActive) {
      brushCursor.classList.remove("is-visible");
      return;
    }
    const d = brushRadiusPx * 2;
    brushCursor.style.width = `${d}px`;
    brushCursor.style.height = `${d}px`;
    brushCursor.style.left = `${brushHoverWrapX - brushRadiusPx}px`;
    brushCursor.style.top = `${brushHoverWrapY - brushRadiusPx}px`;
    brushCursor.style.borderColor = punchModeOn ? "rgba(255, 255, 255, 0.95)" : brushColor;
    brushCursor.classList.toggle("is-square", brushShape === "square");
    brushCursor.classList.toggle("is-eraser", !!punchModeOn);
    brushCursor.classList.add("is-visible");
  };

  const hideBrushCursor = () => {
    brushHoverActive = false;
    brushCursor.classList.remove("is-visible");
  };

  const tools = document.createElement("div");
  tools.className = "career-team-logo-mask-tools";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "career-team-logo-mask-tools__btn";
  toggleBtn.textContent = "Mask";
  toggleBtn.title = "Draw over logo text";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "career-team-logo-mask-tools__btn career-team-logo-mask-tools__btn--danger";
  clearBtn.textContent = "Clear";

  const selectColorBtn = document.createElement("button");
  selectColorBtn.type = "button";
  selectColorBtn.className = "career-team-logo-mask-tools__btn career-team-logo-mask-tools__btn--color";
  selectColorBtn.textContent = "Select Color";
  selectColorBtn.title = "Click, then pick a color from the logo";

  const backgroundMaskBtn = document.createElement("button");
  backgroundMaskBtn.type = "button";
  backgroundMaskBtn.className = "career-team-logo-mask-tools__btn career-team-logo-mask-tools__btn--punch";
  backgroundMaskBtn.textContent = "Background mask";
  backgroundMaskBtn.title =
    "Erase logo pixels to transparency so the stage background shows through (circle/square brush).";

  const brushControls = document.createElement("div");
  brushControls.className = "career-team-logo-mask-tools__brush-row";

  const brushLabel = document.createElement("span");
  brushLabel.className = "career-team-logo-mask-tools__brush-label";
  brushLabel.textContent = "Pen";

  const brushSmallerBtn = document.createElement("button");
  brushSmallerBtn.type = "button";
  brushSmallerBtn.className = "career-team-logo-mask-tools__size-btn";
  brushSmallerBtn.textContent = "−";
  brushSmallerBtn.title = "Smaller pen";
  brushSmallerBtn.setAttribute("aria-label", "Smaller pen");

  const brushSizeValue = document.createElement("strong");
  brushSizeValue.className = "career-team-logo-mask-tools__size-value";
  brushSizeValue.textContent = String(Math.round(brushRadiusPx));

  const brushBiggerBtn = document.createElement("button");
  brushBiggerBtn.type = "button";
  brushBiggerBtn.className = "career-team-logo-mask-tools__size-btn";
  brushBiggerBtn.textContent = "+";
  brushBiggerBtn.title = "Bigger pen";
  brushBiggerBtn.setAttribute("aria-label", "Bigger pen");

  const shapeLabel = document.createElement("span");
  shapeLabel.className = "career-team-logo-mask-tools__brush-label career-team-logo-mask-tools__brush-label--shape";
  shapeLabel.textContent = "Shape";

  const shapeCircleBtn = document.createElement("button");
  shapeCircleBtn.type = "button";
  shapeCircleBtn.className = "career-team-logo-mask-tools__shape-btn";
  shapeCircleBtn.textContent = "Circle";
  shapeCircleBtn.title = "Round brush";
  shapeCircleBtn.setAttribute("aria-label", "Circle brush");

  const shapeSquareBtn = document.createElement("button");
  shapeSquareBtn.type = "button";
  shapeSquareBtn.className = "career-team-logo-mask-tools__shape-btn";
  shapeSquareBtn.textContent = "Square";
  shapeSquareBtn.title = "Square brush";
  shapeSquareBtn.setAttribute("aria-label", "Square brush");

  brushControls.appendChild(brushLabel);
  brushControls.appendChild(brushSmallerBtn);
  brushControls.appendChild(brushSizeValue);
  brushControls.appendChild(brushBiggerBtn);
  brushControls.appendChild(shapeLabel);
  brushControls.appendChild(shapeCircleBtn);
  brushControls.appendChild(shapeSquareBtn);

  tools.appendChild(toggleBtn);
  tools.appendChild(clearBtn);
  tools.appendChild(selectColorBtn);
  tools.appendChild(backgroundMaskBtn);
  tools.appendChild(brushControls);
  teamQuizCard.appendChild(tools);

  let editModeOn = false;

  const updatePointerLayers = () => {
    const maskInteractive = (editModeOn || sampleColorArmed) && !punchModeOn;
    maskCanvas.style.pointerEvents = maskInteractive ? "auto" : "none";
    punchCanvas.style.pointerEvents = punchModeOn ? "auto" : "none";
  };

  const revealPunchLayerAfterDraw = () => {
    setPunchLayerVisible(true);
  };

  const abortPunchEnterUi = () => {
    setPunchLayerVisible(false);
    punchModeOn = false;
    maskCanvas.classList.remove("career-team-quiz-card__logo-mask--punch-edit");
    backgroundMaskBtn.classList.remove("is-active");
    updatePointerLayers();
  };

  const ensurePunchRasterReadyAsync = async () => {
    if (teamFallbackEl && teamFallbackEl.hidden === false) return false;
    try {
      if (typeof logoImg.decode === "function") {
        await logoImg.decode();
      }
    } catch {
      /* ignore */
    }
    if (!logoImg.naturalWidth) return false;

    const rect = logoWrap.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width || 0));
    const nextH = Math.max(1, Math.round(rect.height || 0));
    punchCanvas.width = nextW;
    punchCanvas.height = nextH;
    punchCtx = punchCanvas.getContext("2d");
    if (!punchCtx) return false;
    punchCtx.clearRect(0, 0, nextW, nextH);
    punchCtx.globalCompositeOperation = "source-over";
    punchCtx.globalAlpha = 1;

    const snap = String(savedPunchDataUrl || "").trim();
    if (snap) {
      const im = new Image();
      const snapOk = await new Promise((resolve) => {
        let settled = false;
        const finish = (v) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        im.onload = () => finish(true);
        im.onerror = () => finish(false);
        im.src = snap;
        if (im.complete && im.naturalWidth) finish(true);
      });
      if (snapOk && im.naturalWidth && punchCtx && punchCanvas.isConnected) {
        punchCtx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
        punchCtx.drawImage(im, 0, 0, punchCanvas.width, punchCanvas.height);
        if (isPunchCanvasBlank(punchCtx, punchCanvas.width, punchCanvas.height)) {
          savedPunchDataUrl = "";
          setFakeInfoLogoPunchDataUrl(state, maskKey, "");
          punchCtx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
          if (!tryDrawLogoIntoCtx(punchCtx, logoImg, punchCanvas.width, punchCanvas.height)) {
            abortPunchEnterUi();
            return false;
          }
        }
      } else if (!tryDrawLogoIntoCtx(punchCtx, logoImg, punchCanvas.width, punchCanvas.height)) {
        abortPunchEnterUi();
        return false;
      }
    } else if (!tryDrawLogoIntoCtx(punchCtx, logoImg, punchCanvas.width, punchCanvas.height)) {
      abortPunchEnterUi();
      return false;
    }

    revealPunchLayerAfterDraw();
    updatePointerLayers();
    return true;
  };

  const setPunchMode = (on) => {
    const next = !!on;
    if (!next) {
      punchGen += 1;
      punchPrepareInFlight = false;
      punchModeOn = false;
      maskCanvas.classList.remove("career-team-quiz-card__logo-mask--punch-edit");
      backgroundMaskBtn.classList.remove("is-active");
      if (punchHasUserEdits && punchCtx && punchCanvas.width && punchCanvas.height) {
        persistPunch();
      }
      setPunchLayerVisible(punchHasUserEdits);
      updatePointerLayers();
      hideBrushCursor();
      return;
    }
    if (punchPrepareInFlight || punchModeOn) return;
    sampleColorArmed = false;
    selectColorBtn.classList.remove("is-active");
    maskCanvas.classList.remove("is-sampling");
    editModeOn = false;
    toggleBtn.classList.remove("is-active");
    maskCanvas.classList.remove("is-editing");
    hideBrushCursor();

    punchPrepareInFlight = true;
    const myGen = punchGen;
    void (async () => {
      try {
        syncAllLogoLayers();
        if (drawCtx && maskCanvas.width && maskCanvas.height) {
          persistMask();
        }
        try {
          if (typeof logoImg.decode === "function") {
            await logoImg.decode();
          }
        } catch {
          /* ignore */
        }
        if (!logoImg.isConnected || myGen !== punchGen) return;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!logoImg.isConnected || myGen !== punchGen) return;
        const ok = await ensurePunchRasterReadyAsync();
        if (!logoImg.isConnected || myGen !== punchGen) return;
        if (!ok) return;
        punchModeOn = true;
        maskCanvas.classList.add("career-team-quiz-card__logo-mask--punch-edit");
        backgroundMaskBtn.classList.add("is-active");
        updatePointerLayers();
      } finally {
        punchPrepareInFlight = false;
      }
    })();
  };

  const syncBrushSwatch = () => {
    selectColorBtn.style.setProperty("--mask-color", brushColor);
    updateBrushCursorLayout();
  };
  const setSampleColorMode = (on) => {
    sampleColorArmed = !!on;
    selectColorBtn.classList.toggle("is-active", sampleColorArmed);
    maskCanvas.classList.toggle("is-sampling", sampleColorArmed);
    if (sampleColorArmed) {
      setPunchMode(false);
      toggleBtn.classList.remove("is-active");
      editModeOn = false;
      maskCanvas.classList.remove("is-editing");
      hideBrushCursor();
    }
    updatePointerLayers();
  };
  const setEditMode = (on) => {
    const wasEditing = editModeOn;
    if (on) setPunchMode(false);
    editModeOn = !!on;
    toggleBtn.classList.toggle("is-active", editModeOn);
    maskCanvas.classList.toggle("is-editing", editModeOn);
    if (editModeOn) {
      setSampleColorMode(false);
    } else {
      if (wasEditing && drawCtx && maskCanvas.width && maskCanvas.height) {
        persistMask();
      }
      hideBrushCursor();
    }
    updatePointerLayers();
  };
  const syncBrushSizeUi = () => {
    brushSizeValue.textContent = String(Math.round(brushRadiusPx));
    brushSmallerBtn.disabled = brushRadiusPx <= 4;
    brushBiggerBtn.disabled = brushRadiusPx >= 60;
    updateBrushCursorLayout();
  };
  const syncBrushShapeUi = () => {
    shapeCircleBtn.classList.toggle("is-active", brushShape === "circle");
    shapeSquareBtn.classList.toggle("is-active", brushShape === "square");
    updateBrushCursorLayout();
  };
  syncBrushSwatch();
  syncBrushSizeUi();
  syncBrushShapeUi();
  setEditMode(false);
  updatePointerLayers();

  const persistMask = () => {
    if (!drawCtx || !maskCanvas.width || !maskCanvas.height) return;
    const snapshot = maskCanvas.toDataURL("image/png");
    savedDataUrl = snapshot;
    setFakeInfoLogoMaskDataUrl(state, maskKey, snapshot);
  };

  const persistPunch = () => {
    if (!punchCtx || !punchCanvas.width || !punchCanvas.height) return;
    const snapshot = punchCanvas.toDataURL("image/png");
    savedPunchDataUrl = snapshot;
    setFakeInfoLogoPunchDataUrl(state, maskKey, snapshot);
  };

  const canvasPoint = (ev) => {
    const rect = maskCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, ev.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, ev.clientY - rect.top)),
    };
  };

  const paintCircleStroke = (x, y) => {
    if (!drawCtx) return;
    drawCtx.save();
    drawCtx.globalCompositeOperation = "source-over";
    drawCtx.strokeStyle = brushColor;
    drawCtx.fillStyle = brushColor;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.lineWidth = brushRadiusPx * 2;
    if (lastPoint) {
      drawCtx.beginPath();
      drawCtx.moveTo(lastPoint.x, lastPoint.y);
      drawCtx.lineTo(x, y);
      drawCtx.stroke();
    }
    drawCtx.beginPath();
    drawCtx.arc(x, y, brushRadiusPx, 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.restore();
    lastPoint = { x, y };
  };

  const paintSquareStroke = (x, y) => {
    if (!drawCtx) return;
    const r = brushRadiusPx;
    drawCtx.save();
    drawCtx.globalCompositeOperation = "source-over";
    drawCtx.fillStyle = brushColor;
    if (lastPoint) {
      const x0 = lastPoint.x;
      const y0 = lastPoint.y;
      const dx = x - x0;
      const dy = y - y0;
      const len = Math.hypot(dx, dy);
      if (len > 1e-3) {
        drawCtx.save();
        drawCtx.translate(x0, y0);
        drawCtx.rotate(Math.atan2(dy, dx));
        drawCtx.fillRect(0, -r, len, r * 2);
        drawCtx.restore();
      }
    }
    drawCtx.fillRect(x - r, y - r, r * 2, r * 2);
    drawCtx.restore();
    lastPoint = { x, y };
  };

  const paintStroke = (x, y) => {
    if (brushShape === "square") paintSquareStroke(x, y);
    else paintCircleStroke(x, y);
  };

  const ERASE_INK = "rgba(0, 0, 0, 1)";

  const eraseCircleStroke = (x, y) => {
    if (!punchCtx) return;
    punchCtx.save();
    punchCtx.globalCompositeOperation = "destination-out";
    punchCtx.strokeStyle = ERASE_INK;
    punchCtx.fillStyle = ERASE_INK;
    punchCtx.lineCap = "round";
    punchCtx.lineJoin = "round";
    punchCtx.lineWidth = brushRadiusPx * 2;
    if (punchLastPoint) {
      punchCtx.beginPath();
      punchCtx.moveTo(punchLastPoint.x, punchLastPoint.y);
      punchCtx.lineTo(x, y);
      punchCtx.stroke();
    }
    punchCtx.beginPath();
    punchCtx.arc(x, y, brushRadiusPx, 0, Math.PI * 2);
    punchCtx.fill();
    punchCtx.restore();
    punchLastPoint = { x, y };
  };

  const eraseSquareStroke = (x, y) => {
    if (!punchCtx) return;
    const r = brushRadiusPx;
    punchCtx.save();
    punchCtx.globalCompositeOperation = "destination-out";
    punchCtx.fillStyle = ERASE_INK;
    if (punchLastPoint) {
      const x0 = punchLastPoint.x;
      const y0 = punchLastPoint.y;
      const dx = x - x0;
      const dy = y - y0;
      const len = Math.hypot(dx, dy);
      if (len > 1e-3) {
        punchCtx.save();
        punchCtx.translate(x0, y0);
        punchCtx.rotate(Math.atan2(dy, dx));
        punchCtx.fillRect(0, -r, len, r * 2);
        punchCtx.restore();
      }
    }
    punchCtx.fillRect(x - r, y - r, r * 2, r * 2);
    punchCtx.restore();
    punchLastPoint = { x, y };
  };

  const eraseStroke = (x, y) => {
    if (brushShape === "square") eraseSquareStroke(x, y);
    else eraseCircleStroke(x, y);
  };

  toggleBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    setEditMode(!editModeOn);
  });
  selectColorBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    setSampleColorMode(!sampleColorArmed);
  });
  brushSmallerBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    brushRadiusPx = Math.max(4, brushRadiusPx - 2);
    syncBrushSizeUi();
  });
  brushBiggerBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    brushRadiusPx = Math.min(60, brushRadiusPx + 2);
    syncBrushSizeUi();
  });
  shapeCircleBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    brushShape = "circle";
    syncBrushShapeUi();
  });
  shapeSquareBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    brushShape = "square";
    syncBrushShapeUi();
  });
  backgroundMaskBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    setPunchMode(!punchModeOn);
  });
  clearBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    syncAllLogoLayers();
    if (drawCtx && maskCanvas.width && maskCanvas.height) {
      drawCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    savedDataUrl = "";
    setFakeInfoLogoMaskDataUrl(state, maskKey, "");
    if (punchCtx && punchCanvas.width && punchCanvas.height) {
      punchCtx.clearRect(0, 0, punchCanvas.width, punchCanvas.height);
      void tryDrawLogoIntoCtx(punchCtx, logoImg, punchCanvas.width, punchCanvas.height);
    }
    punchHasUserEdits = false;
    punchCanvas.dataset.hasUserEdits = "0";
    savedPunchDataUrl = "";
    setFakeInfoLogoPunchDataUrl(state, maskKey, "");
    if (!punchModeOn) {
      setPunchLayerVisible(false);
    }
  });

  maskCanvas.addEventListener("pointerdown", (ev) => {
    if (punchModeOn) return;
    if (!drawCtx || (!editModeOn && !sampleColorArmed)) return;
    ev.preventDefault();
    syncAllLogoLayers();
    const p = canvasPoint(ev);
    if (sampleColorArmed) {
      brushColor = sampleLogoPixelColor(logoImg, maskCanvas.width, maskCanvas.height, p.x, p.y);
      syncBrushSwatch();
      /* After a pick, go straight into paint mode (Mask on). */
      setEditMode(true);
      return;
    }
    drawing = true;
    lastPoint = null;
    paintStroke(p.x, p.y);
    try {
      maskCanvas.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  });
  maskCanvas.addEventListener("pointermove", (ev) => {
    if (editModeOn || punchModeOn) {
      const r = logoWrap.getBoundingClientRect();
      brushHoverWrapX = ev.clientX - r.left;
      brushHoverWrapY = ev.clientY - r.top;
      brushHoverActive = true;
      updateBrushCursorLayout();
    }
    if (!drawing || !editModeOn) return;
    ev.preventDefault();
    const p = canvasPoint(ev);
    paintStroke(p.x, p.y);
  });
  const stopDraw = (ev) => {
    if (!drawing) return;
    if (ev) ev.preventDefault();
    drawing = false;
    lastPoint = null;
    persistMask();
  };
  maskCanvas.addEventListener("pointerup", stopDraw);
  maskCanvas.addEventListener("pointercancel", stopDraw);
  maskCanvas.addEventListener("pointerleave", (ev) => {
    if (drawing) stopDraw(ev);
    if (editModeOn || punchModeOn) hideBrushCursor();
  });

  punchCanvas.addEventListener("pointerdown", (ev) => {
    if (!punchModeOn || !punchCtx) return;
    ev.preventDefault();
    syncAllLogoLayers();
    const p = canvasPoint(ev);
    punchDrawing = true;
    punchLastPoint = null;
    eraseStroke(p.x, p.y);
    try {
      punchCanvas.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  });
  punchCanvas.addEventListener("pointermove", (ev) => {
    if (punchModeOn) {
      const r = logoWrap.getBoundingClientRect();
      brushHoverWrapX = ev.clientX - r.left;
      brushHoverWrapY = ev.clientY - r.top;
      brushHoverActive = true;
      updateBrushCursorLayout();
    }
    if (!punchDrawing || !punchModeOn) return;
    ev.preventDefault();
    const p = canvasPoint(ev);
    eraseStroke(p.x, p.y);
  });
  const stopPunchDraw = (ev) => {
    if (!punchDrawing) return;
    if (ev) ev.preventDefault();
    punchDrawing = false;
    punchLastPoint = null;
    punchHasUserEdits = true;
    punchCanvas.dataset.hasUserEdits = "1";
    persistPunch();
  };
  punchCanvas.addEventListener("pointerup", stopPunchDraw);
  punchCanvas.addEventListener("pointercancel", stopPunchDraw);
  punchCanvas.addEventListener("pointerleave", (ev) => {
    if (punchDrawing) stopPunchDraw(ev);
    if (punchModeOn) hideBrushCursor();
  });
}

/** Canonical storage key for fake-info team logo Mask + Background mask (must stay in sync everywhere). */
function resolveFakeInfoTeamQuizMaskKey(state) {
  if (!state?.careerPlayer) return "";
  const teamName = String(state.careerPlayer.club || state.careerPlayer.name || "").trim();
  if (!teamName) return "";
  const searchName = resolveClubAlias(teamName);
  const foundTeam = searchName ? findBestCareerClubEntry(searchName) : null;
  const displayTeamName = String(foundTeam?.name || teamName || searchName || "").trim();
  const logoCacheKey = normalizeClubLookupKey(displayTeamName || teamName || searchName);
  return String(logoCacheKey || normalizeClubLookupKey(displayTeamName || teamName) || "").trim();
}

function collectFakeInfoTeamQuizPunchLookupKeys(state, punchCanvas) {
  const keys = [];
  const add = (k) => {
    const s = String(k || "").trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  add(punchCanvas?.dataset?.maskKey);
  add(resolveFakeInfoTeamQuizMaskKey(state));
  const clubRaw = String(state?.careerPlayer?.club || "").trim();
  const nameRaw = String(state?.careerPlayer?.name || "").trim();
  add(normalizeClubLookupKey(clubRaw));
  add(normalizeClubLookupKey(nameRaw));
  if (clubRaw) add(normalizeClubLookupKey(resolveClubAlias(clubRaw)));
  if (nameRaw) add(normalizeClubLookupKey(resolveClubAlias(nameRaw)));
  return keys;
}

/** No pixel cap — only reject non-finite values so nudge never “sticks” at a clamp while the crest steals clicks. */
export function clampCareerYearNudge(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function ensureCareerSlotYearNudges(state, n) {
  if (!Array.isArray(state.careerSlotYearNudges)) {
    state.careerSlotYearNudges = Array.from({ length: n }, () => 0);
  }
  while (state.careerSlotYearNudges.length < n) {
    state.careerSlotYearNudges.push(0);
  }
  if (state.careerSlotYearNudges.length > n) {
    state.careerSlotYearNudges = state.careerSlotYearNudges.slice(0, n);
  }
  for (let i = 0; i < n; i++) {
    state.careerSlotYearNudges[i] = clampCareerYearNudge(state.careerSlotYearNudges[i] ?? 0);
  }
}

function ensureCareerSlotBadgeScales(state, n) {
  if (!Array.isArray(state.careerSlotBadgeScales)) {
    const legacy = state.careerBadgeScale;
    const seed =
      typeof legacy === "number" && Number.isFinite(legacy) ? legacy : 1;
    state.careerSlotBadgeScales = Array.from({ length: n }, () => clampCareerBadgeScale(seed));
    delete state.careerBadgeScale;
  }
  while (state.careerSlotBadgeScales.length < n) {
    state.careerSlotBadgeScales.push(1);
  }
  if (state.careerSlotBadgeScales.length > n) {
    state.careerSlotBadgeScales = state.careerSlotBadgeScales.slice(0, n);
  }
  for (let i = 0; i < n; i++) {
    state.careerSlotBadgeScales[i] = clampCareerBadgeScale(state.careerSlotBadgeScales[i] ?? 1);
  }
}

function getCareerSlotBadgeScaleModeKey(isShortsMode) {
  return isShortsMode ? "careerSlotBadgeScalesShorts" : "careerSlotBadgeScalesRegular";
}

function ensureCareerSlotBadgeScalesForMode(state, n, isShortsMode) {
  const modeKey = getCareerSlotBadgeScaleModeKey(isShortsMode);
  if (!Array.isArray(state[modeKey])) {
    const legacy = Array.isArray(state.careerSlotBadgeScales)
      ? [...state.careerSlotBadgeScales]
      : [];
    state[modeKey] = legacy;
  }
  state.careerSlotBadgeScales = state[modeKey];
  ensureCareerSlotBadgeScales(state, n);
  return state[modeKey];
}

function appendCareerSlotZoomControls(slotEl, slotIndex, n, isShortsMode) {
  const badge = slotEl.querySelector(".career-club-badge-scale");
  const scaled = slotEl.querySelector(".career-club-emblem-scale");
  if (!badge || !scaled) return;

  const controls = document.createElement("div");
  controls.className = "career-badge-controls";
  const syncFavoriteUi = () => {
    const st = getState();
    const favoriteBtn = controls.querySelector(".career-slot-favorite-btn");
    if (!favoriteBtn) return;
    const isFavorite = hasCareerClubFavorite(st, slotIndex, isShortsMode ? "shorts" : "regular");
    favoriteBtn.innerHTML = isFavorite ? "&#9829;" : "&#9825;";
    favoriteBtn.classList.toggle("is-active", isFavorite);
  };

  const mk = (sign) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "career-badge-zoom-btn";
    b.setAttribute("aria-label", sign < 0 ? "Smaller club badge" : "Larger club badge");
    b.textContent = sign < 0 ? "−" : "+";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const st = getState();
      const slotScales = ensureCareerSlotBadgeScalesForMode(st, n, isShortsMode);
      const cur = clampCareerBadgeScale(slotScales[slotIndex] ?? 1);
      const next = clampCareerBadgeScale(cur + sign * CAREER_BADGE_SCALE_STEP);
      slotScales[slotIndex] = next;
      badge.style.setProperty("--career-badge-scale", String(next));
      badge.style.setProperty("--career-year-inverse-scale", String(1 / next));
    });
    return b;
  };

  const favoriteBtn = document.createElement("button");
  favoriteBtn.type = "button";
  favoriteBtn.className = "career-slot-favorite-btn";
  favoriteBtn.setAttribute("aria-label", "Save this club image size");
  favoriteBtn.title = "Save this club image size";
  favoriteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const st = getState();
    const mode = isShortsMode ? "shorts" : "regular";
    if (hasCareerClubFavorite(st, slotIndex, mode)) clearCareerClubFavorite(st, slotIndex, mode);
    else saveCareerClubFavorite(st, slotIndex, mode);
    syncFavoriteUi();
  });

  controls.append(mk(-1), mk(1), favoriteBtn);
  syncFavoriteUi();
  scaled.insertBefore(controls, scaled.firstChild);
}

function appendCareerSlotYearNudgeControls(slotEl, slotIndex, n, isShortsMode) {
  if (isShortsMode) return;
  const badge = slotEl.querySelector(".career-club-badge-scale");
  const controls = slotEl.querySelector(".career-badge-controls");
  if (!badge || !controls) return;

  const applyNudge = (next) => {
    badge.style.setProperty("--career-year-nudge", `${next}px`);
  };

  const mk = (delta) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "career-year-nudge-btn";
    b.setAttribute(
      "aria-label",
      delta < 0 ? "Move year up" : "Move year down"
    );
    b.textContent = delta < 0 ? "↑" : "↓";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const st = getState();
      ensureCareerSlotYearNudges(st, n);
      const cur = clampCareerYearNudge(st.careerSlotYearNudges[slotIndex] ?? 0);
      const next = clampCareerYearNudge(cur + delta);
      st.careerSlotYearNudges[slotIndex] = next;
      applyNudge(next);
    });
    return b;
  };

  controls.append(mk(-CAREER_YEAR_NUDGE_STEP), mk(CAREER_YEAR_NUDGE_STEP));
}

/** PNGs often include transparent padding below the crest; layout uses the full box, so the year sits too low.
 * Also: object-fit:contain letterboxing inside the <img> box adds empty space below the art (shorts + fixed cells). */
const careerLogoBottomSlackNaturalBySrc = new Map();
const CAREER_LOGO_SLACK_CACHE_PREFIX = "v4|";
const CAREER_LOGO_SLACK_MAX_EDGE = 512;
const CAREER_LOGO_ALPHA_THRESHOLD = 18;
/** Hard cap (px); also capped as a fraction of logo box height so bad measures cannot pull the year into the crest. Scaled with default crest size (~195px tall). */
const CAREER_LOGO_SLACK_CSS_MAX = 108;
const CAREER_LOGO_SLACK_MAX_FRAC_OF_BOX = 0.38;
const CAREER_SHADOW_UNIFORM_Y = 18;
const CAREER_SHADOW_UNIFORM_SCALE = 0.82;
/* Video mode OFF: same caps as Main Runner - Career Path - Regular (viewBox 1000×400). */
const CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_OFF = 760;
const CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_OFF = 580;
const CAREER_SILHOUETTE_CENTER_X_REGULAR_VIDEO_OFF = 505; /* 125 + 760/2 */
/* Video mode ON: original Four parameters - Regular framing (smaller regular, taller shorts). */
const CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_ON = 456;
const CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_ON = 696;
const CAREER_SILHOUETTE_CENTER_X_REGULAR_VIDEO_ON = 500;
const CAREER_SILHOUETTE_BOTTOM_REGULAR = 525;
const CAREER_SILHOUETTE_BOTTOM_SHORTS = 500;
/** Extra upward shift for video-on (Four parameters - Regular) path; Career Path off uses bottomY − hUx only. */
const CAREER_SILHOUETTE_VERTICAL_UP_FRAC = 0.0;
/** Positive = move silhouette down in SVG user space (shorts + Video Mode). Layout uses SVG x/y, not CSS transform. */
const CAREER_SILHOUETTE_SHORTS_VIDEO_MODE_Y_NUDGE = 30;
const CAREER_SILHOUETTE_CENTER_X_SHORTS = 500;
const CAREER_REVEAL_BASE_Y = 10;
const CAREER_REVEAL_BASE_SCALE = 1.08;
/** Same units as Adjust Picture ▼/▲ (one tick = ±1 on `silhouetteYOffset`). */
const PLAYER_STATS_SILHOUETTE_EXTRA_DOWN_TICKS = 15;
const careerPlayerTrimmedPhotoUrlBySrc = new Map();
/** Synchronous cache: src → resolved trimmed URL (stored after first successful resolve). */
const careerPlayerResolvedUrlSync = new Map();
const CAREER_PLAYER_TRIM_MAX_EDGE = 1024;
const CAREER_PLAYER_TRIM_ALPHA_THRESHOLD = 12;
const CAREER_PLAYER_TRIM_MARGIN_PX = 8;

/** Regular: compact “video edit” caps only while Video Mode is on and not during Play Video. Shorts: follow Video Mode whenever it is on. */
function useCareerSilhouetteVideoOnCapsForRender(isShorts, state) {
  if (!state?.videoMode) return false;
  return true;
}

function getCareerSilhouetteSizingCaps(isShorts, videoMode) {
  if (!videoMode) {
    return {
      maxU: isShorts ? CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_OFF : CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_OFF,
      centerX: isShorts ? CAREER_SILHOUETTE_CENTER_X_SHORTS : CAREER_SILHOUETTE_CENTER_X_REGULAR_VIDEO_OFF,
    };
  }
  return {
    maxU: isShorts ? CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_ON : CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_ON,
    centerX: isShorts ? CAREER_SILHOUETTE_CENTER_X_SHORTS : CAREER_SILHOUETTE_CENTER_X_REGULAR_VIDEO_ON,
  };
}

/**
 * Size the SVG <image> rect to the bitmap aspect ratio.
 * `.career-svg` uses preserveAspectRatio="none", so user-space X and Y map to different pixel scales
 * (1000×400 viewBox stretched to the wrap). Converting via clientWidth/height keeps portrait photos
 * from looking stretched sideways when width/height sliders are 1/1.
 */
function applyCareerSilhouetteSvgImageRect(imageEl, isShorts, videoMode = false) {
  if (!imageEl || typeof imageEl.setAttribute !== "function") return;
  const nw = Number(imageEl.naturalWidth || 0);
  const nh = Number(imageEl.naturalHeight || 0);
  if (!nw || !nh) return;
  const svg = imageEl.ownerSVGElement;
  const rw = svg?.clientWidth || 0;
  const rh = svg?.clientHeight || 0;
  if (!rw || !rh) {
    requestAnimationFrame(() =>
      applyCareerSilhouetteSvgImageRect(
        imageEl,
        isShorts,
        useCareerSilhouetteVideoOnCapsForRender(isShorts, getState()),
      )
    );
    return;
  }

  const { maxU, centerX } = getCareerSilhouetteSizingCaps(isShorts, videoMode);
  const sqWpx = maxU * (rw / 1000);
  const sqHpx = maxU * (rh / 400);
  const maxLongPx = Math.max(sqWpx, sqHpx);

  let screenW;
  let screenH;
  if (nh >= nw) {
    screenH = maxLongPx;
    screenW = maxLongPx * (nw / nh);
  } else {
    screenW = maxLongPx;
    screenH = maxLongPx * (nh / nw);
  }

  const wUx = (screenW * 1000) / rw;
  const hUx = (screenH * 400) / rh;
  const bottomY = isShorts ? CAREER_SILHOUETTE_BOTTOM_SHORTS : CAREER_SILHOUETTE_BOTTOM_REGULAR;
  const x = Math.round(centerX - wUx / 2);
  let y = Math.round(bottomY - hUx);
  if (isShorts && getState()?.videoMode) {
    y += CAREER_SILHOUETTE_SHORTS_VIDEO_MODE_Y_NUDGE;
  }
  imageEl.setAttribute("x", String(x));
  imageEl.setAttribute("y", String(y));
  imageEl.setAttribute("width", String(Math.round(wUx)));
  imageEl.setAttribute("height", String(Math.round(hUx)));
}

/**
 * Four parameters - Regular: nudge the portrait down (Video Mode off on questions, and Play Video after the timer)
 * without changing saved Adjust Picture values.
 */
function getPlayerStatsExtraSilhouetteDownTicks(state) {
  if (!shouldUseVideoQuestionLayout(state)) return 0;
  if (!state.videoMode && !appState.isVideoPlaying) {
    return PLAYER_STATS_SILHOUETTE_EXTRA_DOWN_TICKS;
  }
  if (appState.isVideoPlaying && appState.videoRevealPostTimerActive) {
    return PLAYER_STATS_SILHOUETTE_EXTRA_DOWN_TICKS;
  }
  return 0;
}

function applyCareerSilhouetteAdjustments(silhouetteEl, st, { noExtraDown = false } = {}) {
  if (!silhouetteEl) return;
  const yOffset = Number(st?.silhouetteYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET);
  const scaleX = Number(st?.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X);
  const scaleY = Number(st?.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);

  const safeYOffset = Number.isFinite(yOffset) ? yOffset : DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
  const safeScaleX = Number.isFinite(scaleX) ? scaleX : DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
  const safeScaleY = Number.isFinite(scaleY) ? scaleY : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;

  const extraDownTicks = noExtraDown ? 0 : getPlayerStatsExtraSilhouetteDownTicks(st);
  /* Width/height are absolute multipliers (1 = 100%); do not divide by DEFAULT or 0.85 would look like 1. */
  const finalY = CAREER_SHADOW_UNIFORM_Y + (safeYOffset + extraDownTicks) * 2;
  const finalScaleX = CAREER_SHADOW_UNIFORM_SCALE * safeScaleX;
  const finalScaleY = CAREER_SHADOW_UNIFORM_SCALE * safeScaleY;

  silhouetteEl.style.setProperty("--sil-y", `${finalY}%`);
  silhouetteEl.style.setProperty("--sil-scale-x", String(finalScaleX));
  silhouetteEl.style.setProperty("--sil-scale-y", String(finalScaleY));
}

/* Apply Adjust Picture (Up/Down + Width + Height) to the player-card-mode photo.
   Baseline: photo is nudged 4% downward and scaled to 1.05x by default so the head sits
   a touch lower and the body fills the frame a bit more. Each Up/Down tick adds +/-2% on
   top of the Y baseline; Width/Height scale stacks multiplicatively on the size baseline.
   Origin at bottom-center, so scaling up grows the photo upward. */
const PLAYER_CARD_PHOTO_BASELINE_Y_PCT = 4;
const PLAYER_CARD_PHOTO_BASELINE_SCALE = 1.07;
function applyPlayerCardPhotoAdjustments(photoEl, st) {
  if (!photoEl) return;
  const yOffset = Number(st?.silhouetteYOffset ?? 0);
  const scaleX = Number(st?.silhouetteScaleX ?? 1);
  const scaleY = Number(st?.silhouetteScaleY ?? 1);
  const safeY = Number.isFinite(yOffset) ? yOffset : 0;
  const safeSx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const safeSy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const translatePct = PLAYER_CARD_PHOTO_BASELINE_Y_PCT + safeY * 2;
  const finalSx = PLAYER_CARD_PHOTO_BASELINE_SCALE * safeSx;
  const finalSy = PLAYER_CARD_PHOTO_BASELINE_SCALE * safeSy;
  photoEl.style.setProperty("transform-origin", "50% 100%");
  photoEl.style.setProperty(
    "transform",
    `translateY(${translatePct}%) scale(${finalSx}, ${finalSy})`,
    "important",
  );
}

function applyCareerRevealAdjustments(wrapEl, st) {
  if (!wrapEl) return;
  const yOffset = Number(st?.silhouetteYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET);
  const scaleX = Number(st?.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X);
  const scaleY = Number(st?.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);
  const safeYOffset = Number.isFinite(yOffset) ? yOffset : DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
  const safeScaleX = Number.isFinite(scaleX) ? scaleX : DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
  const safeScaleY = Number.isFinite(scaleY) ? scaleY : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;
  const extraDownTicks = getPlayerStatsExtraSilhouetteDownTicks(st);
  const revealY = CAREER_REVEAL_BASE_Y + (safeYOffset + extraDownTicks) * 1.4;
  const revealScaleX = CAREER_REVEAL_BASE_SCALE * safeScaleX;
  const revealScaleY = CAREER_REVEAL_BASE_SCALE * safeScaleY;
  const applyVars = (el) => {
    el.style.setProperty("--career-reveal-y", `${revealY}%`);
    el.style.setProperty("--career-reveal-scale-x", String(revealScaleX));
    el.style.setProperty("--career-reveal-scale-y", String(revealScaleY));
  };
  applyVars(wrapEl);
  /* Overlay is mounted on `.app` so fixed positioning is viewport-anchored (not trapped by #career-wrap perspective). */
  const overlay = document.getElementById("career-reveal-overlay");
  if (overlay && overlay !== wrapEl) applyVars(overlay);
}

function appendPlayerStatsRegularRevealToApp(node) {
  const root = document.querySelector(".app") || document.body;
  root.appendChild(node);
}

function ensureCareerPictureModeProfiles(st) {
  if (!st) return;
  const regularDefaults = getDefaultPlayerPictureValues(false);
  const shortsDefaults = getDefaultPlayerPictureValues(true);
  const seedYOffsetRaw = Number(st.silhouetteYOffset ?? regularDefaults.silhouetteYOffset);
  const seedScaleXRaw = Number(st.silhouetteScaleX ?? regularDefaults.silhouetteScaleX);
  const seedScaleYRaw = Number(st.silhouetteScaleY ?? regularDefaults.silhouetteScaleY);
  const seedYOffset = Number.isFinite(seedYOffsetRaw) ? seedYOffsetRaw : regularDefaults.silhouetteYOffset;
  const seedScaleX = Number.isFinite(seedScaleXRaw) ? seedScaleXRaw : regularDefaults.silhouetteScaleX;
  const seedScaleY = Number.isFinite(seedScaleYRaw) ? seedScaleYRaw : regularDefaults.silhouetteScaleY;

  if (!Number.isFinite(Number(st.silhouetteVideoYOffset))) st.silhouetteVideoYOffset = seedYOffset;
  if (!Number.isFinite(Number(st.silhouetteVideoScaleX))) st.silhouetteVideoScaleX = seedScaleX;
  if (!Number.isFinite(Number(st.silhouetteVideoScaleY))) st.silhouetteVideoScaleY = seedScaleY;
  if (!Number.isFinite(Number(st.silhouetteNormalYOffset))) st.silhouetteNormalYOffset = seedYOffset;
  if (!Number.isFinite(Number(st.silhouetteNormalScaleX))) st.silhouetteNormalScaleX = seedScaleX;
  if (!Number.isFinite(Number(st.silhouetteNormalScaleY))) st.silhouetteNormalScaleY = seedScaleY;

  if (!Number.isFinite(Number(st.silhouetteShortsVideoYOffset))) {
    st.silhouetteShortsVideoYOffset = Number(
      st.silhouetteShortsNormalYOffset ?? shortsDefaults.silhouetteYOffset
    );
  }
  if (!Number.isFinite(Number(st.silhouetteShortsVideoScaleX))) {
    st.silhouetteShortsVideoScaleX = Number(
      st.silhouetteShortsNormalScaleX ?? shortsDefaults.silhouetteScaleX
    );
  }
  if (!Number.isFinite(Number(st.silhouetteShortsVideoScaleY))) {
    st.silhouetteShortsVideoScaleY = Number(
      st.silhouetteShortsNormalScaleY ?? shortsDefaults.silhouetteScaleY
    );
  }
  if (!Number.isFinite(Number(st.silhouetteShortsNormalYOffset))) {
    st.silhouetteShortsNormalYOffset = Number(shortsDefaults.silhouetteYOffset);
  }
  if (!Number.isFinite(Number(st.silhouetteShortsNormalScaleX))) {
    st.silhouetteShortsNormalScaleX = Number(shortsDefaults.silhouetteScaleX);
  }
  if (!Number.isFinite(Number(st.silhouetteShortsNormalScaleY))) {
    st.silhouetteShortsNormalScaleY = Number(shortsDefaults.silhouetteScaleY);
  }
}

/** Load layout-specific picture profile into active `silhouette*` fields used for rendering. */
export function applyCareerPictureModeToActiveState(st, isShortsLayout) {
  if (!st) return;
  if (isShortsLayout) {
    /* Shorts layout: unify VM On/Off/Play Video — one Adjust Picture — Shorts profile that
       carries across VM toggles. Prefer the Normal field, fall back to the Video field. */
    const shortsNormalY = Number(st.silhouetteShortsNormalYOffset);
    const shortsNormalX = Number(st.silhouetteShortsNormalScaleX);
    const shortsNormalYs = Number(st.silhouetteShortsNormalScaleY);
    st.silhouetteYOffset = Number.isFinite(shortsNormalY) ? shortsNormalY : Number(st.silhouetteShortsVideoYOffset);
    st.silhouetteScaleX = Number.isFinite(shortsNormalX) ? shortsNormalX : Number(st.silhouetteShortsVideoScaleX);
    st.silhouetteScaleY = Number.isFinite(shortsNormalYs) ? shortsNormalYs : Number(st.silhouetteShortsVideoScaleY);
    return;
  }
  /* Regular layout: unify Video On/Off — one Adjust Picture profile that carries across
     VM toggles. Prefer the Normal field, fall back to the Video field if only Video is set. */
  const normalY = Number(st.silhouetteNormalYOffset);
  const normalX = Number(st.silhouetteNormalScaleX);
  const normalYs = Number(st.silhouetteNormalScaleY);
  st.silhouetteYOffset = Number.isFinite(normalY) ? normalY : Number(st.silhouetteVideoYOffset);
  st.silhouetteScaleX = Number.isFinite(normalX) ? normalX : Number(st.silhouetteVideoScaleX);
  st.silhouetteScaleY = Number.isFinite(normalYs) ? normalYs : Number(st.silhouetteVideoScaleY);
}

/** Persist active `silhouette*` into the profile for the given layout (shorts vs regular road). */
export function persistCareerPictureModeFromActiveState(st, isShortsLayout) {
  if (!st) return;
  const pictureDefaults = getDefaultPlayerPictureValues(isShortsLayout);
  const y = Number(st.silhouetteYOffset ?? pictureDefaults.silhouetteYOffset);
  const x = Number(st.silhouetteScaleX ?? pictureDefaults.silhouetteScaleX);
  const ys = Number(st.silhouetteScaleY ?? pictureDefaults.silhouetteScaleY);
  const safeY = Number.isFinite(y) ? y : pictureDefaults.silhouetteYOffset;
  const safeX = Number.isFinite(x) ? x : pictureDefaults.silhouetteScaleX;
  const safeYs = Number.isFinite(ys) ? ys : pictureDefaults.silhouetteScaleY;

  if (isShortsLayout) {
    /* Shorts layout: one unified profile — write to both VM On + VM Off shorts fields so a
       change in either mode sticks across the VM toggle and the picture stays identical
       (including during Play Video, which force-enables VM). */
    st.silhouetteShortsNormalYOffset = safeY;
    st.silhouetteShortsNormalScaleX = safeX;
    st.silhouetteShortsNormalScaleY = safeYs;
    st.silhouetteShortsVideoYOffset = safeY;
    st.silhouetteShortsVideoScaleX = safeX;
    st.silhouetteShortsVideoScaleY = safeYs;
    return;
  }
  /* Regular layout: one unified profile — write to both VM On + VM Off fields so a change
     in either mode sticks across the VM toggle and the picture stays identical. */
  st.silhouetteNormalYOffset = safeY;
  st.silhouetteNormalScaleX = safeX;
  st.silhouetteNormalScaleY = safeYs;
  st.silhouetteVideoYOffset = safeY;
  st.silhouetteVideoScaleX = safeX;
  st.silhouetteVideoScaleY = safeYs;
}

function measureCareerLogoBottomSlackNatural(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return 0;

  let cw = w;
  let ch = h;
  if (w > CAREER_LOGO_SLACK_MAX_EDGE || h > CAREER_LOGO_SLACK_MAX_EDGE) {
    if (w >= h) {
      cw = CAREER_LOGO_SLACK_MAX_EDGE;
      ch = Math.max(1, Math.round((h * CAREER_LOGO_SLACK_MAX_EDGE) / w));
    } else {
      ch = CAREER_LOGO_SLACK_MAX_EDGE;
      cw = Math.max(1, Math.round((w * CAREER_LOGO_SLACK_MAX_EDGE) / h));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.imageSmoothingEnabled = false;
  try {
    ctx.drawImage(img, 0, 0, cw, ch);
  } catch {
    return 0;
  }
  let data;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return 0;
  }

  /* One opaque pixel is enough: shield tips / thin feet often have <4 px per row; requiring more falsely moved “content” upward and caused huge slack (year jumped to the top). Smoothing is off so row noise is rare. */
  let maxOpaqueY = -1;
  scan: for (let y = ch - 1; y >= 0; y--) {
    const row = y * cw * 4;
    for (let x = 0; x < cw; x++) {
      if (data[row + x * 4 + 3] > CAREER_LOGO_ALPHA_THRESHOLD) {
        maxOpaqueY = y;
        break scan;
      }
    }
  }
  if (maxOpaqueY < 0) return 0;
  const slackScaled = ch - 1 - maxOpaqueY;
  return slackScaled * (h / ch);
}

function applyCareerLogoYearSlackFromImg(img) {
  const badge = img.closest(".career-club-badge-scale");
  if (!badge) return;
  if (img.hidden || !img.naturalWidth || !img.naturalHeight) {
    badge.style.removeProperty("--career-img-bottom-slack");
    return;
  }
  if (!img.offsetHeight || !img.offsetWidth) return;

  const key = CAREER_LOGO_SLACK_CACHE_PREFIX + (img.currentSrc || img.src || "");
  let slackNatural = careerLogoBottomSlackNaturalBySrc.get(key);
  if (typeof slackNatural !== "number") {
    slackNatural = measureCareerLogoBottomSlackNatural(img);
    careerLogoBottomSlackNaturalBySrc.set(key, slackNatural);
  }

  const ow = img.offsetWidth;
  const oh = img.offsetHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const scaleFit = Math.min(ow / nw, oh / nh);
  const drawnH = nh * scaleFit;
  const letterBottomPx = Math.max(0, (oh - drawnH) / 2);
  const bitmapSlackCss = slackNatural * scaleFit;
  const combined = letterBottomPx + bitmapSlackCss;
  const slackCss = Math.max(
    0,
    Math.min(combined, CAREER_LOGO_SLACK_CSS_MAX, oh * CAREER_LOGO_SLACK_MAX_FRAC_OF_BOX)
  );
  badge.style.setProperty("--career-img-bottom-slack", `${slackCss}px`);
}

function bindCareerLogoYearAlignment(root) {
  root.querySelectorAll(".career-club-logo-img").forEach((img) => {
    const run = () => applyCareerLogoYearSlackFromImg(img);
    const runAfterLayout = () => {
      const fallbackText = img.nextElementSibling;
      if (fallbackText) fallbackText.hidden = true;
      run();
      requestAnimationFrame(run);
      const cacheKey = String(img.dataset.logoCacheKey || "").trim();
      const loadedSrc = String(img.currentSrc || img.src || "").trim();
      if (cacheKey && loadedSrc) {
        careerResolvedClubLogoSrcByKey.set(cacheKey, loadedSrc);
      }
      if (loadedSrc && img.naturalWidth) putCachedImage(loadedSrc, img);
    };
    // Try to resolve from RAM cache for instant display (no flicker)
    const currentSrc = String(img.getAttribute("src") || "").trim();
    const cached = currentSrc ? getCachedImage(currentSrc) : null;
    if (cached) {
      img.src = cached.src;
      runAfterLayout();
    } else if (img.complete && img.naturalWidth) {
      runAfterLayout();
    } else {
      if (currentSrc) preloadImage(currentSrc);
      img.addEventListener("load", runAfterLayout, { once: true });
    }

    img.addEventListener("error", () => {
      const fallbackListRaw = img.dataset.fallbackList || "";
      const fallbackList = fallbackListRaw
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const fallbackIndex = Number.parseInt(img.dataset.fallbackIndex || "0", 10);
      if (Number.isFinite(fallbackIndex) && fallbackIndex < fallbackList.length) {
        img.dataset.fallbackIndex = String(fallbackIndex + 1);
        img.hidden = false;
        const nextUrl = fallbackList[fallbackIndex];
        const cachedFallback = getCachedImage(nextUrl);
        if (cachedFallback) {
          img.src = cachedFallback.src;
        } else {
          preloadImage(nextUrl);
          img.src = nextUrl;
        }
        return;
      }
      const b = img.closest(".career-club-badge-scale");
      if (b) b.style.removeProperty("--career-img-bottom-slack");
      img.hidden = true;
      const f = img.nextElementSibling;
      if (f) f.hidden = false;
    });
    const ro = new ResizeObserver(() => run());
    ro.observe(img);
  });
}

function measureCareerPlayerOpaqueBoundsNatural(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;

  let cw = w;
  let ch = h;
  if (w > CAREER_PLAYER_TRIM_MAX_EDGE || h > CAREER_PLAYER_TRIM_MAX_EDGE) {
    if (w >= h) {
      cw = CAREER_PLAYER_TRIM_MAX_EDGE;
      ch = Math.max(1, Math.round((h * CAREER_PLAYER_TRIM_MAX_EDGE) / w));
    } else {
      ch = CAREER_PLAYER_TRIM_MAX_EDGE;
      cw = Math.max(1, Math.round((w * CAREER_PLAYER_TRIM_MAX_EDGE) / h));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  try {
    ctx.drawImage(img, 0, 0, cw, ch);
  } catch {
    return null;
  }

  let data;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return null;
  }

  let minX = cw;
  let minY = ch;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < ch; y++) {
    const row = y * cw * 4;
    for (let x = 0; x < cw; x++) {
      if (data[row + x * 4 + 3] > CAREER_PLAYER_TRIM_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  const sxScale = w / cw;
  const syScale = h / ch;
  let sx = Math.max(0, Math.floor(minX * sxScale) - CAREER_PLAYER_TRIM_MARGIN_PX);
  let sy = Math.max(0, Math.floor(minY * syScale) - CAREER_PLAYER_TRIM_MARGIN_PX);
  let ex = Math.min(w, Math.ceil((maxX + 1) * sxScale) + CAREER_PLAYER_TRIM_MARGIN_PX);
  let ey = Math.min(h, Math.ceil((maxY + 1) * syScale) + CAREER_PLAYER_TRIM_MARGIN_PX);
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  /* Already tightly packed (or JPG fully opaque): keep original URL to avoid unnecessary blob URLs. */
  if (sw / w > 0.985 && sh / h > 0.985) return null;
  return { sx, sy, sw, sh };
}

async function resolveCareerPlayerPhotoUrl(src) {
  if (!src) return src;
  const cached = careerPlayerTrimmedPhotoUrlBySrc.get(src);
  if (cached) return cached;

  const job = (async () => {
    try {
      // Use RAM cache — avoids re-downloading on every level switch
      const img = await preloadImage(src);
      const bounds = measureCareerPlayerOpaqueBoundsNatural(img);
      if (!bounds) { careerPlayerResolvedUrlSync.set(src, src); return src; }

      const canvas = document.createElement("canvas");
      canvas.width = bounds.sw;
      canvas.height = bounds.sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) { careerPlayerResolvedUrlSync.set(src, src); return src; }
      ctx.drawImage(
        img,
        bounds.sx,
        bounds.sy,
        bounds.sw,
        bounds.sh,
        0,
        0,
        bounds.sw,
        bounds.sh
      );

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });
      if (!blob) { careerPlayerResolvedUrlSync.set(src, src); return src; }
      const url = URL.createObjectURL(blob);
      careerPlayerResolvedUrlSync.set(src, url);
      return url;
    } catch {
      careerPlayerResolvedUrlSync.set(src, src);
      return src;
    }
  })();

  careerPlayerTrimmedPhotoUrlBySrc.set(src, job);
  return job;
}

export function resolveClubAlias(clubName) {
  if (!clubName) return "";
  const c = clubName.toLowerCase().trim();
  const aliases = {
    "man city": "manchester city",
    "man utd": "manchester united",
    "dortmund": "borussia dortmund",
    "bor. dortmund": "borussia dortmund",
    "b. dortmund": "borussia dortmund",
    "psg": "paris saint-germain",
    "paris sg": "paris saint-germain",
    "spurs": "tottenham",
    "nottm forest": "nottingham forest",
    "sheff utd": "sheffield united",
    "wolves": "wolverhampton",
    "juve": "juventus",
    "inter": "inter milan",
    "milan": "ac milan",
    "bayern": "bayern munich",
    "fc bayern": "bayern munich",
    "barca": "barcelona",
    "bayer 04 leverkusen": "bayer",
    "leverkusen": "bayer",
    "atleti": "atlético",
    "atlético madrid": "atlético",
    "rb leipzig": "leipzig",
    "red bull salzburg": "salzburg",
    "rb salzburg": "salzburg",
    "sporting cp": "sporting",
    "sporting lisbon": "sporting",
    "real": "real madrid",
    "real madrid cf": "real madrid",
    "everton": "everton fc"
  };
  return aliases[c] || c;
}

function normalizeClubLookupKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|cf|sc|ac|afc|cfc|club|football|futbol|fk|if|sk|ss|sv|as|rc|ud|cd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findBestCareerClubEntry(clubName) {
  const clubs = Array.isArray(appState.teamsIndex?.clubs) ? appState.teamsIndex.clubs : [];
  const targetRaw = String(clubName || "").toLowerCase().trim();
  if (!targetRaw || !clubs.length) return null;
  const targetNorm = normalizeClubLookupKey(targetRaw);

  let best = null;
  let bestScore = -1;
  for (const club of clubs) {
    const nameRaw = String(club?.name || "").toLowerCase().trim();
    if (!nameRaw) continue;
    const nameNorm = normalizeClubLookupKey(nameRaw);
    let score = -1;
    if (nameRaw === targetRaw) score = 100;
    else if (nameNorm && targetNorm && nameNorm === targetNorm) score = 95;
    else if (nameRaw === `${targetRaw} fc`) score = 92;
    else if (nameRaw.startsWith(`${targetRaw} `)) score = 88;
    else if (targetRaw.startsWith(`${nameRaw} `)) score = 84;
    else if (nameRaw.includes(targetRaw)) score = 72;
    else if (targetRaw.includes(nameRaw)) score = 68;
    else if (nameNorm && targetNorm && (nameNorm.includes(targetNorm) || targetNorm.includes(nameNorm))) score = 60;

    if (score > bestScore) {
      best = club;
      bestScore = score;
    }
  }
  return best;
}

export function cleanCareerHistory(history) {
  if (!history || !history.length) return [];

  const isYouth = (name) => {
      if (!name) return false;
      const n = name.toLowerCase();
      return n.includes("youth") || 
             n.includes("yth") || 
             /\bu\d{2}\b/.test(n) || 
             /\bii\b/.test(n) || 
             /\breserves?\b/.test(n) ||
             n.endsWith(" b");
  };

  let h1 = history.filter(item => !isYouth(item.club));

  let h2 = [];
  for (let i = 0; i < h1.length; i++) {
      if (h2.length > 0 && String(h2[h2.length - 1].year) === String(h1[i].year)) {
          h2[h2.length - 1] = h1[i];
      } else {
          h2.push(h1[i]);
      }
  }

  /* Remove consecutive duplicate clubs. */
  let h3 = [];
  for (let i = 0; i < h2.length; i++) {
      const currentName = resolveClubAlias(h2[i].club);
      if (h3.length > 0 && resolveClubAlias(h3[h3.length - 1].club) === currentName) {
          continue;
      }
      h3.push(h2[i]);
  }

  /* Filter out "Without Club" entries. */
  h3 = h3.filter(item => {
      const name = String(item.club || "").trim().toLowerCase();
      return name && name !== "without club";
  });

  /* Remove non-consecutive duplicates — keep first occurrence only. */
  const seen = new Set();
  h3 = h3.filter(item => {
      const key = resolveClubAlias(item.club);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
  });

  return h3;
}

/**
 * Squad JSON `position` -> Goalkeeper | Defender | Midfielder | Forward.
 * Explicit keys match every distinct value under Squad Formation/Teams (14 labels); infer* covers variants.
 */
const SQUAD_POSITION_TO_BUCKET = {
  Goalkeeper: "Goalkeeper",
  "Centre-Back": "Defender",
  "Left-Back": "Defender",
  "Right-Back": "Defender",
  Sweeper: "Defender",
  "Defensive Midfield": "Midfielder",
  "Central Midfield": "Midfielder",
  "Attacking Midfield": "Midfielder",
  "Left Midfield": "Midfielder",
  "Right Midfield": "Midfielder",
  "Left Winger": "Forward",
  "Right Winger": "Forward",
  "Centre-Forward": "Forward",
  "Second Striker": "Forward",
};

/** Four-param position tile: show abbrev only (CM, RB, CAM, …); keys match squad JSON `position`. */
const SQUAD_POSITION_TO_ABBREV = {
  Goalkeeper: "GK",
  "Centre-Back": "CB",
  "Left-Back": "LB",
  "Right-Back": "RB",
  Sweeper: "SW",
  "Defensive Midfield": "CDM",
  "Central Midfield": "CM",
  "Attacking Midfield": "CAM",
  "Left Midfield": "LM",
  "Right Midfield": "RM",
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Centre-Forward": "CF",
  "Second Striker": "SS",
};

function resolveSquadPositionAbbrev(positionRaw) {
  const key = String(positionRaw ?? "").trim();
  if (!key) return "";
  let abbrev = "";
  if (Object.prototype.hasOwnProperty.call(SQUAD_POSITION_TO_ABBREV, key)) {
    abbrev = SQUAD_POSITION_TO_ABBREV[key];
  } else {
    const centreKey = key.replace(/^Center-/i, "Centre-");
    if (
      centreKey !== key &&
      Object.prototype.hasOwnProperty.call(SQUAD_POSITION_TO_ABBREV, centreKey)
    ) {
      abbrev = SQUAD_POSITION_TO_ABBREV[centreKey];
    }
  }
  /* Translate to Spanish abbrev (POR, DFC, MP, ...) when language is Spanish.
     For English the helper returns the input unchanged. */
  return translatePositionAbbrev(abbrev);
}

function inferPositionBucketFromText(raw) {
  const n = String(raw || "")
    .trim()
    .toLowerCase();
  if (!n) return "";
  if (n === "gk" || n.includes("goalkeeper") || n.includes("goal keeper")) return "Goalkeeper";
  if (n.includes("sweeper") || n.includes("defender")) return "Defender";
  if (n.includes("centre-back") || n.includes("center-back")) return "Defender";
  if (/\b(cb|lb|rb|lcb|rcb|lwb|rwb)\b/.test(n)) return "Defender";
  if (n.endsWith("-back") || n.includes("full-back") || n.includes("full back")) return "Defender";
  if (n.includes("wing-back") || n.includes("wing back")) return "Defender";
  if (n.includes("midfield")) return "Midfielder";
  if (n.includes("winger") || n.includes("forward") || n.includes("striker")) return "Forward";
  return "";
}

function mapSquadPositionToBucket(positionRaw) {
  const key = String(positionRaw != null ? positionRaw : "").trim();
  if (!key) return "";
  if (Object.prototype.hasOwnProperty.call(SQUAD_POSITION_TO_BUCKET, key)) {
    return SQUAD_POSITION_TO_BUCKET[key];
  }
  return inferPositionBucketFromText(key);
}

function isCareerPlayerGoalkeeper(player) {
  if (!player) return false;
  return mapSquadPositionToBucket(player.position) === "Goalkeeper";
}

/** Sum a numeric field from club + national career totals (squad JSON). Missing sides count as 0; both missing → "". */
function formatPlayerCareerTotalStat(player, key) {
  if (!player) return "";
  const club = player.club_career_totals;
  const nat = player.national_team_career_totals;
  const vClub = club && club[key];
  const vNat = nat && nat[key];
  const nClub = vClub != null && Number.isFinite(Number(vClub)) ? Number(vClub) : null;
  const nNat = vNat != null && Number.isFinite(Number(vNat)) ? Number(vNat) : null;
  if (nClub === null && nNat === null) return "";
  return String((nClub ?? 0) + (nNat ?? 0));
}

function formatPlayerPositionLabel(player) {
  if (!player) return "";
  return mapSquadPositionToBucket(player.position);
}

export function openCareerEditModal(slotIndex) {
    appState.careerActiveSlotIndex = slotIndex;
    if (appState.els.careerEditModal) {
        appState.els.careerEditModal.hidden = false;
        if (appState.els.careerEditOptions) appState.els.careerEditOptions.style.display = "flex";
        if (appState.els.careerEditSearchContainer) appState.els.careerEditSearchContainer.style.display = "none";
    }
}

export function shouldUseVideoQuestionLayout(state = getState()) {
  if (!state || !state.careerPlayer) return false;
  /* Shorts: questions start at level 1 (no separate landing level). Regular: level 1 is landing. */
  const isShorts = document.body.classList.contains("shorts-mode");
  const firstQuestion = isShorts ? 1 : 2;
  return appState.currentLevelIndex >= firstQuestion && appState.currentLevelIndex < appState.totalLevelsCount;
}

export function getVideoQuestionPreviewState(state = getState()) {
  const useVideoQuestionLayout = shouldUseVideoQuestionLayout(state);
  const previewPostTimer =
    useVideoQuestionLayout &&
    (appState.videoRevealPostTimerActive || (!state.videoMode && !appState.isVideoPlaying));
  const previewPreTimer = useVideoQuestionLayout && state.videoMode && !previewPostTimer;
  return { useVideoQuestionLayout, previewPreTimer, previewPostTimer };
}

/** Regular four-params: Video Mode off + post-countdown — portrait photo + name in bar; skip cinematic dim/blur.
 *  Also applies to Play Video post-timer (VM ON) so the reveal uses the same switch.
 *  Fake-info quiz: player is always shown revealed (there's no "guess the player" — the player
 *  is already known and we ask what's fake about them), so this returns true unconditionally on
 *  question levels. */
export function shouldFourParamsVmOffPostReveal(state = getState()) {
  if (!state) return false;
  if (!state.careerPlayer?.name?.trim()) return false;
  if (!shouldUseVideoQuestionLayout(state)) return false;
  if (isFakeInfoQuiz()) return true;
  if (state.videoMode && !appState.videoRevealPostTimerActive) return false;
  return getVideoQuestionPreviewState(state).previewPostTimer;
}

/** Show crest/year/edit tweak UI only when Video Mode is ON and not playing. */
export function syncCareerSlotControlsVisibility() {
  const state = getState();
  const hide = !!appState.isVideoPlaying || !state?.videoMode;
  document.body.classList.toggle("career-hide-slot-controls", hide);
}

export function renderHeader() {
  const state = getState();
  const { els } = appState;
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);

  if (els.teamHeader) {
    els.teamHeader.dataset.squadType = state.squadType;
  }

  if (previewPreTimer) {
    // Force the same pre-countdown geometry on every question level.
    els.teamHeader.classList.remove("video-revealed");
    els.teamHeader.classList.add("video-hidden");
  } else if (previewPostTimer) {
    els.teamHeader.classList.remove("video-hidden");
    els.teamHeader.classList.add("video-revealed");
  } else if (!state.videoMode) {
    els.teamHeader.classList.remove("video-hidden");
    els.teamHeader.classList.remove("video-revealed");
  }

  const vmOffFourReveal = shouldFourParamsVmOffPostReveal(state);
  document.body.classList.toggle("four-params-vm-off-reveal", vmOffFourReveal);

  const nm = state.careerPlayer?.name?.trim();
  if (els.headerName) {
    if (vmOffFourReveal) {
      els.headerName.textContent = "";
    } else {
      els.headerName.textContent = nm ? nm.toUpperCase() : CAREER_NO_PLAYER_LABEL;
    }
  }
  if (els.headerLogo) els.headerLogo.hidden = true;

  syncCareerSlotControlsVisibility();
}

/** Shared `teams.js` calls this after squad load; this runner has no pitch UI. */
export function renderPitch() {}

/**
 * Preload all images needed for the current career state into the RAM cache.
 */
export function preloadCareerAssets(state) {
  if (!state) return;
  const urls = [];
  const playerName = state.careerPlayer?.name?.trim();
  if (playerName) {
    const club = careerReadyPhotoClubName(state);
    for (let v = 1; v <= 8; v += 1) {
      for (const rel of careerReadyPhotoRelCandidates(playerName, club, v)) {
        urls.push(projectAssetUrlFresh(rel));
      }
    }
    const nat = state.careerPlayer?.nationality;
    const flagU = nat ? resolvePlayerStatsNationalityFlagUrl(nat) : null;
    if (flagU) urls.push(flagU);
  }
  const history = Array.isArray(state.careerHistory) ? state.careerHistory : [];
  for (const entry of history) {
    if (!entry) continue;
    const clubName = entry.club || "";
    if (entry.customImage) { urls.push(entry.customImage); continue; }
    if (!clubName) continue;
    const searchName = resolveClubAlias(clubName);
    const foundClub = searchName ? findBestCareerClubEntry(searchName) : null;
    if (foundClub && foundClub.path) {
      const logoRel = foundClub.path.replace('.Storage/Squad Formation/Teams/', 'Images/Teams/').replace('.json', '.png');
      urls.push(projectAssetUrlFresh(logoRel));
    }
    const displayName = String(foundClub?.name || clubName || searchName || "").trim();
    const otherTeamsRel = getClubLogoOtherTeamsRelPath(displayName || clubName);
    if (otherTeamsRel) urls.push(projectAssetUrlFresh(otherTeamsRel));
  }
  if (urls.length) preloadImages(urls);
}

export function renderCareer() {
  const state = getState();
  const isShorts = document.body.classList.contains("shorts-mode");
  const previewState = getVideoQuestionPreviewState(state);
  /* Silhouette CSS must not depend on #career-wrap.video-mode-enabled alone: that class is cleared while Play Video runs. */
  document.body.classList.toggle(
    "career-shorts-video-layout",
    isShorts && !!state.videoMode && !previewState.previewPostTimer,
  );
  const wrap = document.getElementById("career-wrap");
  document.getElementById("player-stats-panel")?.remove();
  const _revealOverlay = document.getElementById("career-reveal-overlay");
  if (_revealOverlay && !_revealOverlay.style.opacity) _revealOverlay.remove();
  const _revealName = document.getElementById("career-reveal-name");
  if (_revealName && !_revealName.style.opacity) _revealName.remove();
  /* Preserve the old flag element so we can reuse it if the same player/nationality
     is rendered again (avoids destroying and recreating the Three.js scene each level switch). */
  let preservedFlag = null;
  let preservedFlagUrl = null;
  {
    const prevFlag = document.getElementById("player-stats-national-flag");
    if (prevFlag) {
      preservedFlagUrl = prevFlag.dataset.flagSrc || null;
      /* Detach from the DOM so wrap.innerHTML = "" won't destroy it */
      prevFlag.remove();
      preservedFlag = prevFlag;
    }
  }
  if (!wrap) return;
  appState.careerTeamVisualGateDone = false;
  if (appState._careerTeamUnifiedRevealTimeoutId != null) {
    clearTimeout(appState._careerTeamUnifiedRevealTimeoutId);
    appState._careerTeamUnifiedRevealTimeoutId = null;
  }
  wrap.classList.toggle(
    "video-mode-enabled",
    !!state.videoMode,
  );

  ensureCareerPictureModeProfiles(state);
  applyCareerPictureModeToActiveState(state, isShorts);
  applyCareerRevealAdjustments(wrap, state);

  const favoriteKey = getCareerPictureFavoriteKey(state);
  if (favoriteKey && appliedFavoritePictureKeyByState.get(state) !== favoriteKey) {
    const favoriteSize = getCareerPictureFavoriteSize(state);
    if (favoriteSize) {
      state.silhouetteYOffset = favoriteSize.silhouetteYOffset;
      state.silhouetteScaleX = favoriteSize.silhouetteScaleX;
      state.silhouetteScaleY = favoriteSize.silhouetteScaleY;
      persistCareerPictureModeFromActiveState(state, isShorts);
    }
    appliedFavoritePictureKeyByState.set(state, favoriteKey);
  } else if (!favoriteKey) {
    appliedFavoritePictureKeyByState.delete(state);
  }

  /* Legacy default migration: regular mode now uses 0 / 1 / 1. */
  if (
    Math.abs(Number(state.silhouetteYOffset ?? 0) - 2) < 0.001 &&
    Math.abs(Number(state.silhouetteScaleX ?? 1) - 0.88) < 0.001 &&
    Math.abs(Number(state.silhouetteScaleY ?? 1) - 1.0) < 0.001
  ) {
    state.silhouetteYOffset = DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
    state.silhouetteScaleX = DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
    state.silhouetteScaleY = DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;
    persistCareerPictureModeFromActiveState(state, isShorts);
    applyCareerRevealAdjustments(wrap, state);
  }

  /* Old regular defaults used 0 / 0.85 / 1. Move those untouched profiles to 0 / 1 / 1. */
  const approx = (value, expected) => Math.abs(Number(value ?? expected) - expected) < 0.001;
  const isLegacyRegularDefaultProfile = (y, x, ys) =>
    approx(y, DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET) &&
    approx(x, DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X) &&
    approx(ys, DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);
  if (!isShorts) {
    const regularNormalLooksLegacy = isLegacyRegularDefaultProfile(
      state.silhouetteNormalYOffset,
      state.silhouetteNormalScaleX,
      state.silhouetteNormalScaleY,
    );
    const regularVideoLooksLegacy = isLegacyRegularDefaultProfile(
      state.silhouetteVideoYOffset,
      state.silhouetteVideoScaleX,
      state.silhouetteVideoScaleY,
    );
    let migratedRegularDefaults = false;

    if (regularNormalLooksLegacy) {
      state.silhouetteNormalYOffset = DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
      state.silhouetteNormalScaleX = DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
      state.silhouetteNormalScaleY = DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;
      migratedRegularDefaults = true;
    }

    if (regularVideoLooksLegacy && !regularNormalLooksLegacy) {
      state.silhouetteVideoYOffset = Number(
        state.silhouetteNormalYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET
      );
      state.silhouetteVideoScaleX = Number(
        state.silhouetteNormalScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X
      );
      state.silhouetteVideoScaleY = Number(
        state.silhouetteNormalScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y
      );
      migratedRegularDefaults = true;
    } else if (regularVideoLooksLegacy) {
      state.silhouetteVideoYOffset = DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
      state.silhouetteVideoScaleX = DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
      state.silhouetteVideoScaleY = DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;
      migratedRegularDefaults = true;
    }

    if (migratedRegularDefaults) {
      applyCareerPictureModeToActiveState(state, false);
      applyCareerRevealAdjustments(wrap, state);
    }
  }

  const previewCfg = appState.careerShortsCirclePreview || { enabled: false, count: 5 };
  const shortsPreviewActive =
    isShorts &&
    previewCfg.enabled === true &&
    Number(previewCfg.count) >= 1;
  const previewClubCount = shortsPreviewActive
    ? Math.min(24, Math.max(1, Math.round(Number(previewCfg.count))))
    : 0;

  const history = state.careerHistory || [];
  let n = history.length > 0 ? history.length : (state.careerClubsCount || 5);
  if (shortsPreviewActive) n = previewClubCount;

  const slotScales = ensureCareerSlotBadgeScalesForMode(state, n, isShorts);
  ensureCareerSlotYearNudges(state, n);
  const slotYearNudges = state.careerSlotYearNudges;
  for (let i = 0; i < n; i++) {
    const favorite = getCareerClubFavoriteSize(state, i, isShorts ? "shorts" : "regular");
    if (!favorite) continue;
    slotScales[i] = clampCareerBadgeScale(favorite.badgeScale);
    slotYearNudges[i] = clampCareerYearNudge(favorite.yearNudge);
  }

  wrap.innerHTML = "";
  document.body
    .querySelectorAll(".career-ready-photo-url-modal.career-ready-photo-url-modal--portal")
    .forEach((el) => el.remove());
  document.body
    .querySelectorAll(".career-ready-photo-switch-modal.career-ready-photo-switch-modal--portal")
    .forEach((el) => el.remove());
  /* Clear X may live outside #career-wrap in shorts (same chrome mount as voice). */
  document.getElementById("career-clear-player-btn")?.remove();
  /* Get photo bar may live in `#player-voice-chrome-mount` (outside #career-wrap). */
  document.getElementById("player-voice-chrome-mount")?.querySelector(".career-get-photo-actions")?.remove();

  const playerName = state.careerPlayer?.name?.trim() || "";
  const hasRealPlayer = !!playerName;
  const fakeInfoQuiz = isFakeInfoQuiz();
  const quizTypeControl = appState.els?.inQuizType;
  const quizTypeLabel = String(quizTypeControl?.selectedOptions?.[0]?.textContent || "")
    .trim()
    .toUpperCase();
  const teamYearMarker = String(
    state.careerHistory?.[0]?.year ?? state.careerPlayer?.transfer_history?.[0]?.year ?? "",
  )
    .trim()
    .toUpperCase();
  const quizTypeValue = String(
    quizTypeControl?.value || document.getElementById("in-quiz-type")?.value || "",
  );
  const quizTypeValueLower = quizTypeValue.trim().toLowerCase();
  /* Player-name quiz must always use the boxed square card layout, regardless of any stale
     team-mode flags from previous levels/sessions. */
  const selectedPlayerCardMode =
    hasRealPlayer &&
    !fakeInfoQuiz &&
    (quizTypeValue === "player-by-career-stats" ||
      (quizTypeValueLower.includes("player") && !quizTypeValueLower.includes("fake")) ||
      (quizTypeValue !== "player-by-fake-info" && quizTypeLabel.includes("PLAYER NAME")));
  const selectedTeamCardMode =
    !selectedPlayerCardMode &&
    hasRealPlayer &&
    (
      !!state.careerTeamQuizMode ||
      fakeInfoQuiz ||
      quizTypeLabel.includes("TEAM NAME") ||
      teamYearMarker === "TEAM" ||
      (
        String(state.careerPlayer?.club || "").trim() !== "" &&
        String(state.careerPlayer?.club || "").trim() === String(state.careerPlayer?.name || "").trim() &&
        !String(state.careerPlayer?.position || "").trim()
      )
    );
  const selectedAnyCardMode = selectedTeamCardMode || selectedPlayerCardMode;
  document.body.classList.toggle("career-team-card-mode", !!selectedAnyCardMode);
  document.body.classList.toggle("career-player-card-mode", !!selectedPlayerCardMode);
  const gateStatPlayer = hasRealPlayer ? state.careerPlayer : null;
  let gateFlagUrl =
    !isShorts && hasRealPlayer ? resolvePlayerStatsNationalityFlagUrl(gateStatPlayer?.nationality) : null;
  if (FOUR_PARAMS_HIDE_NATIONALITY_FLAG) gateFlagUrl = null;
  const useTeamUnifiedVisualGate = !isShorts && hasRealPlayer && appState.isVideoPlaying;
  const playerVisualGate = useTeamUnifiedVisualGate ? { silhouette: false, flag: false } : null;
  function tryReleasePlayerFlagVisualGate() {
    if (!playerVisualGate || !wrap.classList.contains("career-player-visual-pending")) return;
    if (!playerVisualGate.silhouette || !playerVisualGate.flag) return;
    wrap.classList.remove("career-player-visual-pending");
    document.body.classList.remove("career-player-visual-pending");
    appState.careerTeamVisualGatePending = false;
    appState.careerTeamVisualGateDone = true;
    runCareerTeamUnifiedRevealFade();
  }
  function markSilhouetteGateReady() {
    if (!playerVisualGate || playerVisualGate.silhouette) return;
    playerVisualGate.silhouette = true;
    tryReleasePlayerFlagVisualGate();
  }
  function markFlagGateReady() {
    if (!playerVisualGate || playerVisualGate.flag) return;
    playerVisualGate.flag = true;
    tryReleasePlayerFlagVisualGate();
  }
  if (useTeamUnifiedVisualGate) {
    wrap.classList.add("career-player-visual-pending");
    document.body.classList.add("career-player-visual-pending");
    appState.careerTeamVisualGatePending = true;
    if (!gateFlagUrl) {
      markFlagGateReady();
    }
    const gateFallbackMs = 7000;
    setTimeout(() => {
      markFlagGateReady();
      markSilhouetteGateReady();
    }, gateFallbackMs);
  } else {
    wrap.classList.remove("career-player-visual-pending");
    document.body.classList.remove("career-player-visual-pending");
    appState.careerTeamVisualGatePending = false;
  }

  const showShortsCareerGrid = hasRealPlayer || shortsPreviewActive;
  wrap.classList.toggle("career-no-player", !hasRealPlayer && !shortsPreviewActive);
  const readyPhotoClub = hasRealPlayer ? careerReadyPhotoClubName(state) : "";
  const readyPhotoVariantIdx = Math.max(1, Math.floor(Number(state.careerReadyPhotoVariantIndex) || 1));
  const readyPhotoPick = hasRealPlayer
    ? pickLoadableReadyPhotoUrlForVariant(playerName, readyPhotoClub, readyPhotoVariantIdx)
    : Promise.resolve("");
  const showClearPlayerButton = hasRealPlayer && !appState.isVideoPlaying;
  /* Team-name fake-info mode has no player photo workflow — only career-stats keeps Get photo / Switch. */
  const getPhotoUi =
    hasRealPlayer && !isFakeInfoQuiz() ? createCareerGetPhotoControls(playerName, readyPhotoClub) : null;
  const careerGetPhotoSuppressed = () =>
    !!(getState()?.videoMode || appState.isVideoPlaying);
  const showGetPhotoUiIfAllowed = () => {
    if (getPhotoUi && !careerGetPhotoSuppressed()) getPhotoUi.show();
  };

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 1000 400");
  /* none: road + slots stay aligned to the wrap; player <image> rect is corrected in applyCareerSilhouetteSvgImageRect. */
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "career-svg");

  const defs = document.createElementNS(svgNamespace, "defs");
  const silhouetteAuraFilter = document.createElementNS(svgNamespace, "filter");
  silhouetteAuraFilter.setAttribute("id", "career-silhouette-aura");
  silhouetteAuraFilter.setAttribute("x", "-72%");
  silhouetteAuraFilter.setAttribute("y", "-72%");
  silhouetteAuraFilter.setAttribute("width", "244%");
  silhouetteAuraFilter.setAttribute("height", "244%");
  silhouetteAuraFilter.setAttribute("color-interpolation-filters", "sRGB");

  const auraExpand = document.createElementNS(svgNamespace, "feMorphology");
  auraExpand.setAttribute("in", "SourceAlpha");
  auraExpand.setAttribute("operator", "dilate");
  auraExpand.setAttribute("radius", "7.5");
  auraExpand.setAttribute("result", "auraExpanded");

  const auraBlur = document.createElementNS(svgNamespace, "feGaussianBlur");
  auraBlur.setAttribute("in", "auraExpanded");
  auraBlur.setAttribute("stdDeviation", "15");
  auraBlur.setAttribute("result", "auraSoft");

  const auraColor = document.createElementNS(svgNamespace, "feFlood");
  auraColor.setAttribute("flood-color", "#c8fff4");
  auraColor.setAttribute("flood-opacity", "1");
  auraColor.setAttribute("result", "auraColor");

  const auraComposite = document.createElementNS(svgNamespace, "feComposite");
  auraComposite.setAttribute("in", "auraColor");
  auraComposite.setAttribute("in2", "auraSoft");
  auraComposite.setAttribute("operator", "in");
  auraComposite.setAttribute("result", "auraTint");

  const auraMerge = document.createElementNS(svgNamespace, "feMerge");
  const auraMergeNodeGlow = document.createElementNS(svgNamespace, "feMergeNode");
  auraMergeNodeGlow.setAttribute("in", "auraTint");
  const auraMergeNodeGraphic = document.createElementNS(svgNamespace, "feMergeNode");
  auraMergeNodeGraphic.setAttribute("in", "SourceGraphic");
  auraMerge.appendChild(auraMergeNodeGlow);
  auraMerge.appendChild(auraMergeNodeGraphic);

  silhouetteAuraFilter.appendChild(auraExpand);
  silhouetteAuraFilter.appendChild(auraBlur);
  silhouetteAuraFilter.appendChild(auraColor);
  silhouetteAuraFilter.appendChild(auraComposite);
  silhouetteAuraFilter.appendChild(auraMerge);
  defs.appendChild(silhouetteAuraFilter);
  svg.appendChild(defs);

  const imageGroup = document.createElementNS(svgNamespace, "g");
  const image = document.createElementNS(svgNamespace, "image");

  const useVideoOnSilhouetteCaps = useCareerSilhouetteVideoOnCapsForRender(isShorts, state);
  if (!useVideoOnSilhouetteCaps) {
    if (isShorts) {
      image.setAttribute("x", "210");
      image.setAttribute("y", "-80");
      image.setAttribute("width", String(CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_OFF));
      image.setAttribute("height", String(CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_OFF));
    } else {
      image.setAttribute("x", "125");
      image.setAttribute("y", "-235");
      image.setAttribute("width", String(CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_OFF));
      image.setAttribute("height", String(CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_OFF));
    }
  } else if (isShorts) {
    const maxSq = CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_ON;
    let placeholderY = Math.round(
      CAREER_SILHOUETTE_BOTTOM_SHORTS - maxSq * (1 + CAREER_SILHOUETTE_VERTICAL_UP_FRAC),
    );
    placeholderY += CAREER_SILHOUETTE_SHORTS_VIDEO_MODE_Y_NUDGE;
    image.setAttribute("x", String(500 - maxSq / 2));
    image.setAttribute("y", String(placeholderY));
    image.setAttribute("width", String(maxSq));
    image.setAttribute("height", String(maxSq));
  } else {
    const maxSq = CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_ON;
    image.setAttribute("x", String(500 - maxSq / 2));
    image.setAttribute(
      "y",
      String(
        Math.round(
          CAREER_SILHOUETTE_BOTTOM_REGULAR - maxSq * (1 + CAREER_SILHOUETTE_VERTICAL_UP_FRAC),
        ),
      ),
    );
    image.setAttribute("width", String(maxSq));
    image.setAttribute("height", String(maxSq));
  }

  image.setAttribute("preserveAspectRatio", "xMidYMax meet");
  image.setAttribute("class", "career-silhouette career-silhouette--photo");

  /* Keep a uniform baseline, but still apply Adjust Picture offsets/scales. */
  applyCareerSilhouetteAdjustments(image, state);

  const missingLabel = document.createElementNS(svgNamespace, "text");
  missingLabel.setAttribute("x", "500");
  missingLabel.setAttribute("y", "120");
  missingLabel.setAttribute("text-anchor", "middle");
  missingLabel.setAttribute("fill", "#f8fafc");
  missingLabel.setAttribute("class", "career-photo-missing-label");
  missingLabel.setAttribute("font-family", "Barlow Condensed, sans-serif");
  missingLabel.setAttribute("font-size", "28");
  missingLabel.setAttribute("font-weight", "800");
  missingLabel.textContent = CAREER_NO_PHOTO_LABEL;

  const showMissing = (label = CAREER_NO_PHOTO_LABEL) => {
    missingLabel.textContent = label;
    image.setAttribute("visibility", "hidden");
    if (getPhotoUi) {
      missingLabel.setAttribute("visibility", "hidden");
      showGetPhotoUiIfAllowed();
    } else {
      missingLabel.setAttribute("visibility", "visible");
    }
    markSilhouetteGateReady();
  };

  const showImage = () => {
    image.setAttribute("visibility", "visible");
    missingLabel.setAttribute("visibility", "hidden");
    if (getPhotoUi) getPhotoUi.hide();
    markSilhouetteGateReady();
  };

  const syncSilhouetteFromLoadedBitmap = () => {
    applyCareerSilhouetteSvgImageRect(
      image,
      isShorts,
      useCareerSilhouetteVideoOnCapsForRender(isShorts, state),
    );
    applyCareerSilhouetteAdjustments(image, state);
  };

  const applyReadyPhotoToSilhouette = (chosenUrl) => {
    if (!chosenUrl) {
      if (hasRealPlayer) {
        if (FOUR_PARAMS_HIDE_PLAYER_IMAGES) {
          image.setAttribute("visibility", "hidden");
          missingLabel.setAttribute("visibility", "hidden");
          showGetPhotoUiIfAllowed();
          markSilhouetteGateReady();
        } else {
          showMissing();
        }
      } else {
        image.setAttribute("visibility", "hidden");
        missingLabel.setAttribute("visibility", "hidden");
      }
      return;
    }
    if (FOUR_PARAMS_HIDE_PLAYER_IMAGES) {
      image.setAttribute("visibility", "hidden");
      missingLabel.setAttribute("visibility", "hidden");
      showGetPhotoUiIfAllowed();
      markSilhouetteGateReady();
      return;
    }
    /* If the trimmed photo URL was already resolved in a prior render, use it
       synchronously so the silhouette is visible immediately — no hidden→load flash. */
    const syncUrl = careerPlayerResolvedUrlSync.get(chosenUrl);
    if (syncUrl) {
      image.setAttribute("href", syncUrl);
      showImage();
      /* Rect fitting needs naturalWidth/Height which may not be ready on a fresh
         <image> element even with a cached blob URL.  Try now, fall back to load event. */
      image.addEventListener("load", () => {
        syncSilhouetteFromLoadedBitmap();
      });
      requestAnimationFrame(() => {
        if (!image.isConnected) return;
        if (image.naturalWidth && image.naturalHeight) {
          syncSilhouetteFromLoadedBitmap();
        }
      });
    } else {
      image.setAttribute("visibility", "hidden");
      missingLabel.setAttribute("visibility", "hidden");
      image.addEventListener("load", () => {
        showImage();
        syncSilhouetteFromLoadedBitmap();
      });
      image.addEventListener("error", () => showMissing());
      void resolveCareerPlayerPhotoUrl(chosenUrl).then((resolvedUrl) => {
        if (!image.isConnected) return;
        image.setAttribute("href", resolvedUrl || chosenUrl);
        /* Cached bitmap: load may not fire. */
        requestAnimationFrame(() => {
          if (!image.isConnected) return;
          if (image.naturalWidth && image.naturalHeight) {
            showImage();
            syncSilhouetteFromLoadedBitmap();
          }
        });
      });
    }
  };

  if (hasRealPlayer) {
    void readyPhotoPick.then((chosenUrl) => {
      if (!image.isConnected) return;
      applyReadyPhotoToSilhouette(chosenUrl);
    });
  } else {
    image.setAttribute("visibility", "hidden");
    missingLabel.setAttribute("visibility", "hidden");
  }

  imageGroup.appendChild(image);
  imageGroup.appendChild(missingLabel);
  svg.appendChild(imageGroup);
  wrap.appendChild(svg);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      if (!image.isConnected || !image.naturalWidth) return;
      applyCareerSilhouetteSvgImageRect(
        image,
        isShorts,
        useCareerSilhouetteVideoOnCapsForRender(isShorts, getState()),
      );
      applyCareerSilhouetteAdjustments(image, getState());
    });
    ro.observe(svg);
  }

  if (!FOUR_PARAMS_HIDE_INLINE_PLAYER_PICKER && !hasRealPlayer && !shortsPreviewActive && !state.isOutro) {
    document.getElementById("career-inline-player-picker")?.remove();
    const pickerTitle = fakeInfoQuiz ? "No team Selected" : "No Player Selected";
    const pickerPlaceholder = fakeInfoQuiz ? "Search team name..." : "Search player name...";
    const pickerHint = fakeInfoQuiz ? "Type team name to search." : "Type player name to search.";
    const picker = document.createElement("div");
    picker.id = "career-inline-player-picker";
    picker.className = "career-inline-player-picker";
    picker.innerHTML = `
      <div class="career-inline-player-picker-title">${pickerTitle}</div>
      <input
        id="career-inline-player-search"
        class="career-inline-player-search"
        type="text"
        autocomplete="off"
        placeholder="${pickerPlaceholder}"
      />
      <div id="career-inline-player-results" class="career-inline-player-results">
        <div class="career-inline-player-hint">${pickerHint}</div>
      </div>
    `;
    /* Mount on <body> so no transformed/filtered ancestor interferes with the
       `position: fixed` centering — matches the Lineups Shorts team picker. */
    document.body.appendChild(picker);
  } else {
    document.getElementById("career-inline-player-picker")?.remove();
  }
  if (hasRealPlayer) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.id = "career-clear-player-btn";
    clearBtn.className = "career-clear-player-btn";
    clearBtn.textContent = "X";
    clearBtn.setAttribute("aria-label", fakeInfoQuiz ? "Remove selected team" : "Remove selected player");
    /* Keep element in flex layout so the gap between param-grid and portrait-card
       stays constant across VM on/off and play-video states; just hide visually. */
    if (showClearPlayerButton) {
      clearBtn.style.visibility = "";
      clearBtn.style.pointerEvents = "";
      clearBtn.setAttribute("aria-hidden", "false");
      clearBtn.tabIndex = 0;
    } else {
      clearBtn.style.visibility = "hidden";
      clearBtn.style.pointerEvents = "none";
      clearBtn.setAttribute("aria-hidden", "true");
      clearBtn.tabIndex = -1;
    }
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const st = getState();
      if (!st) return;
      st.careerPlayer = null;
      st.careerTeamQuizMode = false;
      st.careerHistory = [];
      if (appState.els?.careerSelectedInfo) {
        appState.els.careerSelectedInfo.innerHTML = "";
      }
      renderCareer();
      renderHeader();
    });
    const voiceChromeMount = document.getElementById("player-voice-chrome-mount");
    if (isShorts && voiceChromeMount) {
      /* Match Career Path Shorts: mount next to Vol/X so the red X shares the same
         top: 5.5vh row, outside .stage (viewport-anchored). */
      voiceChromeMount.insertBefore(clearBtn, voiceChromeMount.firstChild);
    } else {
      wrap.appendChild(clearBtn);
    }
  }

  if (getPhotoUi) {
    const voiceChromeMountForPhoto = document.getElementById("player-voice-chrome-mount");
    if (isShorts && voiceChromeMountForPhoto) {
      voiceChromeMountForPhoto.appendChild(getPhotoUi.host);
    } else {
      wrap.appendChild(getPhotoUi.host);
    }
    if (careerGetPhotoSuppressed()) getPhotoUi.hide();
  }

  const knownClubImageFolders = Array.from(
    new Set(
      (appState.teamsIndex?.clubs || [])
        .map((club) => {
          const country = String(club?.country || "").trim();
          const league = String(club?.league || "").trim();
          if (!country || !league) return "";
          return `Teams Images/${country}/${league}`;
        })
        .filter(Boolean)
    )
  );

  const escapeHtml = (text) =>
    String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildClubLogoCandidatesRel = (names, foundClubEntry) => {
    const out = [];
    const uniqueNames = Array.from(
      new Set(
        names
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      )
    );

    uniqueNames.forEach((name) => {
      const rel = getClubLogoOtherTeamsRelPath(name);
      if (rel) out.push(rel);
    });

    if (foundClubEntry && foundClubEntry.country && foundClubEntry.league) {
      uniqueNames.forEach((name) => {
        out.push(`Teams Images/${foundClubEntry.country}/${foundClubEntry.league}/${name}.png`);
      });
    }

    uniqueNames.forEach((name) => {
      knownClubImageFolders.forEach((folder) => {
        out.push(`${folder}/${name}.png`);
      });
    });

    if (foundClubEntry && foundClubEntry.path) {
      out.push(
        foundClubEntry.path.replace(".Storage/Squad Formation/Teams/", "Images/Teams/").replace(".json", ".png")
      );
    }

    return Array.from(new Set(out));
  };

  /** Shirt visual (fake-info mode): same t-shirt PNG + hollow number style used by
   *  Main Runner - Player stats' floating shirt, scaled to fit inside the param card. */
  const buildShirtVisual = (numberText) => {
    const wrap = document.createElement("div");
    wrap.className = "fake-info-shirt";
    const img = document.createElement("img");
    img.className = "fake-info-shirt__img";
    img.src = "https://i.ibb.co/LdRC1wS8/blank-t-shirt.png";
    img.alt = "";
    const num = document.createElement("span");
    num.className = "fake-info-shirt__number play-bold";
    num.textContent = numberText || "—";
    wrap.appendChild(img);
    wrap.appendChild(num);
    return wrap;
  };

  /** Fake-info flip: build the "real value" version of the faked card so it can sit on the
   *  back face of the flipper. Each stat renders with the same class structure the main
   *  builder uses, so glass/card/text styling matches. */
  const buildRealValueInner = (stat, player) => {
    if (stat === "position") {
      const inner = document.createElement("div");
      inner.className = "career-param-card__inner career-param-card__inner--position";
      const posMain = document.createElement("span");
      posMain.className = "career-param-card__position-main";
      posMain.textContent = resolveSquadPositionAbbrev(player.position) || "—";
      inner.appendChild(posMain);
      return inner;
    }
    if (stat === "shirt_number") {
      const inner = document.createElement("div");
      inner.className = "career-param-card__inner career-param-card__inner--age";
      inner.appendChild(
        buildShirtVisual(player.shirt_number != null ? String(player.shirt_number) : "—"),
      );
      return inner;
    }
    if (stat === "country") {
      const realNat = String(player.nationality || "").trim();
      const flagUrl = resolvePlayerStatsNationalityFlagUrl(realNat);
      const inner = document.createElement("div");
      inner.className = "career-param-card__inner career-param-card__inner--flag-fill";
      const flagWrap = document.createElement("div");
      flagWrap.className = "career-param-card__flag-wrap";
      const flagImg = document.createElement("img");
      flagImg.className = "career-param-card__flag";
      flagImg.alt = "";
      if (flagUrl) flagImg.src = flagUrl;
      else flagImg.hidden = true;
      flagImg.addEventListener("error", () => { flagImg.hidden = true; });
      flagWrap.appendChild(flagImg);
      inner.appendChild(flagWrap);
      return inner;
    }
    if (stat === "club") {
      const clubName = String(player.club || "").trim();
      const searchName = resolveClubAlias(clubName);
      const foundClub = searchName ? findBestCareerClubEntry(searchName) : null;
      const displayClubName = String(foundClub?.name || clubName || searchName || "").trim();
      let logoRel = "";
      if (foundClub?.path) {
        logoRel = foundClub.path
          .replace(".Storage/Squad Formation/Teams/", "Images/Teams/")
          .replace(".json", ".png");
      }
      const baseUrl = logoRel ? projectAssetUrlFresh(logoRel) : "";
      const inner = document.createElement("div");
      inner.className = "career-param-card__inner career-param-card__inner--club";
      const vis = document.createElement("div");
      vis.className = "career-param-card__club-visual";
      const logoImg = document.createElement("img");
      logoImg.className = "career-param-card__logo career-club-logo-img";
      logoImg.alt = "";
      logoImg.loading = "eager";
      const fb = document.createElement("div");
      fb.className =
        "career-param-card__logo-fallback career-club-fallback-text career-club-fallback-text--solo";
      fb.textContent = displayClubName || clubName || "—";
      if (baseUrl) {
        logoImg.src = baseUrl;
        fb.hidden = true;
        logoImg.addEventListener("error", () => {
          logoImg.hidden = true;
          fb.hidden = false;
        });
      } else {
        logoImg.hidden = true;
        fb.hidden = false;
      }
      vis.appendChild(logoImg);
      vis.appendChild(fb);
      inner.appendChild(vis);
      return inner;
    }
    return null;
  };

  /** Four-parameter quiz tiles: club logo, position, nationality flag, age (regular layout).
   *  In the fake-info quiz: the age card becomes "shirt number", and one stat per level is
   *  replaced with a plausible-but-wrong value (deterministic per level). */
  const mountFourParamCareerCards = (gridEl, player) => {
    if (!gridEl || !player) return;
    const cells = gridEl.querySelectorAll(".career-param-card");
    if (cells.length !== 4) return;

    const fakeMode = isFakeInfoQuiz();
    const fakePick = fakeMode
      ? fakeInfoPickForLevel({ careerPlayer: player }, appState.currentLevelIndex)
      : null;

    const resolvedClub =
      fakePick?.stat === "club" && fakePick.value ? fakePick.value : String(player.club || "").trim();
    const resolvedPosition =
      fakePick?.stat === "position" && fakePick.value ? fakePick.value : String(player.position || "").trim();
    const resolvedNationality =
      fakePick?.stat === "country" && fakePick.value
        ? fakePick.value
        : String(player.nationality || "").trim();
    const resolvedShirtNumber =
      fakePick?.stat === "shirt_number" && fakePick.value
        ? fakePick.value
        : player.shirt_number != null
          ? String(player.shirt_number)
          : "—";

    const clubName = resolvedClub;
    const searchName = resolveClubAlias(clubName);
    const foundClub = searchName ? findBestCareerClubEntry(searchName) : null;
    const displayClubName = String(foundClub?.name || clubName || searchName || "").trim();
    const fileNameCandidates = [
      displayClubName,
      clubName,
      searchName,
      foundClub?.name,
      /\bfc\b/i.test(displayClubName)
        ? displayClubName.replace(/\s*\bfc\b\s*/i, "").trim()
        : `${displayClubName} FC`.trim(),
    ];
    const fallbackCandidatesRel = buildClubLogoCandidatesRel(fileNameCandidates, foundClub);
    const fallbackCandidates = Array.from(
      new Set(
        fallbackCandidatesRel
          .filter(Boolean)
          .map((rel) => freshenCareerImageUrl(projectAssetUrlFresh(rel))),
      ),
    );
    let logoUrl = "";
    if (foundClub?.path) {
      logoUrl = foundClub.path
        .replace(".Storage/Squad Formation/Teams/", "Images/Teams/")
        .replace(".json", ".png");
    }
    const baseUrl = logoUrl ? projectAssetUrlFresh(logoUrl) : "";
    const logoCacheKey = normalizeClubLookupKey(displayClubName || clubName || searchName);
    const cachedResolvedSrc = logoCacheKey
      ? String(careerResolvedClubLogoSrcByKey.get(logoCacheKey) || "")
      : "";
    const candidateUrls = Array.from(
      new Set([cachedResolvedSrc, baseUrl, ...fallbackCandidates].filter(Boolean)),
    );
    const firstUrl = candidateUrls[0] || "";
    const remainingFallbacks = candidateUrls.slice(1).join("|");

    const positionRaw = resolvedPosition;
    const nationalityRaw = resolvedNationality;
    const natLabel = playerStatsNationalityLabelForFlagcode(nationalityRaw);
    const flagUrl = resolvePlayerStatsNationalityFlagUrl(nationalityRaw);
    /* Fourth card: age by default, shirt number in fake-info mode. */
    const fourthCardText = fakeMode
      ? resolvedShirtNumber
      : (player.age != null && Number.isFinite(Number(player.age))
          ? String(Number(player.age))
          : "—");

    cells[0].classList.add("career-param-card--club");
    const inner0 = document.createElement("div");
    inner0.className = "career-param-card__inner career-param-card__inner--club";
    const vis = document.createElement("div");
    vis.className = "career-param-card__club-visual";
    const logoImg = document.createElement("img");
    logoImg.className = "career-param-card__logo career-club-logo-img";
    logoImg.alt = "";
    logoImg.loading = "eager";
    logoImg.decoding = "async";
    logoImg.dataset.fallbackList = remainingFallbacks;
    logoImg.dataset.fallbackIndex = "0";
    if (logoCacheKey) logoImg.dataset.logoCacheKey = logoCacheKey;
    const logoFb = document.createElement("div");
    logoFb.className =
      "career-param-card__logo-fallback career-club-fallback-text career-club-fallback-text--solo";
    logoFb.textContent = displayClubName || clubName || "—";
    if (firstUrl) {
      logoImg.src = freshenCareerImageUrl(firstUrl);
      logoFb.hidden = true;
    } else {
      logoImg.hidden = true;
      logoFb.hidden = false;
    }
    vis.appendChild(logoImg);
    vis.appendChild(logoFb);
    inner0.appendChild(vis);
    cells[0].appendChild(inner0);

    cells[1].classList.add("career-param-card--position");
    const inner1 = document.createElement("div");
    inner1.className = "career-param-card__inner career-param-card__inner--position";
    const posMain = document.createElement("span");
    posMain.className = "career-param-card__position-main";
    /* Fake-info mode substitutes a different-category position; fall back to our own abbrev
       table when the shared one doesn't know the full name. */
    const posAbbrev =
      resolveSquadPositionAbbrev(resolvedPosition) ||
      (fakeMode ? fakeInfoPositionAbbrev(resolvedPosition) : "") ||
      "—";
    posMain.textContent = posAbbrev;
    inner1.appendChild(posMain);
    cells[1].appendChild(inner1);

    cells[2].classList.add("career-param-card--country");
    const inner2 = document.createElement("div");
    inner2.className = "career-param-card__inner career-param-card__inner--flag-fill";
    const flagWrap = document.createElement("div");
    flagWrap.className = "career-param-card__flag-wrap";
    const flagImg = document.createElement("img");
    flagImg.className = "career-param-card__flag";
    flagImg.alt = natLabel ? `${natLabel} flag` : "";
    if (flagUrl) {
      flagImg.src = flagUrl;
    } else {
      flagImg.hidden = true;
    }
    flagImg.addEventListener("error", () => {
      flagImg.hidden = true;
    });
    flagWrap.appendChild(flagImg);
    inner2.appendChild(flagWrap);
    cells[2].appendChild(inner2);

    cells[3].classList.add("career-param-card--age");
    if (fakeMode) cells[3].classList.add("career-param-card--shirt-number");
    const inner3 = document.createElement("div");
    inner3.className = "career-param-card__inner career-param-card__inner--age";
    if (fakeMode) {
      /* Shirt number card in fake-info: render a t-shirt visual with the number on it,
         matching the floating shirt from Main Runner - Player stats. */
      inner3.appendChild(buildShirtVisual(fourthCardText));
    } else {
      const ageRow = document.createElement("div");
      ageRow.className = "career-param-card__age-row";
      const ageVal = document.createElement("span");
      ageVal.className = "career-param-card__age-value";
      const ageNum = Number(fourthCardText);
      const ageUnit = ageNum === 1 ? t("ageUnitSingular") : t("ageUnitPlural");
      const ageNumSpan = document.createElement("span");
      ageNumSpan.className = "career-param-card__age-number";
      ageNumSpan.textContent = fourthCardText;
      const ageUnitSpan = document.createElement("span");
      ageUnitSpan.className = "career-param-card__age-unit";
      ageUnitSpan.textContent = ageUnit;
      ageVal.appendChild(ageNumSpan);
      ageVal.appendChild(ageUnitSpan);
      ageRow.appendChild(ageVal);
      inner3.appendChild(ageRow);
    }
    cells[3].appendChild(inner3);

    /* Fake-info mode: tag each card with its stat name + which one is the fake.
       CSS uses these to pull the fake card forward and blur the rest on reveal. */
    if (fakeMode) {
      const cardStats = ["club", "position", "country", "shirt_number"];
      for (let i = 0; i < 4; i += 1) {
        cells[i].dataset.fakeInfoStat = cardStats[i];
        cells[i].classList.toggle(
          "career-param-card--fake-stat",
          !!fakePick && fakePick.stat === cardStats[i],
        );
      }

      /* Fake-stat card: wrap its current content (the FAKE value) in a 3D flipper, and
         mount a second face behind it containing the REAL value. CSS triggers the flip
         animation a moment after the timer ends. */
      if (fakePick?.stat) {
        const fakeIdx = cardStats.indexOf(fakePick.stat);
        const fakeCell = cells[fakeIdx];
        const realInner = buildRealValueInner(fakePick.stat, player);
        if (fakeCell && realInner) {
          const existingChildren = Array.from(fakeCell.children);
          const flipper = document.createElement("div");
          flipper.className = "fake-info-flipper";
          const front = document.createElement("div");
          front.className = "fake-info-face fake-info-face--front";
          for (const el of existingChildren) front.appendChild(el);
          flipper.appendChild(front);
          const back = document.createElement("div");
          back.className = "fake-info-face fake-info-face--back";
          back.appendChild(realInner);
          flipper.appendChild(back);
          fakeCell.insertBefore(flipper, fakeCell.firstChild);
        }
      }
    }

    gridEl.removeAttribute("aria-hidden");
    gridEl.setAttribute("role", "region");
    gridEl.setAttribute("aria-label", "Player parameters");
  };

  /** Shorts career grid: clubs per row (rows are flex-centered so short rows sit in the middle). */
  const getShortsCareerRowCounts = (teamCount) => {
    const presets = {
      1: [1],
      2: [2],
      3: [2, 1], // 2 top, 1 centered below
      4: [2, 2],
      5: [3, 2], // 3 top, 2 centered below
      6: [3, 3],
      7: [3, 3, 1], // two full rows of 3, 1 centered
      8: [3, 3, 2], // two rows of 3, 2 centered
      9: [3, 3, 3],
      10: [3, 3, 3, 1], // three rows of 3, 1 centered
      11: [3, 3, 3, 2], // three rows of 3, 2 centered
      12: [3, 3, 3, 3],
    };
    const safeCount = Math.max(0, Number(teamCount) || 0);
    if (presets[safeCount]) return presets[safeCount].slice();

    const rows = [];
    let remaining = safeCount;
    const maxPerRow = 3;
    while (remaining > 0) {
      rows.push(Math.min(maxPerRow, remaining));
      remaining -= maxPerRow;
    }
    return rows;
  };

  // Helper function to build dynamic slot content with logo, fallback text, and optional year
  const generateSlotContent = (index, slotOptions = {}) => {
    const includeYear = slotOptions.includeYear !== false;
    const statsPanelCompact = !!slotOptions.statsPanelCompact;
    let clubName = "";
    let year = "YYYY";
    let logoUrl = "";
    let isCustomImage = false;
    let foundClub = null;
    let searchName = "";

    if (history && history[index]) {
        clubName = history[index].club || "";
        year = history[index].year || "YYYY";
        searchName = resolveClubAlias(clubName);

        if (searchName) {
            foundClub = findBestCareerClubEntry(searchName);
        }

        if (history[index].customImage) {
            logoUrl = history[index].customImage;
            isCustomImage = true;
        } else {
            if (foundClub && foundClub.path) {
                logoUrl = foundClub.path.replace('.Storage/Squad Formation/Teams/', 'Images/Teams/').replace('.json', '.png');
            }
        }
    }

    let innerContent = "";
    const displayClubName = String(foundClub?.name || clubName || searchName || "").trim();
    const fileNameCandidates = [
      displayClubName,
      clubName,
      searchName,
      foundClub?.name,
      /\bfc\b/i.test(displayClubName) ? displayClubName.replace(/\s*\bfc\b\s*/i, "").trim() : `${displayClubName} FC`.trim(),
    ];
    const fallbackCandidatesRel = buildClubLogoCandidatesRel(fileNameCandidates, foundClub);
    const fallbackCandidates = Array.from(
      new Set(
        fallbackCandidatesRel
          .filter(Boolean)
          .map((rel) => freshenCareerImageUrl(projectAssetUrlFresh(rel)))
      )
    );
    
    if (clubName || isCustomImage) {
        const logoCacheKey = normalizeClubLookupKey(displayClubName || clubName || searchName);
        const cachedResolvedSrc = logoCacheKey ? String(careerResolvedClubLogoSrcByKey.get(logoCacheKey) || "") : "";
        if (logoUrl) {
            const baseUrl = isCustomImage
              ? logoUrl
              : (typeof projectAssetUrlFresh === "function" ? projectAssetUrlFresh(logoUrl) : logoUrl);
            const safeUrl = freshenCareerImageUrl(baseUrl);
            const candidateUrls = Array.from(
              new Set([cachedResolvedSrc, safeUrl, ...fallbackCandidates].filter(Boolean))
            );
            const firstUrl = candidateUrls[0] || safeUrl;
            const fallbackList = candidateUrls.slice(1).join("|");
            innerContent = `
                <img class="career-club-logo-img" src="${firstUrl}" data-fallback-list="${fallbackList}" data-fallback-index="0" data-logo-cache-key="${escapeHtml(logoCacheKey)}" alt="" loading="eager" decoding="async" />
                <div class="career-club-fallback-text" hidden>${escapeHtml(displayClubName || clubName)}</div>
            `;
        } else {
            const candidateUrls = Array.from(
              new Set([cachedResolvedSrc, ...fallbackCandidates].filter(Boolean))
            );
            const firstFallbackUrl = candidateUrls[0] || "";
            const remainingFallbacks = candidateUrls.slice(1).join("|");
            innerContent = `
                <img class="career-club-logo-img" src="${firstFallbackUrl}" data-fallback-list="${remainingFallbacks}" data-fallback-index="0" data-logo-cache-key="${escapeHtml(logoCacheKey)}" alt="" loading="eager" decoding="async" />
                <div class="career-club-fallback-text career-club-fallback-text--solo" hidden>${escapeHtml(displayClubName || clubName)}</div>
            `;
        }
    }

    const editBtnHtml = shortsPreviewActive
      ? ""
      : `<button class="career-edit-btn" data-index="${index}" title="Edit Slot">✎</button>`;
    const imgOrText = `<div class="career-club-placeholder">
                          ${editBtnHtml}
                          ${innerContent}
                       </div>`;

    const slotInnerStyle = statsPanelCompact
      ? "animation: none"
      : `animation-delay: -${(index * 0.4).toFixed(1)}s`;
    const yearBlock = includeYear
      ? `<div class="career-club-year-stack">
                      <div class="career-club-year">${year}</div>
                    </div>`
      : "";
    return `
      <div class="career-club-slot-inner" style="${slotInnerStyle}">
          <div class="career-club-slot-visual">
              <div class="career-club-badge-scale" style="--career-badge-scale: ${slotScales[index]}; --career-year-inverse-scale: ${1 / slotScales[index]}; --career-year-nudge: ${slotYearNudges[index]}px">
                  <div class="career-club-emblem-scale">
                    <div class="career-club-emblem-slot">${imgOrText}</div>
                    ${yearBlock}
                  </div>
              </div>
          </div>
      </div>
    `;
  };

  const appendShortsCareerSlot = (rowEl, index, totalCount, isLastInRow) => {
    const slot = document.createElement("div");
    slot.className = "career-grid-item career-grid-item--split career-club-slot";
    slot.innerHTML = generateSlotContent(index);
    appendCareerSlotZoomControls(slot, index, totalCount, true);
    appendCareerSlotYearNudgeControls(slot, index, totalCount, true);
    rowEl.appendChild(slot);

    if (!isLastInRow) {
      const arrow = document.createElement("div");
      arrow.className = "career-grid-arrow";
      arrow.textContent = ">>";
      rowEl.appendChild(arrow);
    }
  };

  if (isShorts && !selectedAnyCardMode /* career-path grid + tall photo; team/player card modes use cluster below */) {
    if (showShortsCareerGrid) {
      const gridContainer = document.createElement("div");
      gridContainer.className = "career-grid career-grid--shorts-split";
      /* data-team-count drives css/modes/shorts-career-club-count-map.css */
      gridContainer.dataset.teamCount = String(Math.min(n, 12));

      const rowCounts = getShortsCareerRowCounts(n);
      let slotIndex = 0;
      rowCounts.forEach((rowCount, rowIndex) => {
        const row = document.createElement("div");
        row.className = "career-grid-row";
        row.dataset.rowSize = String(rowCount);
        row.dataset.rowIndex = String(rowIndex);

        for (let j = 0; j < rowCount && slotIndex < n; j += 1, slotIndex += 1) {
          appendShortsCareerSlot(row, slotIndex, n, j === rowCount - 1 || slotIndex === n - 1);
        }

        gridContainer.appendChild(row);
      });

      while (slotIndex < n) {
        const overflowRow = document.createElement("div");
        overflowRow.className = "career-grid-row";
        overflowRow.dataset.rowSize = "3";

        for (let j = 0; j < 3 && slotIndex < n; j += 1, slotIndex += 1) {
          appendShortsCareerSlot(overflowRow, slotIndex, n, j === 2 || slotIndex === n - 1);
        }

        gridContainer.appendChild(overflowRow);
      }

      wrap.appendChild(gridContainer);
    }

    if (!FOUR_PARAMS_HIDE_PLAYER_IMAGES) {
      const revealShell = document.createElement("div");
      revealShell.id = "career-reveal-photo";
      revealShell.className = "career-reveal-photo";
      const revealImg = document.createElement("img");
      revealImg.className = "career-reveal-photo-img";
      revealImg.alt = "";
      const revealFallback = document.createElement("div");
      revealFallback.className = "career-reveal-photo-fallback";
      revealFallback.textContent = hasRealPlayer
        ? CAREER_NO_PHOTO_LABEL
        : shortsPreviewActive
          ? "Size preview"
          : CAREER_NO_PLAYER_LABEL;

      const updateShortsTallRevealClass = () => {
        const w = Number(revealImg.naturalWidth || 0);
        const h = Number(revealImg.naturalHeight || 0);
        const ratio = w > 0 ? (h / w) : 0;
        /* Tall portraits need a lower anchor so the head doesn't overlap the top name in Shorts. */
        revealShell.classList.toggle("is-tall-player", ratio >= 1.52);
      };

      void readyPhotoPick.then((chosenUrl) => {
        if (!chosenUrl) {
          revealShell.classList.remove("is-tall-player");
          revealImg.hidden = true;
          revealFallback.hidden = false;
          return;
        }
        revealImg.hidden = true;
        revealFallback.hidden = true;
        revealImg.addEventListener("load", () => {
          updateShortsTallRevealClass();
          revealImg.hidden = false;
          revealFallback.hidden = true;
        });
        revealImg.addEventListener("error", () => {
          revealShell.classList.remove("is-tall-player");
          revealImg.hidden = true;
          revealFallback.hidden = false;
        });
        void resolveCareerPlayerPhotoUrl(chosenUrl).then((resolvedUrl) => {
          if (!revealImg.isConnected) return;
          revealImg.src = resolvedUrl || chosenUrl;
        });
      });

      revealShell.appendChild(revealImg);
      revealShell.appendChild(revealFallback);
      wrap.appendChild(revealShell);
    }

    const revealName = document.createElement("div");
    revealName.id = "career-reveal-name";
    revealName.className = "career-reveal-name";
    const playerNameUpper = playerName ? playerName.toUpperCase() : "";
    const parts = playerNameUpper.split(/\s+/).filter(Boolean);
    const topName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
    const bottomName = parts.length > 0 ? parts[parts.length - 1] : CAREER_NO_PLAYER_LABEL;
    revealName.innerHTML = `
      <div class="career-reveal-name-top">${topName}</div>
      <div class="career-reveal-name-bottom">${bottomName}</div>
    `;
    wrap.appendChild(revealName);

  } else {
    imageGroup.setAttribute("class", "career-image-group career-image-group--no-road");

    if (hasRealPlayer) {
      if (selectedTeamCardMode) {
        const teamName = String(state.careerPlayer?.club || state.careerPlayer?.name || "").trim();
        const searchName = resolveClubAlias(teamName);
        const foundTeam = searchName ? findBestCareerClubEntry(searchName) : null;
        const displayTeamName = String(foundTeam?.name || teamName || searchName || "").trim();
        const fileNameCandidates = [
          displayTeamName,
          teamName,
          searchName,
          foundTeam?.name,
          /\bfc\b/i.test(displayTeamName)
            ? displayTeamName.replace(/\s*\bfc\b\s*/i, "").trim()
            : `${displayTeamName} FC`.trim(),
        ];
        const fallbackCandidatesRel = buildClubLogoCandidatesRel(fileNameCandidates, foundTeam);
        const fallbackCandidates = Array.from(
          new Set(
            fallbackCandidatesRel
              .filter(Boolean)
              .map((rel) => freshenCareerImageUrl(projectAssetUrlFresh(rel))),
          ),
        );
        let teamLogoRel = "";
        if (foundTeam?.path) {
          teamLogoRel = foundTeam.path
            .replace(".Storage/Squad Formation/Teams/", "Images/Teams/")
            .replace(".json", ".png");
        }
        const baseUrl = teamLogoRel ? projectAssetUrlFresh(teamLogoRel) : "";
        const logoCacheKey = normalizeClubLookupKey(displayTeamName || teamName || searchName);
        const cachedResolvedSrc = logoCacheKey
          ? String(careerResolvedClubLogoSrcByKey.get(logoCacheKey) || "")
          : "";
        const candidateUrls = Array.from(
          new Set([cachedResolvedSrc, baseUrl, ...fallbackCandidates].filter(Boolean)),
        );

        const teamQuizCard = document.createElement("div");
        teamQuizCard.className = "career-team-quiz-card";

        const teamLogoWrap = document.createElement("div");
        teamLogoWrap.className = "career-team-quiz-card__logo-wrap";
        const teamLogo = document.createElement("img");
        teamLogo.className = "career-team-quiz-card__logo";
        teamLogo.alt = "";
        teamLogo.loading = "eager";
        teamLogo.decoding = "async";
        teamLogo.hidden = true;
        const teamFallback = document.createElement("div");
        teamFallback.className = "career-team-quiz-card__logo-fallback";
        teamFallback.textContent = displayTeamName || teamName || "TEAM";
        teamFallback.hidden = false;
        const showTeamFallback = () => {
          teamLogo.hidden = true;
          teamFallback.hidden = false;
        };
        if (candidateUrls.length > 0) {
          void applyCachedSrcChain(teamLogo, candidateUrls, {
            onLoad: (resolvedUrl) => {
              if (logoCacheKey) {
                careerResolvedClubLogoSrcByKey.set(logoCacheKey, String(resolvedUrl || ""));
              }
              teamLogo.hidden = false;
              teamFallback.hidden = true;
            },
            onFail: showTeamFallback,
          });
        } else {
          showTeamFallback();
        }
        teamLogoWrap.appendChild(teamLogo);
        teamLogoWrap.appendChild(teamFallback);
        teamQuizCard.appendChild(teamLogoWrap);

        const revealBar = document.createElement("div");
        revealBar.className = "career-team-quiz-card__reveal";
        const revealText = document.createElement("span");
        revealText.className = "career-team-quiz-card__reveal-text";
        const shouldRevealTeamName = !!previewState.previewPostTimer;
        revealText.textContent = shouldRevealTeamName ? (displayTeamName || teamName).toUpperCase() : "?";
        if (shouldRevealTeamName) revealText.classList.add("career-team-quiz-card__reveal-text--name");
        revealBar.appendChild(revealText);
        teamQuizCard.appendChild(revealBar);

        attachFakeInfoTeamLogoMaskEditor({
          state,
          teamQuizCard,
          logoWrap: teamLogoWrap,
          logoImg: teamLogo,
          teamFallbackEl: teamFallback,
          previewPostTimer: !!previewState.previewPostTimer,
        });

        wrap.appendChild(teamQuizCard);
        if (shouldRevealTeamName) {
          scheduleFitCareerTeamRevealNameText(revealText);
        }

        appState.els.playerVoiceControls = null;
        appState.els.playerVoicePlay = null;
        appState.els.playerVoiceDelete = null;
      } else if (selectedPlayerCardMode) {
        /* Player-name quiz: structurally identical to the team-name card. Same DOM, same
           classes, same CSS rules — so the box ends up the exact same size visually. The
           only difference is the image source (player photo) and the reveal label (player
           name), and we skip the mask/paint editor since this quiz has no logo to mask. */
        const playerQuizCard = document.createElement("div");
        playerQuizCard.className = "career-team-quiz-card";

        const photoWrap = document.createElement("div");
        photoWrap.className = "career-team-quiz-card__logo-wrap";
        const photoImg = document.createElement("img");
        photoImg.className = "career-team-quiz-card__logo";
        photoImg.alt = "";
        photoImg.loading = "eager";
        photoImg.decoding = "async";
        photoImg.hidden = true;
        applyPlayerCardPhotoAdjustments(photoImg, state);
        const photoFallback = document.createElement("div");
        photoFallback.className = "career-team-quiz-card__logo-fallback";
        photoFallback.textContent = playerName ? playerName.toUpperCase() : CAREER_NO_PHOTO_LABEL;
        photoFallback.hidden = false;
        const showPhotoFallback = () => {
          photoImg.hidden = true;
          photoFallback.hidden = false;
        };
        const hidePhotoFallback = () => {
          photoImg.hidden = false;
          photoFallback.hidden = true;
        };
        const setPhotoSrc = (u) => {
          if (!photoImg.isConnected) return;
          photoImg.addEventListener("load", hidePhotoFallback, { once: true });
          photoImg.addEventListener("error", showPhotoFallback, { once: true });
          photoImg.src = u;
        };
        void readyPhotoPick.then((chosenUrl) => {
          if (!chosenUrl || !photoImg.isConnected) {
            showPhotoFallback();
            return;
          }
          const syncUrl = careerPlayerResolvedUrlSync.get(chosenUrl);
          if (syncUrl) {
            setPhotoSrc(syncUrl);
          } else {
            void resolveCareerPlayerPhotoUrl(chosenUrl).then((resolvedUrl) => {
              setPhotoSrc(resolvedUrl || chosenUrl);
            });
          }
        });
        photoWrap.appendChild(photoImg);
        photoWrap.appendChild(photoFallback);
        playerQuizCard.appendChild(photoWrap);

        const playerRevealBar = document.createElement("div");
        playerRevealBar.className = "career-team-quiz-card__reveal";
        const playerRevealText = document.createElement("span");
        playerRevealText.className = "career-team-quiz-card__reveal-text";
        const shouldRevealPlayerName = !!previewState.previewPostTimer;
        playerRevealText.textContent = shouldRevealPlayerName ? playerName.toUpperCase() : "?";
        if (shouldRevealPlayerName) {
          playerRevealText.classList.add("career-team-quiz-card__reveal-text--name");
        }
        playerRevealBar.appendChild(playerRevealText);
        playerQuizCard.appendChild(playerRevealBar);

        wrap.appendChild(playerQuizCard);
        if (shouldRevealPlayerName) {
          scheduleFitCareerTeamRevealNameText(playerRevealText);
        }
        /* Bulletproof: nuke any legacy player-stats nodes that may have slipped in. */
        wrap.querySelectorAll(
          ".career-svg, .career-param-grid, .career-param-cluster, .career-portrait-card, .career-player-controls-row, #career-reveal-overlay, #career-reveal-name, #career-reveal-photo, .player-stats-national-flag",
        ).forEach((n) => n.remove());

        appState.els.playerVoiceControls = null;
        appState.els.playerVoicePlay = null;
        appState.els.playerVoiceDelete = null;
        syncPlayerVoiceControlsForActivePlayer(playerName);
      } else {
      const paramGrid = document.createElement("div");
      paramGrid.className = "career-param-grid";
      paramGrid.setAttribute("aria-hidden", "true");
      for (let pi = 0; pi < 4; pi += 1) {
        const cell = document.createElement("div");
        cell.className = "career-param-card";
        paramGrid.appendChild(cell);
      }
      mountFourParamCareerCards(paramGrid, state.careerPlayer);

      const portraitCard = document.createElement("div");
      portraitCard.className = "career-portrait-card";
      portraitCard.setAttribute("aria-hidden", "true");
      const portraitSil = document.createElement("div");
      portraitSil.className = "career-portrait-card__silhouette";

      const portraitImg = document.createElement("img");
      portraitImg.className = "career-portrait-card__photo";
      portraitImg.alt = "";
      portraitImg.decoding = "async";
      portraitImg.loading = "eager";
      portraitImg.setAttribute("aria-hidden", "true");
      applyCareerSilhouetteAdjustments(portraitImg, state, { noExtraDown: true });

      void readyPhotoPick.then((chosenUrl) => {
        const framePhotoUrl = typeof chosenUrl === "string" ? chosenUrl : "";
        if (!framePhotoUrl || !portraitImg.isConnected) {
          portraitImg.hidden = true;
          return;
        }
        const setPortraitSrc = (u) => {
          portraitImg.src = u;
        };
        portraitImg.addEventListener("error", () => {
          portraitImg.hidden = true;
        });
        const syncUrl = careerPlayerResolvedUrlSync.get(framePhotoUrl);
        if (syncUrl) {
          setPortraitSrc(syncUrl);
        } else {
          void resolveCareerPlayerPhotoUrl(framePhotoUrl).then((resolvedUrl) => {
            if (!portraitImg.isConnected) return;
            setPortraitSrc(resolvedUrl || framePhotoUrl);
          });
        }
      });

      portraitSil.appendChild(portraitImg);

      const portraitMystery = document.createElement("span");
      portraitMystery.className = "career-portrait-card__mystery-badge";
      portraitMystery.setAttribute("aria-hidden", "true");
      const portraitMysteryMark = document.createElement("span");
      portraitMysteryMark.className = "career-portrait-card__mystery-mark";
      const fourParamsVmOffReveal = shouldFourParamsVmOffPostReveal(state);
      portraitCard.classList.toggle("career-portrait-card--vm-off-revealed", fourParamsVmOffReveal);
      if (fourParamsVmOffReveal) {
        portraitMysteryMark.textContent = playerName.toUpperCase();
        portraitMysteryMark.classList.add("career-portrait-card__mystery-mark--name");
      } else {
        portraitMysteryMark.textContent = "?";
      }
      portraitMystery.appendChild(portraitMysteryMark);
      portraitCard.appendChild(portraitSil);
      portraitCard.appendChild(portraitMystery);

      /* Portrait “preset 10” = final look only; no picker / no CSS animations. */
      portraitCard.classList.add("career-portrait-reveal-preset-10");

      const paramCluster = document.createElement("div");
      paramCluster.className = "career-param-cluster";
      paramCluster.appendChild(paramGrid);

      paramCluster.appendChild(portraitCard);
      wrap.appendChild(paramCluster);

      appState.els.playerVoiceControls = null;
      appState.els.playerVoicePlay = null;
      appState.els.playerVoiceDelete = null;
      syncPlayerVoiceControlsForActivePlayer(playerName);
      }
    }

    if (!fakeInfoQuiz && !selectedPlayerCardMode && !FOUR_PARAMS_HIDE_PLAYER_IMAGES) {
      const revealOverlay = document.createElement("div");
      revealOverlay.id = "career-reveal-overlay";
      revealOverlay.className = "career-reveal-overlay";
      const revealOverlayImg = document.createElement("img");
      revealOverlayImg.className = "career-reveal-overlay-img";
      revealOverlayImg.alt = "";
      const revealOverlayFallback = document.createElement("div");
      revealOverlayFallback.className = "career-reveal-overlay-fallback";
      revealOverlayFallback.textContent = hasRealPlayer
        ? CAREER_NO_PHOTO_LABEL
        : shortsPreviewActive
          ? "Size preview"
          : CAREER_NO_PLAYER_LABEL;

      void readyPhotoPick.then((chosenUrl) => {
        if (!chosenUrl) {
          revealOverlayImg.hidden = true;
          revealOverlayFallback.hidden = false;
          return;
        }
        revealOverlayImg.hidden = true;
        revealOverlayFallback.hidden = true;
        revealOverlayImg.addEventListener("load", () => {
          revealOverlayImg.hidden = false;
          revealOverlayFallback.hidden = true;
        });
        revealOverlayImg.addEventListener("error", () => {
          revealOverlayImg.hidden = true;
          revealOverlayFallback.hidden = false;
        });
        void resolveCareerPlayerPhotoUrl(chosenUrl).then((resolvedUrl) => {
          if (!revealOverlayImg.isConnected) return;
          revealOverlayImg.src = resolvedUrl || chosenUrl;
        });
      });

      revealOverlay.appendChild(revealOverlayImg);
      revealOverlay.appendChild(revealOverlayFallback);
      appendPlayerStatsRegularRevealToApp(revealOverlay);
    }

    if (!fakeInfoQuiz) {
    const revealName = document.createElement("div");
    revealName.id = "career-reveal-name";
    revealName.className = "career-reveal-name";
    const playerNameUpper = playerName ? playerName.toUpperCase() : "";
    const parts = playerNameUpper.split(/\s+/).filter(Boolean);
    const topName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
    const bottomName = parts.length > 0 ? parts[parts.length - 1] : CAREER_NO_PLAYER_LABEL;
    revealName.innerHTML = `
      <div class="career-reveal-name-top">${topName}</div>
      <div class="career-reveal-name-bottom">${bottomName}</div>
    `;
    appendPlayerStatsRegularRevealToApp(revealName);

    applyCareerRevealAdjustments(wrap, state);

    let flagUrl = hasRealPlayer ? resolvePlayerStatsNationalityFlagUrl(gateStatPlayer?.nationality) : null;
    if (FOUR_PARAMS_HIDE_NATIONALITY_FLAG) flagUrl = null;
    if (flagUrl) {
      /* Reuse the preserved Three.js flag if the URL hasn't changed (same player/nationality).
         This avoids tearing down and rebuilding the entire Three.js scene on every level switch. */
      if (preservedFlag && preservedFlagUrl === flagUrl) {
        wrap.appendChild(preservedFlag);
        preservedFlag = null;
        markFlagGateReady();
      } else {
        /* Different flag needed — dispose old one and create fresh. */
        if (preservedFlag) {
          if (typeof preservedFlag._playerStatsThreeFlagCleanup === "function") {
            preservedFlag._playerStatsThreeFlagCleanup();
          }
          preservedFlag = null;
        }
        const natForAlt = playerStatsNationalityLabelForFlagcode(gateStatPlayer?.nationality);
        const flagWrap = document.createElement("div");
        flagWrap.id = "player-stats-national-flag";
        flagWrap.className = "player-stats-national-flag";
        flagWrap.dataset.flagSrc = flagUrl;
        wrap.appendChild(flagWrap);
        void import("./player-stats-flag-three.js")
          .then((m) => {
            if (!flagWrap.isConnected) return;
            m.mountPlayerStatsThreeFlag(
              flagWrap,
              flagUrl,
              natForAlt ? `${natForAlt} flag` : "National flag",
              markFlagGateReady,
            );
          })
          .catch(() => {
            markFlagGateReady();
            flagWrap.remove();
          });
      }
    } else if (preservedFlag) {
      /* No flag needed — clean up the preserved one. */
      if (typeof preservedFlag._playerStatsThreeFlagCleanup === "function") {
        preservedFlag._playerStatsThreeFlagCleanup();
      }
      preservedFlag = null;
    }
  }
  }

  bindCareerLogoYearAlignment(wrap);
  const statsPanelRoot = document.getElementById("player-stats-panel");
  if (statsPanelRoot) bindCareerLogoYearAlignment(statsPanelRoot);

  // Bind the edit buttons that were just created
  const editRoots = [wrap, statsPanelRoot].filter(Boolean);
  for (const root of editRoots) {
    root.querySelectorAll(".career-edit-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openCareerEditModal(parseInt(btn.dataset.index, 10));
      };
    });
  }

  // Keep direct renders (e.g. selecting a player) aligned with video preview states.
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);
  const silhouette = wrap.querySelector(".career-silhouette");
  if (silhouette) {
    silhouette.classList.toggle("revealed", previewPostTimer);
  }
  const portraitCardVm = wrap.querySelector(".career-portrait-card");
  if (portraitCardVm) {
    portraitCardVm.classList.add("career-portrait-reveal-preset-10");
    const vmOffReveal = shouldFourParamsVmOffPostReveal(state);
    portraitCardVm.classList.toggle("career-portrait-card--vm-off-revealed", vmOffReveal);
    const portraitPhotoEl = portraitCardVm.querySelector(".career-portrait-card__photo");
    if (portraitPhotoEl) {
      applyCareerSilhouetteAdjustments(portraitPhotoEl, state, { noExtraDown: true });
    }
    const markEl = portraitCardVm.querySelector(".career-portrait-card__mystery-mark");
    if (markEl) {
      const nameUpper = String(state.careerPlayer?.name || "").trim().toUpperCase();
      if (vmOffReveal && nameUpper) {
        markEl.textContent = nameUpper;
        markEl.classList.add("career-portrait-card__mystery-mark--name");
      } else {
        markEl.textContent = "?";
        markEl.classList.remove("career-portrait-card__mystery-mark--name");
      }
    }
  }
  const teamRevealTextEl = wrap.querySelector(".career-team-quiz-card__reveal-text");
  if (teamRevealTextEl) {
    const isPlayerCardMode = document.body.classList.contains("career-player-card-mode");
    const teamLabel = isPlayerCardMode
      ? String(state.careerPlayer?.name || "").trim().toUpperCase()
      : String(state.careerPlayer?.club || state.careerPlayer?.name || "").trim().toUpperCase();
    if (previewPostTimer && teamLabel) {
      teamRevealTextEl.textContent = teamLabel;
      teamRevealTextEl.classList.add("career-team-quiz-card__reveal-text--name");
      scheduleFitCareerTeamRevealNameText(teamRevealTextEl);
    } else {
      clearCareerTeamRevealNameFit(teamRevealTextEl);
      teamRevealTextEl.textContent = "?";
      teamRevealTextEl.classList.remove("career-team-quiz-card__reveal-text--name");
    }
  }
  const teamLogoMaskEl = wrap.querySelector(".career-team-quiz-card__logo-mask");
  if (teamLogoMaskEl) {
    teamLogoMaskEl.classList.toggle("is-revealed", !!previewPostTimer);
  }
  const teamLogoPunchEl = wrap.querySelector(".career-team-quiz-card__logo-punch");
  const teamLogoImgEl = wrap.querySelector(".career-team-quiz-card__logo");
  const restoredPunch = teamLogoPunchEl
    ? restoreTeamLogoPunchCanvasFromState(state, teamLogoPunchEl, teamLogoImgEl)
    : false;
  if (teamLogoPunchEl) {
    teamLogoPunchEl.classList.toggle("is-revealed", !!previewPostTimer);
  }
  if (previewPostTimer && teamLogoImgEl && restoredPunch) {
    teamLogoImgEl.style.opacity = "";
  } else if (!restoredPunch && teamLogoImgEl && (!teamLogoPunchEl || teamLogoPunchEl.hidden)) {
    teamLogoImgEl.style.opacity = "";
  }
  const revealPhoto = wrap.querySelector("#career-reveal-photo");
  const careerGrid = wrap.querySelector(".career-grid");
  const revealOverlay = document.getElementById("career-reveal-overlay");
  const revealName = document.getElementById("career-reveal-name");
  if (revealPhoto) {
    revealPhoto.classList.toggle("show", previewPostTimer || (isShorts && previewPreTimer));
  }
  if (careerGrid) {
    careerGrid.classList.toggle("reveal-active", previewPostTimer);
  }
  if (revealOverlay) {
    revealOverlay.classList.toggle("show", previewPostTimer);
  }
  if (revealName) {
    const hideBigScreenRevealName = shouldFourParamsVmOffPostReveal(state);
    revealName.classList.toggle("show", previewPostTimer && !hideBigScreenRevealName);
  }
  if (!document.body.classList.contains("shorts-mode")) {
    const skipCinematicDim = shouldFourParamsVmOffPostReveal(state);
    wrap.classList.toggle("cinematic-reveal-active", previewPostTimer && !skipCinematicDim);
    const cinematicBackdropOn =
      (previewPostTimer && !skipCinematicDim) || !!appState.holdCinematicBackdropForPlayVideoStage;
    document.body.classList.toggle("career-cinematic-reveal", cinematicBackdropOn);
    if (appState.els.teamHeader) {
      appState.els.teamHeader.classList.toggle("cinematic-reveal", previewPostTimer && !skipCinematicDim);
    }
  }

  document.body.classList.toggle("four-params-vm-off-reveal", shouldFourParamsVmOffPostReveal(state));

  syncCareerSlotControlsVisibility();
  renderCareerPictureControls(wrap, state);
}

/**
 * Timer-end reveal: update reveal-state classes/content on existing career DOM
 * without wiping and rebuilding it. Matches the tail of `renderCareer()` so
 * pre-timer → post-timer transition doesn't flash boxes by destroying them.
 */
export function refreshCareerRevealStateOnly() {
  const state = getState();
  const wrap = appState.els.careerWrap;
  if (!wrap) return;
  const isShorts = document.body.classList.contains("shorts-mode");
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);

  const silhouette = wrap.querySelector(".career-silhouette");
  if (silhouette) {
    silhouette.classList.toggle("revealed", previewPostTimer);
  }
  const portraitCardVm = wrap.querySelector(".career-portrait-card");
  if (portraitCardVm) {
    portraitCardVm.classList.add("career-portrait-reveal-preset-10");
    const vmOffReveal = shouldFourParamsVmOffPostReveal(state);
    portraitCardVm.classList.toggle("career-portrait-card--vm-off-revealed", vmOffReveal);
    const portraitPhotoEl = portraitCardVm.querySelector(".career-portrait-card__photo");
    if (portraitPhotoEl) {
      applyCareerSilhouetteAdjustments(portraitPhotoEl, state, { noExtraDown: true });
    }
    const markEl = portraitCardVm.querySelector(".career-portrait-card__mystery-mark");
    if (markEl) {
      const nameUpper = String(state.careerPlayer?.name || "").trim().toUpperCase();
      if (vmOffReveal && nameUpper) {
        markEl.textContent = nameUpper;
        markEl.classList.add("career-portrait-card__mystery-mark--name");
      } else {
        markEl.textContent = "?";
        markEl.classList.remove("career-portrait-card__mystery-mark--name");
      }
    }
  }
  const teamRevealTextEl = wrap.querySelector(".career-team-quiz-card__reveal-text");
  if (teamRevealTextEl) {
    const isPlayerCardMode = document.body.classList.contains("career-player-card-mode");
    const teamLabel = isPlayerCardMode
      ? String(state.careerPlayer?.name || "").trim().toUpperCase()
      : String(state.careerPlayer?.club || state.careerPlayer?.name || "").trim().toUpperCase();
    if (previewPostTimer && teamLabel) {
      teamRevealTextEl.textContent = teamLabel;
      teamRevealTextEl.classList.add("career-team-quiz-card__reveal-text--name");
      scheduleFitCareerTeamRevealNameText(teamRevealTextEl);
    } else {
      clearCareerTeamRevealNameFit(teamRevealTextEl);
      teamRevealTextEl.textContent = "?";
      teamRevealTextEl.classList.remove("career-team-quiz-card__reveal-text--name");
    }
  }
  const teamLogoMaskEl = wrap.querySelector(".career-team-quiz-card__logo-mask");
  if (teamLogoMaskEl) {
    teamLogoMaskEl.classList.toggle("is-revealed", !!previewPostTimer);
  }
  const teamLogoPunchEl = wrap.querySelector(".career-team-quiz-card__logo-punch");
  const teamLogoImgEl = wrap.querySelector(".career-team-quiz-card__logo");
  const restoredPunch = teamLogoPunchEl
    ? restoreTeamLogoPunchCanvasFromState(state, teamLogoPunchEl, teamLogoImgEl)
    : false;
  if (teamLogoPunchEl) {
    teamLogoPunchEl.classList.toggle("is-revealed", !!previewPostTimer);
  }
  if (previewPostTimer && teamLogoImgEl && restoredPunch) {
    teamLogoImgEl.style.opacity = "";
  } else if (!restoredPunch && teamLogoImgEl && (!teamLogoPunchEl || teamLogoPunchEl.hidden)) {
    teamLogoImgEl.style.opacity = "";
  }
  const revealPhoto = wrap.querySelector("#career-reveal-photo");
  const careerGrid = wrap.querySelector(".career-grid");
  const revealOverlay = document.getElementById("career-reveal-overlay");
  const revealName = document.getElementById("career-reveal-name");
  if (revealPhoto) {
    revealPhoto.classList.toggle("show", previewPostTimer || (isShorts && previewPreTimer));
  }
  if (careerGrid) {
    careerGrid.classList.toggle("reveal-active", previewPostTimer);
  }
  if (revealOverlay) {
    revealOverlay.classList.toggle("show", previewPostTimer);
  }
  if (revealName) {
    const hideBigScreenRevealName = shouldFourParamsVmOffPostReveal(state);
    revealName.classList.toggle("show", previewPostTimer && !hideBigScreenRevealName);
  }
  if (!isShorts) {
    const skipCinematicDim = shouldFourParamsVmOffPostReveal(state);
    wrap.classList.toggle("cinematic-reveal-active", previewPostTimer && !skipCinematicDim);
    const cinematicBackdropOn =
      (previewPostTimer && !skipCinematicDim) || !!appState.holdCinematicBackdropForPlayVideoStage;
    document.body.classList.toggle("career-cinematic-reveal", cinematicBackdropOn);
    if (appState.els.teamHeader) {
      appState.els.teamHeader.classList.toggle("cinematic-reveal", previewPostTimer && !skipCinematicDim);
    }
  }

  document.body.classList.toggle("four-params-vm-off-reveal", shouldFourParamsVmOffPostReveal(state));

  syncCareerSlotControlsVisibility();
  renderCareerPictureControls(wrap, state);
}

/** Inside `.app` so stacking respects Quiz Controls; body-level siblings beat the whole app when `.app` has z-index (sun-ray background effects). */
function mountCareerPictureControlsPanel(panel) {
  const app = document.querySelector(".app");
  if (!panel || !app) return;
  const rightPanel = document.getElementById("right-panel");
  const controlPanel = document.getElementById("control-panel");
  const anchor =
    rightPanel && rightPanel.parentElement === app
      ? rightPanel
      : controlPanel && controlPanel.parentElement === app
        ? controlPanel
        : null;
  if (!anchor) {
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    return;
  }
  if (panel.parentElement === app && panel.previousElementSibling === anchor) return;
  anchor.insertAdjacentElement("afterend", panel);
}

function renderCareerPictureControls(wrap, state) {
  if (!wrap) return;
  const isShorts = document.body.classList.contains("shorts-mode");
  const fakeInfoQuiz = isFakeInfoQuiz();
  const useShortsPanelLayout = false;
  /* Only hide while Play Video is actively running. The same box controls both the
     silhouette (pre-timer) and the revealed photo (post-timer) — see
     applyCareerSilhouetteAdjustments + applyCareerRevealAdjustments in the click handler. */
  const hide = appState.isVideoPlaying || fakeInfoQuiz;

  let panel = document.getElementById("career-picture-controls-floating");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "career-picture-controls-floating";
    panel.className = "career-picture-controls";
    panel.innerHTML = `
    <h3 class="career-picture-controls-title">Adjust Picture</h3>
    <label class="career-picture-controls-row">
      <span>Up / Down</span>
      <div class="career-picture-controls-actions career-picture-controls-actions--favorite">
        <button type="button" data-action="up">▲</button>
        <strong data-value="y">${state.silhouetteYOffset || 0}</strong>
        <button type="button" data-action="down">▼</button>
        <button
          type="button"
          class="career-picture-controls-favorite${hasCareerPictureFavorite(state) ? " is-active" : ""}"
          data-action="favorite"
          title="Save current picture size for this player"
          aria-label="Save current picture size for this player"
        >${hasCareerPictureFavorite(state) ? "&#9829;" : "&#9825;"}</button>
      </div>
    </label>
    <label class="career-picture-controls-row">
      <span>Width</span>
      <div class="career-picture-controls-actions">
        <button type="button" data-action="narrow">-</button>
        <strong data-value="x">${(state.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X).toFixed(2)}</strong>
        <button type="button" data-action="wide">+</button>
      </div>
    </label>
    <label class="career-picture-controls-row">
      <span>Height</span>
      <div class="career-picture-controls-actions">
        <button type="button" data-action="short">-</button>
        <strong data-value="ys">${(state.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y).toFixed(2)}</strong>
        <button type="button" data-action="tall">+</button>
      </div>
    </label>
    <button type="button" class="career-picture-controls-reset" data-action="reset">Reset</button>
  `;
    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const st = getState();
      if (!st) return;
      const layoutShorts = document.body.classList.contains("shorts-mode");

      if (action === "up") st.silhouetteYOffset = (st.silhouetteYOffset || 0) - 1;
      if (action === "down") st.silhouetteYOffset = (st.silhouetteYOffset || 0) + 1;
      if (action === "narrow") st.silhouetteScaleX = Math.max(0.1, (st.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X) - 0.05);
      if (action === "wide") st.silhouetteScaleX = (st.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X) + 0.05;
      if (action === "short") st.silhouetteScaleY = Math.max(0.1, (st.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y) - 0.05);
      if (action === "tall") st.silhouetteScaleY = (st.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y) + 0.05;
      if (action === "favorite") {
        if (hasCareerPictureFavorite(st)) clearCareerPictureFavorite(st);
        else saveCareerPictureFavorite(st);
      }
      if (action === "reset") {
        const pictureDefaults = getDefaultPlayerPictureValues(layoutShorts);
        st.silhouetteYOffset = pictureDefaults.silhouetteYOffset;
        st.silhouetteScaleX = pictureDefaults.silhouetteScaleX;
        st.silhouetteScaleY = pictureDefaults.silhouetteScaleY;
      }
      persistCareerPictureModeFromActiveState(st, layoutShorts);

      panel.querySelector('[data-value="y"]').textContent = st.silhouetteYOffset || 0;
      panel.querySelector('[data-value="x"]').textContent = (st.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X).toFixed(2);
      panel.querySelector('[data-value="ys"]').textContent = (st.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y).toFixed(2);
      const favoriteBtn = panel.querySelector('[data-action="favorite"]');
      if (favoriteBtn) {
        const isFavorite = hasCareerPictureFavorite(st);
        favoriteBtn.innerHTML = isFavorite ? "&#9829;" : "&#9825;";
        favoriteBtn.classList.toggle("is-active", isFavorite);
      }

      const activeWrap = document.getElementById("career-wrap");
      const silhouette = activeWrap?.querySelector(".career-silhouette");
      if (silhouette) {
        applyCareerSilhouetteAdjustments(silhouette, st);
      }
      /* Player-name boxed card: same Up/Down + Width + Height controls, applied as a simple
         translate + scale on the photo (no SVG transforms, since the card is plain HTML). */
      if (document.body.classList.contains("career-player-card-mode")) {
        const playerCardPhoto = activeWrap?.querySelector(".career-team-quiz-card__logo");
        if (playerCardPhoto) {
          applyPlayerCardPhotoAdjustments(playerCardPhoto, st);
        }
      }
      /* Four-params portrait card: the same `--sil-*` vars drive the inline portrait
         photo for both silhouette (pre-timer) AND revealed (post-timer) states, so one
         adjustment keeps the before/after at the identical position. */
      const portraitPhoto = activeWrap?.querySelector(".career-portrait-card__photo");
      if (portraitPhoto) {
        applyCareerSilhouetteAdjustments(portraitPhoto, st, { noExtraDown: true });
        /* VM off = revealed state with a `forwards` CSS animation (preset-10). Its filled
           computed transform locks the photo and doesn't re-flow var changes. Write the
           final transform inline with `!important` so it beats the animation cascade. */
        const portraitCardEl = portraitPhoto.closest(".career-portrait-card");
        if (portraitCardEl?.classList.contains("career-portrait-card--vm-off-revealed")) {
          const yOff = Number(st?.silhouetteYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET);
          const sx = Number(st?.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X);
          const sy = Number(st?.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);
          const safeY = Number.isFinite(yOff) ? yOff : DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
          const safeSx = Number.isFinite(sx) ? sx : DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
          const safeSy = Number.isFinite(sy) ? sy : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;
          const finalY = CAREER_SHADOW_UNIFORM_Y + safeY * 2;
          const finalSx = CAREER_SHADOW_UNIFORM_SCALE * safeSx * 2;
          const finalSy = CAREER_SHADOW_UNIFORM_SCALE * safeSy * 2;
          portraitPhoto.style.setProperty(
            "transform",
            `rotateX(-10deg) translateY(calc(${finalY}% + var(--career-portrait-photo-base-y, 12%))) scale(${finalSx}, ${finalSy})`,
            "important",
          );
        } else {
          portraitPhoto.style.removeProperty("transform");
        }
      }
      applyCareerRevealAdjustments(activeWrap, st);
    });
    mountCareerPictureControlsPanel(panel);
  }

  mountCareerPictureControlsPanel(panel);

  panel.classList.toggle("career-picture-controls--shorts-layout", useShortsPanelLayout);
  if (useShortsPanelLayout) {
    panel.style.left = "";
    panel.style.top = "";
  } else {
    panel.style.left = "15.2rem";
    panel.style.top = "0.15rem";
  }
  panel.hidden = hide;
  const title = panel.querySelector(".career-picture-controls-title");
  if (title) {
    /* Regular layout: one unified profile — no per-VM split, so the title doesn't need
       to call out the current mode. Shorts still has its own layout-scoped profile. */
    title.textContent = isShorts ? "Adjust Picture — Shorts" : "Adjust Picture";
  }

  panel.querySelector('[data-value="y"]').textContent = state.silhouetteYOffset || 0;
  panel.querySelector('[data-value="x"]').textContent = (state.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X).toFixed(2);
  panel.querySelector('[data-value="ys"]').textContent = (state.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y).toFixed(2);
  const favoriteBtn = panel.querySelector('[data-action="favorite"]');
  if (favoriteBtn) {
    const isFavorite = hasCareerPictureFavorite(state);
    favoriteBtn.innerHTML = isFavorite ? "&#9829;" : "&#9825;";
    favoriteBtn.classList.toggle("is-active", isFavorite);
  }
}
/* ── Shorts-only helpers ported from Career Path Shorts ────────── */

export function syncShortsCareerVideoPreviewLayers() {
  if (!document.body.classList.contains("shorts-mode")) return;
  const state = getState();
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);
  const silhouette = document.querySelector(".career-silhouette");
  if (silhouette) {
    silhouette.classList.toggle("revealed", previewPostTimer);
  }
  const revealPhoto = document.getElementById("career-reveal-photo");
  const careerGrid = document.querySelector(".career-grid");
  if (revealPhoto) {
    revealPhoto.classList.toggle("show", previewPostTimer || previewPreTimer);
    if (careerGrid) careerGrid.classList.toggle("reveal-active", previewPostTimer);
  }
}

export function refreshCareerPictureControlsDisplay(state) {
  const panel = document.getElementById("career-picture-controls-floating");
  if (!panel || !state) return;
  const isShorts = document.body.classList.contains("shorts-mode");
  const isShortsVideo = isShorts && state.videoMode;
  const yOff = isShorts
    ? (isShortsVideo ? DEFAULT_SHORTS_VIDEO_SILHOUETTE_Y_OFFSET : DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_Y_OFFSET)
    : 0;
  const scaleOff = isShorts
    ? (isShortsVideo ? (1.0 - DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X) : (1.0 - DEFAULT_SHORTS_VIDEO_OFF_SILHOUETTE_SCALE_X))
    : 0;
  const yEl = panel.querySelector('[data-value="y"]');
  const xEl = panel.querySelector('[data-value="x"]');
  const ysEl = panel.querySelector('[data-value="ys"]');
  if (yEl) yEl.textContent = (state.silhouetteYOffset || 0) - yOff;
  if (xEl) xEl.textContent = ((state.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X) + scaleOff).toFixed(2);
  if (ysEl) ysEl.textContent = ((state.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y) + scaleOff).toFixed(2);
  const favoriteBtn = panel.querySelector('[data-action="favorite"]');
  if (favoriteBtn) {
    const isFavorite = hasCareerPictureFavorite(state);
    favoriteBtn.innerHTML = isFavorite ? "&#9829;" : "&#9825;";
    favoriteBtn.classList.toggle("is-active", isFavorite);
  }
}
