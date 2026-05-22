import { appState } from "./state.js";

const POLL_INTERVAL_MS = 500;

let pollTimer = null;
let activeJobId = null;
let consecutivePollFailures = 0;
const POLL_FAILURE_THRESHOLD = 5;
let resumed409 = false;

function $(id) {
  return document.getElementById(id);
}

function showError(msg) {
  const el = $("update-data-error");
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function clearError() {
  showError("");
}

function setProgressMode(on) {
  const form = $("update-data-form");
  const prog = $("update-data-progress");
  if (form) form.style.display = on ? "none" : "block";
  if (prog) prog.style.display = on ? "block" : "none";
}

function resetModalState() {
  clearError();
  resumed409 = false;
  setProgressMode(false);
  const summary = $("update-data-summary");
  if (summary) {
    summary.style.display = "none";
    summary.replaceChildren();
  }
  const bar = $("update-data-bar");
  if (bar) bar.style.width = "0%";
  const counter = $("update-data-counter");
  if (counter) counter.textContent = "Starting…";
  const apply = $("update-data-apply");
  if (apply) apply.disabled = false;
}

function openModal() {
  resetModalState();
  const modal = $("update-data-modal");
  if (modal) modal.hidden = false;
  const ta = $("update-data-cookie");
  if (ta) ta.focus();
}

function closeModal() {
  stopPolling();
  const modal = $("update-data-modal");
  if (modal) modal.hidden = true;
}

function collectPaths() {
  const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  const seen = new Set();
  const out = [];
  for (const lvl of levels) {
    // Levels can hold a team directly (selectedEntry) or a player whose home
    // team is attached as _clubItem (career-path / player-stats / four-params).
    const candidates = [
      lvl?.selectedEntry?.path,
      lvl?.careerPlayer?._clubItem?.path,
      lvl?.careerPlayer?._clubItem?.id,
    ];
    for (const p of candidates) {
      if (typeof p === "string" && p.length > 0 && !seen.has(p)) {
        seen.add(p);
        out.push(p);
        break; // one path per level is enough
      }
    }
  }
  return out;
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function renderProgress(snap) {
  const counter = $("update-data-counter");
  const bar = $("update-data-bar");
  const total = snap.total || 0;
  const done = snap.done || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  if (bar) bar.style.width = pct + "%";
  if (counter) {
    const prefix = resumed409 ? "Resumed: " : "";
    if (snap.status === "running") {
      const cur = snap.current ? ` — refreshing ${snap.current}…` : "";
      counter.textContent = `${prefix}${done} / ${total}${cur}`;
    } else if (snap.status === "done") {
      counter.textContent = `${prefix}${done} / ${total} — done`;
    } else if (snap.status === "error") {
      counter.textContent = `Error: ${snap.error || "unknown error"}`;
    } else {
      counter.textContent = "Job no longer tracked.";
    }
  }
}

function renderSummary(snap) {
  const el = $("update-data-summary");
  if (!el) return;
  el.replaceChildren();
  if (snap.status === "error") {
    const p = document.createElement("div");
    p.style.color = "#ef4444";
    p.textContent = `Failed: ${snap.error || "unknown error"}`;
    el.appendChild(p);
    el.style.display = "block";
    return;
  }
  const ok = snap.ok_count || 0;
  const failed = Array.isArray(snap.failed) ? snap.failed : [];
  const summary = document.createElement("div");
  if (failed.length === 0) {
    summary.textContent = `Done. All ${ok} teams refreshed successfully.`;
  } else {
    summary.textContent = `Done. ${ok} ok, ${failed.length} failed.`;
  }
  el.appendChild(summary);
  if (failed.length > 0) {
    const ul = document.createElement("ul");
    ul.style.marginTop = "0.6rem";
    ul.style.paddingLeft = "1.2rem";
    ul.style.color = "#ef4444";
    for (const f of failed) {
      const li = document.createElement("li");
      li.style.marginBottom = "0.3rem";
      li.textContent = `${f.path}: ${f.error}`;
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }
  el.style.display = "block";
}

async function pollOnce() {
  if (!activeJobId) return;
  let snap;
  try {
    const res = await fetch(`/__update-data/progress?id=${encodeURIComponent(activeJobId)}`);
    snap = await res.json();
  } catch (err) {
    consecutivePollFailures += 1;
    if (consecutivePollFailures >= POLL_FAILURE_THRESHOLD) {
      const counter = $("update-data-counter");
      if (counter) counter.textContent = "Connection lost — retrying…";
    }
    return; // transient; next tick will retry
  }
  consecutivePollFailures = 0;
  renderProgress(snap);
  if (snap.status === "done" || snap.status === "error" || snap.status === "unknown") {
    stopPolling();
    activeJobId = null;
    renderSummary(snap);
    const apply = $("update-data-apply");
    if (apply) apply.disabled = false;
    setProgressMode(true); // keep progress block visible to show summary
  }
}

function startPolling(jobId) {
  stopPolling();
  activeJobId = jobId;
  consecutivePollFailures = 0;
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

/* Starts a refresh job using the given cookie. Returns true if the job is
   now running and being polled. */
async function startJob(cookie) {
  const paths = collectPaths();
  if (paths.length === 0) {
    showError("No teams selected in your levels.");
    setProgressMode(false);
    return false;
  }
  const apply = $("update-data-apply");
  if (apply) apply.disabled = true;
  let res, body;
  try {
    res = await fetch("/__update-data/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie, paths }),
    });
    body = await res.json();
  } catch (err) {
    if (apply) apply.disabled = false;
    setProgressMode(false);
    showError(`Network error: ${err.message || err}`);
    return false;
  }
  if (res.status === 409 && body && body.jobId) {
    resumed409 = true;
    setProgressMode(true);
    startPolling(body.jobId);
    return true;
  }
  if (!res.ok) {
    if (apply) apply.disabled = false;
    setProgressMode(false);
    showError(body && body.error ? body.error : `HTTP ${res.status}`);
    return false;
  }
  if (!body || !body.jobId) {
    if (apply) apply.disabled = false;
    setProgressMode(false);
    showError("Server did not return a job id.");
    return false;
  }
  setProgressMode(true);
  startPolling(body.jobId);
  return true;
}

async function applyUpdate() {
  clearError();
  const cookieEl = $("update-data-cookie");
  const cookie = cookieEl ? cookieEl.value.trim() : "";
  if (!cookie) {
    showError("Paste your Transfermarkt cookie to continue.");
    return;
  }
  await startJob(cookie);
}

/* Click handler: try the saved cookie silently first. If the server has one
   on file and the job kickoff succeeds, the modal opens directly into
   progress mode — no paste step. If there's no saved cookie, or the server
   says one was just cleared (the last job failed entirely), open the
   paste-form modal as before. */
async function openOrUseCached() {
  resetModalState();
  const paths = collectPaths();
  if (paths.length === 0) {
    openModal();
    showError("No teams selected in your levels.");
    return;
  }
  let res, body;
  try {
    res = await fetch("/__update-data/start-cached", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    body = await res.json().catch(() => ({}));
  } catch (_) {
    // Server unreachable — open paste form as fallback.
    openModal();
    return;
  }
  if (res.status === 200 && body && body.jobId) {
    // Saved cookie worked — open modal directly in progress mode.
    const modal = $("update-data-modal");
    if (modal) modal.hidden = false;
    setProgressMode(true);
    startPolling(body.jobId);
    return;
  }
  if (res.status === 409 && body && body.jobId) {
    // A job is already running — attach to it.
    const modal = $("update-data-modal");
    if (modal) modal.hidden = false;
    setProgressMode(true);
    resumed409 = true;
    startPolling(body.jobId);
    return;
  }
  // 404 (no saved cookie) or any other error → manual paste flow.
  openModal();
  if (res.status !== 404 && body && body.error) {
    showError(body.error);
  }
}

export function initUpdateData() {
  const openBtn = $("btn-update-data");
  const closeBtn = $("update-data-modal-close");
  const cancelBtn = $("update-data-cancel");
  const applyBtn = $("update-data-apply");
  if (openBtn) openBtn.onclick = openOrUseCached;
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (applyBtn) applyBtn.onclick = applyUpdate;
}
