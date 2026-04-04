/* js/search-normalize.js — tolerant matching for swap search (accents, apostrophes). */

/** Apostrophe-like characters removed so e.g. "Cont'e" / "Conté" match "conte". */
const APOSTROPHE_LIKE = /[\u0027\u2018\u2019\u0060\u02BC\u02BB\u2032]/g;

/**
 * Lowercase, strip combining marks (diacritics), drop apostrophe-like chars, collapse spaces.
 */
export function normalizeForSearch(raw) {
  if (raw == null) return "";
  return String(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(APOSTROPHE_LIKE, "")
    .replace(/\s+/g, " ")
    .trim();
}
