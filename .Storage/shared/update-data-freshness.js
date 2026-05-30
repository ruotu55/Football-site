/**
 * update-data-freshness.js  (shared by all runners)
 *
 * Single source of truth for "is a team's squad data fresh enough?". Used by BOTH
 * the PROD freshness validator (prod-validation.js) and the Update Data button
 * (update-data.js) so they can never disagree about what counts as up to date.
 *
 * Policy: a team is fresh if it was refreshed within the last UPDATE_DATA_FRESH_DAYS
 * (rolling window from its last-refresh timestamp). Anything older — or never
 * refreshed — is stale and should be re-fetched. Changed from "must be updated
 * today" to a 7-day window on 2026-05-31.
 */

export const UPDATE_DATA_FRESH_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string} iso  An ISO-8601 timestamp (the form stored in update-data-history.json).
 * @param {number} [nowMs]  Current time in ms (defaults to Date.now()); injectable for tests.
 * @returns {boolean} true if the timestamp is within the last UPDATE_DATA_FRESH_DAYS.
 */
export function isUpdateDataFresh(iso, nowMs = Date.now()) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const ageMs = nowMs - t;
  // Reject future timestamps (clock skew / bad data) as well as anything older
  // than the window.
  return ageMs >= 0 && ageMs <= UPDATE_DATA_FRESH_DAYS * MS_PER_DAY;
}
