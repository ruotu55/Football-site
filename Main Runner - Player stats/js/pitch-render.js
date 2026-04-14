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
  projectAssetUrl,
  projectAssetUrlFresh,
  careerReadyPhotoRelPath,
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
const CAREER_SHADOW_UNIFORM_Y = -2;
const CAREER_SHADOW_UNIFORM_SCALE = 0.82;
/* Video mode OFF: same caps as Main Runner - Career Path - Regular (viewBox 1000×400). */
const CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_OFF = 760;
const CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_OFF = 580;
const CAREER_SILHOUETTE_CENTER_X_REGULAR_VIDEO_OFF = 505; /* 125 + 760/2 */
/* Video mode ON: original Player stats framing (smaller regular, taller shorts). */
const CAREER_SILHOUETTE_MAX_REGULAR_VIDEO_ON = 456;
const CAREER_SILHOUETTE_MAX_SHORTS_VIDEO_ON = 696;
const CAREER_SILHOUETTE_CENTER_X_REGULAR_VIDEO_ON = 500;
const CAREER_SILHOUETTE_BOTTOM_REGULAR = 525;
const CAREER_SILHOUETTE_BOTTOM_SHORTS = 500;
/** Extra upward shift for video-on (Player stats) path; Career Path off uses bottomY − hUx only. */
const CAREER_SILHOUETTE_VERTICAL_UP_FRAC = 0.0;
/** Positive = move silhouette down in SVG user space (shorts + Video Mode). Layout uses SVG x/y, not CSS transform. */
const CAREER_SILHOUETTE_SHORTS_VIDEO_MODE_Y_NUDGE = 30;
const CAREER_SILHOUETTE_CENTER_X_SHORTS = 500;
const CAREER_REVEAL_BASE_Y = -10;
const CAREER_REVEAL_BASE_SCALE = 1.08;
/** Same units as Adjust Picture ▼/▲ (one tick = ±1 on `silhouetteYOffset`). */
const PLAYER_STATS_SILHOUETTE_EXTRA_DOWN_TICKS = 15;
const careerPlayerTrimmedPhotoUrlBySrc = new Map();
const CAREER_PLAYER_TRIM_MAX_EDGE = 1024;
const CAREER_PLAYER_TRIM_ALPHA_THRESHOLD = 12;
const CAREER_PLAYER_TRIM_MARGIN_PX = 8;

/** Regular: compact “video edit” caps only while Video Mode is on and not during Play Video. Shorts: follow Video Mode whenever it is on. */
function useCareerSilhouetteVideoOnCapsForRender(isShorts, state) {
  if (!state?.videoMode) return false;
  if (isShorts) return true;
  return !appState.isVideoPlaying;
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
 * Player stats: nudge the portrait down (Video Mode off on questions, and Play Video after the timer)
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

function applyCareerSilhouetteAdjustments(silhouetteEl, st) {
  if (!silhouetteEl) return;
  const yOffset = Number(st?.silhouetteYOffset ?? DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET);
  const scaleX = Number(st?.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X);
  const scaleY = Number(st?.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y);

  const safeYOffset = Number.isFinite(yOffset) ? yOffset : DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET;
  const safeScaleX = Number.isFinite(scaleX) ? scaleX : DEFAULT_PLAYER_SILHOUETTE_SCALE_X;
  const safeScaleY = Number.isFinite(scaleY) ? scaleY : DEFAULT_PLAYER_SILHOUETTE_SCALE_Y;

  const extraDownTicks = getPlayerStatsExtraSilhouetteDownTicks(st);
  /* Width/height are absolute multipliers (1 = 100%); do not divide by DEFAULT or 0.85 would look like 1. */
  const finalY = CAREER_SHADOW_UNIFORM_Y + (safeYOffset + extraDownTicks) * 2;
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
  if (st.videoMode && !appState.isVideoPlaying) {
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

  let h1 = history.filter(item => !isYouth(item.club));

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
  if (els.headerLogo) els.headerLogo.hidden = true;

  syncCareerSlotControlsVisibility();
}

/** Shared `teams.js` calls this after squad load; this runner has no pitch UI. */
export function renderPitch() {}

/** Small white icons in player stat card headers (regular layout). */
function createPlayerStatHeadIcon(kind) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "player-stat-card__icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "27");
  svg.setAttribute("height", "27");
  svg.setAttribute("aria-hidden", "true");

  const strokeEl = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "1.65");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  if (kind === "pitch") {
    svg.append(
      strokeEl("rect", { x: "3", y: "5", width: "18", height: "14", rx: "1.2" }),
      strokeEl("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    );
  } else if (kind === "ball") {
    svg.append(
      strokeEl("circle", { cx: "12", cy: "12", r: "7.5" }),
      strokeEl("path", {
        d: "M5.2 10c3.8 1.1 9.8 1.1 13.6 0M5.2 14c3.8-1.1 9.8-1.1 13.6 0M12 4.5v15",
      }),
    );
  } else if (kind === "goal") {
    svg.setAttribute("class", "player-stat-card__icon player-stat-card__icon--goal");
    /* Goal frame + ball in the net. */
    svg.append(
      strokeEl("path", { d: "M5.2 7.8h13.6M5.2 7.8v9.4M18.8 7.8v9.4" }),
      strokeEl("circle", { cx: "12", cy: "16.9", r: "2.7" }),
      strokeEl("path", {
        d: "M9.5 15.9c1.3.48 3.7.48 5 0M12 14.2v5.2",
      }),
    );
  } else if (kind === "trophy") {
    svg.append(
      strokeEl("path", {
        d: "M9 5h6M8 7h8v2a4 4 0 01-8 0V7zm1 9h6M10 18h4M9 21h6",
      }),
    );
  } else if (kind === "euro") {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", "12");
    t.setAttribute("y", "16.5");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("fill", "currentColor");
    t.setAttribute("font-size", "13");
    t.setAttribute("font-weight", "800");
    t.setAttribute("font-family", "system-ui,Segoe UI,sans-serif");
    t.textContent = "\u20ac";
    svg.appendChild(t);
  } else if (kind === "clubs") {
    svg.append(
      strokeEl("path", {
        d: "M12 3.2l7.2 3.6v5.2c0 4.1-3.1 7.9-7.2 9.8-4.1-1.9-7.2-5.7-7.2-9.8V6.8L12 3.2z",
      }),
    );
  } else if (kind === "position") {
    svg.append(
      strokeEl("circle", { cx: "12", cy: "8", r: "3.2" }),
      strokeEl("path", {
        d: "M5.5 20.5v-1.2a4.5 4.5 0 014.3-4.3h1.4a4.5 4.5 0 014.3 4.3v1.2",
      }),
    );
  } else {
    return null;
  }
  return svg;
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
  document.getElementById("career-reveal-overlay")?.remove();
  document.getElementById("career-reveal-name")?.remove();
  {
    const prevFlag = document.getElementById("player-stats-national-flag");
    if (typeof prevFlag?._playerStatsThreeFlagCleanup === "function") {
      prevFlag._playerStatsThreeFlagCleanup();
    }
    prevFlag?.remove();
  }
  if (!wrap) return;
  wrap.classList.toggle(
    "video-mode-enabled",
    !!state.videoMode && !appState.isVideoPlaying,
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

  const playerName = state.careerPlayer?.name?.trim() || "";
  const hasRealPlayer = !!playerName;
  const showShortsCareerGrid = hasRealPlayer || shortsPreviewActive;
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
    missingLabel.setAttribute("visibility", "visible");
  };

  const showImage = () => {
    image.setAttribute("visibility", "visible");
    missingLabel.setAttribute("visibility", "hidden");
  };

  const syncSilhouetteFromLoadedBitmap = () => {
    applyCareerSilhouetteSvgImageRect(
      image,
      isShorts,
      useCareerSilhouetteVideoOnCapsForRender(isShorts, state),
    );
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
      applyCareerSilhouetteSvgImageRect(
        image,
        isShorts,
        useCareerSilhouetteVideoOnCapsForRender(isShorts, getState()),
      );
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
    imageGroup.setAttribute("class", "career-image-group career-image-group--no-road");

    const statsPanel = document.createElement("div");
    statsPanel.id = "player-stats-panel";
    statsPanel.className = "player-stats-panel";

    const mkStatCard = (label, valueHtml, opts = {}) => {
      const card = document.createElement("div");
      card.className = "player-stat-card";
      const head = document.createElement("div");
      head.className = "player-stat-card__head";
      if (opts.icon) {
        const ic = createPlayerStatHeadIcon(opts.icon);
        if (ic) head.appendChild(ic);
      }
      const lab = document.createElement("span");
      lab.className = "player-stat-card__label";
      if (opts.nudgeLabelRight) lab.classList.add("player-stat-card__label--nudge-right");
      if (opts.nudgeLabelStrong) lab.classList.add("player-stat-card__label--nudge-strong");
      lab.textContent = label;
      head.appendChild(lab);
      const value = document.createElement("div");
      value.className = "player-stat-card__value";
      if (typeof valueHtml === "string") {
        value.textContent = valueHtml;
      } else {
        value.appendChild(valueHtml);
      }
      card.append(head, value);
      return card;
    };

    const statPlayer = hasRealPlayer ? state.careerPlayer : null;
    const careerGamesStr = formatPlayerCareerTotalStat(statPlayer, "appearances");
    const positionStr = formatPlayerPositionLabel(statPlayer);
    const careerGoalsStr = formatPlayerCareerTotalStat(statPlayer, "goals");
    const careerAssistsStr = formatPlayerCareerTotalStat(statPlayer, "assists");

    const clubsValueEl = document.createElement("div");
    clubsValueEl.className = "player-stat-card__value player-stat-card__value--clubs";
    const clubsTrack = document.createElement("div");
    clubsTrack.className = "player-stat-clubs-track";
    /** Rows of up to 4 slot indices: full rows of 4, last row 1–3 centered by CSS. */
    const clubSlotRows = [];
    for (let i = 0; i < n; ) {
      const remaining = n - i;
      const take = remaining >= 4 ? 4 : remaining;
      clubSlotRows.push(Array.from({ length: take }, (_, k) => i + k));
      i += take;
    }
    for (const rowIndices of clubSlotRows) {
      const rowEl = document.createElement("div");
      rowEl.className = "player-stat-clubs-row";
      if (rowIndices.length === 4) rowEl.classList.add("player-stat-clubs-row--four");
      for (const idx of rowIndices) {
        const slot = document.createElement("div");
        slot.className = "player-stat-club-item career-club-slot";
        slot.innerHTML = generateSlotContent(idx, {
          includeYear: false,
          statsPanelCompact: true,
        });
        appendCareerSlotZoomControls(slot, idx, n, false);
        rowEl.appendChild(slot);
      }
      clubsTrack.appendChild(rowEl);
    }
    clubsValueEl.appendChild(clubsTrack);
    const clubsCard = document.createElement("div");
    clubsCard.className = "player-stat-card player-stat-card--clubs";
    const clubLogoRows = Math.max(1, clubSlotRows.length);
    clubsCard.style.setProperty("--player-stat-club-rows", String(clubLogoRows));
    /* Always expanded: single row still needs header + beige min-content (logos + −/+) — non-expanded fixed 2×cell caused overflow + bogus scrollbar. */
    clubsCard.classList.add("player-stat-card--clubs-expanded");
    clubsTrack.classList.add("player-stat-clubs-track--expanded");
    const clubsHead = document.createElement("div");
    clubsHead.className = "player-stat-card__head";
    const clubsIcon = createPlayerStatHeadIcon("clubs");
    if (clubsIcon) clubsHead.appendChild(clubsIcon);
    const clubsLab = document.createElement("span");
    clubsLab.className = "player-stat-card__label";
    clubsLab.textContent = "Career Clubs";
    clubsHead.appendChild(clubsLab);
    clubsCard.append(clubsHead, clubsValueEl);

    /* One row: side columns stack two short cards each so Clubs height does not push Position/Assists down. */
    const rowMain = document.createElement("div");
    rowMain.className = "player-stats-panel__row player-stats-panel__row--main";
    const colLeft = document.createElement("div");
    colLeft.className = "player-stats-panel__column";
    colLeft.append(
      mkStatCard("Career games", careerGamesStr, { icon: "pitch", nudgeLabelStrong: true }),
      mkStatCard("Position", positionStr, { icon: "position" }),
    );
    const colRight = document.createElement("div");
    colRight.className = "player-stats-panel__column";
    colRight.append(
      mkStatCard("Career Goals", careerGoalsStr, { icon: "goal", nudgeLabelRight: true }),
      mkStatCard("Career assists", careerAssistsStr, { icon: "ball", nudgeLabelStrong: true }),
    );
    rowMain.append(colLeft, clubsCard, colRight);

    const statsMatrix = document.createElement("div");
    statsMatrix.className = "player-stats-panel__matrix";
    statsMatrix.appendChild(rowMain);
    statsPanel.appendChild(statsMatrix);
    (document.querySelector(".app") || document.body).appendChild(statsPanel);

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
    appendPlayerStatsRegularRevealToApp(revealOverlay);

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

    const flagUrl = hasRealPlayer ? resolvePlayerStatsNationalityFlagUrl(statPlayer?.nationality) : null;
    if (flagUrl) {
      const natForAlt = playerStatsNationalityLabelForFlagcode(statPlayer?.nationality);
      const flagWrap = document.createElement("div");
      flagWrap.id = "player-stats-national-flag";
      flagWrap.className = "player-stats-national-flag";
      wrap.appendChild(flagWrap);
      void import("./player-stats-flag-three.js")
        .then((m) => {
          if (!flagWrap.isConnected) return;
          m.mountPlayerStatsThreeFlag(
            flagWrap,
            flagUrl,
            natForAlt ? `${natForAlt} flag` : "National flag",
          );
        })
        .catch(() => {
          flagWrap.remove();
        });
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
    revealName.classList.toggle("show", previewPostTimer);
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