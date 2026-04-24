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

let PAGE_LOAD_CACHE_BUST = String(Date.now());

/** After switching Ready photo variants or saving a new file, bump so `projectAssetUrlFresh` bypasses browser cache. */
export function bumpProjectAssetCacheBust() {
  PAGE_LOAD_CACHE_BUST = String(Date.now());
}

function withCacheBust(url, token = PAGE_LOAD_CACHE_BUST) {
  if (!url) return url;
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}v=${encodeURIComponent(normalizedToken)}`;
}

/**
 * Build an asset URL and append a per-page cache-bust token.
 * This forces fresh image fetches after reloads without local persistence.
 */
export function projectAssetUrlFresh(relativePath) {
  return withCacheBust(projectAssetUrl(relativePath));
}

/** Relative to project root (Football Channel). PNGs/WebP like "{Player Name}.png" or "{Player Name} 2.png". */
export const CAREER_READY_PHOTOS_DIR = "Images/Players No Background/Ready photos";

/** Variant 1 = base player name; 2+ = ``{name} {n}`` (matches extra Ready photo files on disk). */
export function careerReadyPhotoStemForVariant(playerName, variantIndex) {
  const t = String(playerName || "").trim();
  if (!t) return "";
  const n = Math.floor(Number(variantIndex));
  if (!Number.isFinite(n) || n < 2) return t;
  return `${t} ${n}`;
}

export function careerReadyPhotoRelCandidatesForStem(playerName, stem) {
  if (!playerName || typeof playerName !== "string") return [];
  const t = playerName.trim();
  const s = String(stem || "").trim();
  if (!t || !s) return [];
  return [`${CAREER_READY_PHOTOS_DIR}/${s}.png`, `${CAREER_READY_PHOTOS_DIR}/${s}.webp`];
}

export function careerReadyPhotoRelCandidates(playerName, variantIndex) {
  const stem = careerReadyPhotoStemForVariant(playerName, variantIndex ?? 1);
  return careerReadyPhotoRelCandidatesForStem(playerName, stem);
}

export function careerReadyPhotoRelPath(playerName, variantIndex) {
  if (!playerName || typeof playerName !== "string") return null;
  const t = playerName.trim();
  if (!t) return null;
  const cands = careerReadyPhotoRelCandidates(t, variantIndex ?? 1);
  return cands[0] || null;
}

export const CAREER_NO_PLAYER_LABEL = "No Player Selected";
export const CAREER_NO_PHOTO_LABEL = "- No image and No photo";
