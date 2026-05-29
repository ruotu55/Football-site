/**
 * Verify project assets actually load (not just referenced in JSON / indexes).
 */

/** @param {string} url */
export async function probeAssetUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  const opts = { cache: "no-store", mode: "cors" };
  try {
    const head = await fetch(u, { ...opts, method: "HEAD" });
    if (head.ok) return true;
  } catch (_) {
    /* fall through */
  }
  try {
    const get = await fetch(u, { ...opts, method: "GET" });
    return get.ok;
  } catch (_) {
    return false;
  }
}

/** Try URLs in order (same chain as header crest / slot badge fallbacks). */
export async function probeAssetUrlChain(urls) {
  if (!Array.isArray(urls)) return false;
  for (const url of urls) {
    if (url && (await probeAssetUrl(url))) return true;
  }
  return false;
}
