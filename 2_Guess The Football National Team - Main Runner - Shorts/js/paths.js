export function normalizePhotoPathsEntry(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.length);
  if (typeof v === "string") return v ? [v] : [];
  return [];
}

export function migratePlayerImages(raw) {
  const club = {};
  const nat = {};
  for (const [k, v] of Object.entries(raw.club || {})) {
    club[k] = normalizePhotoPathsEntry(v);
  }
  for (const [k, v] of Object.entries(raw.nationality || {})) {
    nat[k] = normalizePhotoPathsEntry(v);
  }
  return { club, nationality: nat };
}

/** Legacy broken index: duplicate "Squad Formation" segment */
export function normalizeTeamPath(path) {
  if (!path || typeof path !== "string") return path;
  return path
    .replace(/^\.\.\//,  "")
    .replace(/\.Storage\/Squad Formation\/\.Storage\/Squad Formation\//g, ".Storage/Squad Formation/")
    .replace(/^Squad Formation\//g, ".Storage/Squad Formation/");
}

/** Resolve a path relative to the Football Channel repo root (shared asset folders sit next to each runner). */
export function projectAssetUrl(relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  return new URL(`../${rel}`, window.location.href).href;
}

const PAGE_LOAD_CACHE_BUST = String(Date.now());

function withCacheBust(url, token = PAGE_LOAD_CACHE_BUST) {
  if (!url) return url;
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}v=${encodeURIComponent(normalizedToken)}`;
}

/** Per-path cache-bust overrides — set when a file is overwritten in-session
 *  (e.g. after cropping a photo) so its URL changes and the browser re-fetches. */
const PATH_CACHE_BUST = new Map();

/** Force the next `projectAssetUrlFresh(relativePath)` to return a new URL so an
 *  overwritten file is re-downloaded instead of served from the browser cache. */
export function bumpAssetCacheBust(relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  if (rel) PATH_CACHE_BUST.set(rel, String(Date.now()));
}

/**
 * Build an asset URL and append a per-page cache-bust token (or a per-path token
 * when the file was overwritten in this session — see bumpAssetCacheBust).
 * This forces fresh image fetches after reloads without local persistence.
 */
export function projectAssetUrlFresh(relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  const token = PATH_CACHE_BUST.get(rel) || PAGE_LOAD_CACHE_BUST;
  return withCacheBust(projectAssetUrl(relativePath), token);
}

/** Same cache-bust as `projectAssetUrlFresh`, for an already-resolved absolute asset URL. */
export function withProjectAssetCacheBust(absoluteHref) {
  return withCacheBust(absoluteHref);
}

/** Relative to project root (Football Channel). PNGs named like "{Player Name}.png" */
export const CAREER_READY_PHOTOS_DIR = "Images/Players No Background/Ready photos";

export function careerReadyPhotoRelPath(playerName) {
  if (!playerName || typeof playerName !== "string") return null;
  const t = playerName.trim();
  if (!t) return null;
  return `${CAREER_READY_PHOTOS_DIR}/${t}.png`;
}

export const CAREER_NO_PHOTO_LABEL = "";
