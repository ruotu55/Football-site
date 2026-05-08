/**
 * `international-club-pool-by-nationality.json` keys sometimes differ from
 * nationality squad JSON `name` / teams-index display names.
 */
const DISPLAY_NAME_TO_POOL_KEY = {
  "Bosnia And Herzegovina": "Bosnia-Herzegovina",
};

/**
 * @param {Record<string, unknown[]> | null | undefined} pool
 * @param {string} nationDisplayName
 * @returns {unknown[]}
 */
export function getInternationalClubPlayersForNation(pool, nationDisplayName) {
  const n = String(nationDisplayName || "").trim();
  if (!pool || !n) return [];
  const keysToTry = [n];
  const alias = DISPLAY_NAME_TO_POOL_KEY[n];
  if (alias && alias !== n) keysToTry.push(alias);
  for (const k of keysToTry) {
    const arr = pool[k];
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }
  const last = pool[n];
  return Array.isArray(last) ? last : [];
}
