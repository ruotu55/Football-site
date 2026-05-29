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

  /** Prefer teamsImportText; derive from legacy script.levels when missing. */
  function extractTeamsImportTextFromScript(script) {
    if (!script || !Array.isArray(script.levels)) return "";
    const lines = [];
    for (const lvl of script.levels) {
      if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro) continue;
      const name = String(
        lvl.searchText ||
        lvl.currentSquad?.name ||
        lvl.selectedEntry?.name ||
        lvl.playerName ||
        "",
      ).trim();
      if (!name) continue;
      const right = String(
        lvl.selectedEntry?.country ||
        lvl.currentSquad?.country ||
        lvl.selectedEntry?.club ||
        lvl.currentSquad?.club ||
        lvl.country ||
        lvl.club ||
        lvl.region ||
        "",
      ).trim();
      lines.push(right ? `${name} - ${right}` : name);
    }
    return lines.join("\n");
  }

  function teamsImportTextForBlock(block) {
    if (!block || typeof block !== "object") return "";
    const stored = String(block.teamsImportText || "").trim();
    if (stored) return stored;
    return extractTeamsImportTextFromScript(block.script);
  }

  function hydrateBlocks(rawBlocks) {
    if (!rawBlocks || typeof rawBlocks !== "object") return;
    for (const block of Object.values(rawBlocks)) {
      if (!block || typeof block !== "object") continue;
      if (!String(block.teamsImportText || "").trim() && block.script) {
        const derived = extractTeamsImportTextFromScript(block.script);
        if (derived) block.teamsImportText = derived;
      }
    }
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
        return false;
      }
      const data = await res.json();
      const incoming = (data && typeof data.blocks === "object" && data.blocks) || {};
      const keys = Object.keys(incoming);
      console.info("[FCRecordingStatus] fetched", keys.length, "block(s):", keys);
      // Replace wholesale — the server returns the full store and we want
      // deletions to propagate.
      blocks = incoming;
      hydrateBlocks(blocks);
      notify();
      return true;
    } catch (err) {
      console.warn("[FCRecordingStatus] fetch failed:", err);
      return false;
    }
  }

  async function saveBlock(runnerId, type, episode, { name, teamsImportText }) {
    const cleanName = String(name || "").trim();
    const cleanTeams = String(teamsImportText || "").trim();
    // Shorts are nameless by design; only long-form requires a competition name.
    if (!cleanTeams) return false;
    if (type !== "short" && !cleanName) return false;

    await refresh();
    const key = blockKey(runnerId, type, episode);
    const previous = blocks[key] || {};
    const nextBlocks = { ...blocks };
    nextBlocks[key] = {
      ...previous,
      name: cleanName,
      teamsImportText: cleanTeams,
      script: previous.script && typeof previous.script === "object" ? previous.script : {},
      recorded: previous.recorded && typeof previous.recorded === "object"
        ? previous.recorded
        : { english: null, spanish: null },
      updatedAt: Date.now(),
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "replace", payload: { blocks: nextBlocks } }),
      });
      if (!res.ok) return false;
      blocks = nextBlocks;
      notify();
      return true;
    } catch (err) {
      console.warn("[FCRecordingStatus] save failed:", err);
      return false;
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

  /** Map of `<type>|<runnerId>` -> sorted list of episode numbers that have a
   *  block WITH content (a "video"). Used by the schedule to place only real
   *  videos and skip runners that have run out. */
  function availableEpisodes() {
    const out = {};
    for (const key of Object.keys(blocks)) {
      const b = blocks[key];
      const text = String((b && b.teamsImportText) || "").trim();
      if (!text) continue; // only blocks that actually have levels
      const parts = key.split("|");
      if (parts.length !== 3) continue;
      const runnerId = Number(parts[0]);
      const type = parts[1];
      const ep = Number(parts[2]);
      if (!runnerId || (type !== "long" && type !== "short") || !ep) continue;
      // opener = first level's left side (player or team name) — used by the
      // schedule to avoid two consecutive videos opening with the same one.
      const firstLine = text.split("\n").find((l) => l.trim()) || "";
      const opener = firstLine.split(" - ")[0].trim();
      const k = `${type}|${runnerId}`;
      (out[k] || (out[k] = [])).push({ ep, opener });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.ep - b.ep);
    return out;
  }

  window.FCRecordingStatus = {
    blockKey,
    getBlock,
    statusForBlock,
    statusForPill,
    labelForBlock,
    teamsImportTextForBlock,
    availableEpisodes,
    saveBlock,
    subscribe,
    refresh,
  };
})();
