/* js/pitch-render.js — career path mode */

import {
  appState,
  DEFAULT_SHORTS_PLAYER_SILHOUETTE_SCALE_X,
  DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
  DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
  DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
  getDefaultPlayerPictureValues,
  getState,
} from "./state.js";
import {
  projectAssetUrlFresh,
  careerReadyPhotoRelPath,
  CAREER_NO_PHOTO_LABEL,
  CAREER_NO_PLAYER_LABEL,
} from "./paths.js";
import { syncPlayerVoiceControls } from "./player-voice-manager.js";
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

const AUTO_FETCH_TEAM_LOGO_ENDPOINT = "/__team-logo/fetch";

const CAREER_REVEAL_NAME_FIT_ABS_MIN_PX = 11;
let careerRevealNameFitResizeHooked = false;

function getShortsNineSixteenColumnWidthPx() {
  const stage = document.getElementById("stage-main") || document.querySelector(".stage-main");
  const sw = stage?.clientWidth || 0;
  if (sw > 8) return sw;
  return Math.min(window.innerWidth, (9 / 16) * window.innerHeight);
}

function getCareerRevealNameFitBudgetPx(revealNameEl) {
  const isShorts = document.body.classList.contains("shorts-mode");
  const cw = Math.max(0, revealNameEl.clientWidth);
  const rw = Math.max(0, revealNameEl.getBoundingClientRect().width);
  if (isShorts) {
    const columnPx = getShortsNineSixteenColumnWidthPx();
    const fromColumn = Math.max(0, columnPx - 14);
    const fromEl = Math.max(cw, rw) > 8 ? Math.min(Math.max(cw, rw) - 6, fromColumn) : fromColumn;
    return Math.max(24, Math.min(fromEl, fromColumn));
  }
  const fromCss = Math.min(window.innerWidth * 0.9, 1000);
  return Math.max(cw, rw, fromCss) - 8;
}

function hookCareerRevealNameFitOnResize() {
  if (careerRevealNameFitResizeHooked) return;
  careerRevealNameFitResizeHooked = true;
  let tid = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(tid);
    tid = window.setTimeout(() => {
      if (!document.body.classList.contains("shorts-mode")) return;
      const el = document.getElementById("career-reveal-name");
      if (el) fitCareerRevealNameLines(el);
    }, 120);
  });
}

/** Shrink only lines that overflow the reveal name box (white top / red bottom independent). */
function fitCareerRevealNameLines(revealNameEl) {
  if (!revealNameEl) return;
  const maxW = getCareerRevealNameFitBudgetPx(revealNameEl);
  if (maxW <= 8) return;
  const fitLine = (el) => {
    if (!el || !String(el.textContent || "").trim()) return;
    el.style.removeProperty("font-size");
    void el.offsetWidth;
    const computed = getComputedStyle(el);
    const maxPx = parseFloat(computed.fontSize);
    if (!Number.isFinite(maxPx) || maxPx <= CAREER_REVEAL_NAME_FIT_ABS_MIN_PX) return;
    if (el.scrollWidth <= maxW) return;
    let lo = CAREER_REVEAL_NAME_FIT_ABS_MIN_PX;
    let hi = maxPx;
    for (let i = 0; i < 52 && hi - lo > 0.35; i += 1) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (el.scrollWidth <= maxW) lo = mid;
      else hi = mid;
    }
    el.style.fontSize = `${lo}px`;
  };
  fitLine(revealNameEl.querySelector(".career-reveal-name-top"));
  fitLine(revealNameEl.querySelector(".career-reveal-name-bottom"));
}

export const CAREER_BADGE_SCALE_MIN = 0.5;
export const CAREER_BADGE_SCALE_MAX = 2.25;
export const CAREER_BADGE_SCALE_STEP = 0.08;
const CAREER_BADGE_DEFAULT_SCALE_REGULAR = 1 - CAREER_BADGE_SCALE_STEP;

export function clampCareerBadgeScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(CAREER_BADGE_SCALE_MAX, Math.max(CAREER_BADGE_SCALE_MIN, n));
}

export const CAREER_YEAR_NUDGE_STEP = 2;
const appliedFavoritePictureKeyByState = new WeakMap();
const CAREER_IMAGE_REFRESH_TOKEN = String(Date.now());
const careerResolvedClubLogoSrcByKey = new Map();
function freshenCareerImageUrl(url) {
  const src = String(url || "").trim();
  if (!src) return "";
  if (/^(blob:|data:)/i.test(src)) return src;
  const joiner = src.includes("?") ? "&" : "?";
  return `${src}${joiner}v=${encodeURIComponent(CAREER_IMAGE_REFRESH_TOKEN)}`;
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

function ensureCareerSlotBadgeScales(state, n, defaultScale = 1) {
  if (!Array.isArray(state.careerSlotBadgeScales)) {
    const legacy = state.careerBadgeScale;
    const seed =
      typeof legacy === "number" && Number.isFinite(legacy) ? legacy : defaultScale;
    state.careerSlotBadgeScales = Array.from({ length: n }, () => clampCareerBadgeScale(seed));
    delete state.careerBadgeScale;
  }
  while (state.careerSlotBadgeScales.length < n) {
    state.careerSlotBadgeScales.push(defaultScale);
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

function getCareerDefaultBadgeScale(isShortsMode) {
  return isShortsMode ? 1 : CAREER_BADGE_DEFAULT_SCALE_REGULAR;
}

function ensureCareerSlotBadgeScalesForMode(state, n, isShortsMode) {
  const modeKey = getCareerSlotBadgeScaleModeKey(isShortsMode);
  const defaultScale = getCareerDefaultBadgeScale(isShortsMode);
  if (!Array.isArray(state[modeKey])) {
    const legacy = Array.isArray(state.careerSlotBadgeScales)
      ? [...state.careerSlotBadgeScales]
      : [];
    state[modeKey] = legacy;
  }
  state.careerSlotBadgeScales = state[modeKey];
  ensureCareerSlotBadgeScales(state, n, defaultScale);
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
      const cur = clampCareerBadgeScale(
        slotScales[slotIndex] ?? getCareerDefaultBadgeScale(isShortsMode)
      );
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
const CAREER_SHADOW_UNIFORM_Y = -2;
const CAREER_SHADOW_UNIFORM_SCALE = 0.82;
/* Legacy square <image> side length in SVG user units (viewBox 1000×400). */
const CAREER_SILHOUETTE_MAX_REGULAR = 760;
const CAREER_SILHOUETTE_BOTTOM_REGULAR = 525; /* legacy square was y=-235, h=760 */
const CAREER_SILHOUETTE_MAX_SHORTS = 580;
const CAREER_SILHOUETTE_BOTTOM_SHORTS = 500; /* legacy square was y=-80, h=580 */
/** Positive = move silhouette down in SVG user space (shorts + Video Mode). Layout uses SVG x/y, not CSS transform. */
const CAREER_SILHOUETTE_SHORTS_VIDEO_MODE_Y_NUDGE = 30;
const CAREER_SILHOUETTE_CENTER_X_REGULAR = 505; /* 125 + 760/2 */
const CAREER_SILHOUETTE_CENTER_X_SHORTS = 500; /* 210 + 580/2 */
const CAREER_REVEAL_BASE_Y = -10;
const CAREER_REVEAL_BASE_SCALE = 1.08;
const careerPlayerTrimmedPhotoUrlBySrc = new Map();
const CAREER_PLAYER_TRIM_MAX_EDGE = 1024;
const CAREER_PLAYER_TRIM_ALPHA_THRESHOLD = 12;
const CAREER_PLAYER_TRIM_MARGIN_PX = 8;

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
      applyCareerSilhouetteSvgImageRect(imageEl, isShorts, !!getState()?.videoMode)
    );
    return;
  }

  const maxU = isShorts ? CAREER_SILHOUETTE_MAX_SHORTS : CAREER_SILHOUETTE_MAX_REGULAR;
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
  const centerX = isShorts ? CAREER_SILHOUETTE_CENTER_X_SHORTS : CAREER_SILHOUETTE_CENTER_X_REGULAR;
  const x = Math.round(centerX - wUx / 2);
  let y = Math.round(bottomY - hUx);
  if (isShorts && videoMode) {
    y += CAREER_SILHOUETTE_SHORTS_VIDEO_MODE_Y_NUDGE;
  }
  imageEl.setAttribute("x", String(x));
  imageEl.setAttribute("y", String(y));
  imageEl.setAttribute("width", String(Math.round(wUx)));
  imageEl.setAttribute("height", String(Math.round(hUx)));
}

function applyCareerSilhouetteAdjustments(silhouetteEl, st) {
  if (!silhouetteEl) return;
  const yOffset = Number(st?.silhouetteYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET);
  const scaleX = Number(st?.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X);
  const scaleY = Number(st?.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);

  const safeYOffset = Number.isFinite(yOffset) ? yOffset : DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
  const safeScaleX = Number.isFinite(scaleX) ? scaleX : DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
  const safeScaleY = Number.isFinite(scaleY) ? scaleY : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;

  /* Width/height are absolute multipliers (1 = 100%); do not divide by DEFAULT or 0.85 would look like 1. */
  const finalY = CAREER_SHADOW_UNIFORM_Y + safeYOffset * 2;
  const finalScaleX = CAREER_SHADOW_UNIFORM_SCALE * safeScaleX;
  const finalScaleY = CAREER_SHADOW_UNIFORM_SCALE * safeScaleY;

  silhouetteEl.style.setProperty("--sil-y", `${finalY}%`);
  silhouetteEl.style.setProperty("--sil-scale-x", String(finalScaleX));
  silhouetteEl.style.setProperty("--sil-scale-y", String(finalScaleY));
}

function applyCareerRevealAdjustments(wrapEl, st) {
  if (!wrapEl) return;
  const yOffset = Number(st?.silhouetteYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET);
  const scaleX = Number(st?.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X);
  const scaleY = Number(st?.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);
  const safeYOffset = Number.isFinite(yOffset) ? yOffset : DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
  const safeScaleX = Number.isFinite(scaleX) ? scaleX : DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
  const safeScaleY = Number.isFinite(scaleY) ? scaleY : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;
  const revealY = CAREER_REVEAL_BASE_Y + safeYOffset * 1.4;
  const revealScaleX = CAREER_REVEAL_BASE_SCALE * safeScaleX;
  const revealScaleY = CAREER_REVEAL_BASE_SCALE * safeScaleY;
  wrapEl.style.setProperty("--career-reveal-y", `${revealY}%`);
  wrapEl.style.setProperty("--career-reveal-scale-x", String(revealScaleX));
  wrapEl.style.setProperty("--career-reveal-scale-y", String(revealScaleY));
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
    if (st.videoMode) {
      st.silhouetteYOffset = Number(st.silhouetteShortsVideoYOffset);
      st.silhouetteScaleX = Number(st.silhouetteShortsVideoScaleX);
      st.silhouetteScaleY = Number(st.silhouetteShortsVideoScaleY);
    } else {
      st.silhouetteYOffset = Number(st.silhouetteShortsNormalYOffset);
      st.silhouetteScaleX = Number(st.silhouetteShortsNormalScaleX);
      st.silhouetteScaleY = Number(st.silhouetteShortsNormalScaleY);
    }
    return;
  }
  if (st.videoMode) {
    st.silhouetteYOffset = Number(st.silhouetteVideoYOffset);
    st.silhouetteScaleX = Number(st.silhouetteVideoScaleX);
    st.silhouetteScaleY = Number(st.silhouetteVideoScaleY);
    return;
  }
  st.silhouetteYOffset = Number(st.silhouetteNormalYOffset);
  st.silhouetteScaleX = Number(st.silhouetteNormalScaleX);
  st.silhouetteScaleY = Number(st.silhouetteNormalScaleY);
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
    if (st.videoMode) {
      st.silhouetteShortsVideoYOffset = safeY;
      st.silhouetteShortsVideoScaleX = safeX;
      st.silhouetteShortsVideoScaleY = safeYs;
    } else {
      st.silhouetteShortsNormalYOffset = safeY;
      st.silhouetteShortsNormalScaleX = safeX;
      st.silhouetteShortsNormalScaleY = safeYs;
    }
    return;
  }
  if (st.videoMode) {
    st.silhouetteVideoYOffset = safeY;
    st.silhouetteVideoScaleX = safeX;
    st.silhouetteVideoScaleY = safeYs;
    return;
  }
  st.silhouetteNormalYOffset = safeY;
  st.silhouetteNormalScaleX = safeX;
  st.silhouetteNormalScaleY = safeYs;
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
    const syncMissingUi = () => {
      const fallbackText = img.nextElementSibling;
      const fetchBtn = img.parentElement?.querySelector(".career-logo-fetch-btn");
      const hasSrc = String(img.getAttribute("src") || "").trim().length > 0;
      const hasPixels = !!(img.naturalWidth && img.naturalHeight);
      const missing = !hasSrc || img.hidden || !hasPixels;
      if (fallbackText) fallbackText.hidden = !missing;
      if (fetchBtn) fetchBtn.hidden = !missing;
    };
    const run = () => applyCareerLogoYearSlackFromImg(img);
    const runAfterLayout = () => {
      const fallbackText = img.nextElementSibling;
      if (fallbackText) fallbackText.hidden = true;
      const fetchBtn = img.parentElement?.querySelector(".career-logo-fetch-btn");
      if (fetchBtn) fetchBtn.hidden = true;
      run();
      requestAnimationFrame(run);
      const cacheKey = String(img.dataset.logoCacheKey || "").trim();
      const loadedSrc = String(img.currentSrc || img.src || "").trim();
      if (cacheKey && loadedSrc) {
        careerResolvedClubLogoSrcByKey.set(cacheKey, loadedSrc);
      }
    };
    if (img.complete && img.naturalWidth) runAfterLayout();
    else img.addEventListener("load", runAfterLayout, { once: true });
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
        img.src = fallbackList[fallbackIndex];
        return;
      }
      const b = img.closest(".career-club-badge-scale");
      if (b) b.style.removeProperty("--career-img-bottom-slack");
      img.hidden = true;
      const f = img.nextElementSibling;
      if (f) f.hidden = false;
      const fetchBtn = img.parentElement?.querySelector(".career-logo-fetch-btn");
      if (fetchBtn) fetchBtn.hidden = false;
    });
    syncMissingUi();
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
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.decoding = "async";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("player photo load failed"));
        el.src = src;
      });
      const bounds = measureCareerPlayerOpaqueBoundsNatural(img);
      if (!bounds) return src;

      const canvas = document.createElement("canvas");
      canvas.width = bounds.sw;
      canvas.height = bounds.sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return src;
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
      if (!blob) return src;
      return URL.createObjectURL(blob);
    } catch {
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
  const isWithoutClub = (name) => {
      const n = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
      return n.includes("without club");
  };

  let h1 = history.filter(item => !isYouth(item.club) && !isWithoutClub(item.club));

  let h2 = [];
  for (let i = 0; i < h1.length; i++) {
      if (h2.length > 0 && String(h2[h2.length - 1].year) === String(h1[i].year)) {
          h2[h2.length - 1] = h1[i];
      } else {
          h2.push(h1[i]);
      }
  }

  let h3 = [];
  for (let i = 0; i < h2.length; i++) {
      const currentName = resolveClubAlias(h2[i].club);
      if (h3.length > 0 && resolveClubAlias(h3[h3.length - 1].club) === currentName) {
          continue; 
      }
      h3.push(h2[i]);
  }
  return h3;
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

  const nm = state.careerPlayer?.name?.trim();
  if (els.headerName) {
    els.headerName.textContent = nm ? nm.toUpperCase() : CAREER_NO_PLAYER_LABEL;
  }
  syncPlayerVoiceControls(nm || "");
  if (els.headerLogo) els.headerLogo.hidden = true;

  syncCareerSlotControlsVisibility();
}

/** Shared `teams.js` calls this after squad load; this runner has no pitch UI. */
export function renderPitch() {}

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
  if (!wrap) return;
  wrap.classList.toggle(
    "video-mode-enabled",
    !!state.videoMode && !appState.isVideoPlaying && !previewState.previewPostTimer,
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

  const isWithoutClub = (name) => {
    const n = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
    return n.includes("without club");
  };
  const historySource = Array.isArray(state.careerHistory) ? state.careerHistory : [];
  const history = historySource.filter((item) => !isWithoutClub(item?.club));
  if (history.length !== historySource.length) {
    state.careerHistory = history;
  }
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

  const playerName = state.careerPlayer?.name?.trim() || "";
  const hasRealPlayer = !!playerName;
  const showShortsCareerGrid = hasRealPlayer || shortsPreviewActive;
  if (!hasRealPlayer && !shortsPreviewActive) {
    n = 0;
  }
  wrap.classList.toggle("career-no-player", !hasRealPlayer && !shortsPreviewActive);
  const readyRel = careerReadyPhotoRelPath(playerName);
  const readyUrl = readyRel ? projectAssetUrlFresh(readyRel) : "";
  const showClearPlayerButton = hasRealPlayer && !appState.isVideoPlaying;

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
  
  if (isShorts) {
    image.setAttribute("x", "210");
    image.setAttribute("y", "-80");
    image.setAttribute("width", String(CAREER_SILHOUETTE_MAX_SHORTS));
    image.setAttribute("height", String(CAREER_SILHOUETTE_MAX_SHORTS));
  } else {
    image.setAttribute("x", "125");
    image.setAttribute("y", "-235");
    image.setAttribute("width", String(CAREER_SILHOUETTE_MAX_REGULAR));
    image.setAttribute("height", String(CAREER_SILHOUETTE_MAX_REGULAR));
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
    missingLabel.setAttribute("visibility", "visible");
  };

  const showImage = () => {
    image.setAttribute("visibility", "visible");
    missingLabel.setAttribute("visibility", "hidden");
  };

  const syncSilhouetteFromLoadedBitmap = () => {
    applyCareerSilhouetteSvgImageRect(image, isShorts, !!state.videoMode);
    applyCareerSilhouetteAdjustments(image, state);
  };

  if (readyUrl) {
    image.setAttribute("visibility", "hidden");
    missingLabel.setAttribute("visibility", "hidden");
    image.addEventListener("load", () => {
      showImage();
      syncSilhouetteFromLoadedBitmap();
    });
    image.addEventListener("error", () => showMissing());
    void resolveCareerPlayerPhotoUrl(readyUrl).then((resolvedUrl) => {
      if (!image.isConnected) return;
      image.setAttribute("href", resolvedUrl || readyUrl);
      /* Cached bitmap: load may not fire. */
      requestAnimationFrame(() => {
        if (!image.isConnected) return;
        if (image.naturalWidth && image.naturalHeight) {
          showImage();
          syncSilhouetteFromLoadedBitmap();
        }
      });
    });
  } else {
    if (hasRealPlayer) {
      showMissing();
    } else {
      image.setAttribute("visibility", "hidden");
      missingLabel.setAttribute("visibility", "hidden");
    }
  }

  imageGroup.appendChild(image);
  imageGroup.appendChild(missingLabel);
  svg.appendChild(imageGroup);
  wrap.appendChild(svg);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      if (!image.isConnected || !image.naturalWidth) return;
      applyCareerSilhouetteSvgImageRect(image, isShorts, !!getState()?.videoMode);
      applyCareerSilhouetteAdjustments(image, getState());
    });
    ro.observe(svg);
  }
  if (!hasRealPlayer && !shortsPreviewActive) {
    const picker = document.createElement("div");
    picker.id = "career-inline-player-picker";
    picker.className = "career-inline-player-picker";
    picker.innerHTML = `
      <div class="career-inline-player-picker-title">No Player Selected</div>
      <input
        id="career-inline-player-search"
        class="career-inline-player-search"
        type="text"
        autocomplete="off"
        placeholder="Search player name..."
      />
      <div id="career-inline-player-results" class="career-inline-player-results">
        <div class="career-inline-player-hint">Type player name to search.</div>
      </div>
    `;
    wrap.appendChild(picker);
  }
  if (hasRealPlayer) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.id = "career-clear-player-btn";
    clearBtn.className = "career-clear-player-btn";
    clearBtn.textContent = "X";
    clearBtn.setAttribute("aria-label", "Remove selected player");
    clearBtn.hidden = !showClearPlayerButton;
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const st = getState();
      if (!st) return;
      st.careerPlayer = null;
      st.careerHistory = [];
      if (appState.els?.careerSelectedInfo) {
        appState.els.careerSelectedInfo.innerHTML = "";
      }
      renderCareer();
      renderHeader();
    });
    wrap.appendChild(clearBtn);
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

  const ensureEditableCareerHistory = () => {
    if (!Array.isArray(state.careerHistory)) {
      state.careerHistory = [];
    }
    return state.careerHistory;
  };

  const removeCareerSlotAt = (slotIndex) => {
    const safeIndex = Number(slotIndex);
    const list = ensureEditableCareerHistory();
    if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= list.length) return;
    list.splice(safeIndex, 1);
    state.careerClubsCount = list.length;
    renderCareer();
    renderHeader();
  };

  const insertCareerSlotAfter = (slotIndex) => {
    const safeIndex = Number(slotIndex);
    const list = ensureEditableCareerHistory();
    if (!Number.isInteger(safeIndex)) return;
    const clamped = Math.min(Math.max(-1, safeIndex), Math.max(-1, list.length - 1));
    openCareerInsertTeamPicker(clamped);
  };


  const getCareerInsertTeamList = () => {
    const clubs = Array.isArray(appState.teamsIndex?.clubs) ? appState.teamsIndex.clubs : [];
    const nationalities = Array.isArray(appState.teamsIndex?.nationalities)
      ? appState.teamsIndex.nationalities
      : [];
    const map = new Map();
    [...clubs, ...nationalities].forEach((team) => {
      const name = String(team?.name || "").trim();
      if (!name || isWithoutClub(name)) return;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, team);
    });
    return Array.from(map.values()).sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""))
    );
  };

  const resolveInsertTeamCustomImage = (team) => {
    if (!team) return "";
    if (team.country && team.league) {
      return projectAssetUrl(`Teams Images/${team.country}/${team.league}/${team.name}.png`);
    }
    if (team.region) {
      return projectAssetUrl(`Images/Nationality/${team.region}/${team.name}.png`);
    }
    const other = getClubLogoOtherTeamsUrl(team.name);
    return other || "";
  };

  const openCareerInsertTeamPicker = (insertAfterIndex) => {
    const existing = document.getElementById("career-insert-team-picker");
    if (existing) existing.remove();

    const picker = document.createElement("div");
    picker.id = "career-insert-team-picker";
    picker.style.position = "absolute";
    picker.style.left = "50%";
    picker.style.top = "52%";
    picker.style.transform = "translate(-50%, -50%)";
    picker.style.width = "min(26rem, 90%)";
    picker.style.maxHeight = "22rem";
    picker.style.display = "flex";
    picker.style.flexDirection = "column";
    picker.style.gap = "0.45rem";
    picker.style.padding = "0.7rem";
    picker.style.borderRadius = "10px";
    picker.style.border = "1px solid rgba(255,255,255,0.2)";
    picker.style.background = "rgba(0,0,0,0.9)";
    picker.style.backdropFilter = "blur(3px)";
    picker.style.zIndex = "1200";
    picker.style.pointerEvents = "auto";
    picker.addEventListener("click", (e) => e.stopPropagation());

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.gap = "0.5rem";

    const title = document.createElement("div");
    title.textContent = "Add Team";
    title.style.fontWeight = "800";
    title.style.color = "#fff";
    title.style.fontSize = "1rem";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    closeBtn.style.border = "1px solid rgba(255,255,255,0.35)";
    closeBtn.style.borderRadius = "6px";
    closeBtn.style.background = "rgba(255,255,255,0.08)";
    closeBtn.style.color = "#fff";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "0.22rem 0.48rem";
    closeBtn.onclick = () => picker.remove();

    head.appendChild(title);
    head.appendChild(closeBtn);

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search team name...";
    search.autocomplete = "off";
    search.style.width = "100%";
    search.style.padding = "0.55rem";
    search.style.borderRadius = "7px";
    search.style.border = "1px solid rgba(255,255,255,0.25)";
    search.style.background = "rgba(255,255,255,0.08)";
    search.style.color = "#fff";
    search.style.outline = "none";

    const listEl = document.createElement("div");
    listEl.style.display = "grid";
    listEl.style.gap = "0.32rem";
    listEl.style.maxHeight = "15rem";
    listEl.style.overflowY = "auto";
    listEl.style.paddingRight = "0.2rem";

    const allTeams = getCareerInsertTeamList();
    const drawList = (query) => {
      const q = String(query || "").toLowerCase().trim();
      listEl.innerHTML = "";
      const filtered = allTeams
        .filter((team) => String(team?.name || "").toLowerCase().includes(q))
        .slice(0, 80);
      if (filtered.length === 0) {
        const hint = document.createElement("div");
        hint.textContent = "No teams found.";
        hint.style.color = "#bbb";
        hint.style.fontSize = "0.9rem";
        listEl.appendChild(hint);
        return;
      }
      filtered.forEach((team) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = team.name;
        btn.style.padding = "0.55rem";
        btn.style.background = "rgba(255,255,255,0.06)";
        btn.style.border = "1px solid rgba(255,255,255,0.15)";
        btn.style.color = "#fff";
        btn.style.textAlign = "left";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "6px";
        btn.onmouseover = () => (btn.style.background = "rgba(255,202,40,0.2)");
        btn.onmouseout = () => (btn.style.background = "rgba(255,255,255,0.06)");
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const editable = ensureEditableCareerHistory();
          const item = { club: team.name, year: "YYYY" };
          try {
            const imageUrl = resolveInsertTeamCustomImage(team);
            if (imageUrl) item.customImage = imageUrl;
          } catch (_) {}
          editable.splice(insertAfterIndex + 1, 0, item);
          state.careerClubsCount = editable.length;
          picker.remove();
          renderCareer();
          renderHeader();
        });
        listEl.appendChild(btn);
      });
    };

    search.addEventListener("input", () => drawList(search.value));
    picker.appendChild(head);
    picker.appendChild(search);
    picker.appendChild(listEl);
    wrap.appendChild(picker);
    drawList("");
    search.focus();
  };

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

  // Helper function to build dynamic slot content with logo, fallback text, and year
  const generateSlotContent = (index) => {
    let clubName = "";
    let year = "YYYY";
    let logoUrl = "";
    let isCustomImage = false;
    let foundClub = null;
    let searchName = "";
    let targetRelativePath = "";
    let fetchCountryHint = "";
    let fetchLeagueHint = "";

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
        if (foundClub?.country && foundClub?.league) {
          fetchCountryHint = String(foundClub.country || "").trim();
          fetchLeagueHint = String(foundClub.league || "").trim();
        }
    }

    let innerContent = "";
    const displayClubName = String(foundClub?.name || clubName || searchName || "").trim();
    const safeFileName = String(displayClubName || clubName || "").replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "").trim();
    if (safeFileName) {
      if (fetchCountryHint && fetchLeagueHint) {
        targetRelativePath = `Teams Images/${fetchCountryHint}/${fetchLeagueHint}/${safeFileName}.png`;
      } else {
        targetRelativePath = `Teams Images/(1) Other Teams/${safeFileName}.png`;
      }
    }
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
                <button
                  type="button"
                  class="career-logo-fetch-btn"
                  data-index="${index}"
                  data-team-name="${escapeHtml(displayClubName || clubName)}"
                  data-country-hint="${escapeHtml(fetchCountryHint)}"
                  data-league-hint="${escapeHtml(fetchLeagueHint)}"
                  data-target-rel-path="${escapeHtml(targetRelativePath)}"
                  hidden
                >Logo</button>
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
                <button
                  type="button"
                  class="career-logo-fetch-btn"
                  data-index="${index}"
                  data-team-name="${escapeHtml(displayClubName || clubName)}"
                  data-country-hint="${escapeHtml(fetchCountryHint)}"
                  data-league-hint="${escapeHtml(fetchLeagueHint)}"
                  data-target-rel-path="${escapeHtml(targetRelativePath)}"
                  hidden
                >Logo</button>
            `;
        }
    }

    const hasHistorySlot = !!history[index];
    const removeBtnHtml = hasHistorySlot
      ? `<button class="career-remove-btn" data-index="${index}" title="Remove Team" aria-label="Remove team from path">X</button>`
      : "";
    const editBtnHtml = hasHistorySlot
      ? `<button class="career-edit-btn" data-index="${index}" title="Edit Slot">✎</button>`
      : "";
    const imgOrText = `<div class="career-club-placeholder">
                          ${removeBtnHtml}
                          ${editBtnHtml}
                          ${innerContent}
                       </div>`;

    return `
      <div class="career-club-slot-inner" style="animation-delay: -${(index * 0.4).toFixed(1)}s">
          <div class="career-club-slot-visual">
              <div class="career-club-badge-scale" style="--career-badge-scale: ${slotScales[index]}; --career-year-inverse-scale: ${1 / slotScales[index]}; --career-year-nudge: ${slotYearNudges[index]}px">
                  <div class="career-club-emblem-scale">
                    <div class="career-club-emblem-slot">${imgOrText}</div>
                    <div class="career-club-year-stack">
                      <div class="career-club-year"${hasHistorySlot ? ` data-career-slot-index="${index}" title="Double-click to edit year"` : ""}>${escapeHtml(year)}</div>
                    </div>
                  </div>
              </div>
          </div>
      </div>
    `;
  };

  const appendShortsCareerSlot = (rowEl, index, totalCount, showInsertAfter = true) => {
    const slot = document.createElement("div");
    slot.className = "career-grid-item career-grid-item--split career-club-slot";
    slot.innerHTML = generateSlotContent(index);
    const leftInsert = document.createElement("button");
    leftInsert.type = "button";
    leftInsert.className = "career-insert-btn career-insert-btn--side career-insert-btn--side-left";
    leftInsert.dataset.insertAfter = String(index - 1);
    leftInsert.title = "Add Team";
    leftInsert.setAttribute("aria-label", "Add team before this team");
    leftInsert.textContent = "+";
    slot.appendChild(leftInsert);
    const rightInsert = document.createElement("button");
    rightInsert.type = "button";
    rightInsert.className = "career-insert-btn career-insert-btn--side career-insert-btn--side-right";
    rightInsert.dataset.insertAfter = String(index);
    rightInsert.title = "Add Team";
    rightInsert.setAttribute("aria-label", "Add team after this team");
    rightInsert.textContent = "+";
    slot.appendChild(rightInsert);
    appendCareerSlotZoomControls(slot, index, totalCount, true);
    appendCareerSlotYearNudgeControls(slot, index, totalCount, true);
    rowEl.appendChild(slot);

    if (showInsertAfter && index < totalCount - 1) {
      const arrow = document.createElement("div");
      arrow.className = "career-grid-arrow";
      arrow.innerHTML = `<button type="button" class="career-insert-btn career-insert-btn--shorts" data-insert-after="${index}" title="Add Team" aria-label="Add team between teams">+</button>`;
      rowEl.appendChild(arrow);
    }
  };

  if (isShorts) {
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
          const showInsertAfter = j < rowCount - 1;
          appendShortsCareerSlot(row, slotIndex, n, showInsertAfter);
        }

        gridContainer.appendChild(row);
        if (slotIndex < n) {
          const breakInsert = document.createElement("div");
          breakInsert.className = "career-grid-break-insert";
          breakInsert.innerHTML = `<button type="button" class="career-insert-btn career-insert-btn--shorts" data-insert-after="${slotIndex - 1}" title="Add Team" aria-label="Add team between teams">+</button>`;
          gridContainer.appendChild(breakInsert);
        }
      });

      while (slotIndex < n) {
        const overflowRow = document.createElement("div");
        overflowRow.className = "career-grid-row";
        overflowRow.dataset.rowSize = "3";

        const overflowRowCount = Math.min(3, n - slotIndex);
        for (let j = 0; j < overflowRowCount && slotIndex < n; j += 1, slotIndex += 1) {
          const showInsertAfter = j < overflowRowCount - 1;
          appendShortsCareerSlot(overflowRow, slotIndex, n, showInsertAfter);
        }

        gridContainer.appendChild(overflowRow);
        if (slotIndex < n) {
          const breakInsert = document.createElement("div");
          breakInsert.className = "career-grid-break-insert";
          breakInsert.innerHTML = `<button type="button" class="career-insert-btn career-insert-btn--shorts" data-insert-after="${slotIndex - 1}" title="Add Team" aria-label="Add team between teams">+</button>`;
          gridContainer.appendChild(breakInsert);
        }
      }

      const firstRow = gridContainer.querySelector(".career-grid-row");
      if (firstRow) {
        const startArrow = document.createElement("div");
        startArrow.className = "career-grid-arrow career-grid-arrow--edge career-grid-arrow--edge-start";
        startArrow.innerHTML = `<button type="button" class="career-insert-btn career-insert-btn--shorts" data-insert-after="-1" title="Add Team" aria-label="Add team before first team">+</button>`;
        firstRow.insertBefore(startArrow, firstRow.firstChild);
      }
      const allRows = gridContainer.querySelectorAll(".career-grid-row");
      const lastRow = allRows.length ? allRows[allRows.length - 1] : null;
      if (lastRow) {
        const endArrow = document.createElement("div");
        endArrow.className = "career-grid-arrow career-grid-arrow--edge career-grid-arrow--edge-end";
        endArrow.innerHTML = `<button type="button" class="career-insert-btn career-insert-btn--shorts" data-insert-after="${Math.max(-1, n - 1)}" title="Add Team" aria-label="Add team after last team">+</button>`;
        lastRow.appendChild(endArrow);
      }

      wrap.appendChild(gridContainer);
    }

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

    if (readyUrl) {
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
      void resolveCareerPlayerPhotoUrl(readyUrl).then((resolvedUrl) => {
        if (!revealImg.isConnected) return;
        revealImg.src = resolvedUrl || readyUrl;
      });
    } else {
      revealShell.classList.remove("is-tall-player");
      revealImg.hidden = true;
      revealFallback.hidden = false;
    }

    revealShell.appendChild(revealImg);
    revealShell.appendChild(revealFallback);
    wrap.appendChild(revealShell);

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
    if (n > 0) {
    const defs = document.createElementNS(svgNamespace, "defs");
    const clipPath = document.createElementNS(svgNamespace, "clipPath");
    clipPath.setAttribute("id", "road-clip");
    const clipPathElement = document.createElementNS(svgNamespace, "path");
    clipPath.appendChild(clipPathElement);
    defs.appendChild(clipPath);
    svg.appendChild(defs);
    imageGroup.setAttribute("class", "career-image-group");
    imageGroup.setAttribute("clip-path", "url(#road-clip)");

    const pathOuter = document.createElementNS(svgNamespace, "path");
    pathOuter.setAttribute("class", "career-path-outer");
    const pathInner = document.createElementNS(svgNamespace, "path");
    pathInner.setAttribute("class", "career-path-inner");
    const pathDash = document.createElementNS(svgNamespace, "path");
    pathDash.setAttribute("class", "career-path-dash");

    const slotsContainer = document.createElement("div");
    slotsContainer.className = "career-slots";

    const startX = 130;
    const endX = 870;
    const dx = n > 1 ? (endX - startX) / (n - 1) : 0;
    const points = [];
    /* Keep all question levels (including level 20 + bonus) on the same vertical framing. */
    const roadYBias = 10;
    const stableRoadSeedBase = `${state.careerPlayer?.name || ""}|${history
      .map((item) => `${item?.club || ""}:${item?.year || ""}`)
      .join("|")}`;
    const stableUnit = (slotIndex) => {
      // Deterministic 0..1 value so re-renders do not reshuffle road geometry.
      const seed = `${stableRoadSeedBase}|${slotIndex}`;
      let hash = 2166136261;
      for (let j = 0; j < seed.length; j++) {
        hash ^= seed.charCodeAt(j);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0) / 4294967295;
    };

    for (let i = 0; i < n; i++) {
      const cx = startX + i * dx;
      const nx = (cx - 500) / 350;
      const baseY = 360 - nx * nx * 120;
      /* Anchor on the road centerline; small jitter only (~same spread as old random terms) */
      const jitter = (stableUnit(i) - 0.5) * 14;
      let cy = baseY + roadYBias + jitter;
      if (cy > 378) cy = 368 + stableUnit(i + 10000) * 8;
      points.push({ x: cx, y: cy });
    }

    let d = `M ${points[0].x},${points[0].y} `;
    for (let i = 1; i < n; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const cpX = (prev.x + p.x) / 2;
      d += `C ${cpX},${prev.y} ${cpX},${p.y} ${p.x},${p.y} `;
    }

    pathOuter.setAttribute("d", d);
    pathInner.setAttribute("d", d);
    pathDash.setAttribute("d", d);
    svg.append(pathOuter, pathInner, pathDash);

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const slot = document.createElement("div");
      slot.className = "career-club-slot";
      slot.style.left = `${(p.x / 1000) * 100}%`;
      slot.style.top = `${(p.y / 400) * 100}%`;
      
      slot.innerHTML = generateSlotContent(i);
      const leftInsert = document.createElement("button");
      leftInsert.type = "button";
      leftInsert.className = "career-insert-btn career-insert-btn--side career-insert-btn--side-left";
      leftInsert.dataset.insertAfter = String(i - 1);
      leftInsert.title = "Add Team";
      leftInsert.setAttribute("aria-label", "Add team before this team");
      leftInsert.textContent = "+";
      slot.appendChild(leftInsert);
      const rightInsert = document.createElement("button");
      rightInsert.type = "button";
      rightInsert.className = "career-insert-btn career-insert-btn--side career-insert-btn--side-right";
      rightInsert.dataset.insertAfter = String(i);
      rightInsert.title = "Add Team";
      rightInsert.setAttribute("aria-label", "Add team after this team");
      rightInsert.textContent = "+";
      slot.appendChild(rightInsert);
      appendCareerSlotZoomControls(slot, i, n, false);
      appendCareerSlotYearNudgeControls(slot, i, n, false);

      slotsContainer.appendChild(slot);
    }
    for (let i = 0; i < n - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const insertBtn = document.createElement("button");
      insertBtn.type = "button";
      insertBtn.className = "career-insert-btn career-insert-btn--road";
      insertBtn.dataset.insertAfter = String(i);
      insertBtn.title = "Add Team";
      insertBtn.setAttribute("aria-label", "Add team between teams");
      insertBtn.textContent = "+";
      const midX = ((current.x + next.x) / 2 / 1000) * 100;
      const midY = ((current.y + next.y) / 2 / 400) * 100;
      insertBtn.style.left = `${midX}%`;
      insertBtn.style.top = `${midY}%`;
      slotsContainer.appendChild(insertBtn);
    }
    if (n > 0) {
      const clampPct = (v, min, max) => Math.min(max, Math.max(min, v));
      const edgeOffsetX = 7.5;
      const first = points[0];
      const last = points[n - 1];

      const startInsertBtn = document.createElement("button");
      startInsertBtn.type = "button";
      startInsertBtn.className = "career-insert-btn career-insert-btn--road";
      startInsertBtn.dataset.insertAfter = "-1";
      startInsertBtn.title = "Add Team";
      startInsertBtn.setAttribute("aria-label", "Add team before first team");
      startInsertBtn.textContent = "+";
      startInsertBtn.style.left = `${clampPct((first.x / 1000) * 100 - edgeOffsetX, 2, 98)}%`;
      startInsertBtn.style.top = `${(first.y / 400) * 100}%`;
      slotsContainer.appendChild(startInsertBtn);

      const endInsertBtn = document.createElement("button");
      endInsertBtn.type = "button";
      endInsertBtn.className = "career-insert-btn career-insert-btn--road";
      endInsertBtn.dataset.insertAfter = String(n - 1);
      endInsertBtn.title = "Add Team";
      endInsertBtn.setAttribute("aria-label", "Add team after last team");
      endInsertBtn.textContent = "+";
      endInsertBtn.style.left = `${clampPct((last.x / 1000) * 100 + edgeOffsetX, 2, 98)}%`;
      endInsertBtn.style.top = `${(last.y / 400) * 100}%`;
      slotsContainer.appendChild(endInsertBtn);
    }
    const clipD = `M 0,${points[0].y} L ${points[0].x},${points[0].y} ` + d.replace(`M ${points[0].x},${points[0].y} `, "") + ` L 1000,${points[n-1].y} L 1000,-1000 L 0,-1000 Z`;
    clipPathElement.setAttribute("d", clipD);
    wrap.appendChild(slotsContainer);

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

    if (readyUrl) {
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
      void resolveCareerPlayerPhotoUrl(readyUrl).then((resolvedUrl) => {
        if (!revealOverlayImg.isConnected) return;
        revealOverlayImg.src = resolvedUrl || readyUrl;
      });
    } else {
      revealOverlayImg.hidden = true;
      revealOverlayFallback.hidden = false;
    }

    revealOverlay.appendChild(revealOverlayImg);
    revealOverlay.appendChild(revealOverlayFallback);
    wrap.appendChild(revealOverlay);

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
    }
  }

  bindCareerLogoYearAlignment(wrap);

  // Bind the edit buttons that were just created
  wrap.querySelectorAll('.career-edit-btn').forEach(btn => {
      btn.onclick = (e) => {
          e.stopPropagation();
          openCareerEditModal(parseInt(btn.dataset.index, 10));
      };
  });
  wrap.querySelectorAll(".career-remove-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeCareerSlotAt(parseInt(btn.dataset.index, 10));
    };
  });
  wrap.querySelectorAll(".career-insert-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertCareerSlotAfter(parseInt(btn.dataset.insertAfter, 10));
    };
  });
  wrap.querySelectorAll(".career-club-year[data-career-slot-index]").forEach((yearEl) => {
    yearEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (yearEl.tagName !== "DIV") return;
      const slotIndex = Number.parseInt(String(yearEl.getAttribute("data-career-slot-index") || ""), 10);
      if (!Number.isInteger(slotIndex) || slotIndex < 0) return;
      const st = getState();
      const row = Array.isArray(st.careerHistory) ? st.careerHistory[slotIndex] : null;
      if (!row || typeof row !== "object") return;

      const stack = yearEl.parentElement;
      if (!stack || !stack.classList.contains("career-club-year-stack")) return;

      const displayVal = String(row.year || "").trim();
      const input = document.createElement("input");
      input.type = "text";
      input.className = `${yearEl.className} career-club-year-input`.trim();
      input.value = displayVal === "YYYY" ? "" : displayVal;
      input.maxLength = 32;
      input.setAttribute("aria-label", "Team year");
      input.style.minWidth = `${Math.max(yearEl.offsetWidth || 0, 40)}px`;

      let done = false;
      const finishCommit = () => {
        if (done) return;
        done = true;
        const v = input.value.trim();
        row.year = v || "YYYY";
        renderCareer();
        renderHeader();
      };
      const finishCancel = () => {
        if (done) return;
        done = true;
        renderCareer();
      };

      stack.replaceChild(input, yearEl);
      input.focus();
      input.select();

      input.addEventListener("blur", () => {
        if (!done) finishCommit();
      });
      input.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          input.blur();
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          done = true;
          finishCancel();
        }
      });
    });
  });

  wrap.querySelectorAll(".career-logo-fetch-btn").forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      const teamName = String(btn.dataset.teamName || "").trim();
      const slotIndex = Number.parseInt(String(btn.dataset.index || "-1"), 10);
      if (!teamName || !Number.isInteger(slotIndex) || slotIndex < 0) {
        window.alert("Missing team name for this slot.");
        return;
      }
      const st = getState();
      const row = Array.isArray(st?.careerHistory) ? st.careerHistory[slotIndex] : null;
      if (!row || typeof row !== "object") {
        window.alert("Could not resolve this team slot.");
        return;
      }

      const prevText = btn.textContent || "Logo";
      btn.disabled = true;
      btn.textContent = "...";
      try {
        const res = await fetch(AUTO_FETCH_TEAM_LOGO_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamName,
            countryHint: String(btn.dataset.countryHint || "").trim(),
            leagueHint: String(btn.dataset.leagueHint || "").trim(),
            targetRelativePath: String(btn.dataset.targetRelPath || "").trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !data?.relativePath) {
          throw new Error(data?.error || "Could not fetch team logo.");
        }
        const relPath = String(data.relativePath);
        const baseFreshUrl = projectAssetUrlFresh(relPath);
        const freshJoiner = baseFreshUrl.includes("?") ? "&" : "?";
        const freshUrl = `${baseFreshUrl}${freshJoiner}logoDl=${Date.now()}`;
        row.customImage = freshUrl;
        const slotRoot = btn.closest(".career-club-emblem-slot");
        const slotImg = slotRoot?.querySelector(".career-club-logo-img");
        const slotFallback = slotRoot?.querySelector(".career-club-fallback-text");
        if (slotImg) {
          const logoCacheKey = String(slotImg.dataset.logoCacheKey || "").trim();
          if (logoCacheKey) {
            careerResolvedClubLogoSrcByKey.delete(logoCacheKey);
          }
          slotImg.hidden = false;
          slotImg.dataset.fallbackIndex = "0";
          slotImg.src = freshUrl;
        }
        if (slotFallback) slotFallback.hidden = true;
        btn.hidden = true;
        renderCareer();
        renderHeader();
        window.alert(`Logo downloaded: ${String(data.matchedName || teamName)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not fetch team logo.";
        window.alert(msg);
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    };
  });

  // Keep direct renders (e.g. selecting a player) aligned with video preview states.
  const { previewPreTimer, previewPostTimer } = getVideoQuestionPreviewState(state);
  const silhouette = wrap.querySelector(".career-silhouette");
  if (silhouette) {
    silhouette.classList.toggle("revealed", previewPostTimer);
  }
  const revealPhoto = wrap.querySelector("#career-reveal-photo");
  const careerGrid = wrap.querySelector(".career-grid");
  const revealOverlay = wrap.querySelector("#career-reveal-overlay");
  const revealName = wrap.querySelector("#career-reveal-name");
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
    revealName.classList.toggle("show", previewPostTimer);
    if (isShorts) {
      hookCareerRevealNameFitOnResize();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitCareerRevealNameLines(revealName));
      });
    } else {
      revealName.querySelectorAll(".career-reveal-name-top, .career-reveal-name-bottom").forEach((el) => {
        el.style.removeProperty("font-size");
      });
    }
  }
  if (!document.body.classList.contains("shorts-mode")) {
    wrap.classList.toggle("cinematic-reveal-active", previewPostTimer);
    document.body.classList.toggle("career-cinematic-reveal", previewPostTimer);
    if (appState.els.teamHeader) {
      appState.els.teamHeader.classList.toggle("cinematic-reveal", previewPostTimer);
    }
  }

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
  const useShortsPanelLayout = false;
  const inPlayVideoFlow = shouldUseVideoQuestionLayout(state);
  const hide = appState.isVideoPlaying || inPlayVideoFlow;

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
    if (isShorts) {
      title.textContent = state.videoMode
        ? "Adjust Picture — Shorts (Video On)"
        : "Adjust Picture — Shorts (Video Off)";
    } else {
      title.textContent = state.videoMode
        ? "Adjust Picture (Video On)"
        : "Adjust Picture (Video Off)";
    }
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