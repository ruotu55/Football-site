// js/bulk-photo-picker.js — "Get all team photos" bulk modal.
// Self-contained ESM module; mirrors photo-source-picker.js conventions.
//
// openBulkPhotoPicker({
//   teamLabel,           // string  — squad name shown in subtitle
//   players,             // [{ slotIndex, name, club, nationality, photoBodyBase, ...passthrough }]
//   sources,             // string[]  — e.g. ["fut.gg", "365scores"]
//   loadCandidates,      // ({ player, source }) => Promise<Array<{ dataUrl, url }>>
//   onSelectCandidate,   // ({ player, candidate, source }) => Promise<void>  (throws -> inline error)
//   onPasteUrl,          // (player) => void  (caller owns the URL prompt + apply)
// })
//
// The module is pure UI: it does not know server endpoints or appState. The
// caller wires `loadCandidates` / `onSelectCandidate` / `onPasteUrl` to the
// existing per-player flow so we reuse the same endpoints and the same
// post-save renderPitch() side-effect.

let root = null;

function ensureRoot() {
  if (root) return root;
  const el = document.createElement("div");
  el.className = "bpick-modal";
  el.hidden = true;
  el.innerHTML = `
    <div class="bpick-backdrop" data-bpick-close></div>
    <div class="bpick-panel" role="dialog" aria-label="Get all team photos">
      <header class="bpick-header">
        <h3 class="bpick-title">Get all team photos</h3>
        <button type="button" class="bpick-close" data-bpick-close aria-label="Close">&times;</button>
      </header>
      <div class="bpick-sub"></div>
      <div class="bpick-toolbar">
        <button type="button" class="bpick-fetch-all">Fetch all</button>
        <span class="bpick-overall-status"></span>
      </div>
      <div class="bpick-list"></div>
    </div>`;
  document.body.appendChild(el);
  root = el;
  return el;
}

function sourceTag(source) {
  if (source === "fut.gg") return "FUT";
  if (source === "365scores") return "365";
  return String(source || "").toUpperCase();
}

// Render one player's row up-front; thumbnails get appended later as each
// per-source fetch resolves. Returned handle exposes the elements the
// orchestrator will mutate.
function buildRow(player, index) {
  const row = document.createElement("div");
  row.className = "bpick-row";
  row.dataset.slotIndex = String(player.slotIndex);
  row.innerHTML = `
    <div class="bpick-row-head">
      <span class="bpick-row-num">${index + 1}.</span>
      <span class="bpick-row-name"></span>
      <span class="bpick-row-tick" hidden>&#10003; chosen</span>
      <button type="button" class="bpick-row-paste">Paste URL</button>
    </div>
    <div class="bpick-row-status"></div>
    <div class="bpick-row-thumbs"></div>`;
  row.querySelector(".bpick-row-name").textContent = player.name || "(unknown)";
  return {
    el: row,
    nameEl: row.querySelector(".bpick-row-name"),
    statusEl: row.querySelector(".bpick-row-status"),
    thumbsEl: row.querySelector(".bpick-row-thumbs"),
    tickEl: row.querySelector(".bpick-row-tick"),
    pasteBtn: row.querySelector(".bpick-row-paste"),
  };
}

function appendCandidates(rowHandle, source, candidates) {
  const frag = document.createDocumentFragment();
  for (const c of candidates) {
    if (!c || !c.dataUrl) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bpick-thumb";
    btn.dataset.source = source;
    btn.innerHTML = `<img alt="" draggable="false" /><span class="bpick-thumb-tag">${sourceTag(source)}</span>`;
    btn.querySelector("img").src = c.dataUrl;
    btn._candidate = c;
    frag.appendChild(btn);
  }
  rowHandle.thumbsEl.appendChild(frag);
}

function setRowStatus(rowHandle, text, kind) {
  rowHandle.statusEl.textContent = text || "";
  rowHandle.statusEl.classList.toggle("bpick-row-status--error", kind === "error");
}

export function openBulkPhotoPicker({
  teamLabel = "",
  players = [],
  sources = ["fut.gg", "365scores"],
  loadCandidates,
  onSelectCandidate,
  onPasteUrl,
} = {}) {
  const el = ensureRoot();
  el.querySelector(".bpick-sub").textContent = [
    teamLabel ? teamLabel : null,
    `${players.length} player${players.length === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");

  const listEl = el.querySelector(".bpick-list");
  listEl.innerHTML = "";
  const handles = players.map((p, i) => {
    const h = buildRow(p, i);
    h.player = p;
    h.busy = false;
    h.sourcesPending = new Set(sources);
    h.sourcesFailed = new Set();
    h.hadAnyCandidate = false;
    listEl.appendChild(h.el);
    return h;
  });

  const overallEl = el.querySelector(".bpick-overall-status");
  const fetchAllBtn = el.querySelector(".bpick-fetch-all");
  fetchAllBtn.disabled = false;
  fetchAllBtn.textContent = "Fetch all";
  overallEl.textContent = "";

  const close = () => {
    el.hidden = true;
    el.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };

  const refreshRowStatus = (h) => {
    if (h.busy) return;
    if (h.sourcesPending.size > 0) return; // still loading
    if (h.hadAnyCandidate) { setRowStatus(h, "", null); return; }
    if (h.sourcesFailed.size === sources.length) {
      setRowStatus(h, "No photos found (both sources failed).", "error");
    } else {
      setRowStatus(h, "No photos found.", null);
    }
  };

  const handleThumbClick = async (h, thumbBtn) => {
    if (h.busy) return;
    const candidate = thumbBtn._candidate;
    if (!candidate) return;
    h.busy = true;
    thumbBtn.classList.add("bpick-thumb--busy");
    setRowStatus(h, "Saving…", null);
    try {
      await onSelectCandidate?.({
        player: h.player,
        candidate,
        source: thumbBtn.dataset.source || "",
      });
      // Mark this thumb as the chosen one; un-mark any prior chosen.
      h.thumbsEl.querySelectorAll(".bpick-thumb--chosen").forEach((b) => {
        b.classList.remove("bpick-thumb--chosen");
      });
      thumbBtn.classList.add("bpick-thumb--chosen");
      h.tickEl.hidden = false;
      setRowStatus(h, "", null);
    } catch (err) {
      setRowStatus(h, err?.message || "Failed to save photo.", "error");
    } finally {
      thumbBtn.classList.remove("bpick-thumb--busy");
      h.busy = false;
    }
  };

  const fetchAll = async () => {
    fetchAllBtn.disabled = true;
    fetchAllBtn.textContent = "Fetching…";
    overallEl.textContent = `0 / ${handles.length * sources.length}`;
    let done = 0;
    const bump = () => {
      done += 1;
      overallEl.textContent = `${done} / ${handles.length * sources.length}`;
    };
    const jobs = [];
    for (const h of handles) {
      setRowStatus(h, "Searching…", null);
      for (const source of sources) {
        jobs.push((async () => {
          try {
            const cands = (await loadCandidates?.({ player: h.player, source })) || [];
            if (cands.length) {
              appendCandidates(h, source, cands);
              h.hadAnyCandidate = true;
            }
          } catch (err) {
            h.sourcesFailed.add(source);
            // Surface per-source error without nuking the other source's results.
            const prev = h.statusEl.textContent;
            const msg = `${sourceTag(source)}: ${err?.message || "failed"}`;
            h.statusEl.textContent = prev && !prev.startsWith("Searching") ? `${prev} · ${msg}` : msg;
            h.statusEl.classList.add("bpick-row-status--error");
          } finally {
            h.sourcesPending.delete(source);
            refreshRowStatus(h);
            bump();
          }
        })());
      }
    }
    await Promise.allSettled(jobs);
    fetchAllBtn.disabled = false;
    fetchAllBtn.textContent = "Fetch all again";
  };

  const onClick = (e) => {
    if (e.target?.dataset?.bpickClose !== undefined || e.target?.closest?.("[data-bpick-close]")) {
      close();
      return;
    }
    if (e.target === fetchAllBtn || e.target?.closest?.(".bpick-fetch-all")) {
      fetchAll();
      return;
    }
    const pasteBtn = e.target?.closest?.(".bpick-row-paste");
    if (pasteBtn) {
      const rowEl = pasteBtn.closest(".bpick-row");
      const h = handles.find((x) => x.el === rowEl);
      if (h) onPasteUrl?.(h.player);
      return;
    }
    const thumbBtn = e.target?.closest?.(".bpick-thumb");
    if (thumbBtn) {
      const rowEl = thumbBtn.closest(".bpick-row");
      const h = handles.find((x) => x.el === rowEl);
      if (h) handleThumbClick(h, thumbBtn);
      return;
    }
  };

  el.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  el.hidden = false;
}
