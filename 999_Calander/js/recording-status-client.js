/* Calendar-side client for the shared recording-status store.
 *
 * Single source of truth lives at GET /__recording-status (served from any
 * runner's run_site.py). The calendar reads the whole store once on page load
 * and re-reads on a 10-second cadence so newly-recorded blocks light up on the
 * calendar without a manual refresh.
 *
 * Block key shape: "<runnerId>|<type>|<episode>"  (e.g. "1|long|5")
 * Block value:     { name, script, recorded: { english, spanish }, updatedAt }
 */
(function () {
  const ENDPOINT = "/__recording-status";
  const REFRESH_MS = 10_000;

  let blocks = Object.create(null);
  const listeners = new Set();

  function blockKey(runnerId, type, episode) {
    return `${runnerId}|${type}|${episode}`;
  }

  function getBlock(runnerId, type, episode) {
    return blocks[blockKey(runnerId, type, episode)] || null;
  }

  /** "empty" | "ready" | "recordedEnglish" | "recordedSpanish" | "recordedBoth" */
  function statusForBlock(block) {
    if (!block) return "empty";
    const en = !!block.recorded?.english;
    const es = !!block.recorded?.spanish;
    if (en && es) return "recordedBoth";
    if (en) return "recordedEnglish";
    if (es) return "recordedSpanish";
    return "ready";
  }

  /** Status from the calendar's point of view: did THIS pill's language get recorded? */
  function statusForPill(runnerId, type, episode, channel) {
    const block = getBlock(runnerId, type, episode);
    if (!block) return "empty";
    const language = channel === "en" ? "english" : "spanish";
    return block.recorded?.[language] ? "recorded" : "ready";
  }

  /** Short label matching the runner Saved tab's status chip. Mirrors the
   *  block-level status (both EN+ES) so both pills of an episode show the same
   *  text — keeps the calendar and the runner queue visually consistent. */
  function labelForBlock(block) {
    if (!block) return "Empty";
    const en = !!block.recorded?.english;
    const es = !!block.recorded?.spanish;
    if (en && es) return "2/2 ✓";
    if (en) return "1/2 EN";
    if (es) return "1/2 ES";
    return "Ready";
  }

  function notify() {
    for (const fn of listeners) {
      try { fn(); } catch (_) { /* listeners must not break the polling loop */ }
    }
  }

  async function refresh() {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) {
        console.warn("[FCRecordingStatus] GET", ENDPOINT, "returned", res.status, res.statusText);
        return;
      }
      const data = await res.json();
      const incoming = (data && typeof data.blocks === "object" && data.blocks) || {};
      const keys = Object.keys(incoming);
      console.info("[FCRecordingStatus] fetched", keys.length, "block(s):", keys);
      // Replace wholesale — the server returns the full store and we want
      // deletions to propagate.
      blocks = incoming;
      notify();
    } catch (err) {
      console.warn("[FCRecordingStatus] fetch failed:", err);
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Initial load + lightweight polling. setInterval is fine here — the payload
  // is tiny (one JSON object) and there's no other live-update mechanism.
  refresh();
  setInterval(refresh, REFRESH_MS);

  window.FCRecordingStatus = {
    blockKey,
    getBlock,
    statusForBlock,
    statusForPill,
    labelForBlock,
    subscribe,
    refresh,
  };
})();
