import { careerReadyPhotoClubName, careerReadyPhotoRelPath } from "./paths.js";
import {
  DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
  DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
} from "./state.js";

const KEY_CAREER_SIZE_FAVORITES = "footballQuizCareerSizeFavorites_four_parameters_regular_v2";
const FILE_API_PATH = "/api/career-size-favorites";
const PLAYER_PREFIX = "player::";
const CLUB_PREFIX = "club::";
const PLAYER_STRETCH_RATIO_MAX = 1.3;

let cache = null;
let hasLoadedFromFile = false;

function normalizePlayerScales(scaleX, scaleY) {
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    return {
      silhouetteScaleX: DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
      silhouetteScaleY: DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
    };
  }
  if (scaleX <= 0 || scaleY <= 0) {
    return {
      silhouetteScaleX: DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
      silhouetteScaleY: DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
    };
  }
  const ratio = Math.max(scaleX / scaleY, scaleY / scaleX);
  if (ratio <= PLAYER_STRETCH_RATIO_MAX) {
    return { silhouetteScaleX: scaleX, silhouetteScaleY: scaleY };
  }
  const unified = (scaleX + scaleY) / 2;
  return { silhouetteScaleX: unified, silhouetteScaleY: unified };
}

function coercePlayerFavorite(raw) {
  if (!raw || typeof raw !== "object") return null;
  const silhouetteYOffset = Number(
    raw.silhouetteYOffset ?? raw.player?.silhouetteYOffset
  );
  const silhouetteScaleX = Number(
    raw.silhouetteScaleX ?? raw.player?.silhouetteScaleX
  );
  const silhouetteScaleY = Number(
    raw.silhouetteScaleY ?? raw.player?.silhouetteScaleY
  );
  if (
    !Number.isFinite(silhouetteYOffset) ||
    !Number.isFinite(silhouetteScaleX) ||
    !Number.isFinite(silhouetteScaleY)
  ) {
    return null;
  }
  /* Older saves used 1/1; map to current app defaults (0.85 × 1). */
  const isLegacyOneByOne =
    Math.abs(silhouetteScaleX - 1) < 0.001 &&
    Math.abs(silhouetteScaleY - 1) < 0.001;
  if (isLegacyOneByOne) {
    return {
      silhouetteYOffset,
      silhouetteScaleX: DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
      silhouetteScaleY: DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
    };
  }
  const normalized = normalizePlayerScales(silhouetteScaleX, silhouetteScaleY);
  return {
    silhouetteYOffset,
    silhouetteScaleX: normalized.silhouetteScaleX,
    silhouetteScaleY: normalized.silhouetteScaleY,
  };
}

function coerceClubFavorite(raw) {
  if (!raw || typeof raw !== "object") return null;
  const badgeScale = Number(raw.badgeScale ?? raw.club?.badgeScale);
  const yearNudge = Number(raw.yearNudge ?? raw.club?.yearNudge);
  if (!Number.isFinite(badgeScale) || !Number.isFinite(yearNudge)) return null;
  return { badgeScale, yearNudge };
}

function resolveClubModeSuffix(mode) {
  if (mode === "shorts") return "|shorts";
  if (mode === "regular") return "|regular";
  const isShorts =
    typeof document !== "undefined" &&
    document.body &&
    document.body.classList.contains("shorts-mode");
  return isShorts ? "|shorts" : "|regular";
}

function readStore() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY_CAREER_SIZE_FAVORITES) || "{}");
    cache = sanitizeStore(parsed);
  } catch (_) {
    cache = {};
  }
  return cache;
}

function writeStore(next) {
  cache = next && typeof next === "object" ? next : {};
  try {
    localStorage.setItem(KEY_CAREER_SIZE_FAVORITES, JSON.stringify(cache));
  } catch (_) {
    /* Ignore quota/privacy mode failures so UI still works for current session. */
  }
  persistStoreToFile(cache);
}

function sanitizeStore(raw) {
  if (!raw || typeof raw !== "object") return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key).toLowerCase();
    if (normalizedKey.startsWith(CLUB_PREFIX)) {
      const safeClub = coerceClubFavorite(value);
      if (safeClub) {
        cleaned[normalizedKey] = { type: "club", ...safeClub };
      }
      continue;
    }
    if (normalizedKey.startsWith(PLAYER_PREFIX)) {
      const safePlayer = coercePlayerFavorite(value);
      if (safePlayer) {
        cleaned[normalizedKey] = { type: "player", ...safePlayer };
      }
      continue;
    }

    /* Backward compatibility with previous player-only key format. */
    const legacyPlayer = coercePlayerFavorite(value);
    if (legacyPlayer) {
      cleaned[`${PLAYER_PREFIX}${normalizedKey}`] = { type: "player", ...legacyPlayer };
    }
  }
  return cleaned;
}

async function persistStoreToFile(store) {
  try {
    await fetch(FILE_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizeStore(store)),
    });
  } catch (_) {
    /* Keep localStorage copy if file write fails. */
  }
}

export async function loadCareerPictureFavoritesFromFile() {
  if (hasLoadedFromFile) return;
  hasLoadedFromFile = true;
  try {
    const res = await fetch(FILE_API_PATH, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const fromFile = sanitizeStore(data);
    const merged = { ...readStore(), ...fromFile };
    cache = merged;
    try {
      localStorage.setItem(KEY_CAREER_SIZE_FAVORITES, JSON.stringify(cache));
    } catch (_) {
      /* Ignore localStorage write failures. */
    }
  } catch (_) {
    /* Endpoint not available; continue with local storage only. */
  }
}

export function getCareerPictureFavoriteKey(state, options = {}) {
  const playerName = state?.careerPlayer?.name?.trim();
  const readyRelPath = careerReadyPhotoRelPath(
    playerName,
    careerReadyPhotoClubName(state),
    state?.careerReadyPhotoVariantIndex ?? 1,
  );
  if (!readyRelPath) return "";
  const isShorts =
    typeof document !== "undefined" &&
    document.body &&
    document.body.classList.contains("shorts-mode");
  const layoutSuffix = isShorts ? "|shorts" : "";
  const useVideoMode = options.forceNormalMode ? false : !!state?.videoMode;
  const modeSuffix = useVideoMode ? "|video" : "|normal";
  return `${PLAYER_PREFIX}${readyRelPath.toLowerCase()}${layoutSuffix}${modeSuffix}`;
}

export function getCareerPictureFavoriteSize(state, options = {}) {
  const key = getCareerPictureFavoriteKey(state, options);
  if (!key) return null;
  const store = readStore();
  const scoped = coercePlayerFavorite(store[key]);
  if (scoped) return scoped;
  const isShorts =
    typeof document !== "undefined" &&
    document.body &&
    document.body.classList.contains("shorts-mode");
  /* Shorts favorites are isolated: do not fall back to regular-layout keys. */
  if (isShorts) return null;
  /* Backward compatibility with pre-mode favorites (regular layout only). */
  const playerName = state?.careerPlayer?.name?.trim();
  const readyRelPath = careerReadyPhotoRelPath(
    playerName,
    careerReadyPhotoClubName(state),
    state?.careerReadyPhotoVariantIndex ?? 1,
  );
  if (!readyRelPath) return null;
  const useVideoMode = options.forceNormalMode ? false : !!state?.videoMode;
  const modeSuffix = useVideoMode ? "|video" : "|normal";
  const legacyModeKey = `${PLAYER_PREFIX}${readyRelPath.toLowerCase()}${modeSuffix}`;
  const fromMode = coercePlayerFavorite(store[legacyModeKey]);
  if (fromMode) return fromMode;
  const legacyKey = `${PLAYER_PREFIX}${readyRelPath.toLowerCase()}`;
  return coercePlayerFavorite(store[legacyKey]);
}

export function hasCareerPictureFavorite(state) {
  return !!getCareerPictureFavoriteSize(state);
}

export function saveCareerPictureFavorite(state) {
  const key = getCareerPictureFavoriteKey(state);
  if (!key) return false;
  const store = readStore();
  const normalized = normalizePlayerScales(
    Number(state.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X),
    Number(state.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y)
  );
  store[key] = {
    type: "player",
    silhouetteYOffset: Number(state.silhouetteYOffset || 0),
    silhouetteScaleX: normalized.silhouetteScaleX,
    silhouetteScaleY: normalized.silhouetteScaleY,
  };
  writeStore(store);
  return true;
}

export function clearCareerPictureFavorite(state) {
  const key = getCareerPictureFavoriteKey(state);
  if (!key) return false;
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store, key)) return true;
  delete store[key];
  writeStore(store);
  return true;
}

export function getCareerClubFavoriteKey(state, slotIndex, mode) {
  const slot = state?.careerHistory?.[slotIndex];
  if (!slot || typeof slot !== "object") return "";
  const customImage = String(slot.customImage || "").trim();
  const modeSuffix = resolveClubModeSuffix(mode);
  if (customImage) return `${CLUB_PREFIX}custom:${customImage.toLowerCase()}${modeSuffix}`;
  const clubName = String(slot.club || "").trim();
  if (clubName) return `${CLUB_PREFIX}name:${clubName.toLowerCase()}${modeSuffix}`;
  return "";
}

export function getCareerClubFavoriteSize(state, slotIndex, mode) {
  const key = getCareerClubFavoriteKey(state, slotIndex, mode);
  if (!key) return null;
  const store = readStore();
  const scoped = coerceClubFavorite(store[key]);
  if (scoped) return scoped;

  /* Backward compatibility with pre-mode club favorites. */
  const slot = state?.careerHistory?.[slotIndex];
  if (!slot || typeof slot !== "object") return null;
  const customImage = String(slot.customImage || "").trim();
  if (customImage) {
    return coerceClubFavorite(store[`${CLUB_PREFIX}custom:${customImage.toLowerCase()}`]);
  }
  const clubName = String(slot.club || "").trim();
  if (clubName) {
    return coerceClubFavorite(store[`${CLUB_PREFIX}name:${clubName.toLowerCase()}`]);
  }
  return null;
}

export function hasCareerClubFavorite(state, slotIndex, mode) {
  return !!getCareerClubFavoriteSize(state, slotIndex, mode);
}

export function saveCareerClubFavorite(state, slotIndex, mode) {
  const key = getCareerClubFavoriteKey(state, slotIndex, mode);
  if (!key) return false;
  const modeKey = resolveClubModeSuffix(mode) === "|shorts"
    ? "careerSlotBadgeScalesShorts"
    : "careerSlotBadgeScalesRegular";
  const scales = Array.isArray(state?.[modeKey])
    ? state[modeKey]
    : state?.careerSlotBadgeScales;
  const scale = Number(scales?.[slotIndex] ?? 1);
  const nudge = Number(state?.careerSlotYearNudges?.[slotIndex] ?? 0);
  if (!Number.isFinite(scale) || !Number.isFinite(nudge)) return false;
  const store = readStore();
  store[key] = {
    type: "club",
    badgeScale: scale,
    yearNudge: nudge,
  };
  writeStore(store);
  return true;
}

export function clearCareerClubFavorite(state, slotIndex, mode) {
  const key = getCareerClubFavoriteKey(state, slotIndex, mode);
  if (!key) return false;
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store, key)) return true;
  delete store[key];
  writeStore(store);
  return true;
}
