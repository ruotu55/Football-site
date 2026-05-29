/**
 * Normalize team crest paths after folder renames (e.g. Teams Images → Images/Teams).
 */

/** @param {string} rel */
export function normalizeLegacyTeamImageRelPath(rel) {
  let p = String(rel || "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!p || p.includes("..")) return "";
  if (p.startsWith("Teams Images/")) {
    p = `Images/Teams/${p.slice("Teams Images/".length)}`;
  }
  return p;
}

/** Per-level override may include `?_logo=` cache-bust query — strip before loading. */
export function stripLogoOverrideRelPath(ov) {
  const t = String(ov || "").trim();
  if (!t || t.includes("..") || t.includes("\\")) return "";
  const withoutQuery = t.split("?")[0].split("#")[0];
  return normalizeLegacyTeamImageRelPath(withoutQuery);
}
