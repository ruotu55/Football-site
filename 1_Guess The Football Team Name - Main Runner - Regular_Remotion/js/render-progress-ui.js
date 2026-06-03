// js/render-progress-ui.js — progress overlay for Render Video.
// One big overall bar + a small bar per parallel worker, frames + time, and on failure
// a copyable error box + a Rerun button. Self-contained (injects its own styles + DOM).

let overlay = null, titleEl = null, subEl = null, bigBar = null, workersWrap = null;
let actionsEl = null, closeBtn = null, rerunBtn = null, errBtn = null, errBox = null, copyBtn = null;
const workerBars = []; // { fill, label }

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ensureOverlay() {
  if (overlay) return;
  const style = document.createElement("style");
  style.textContent = `
    #render-progress-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;
      justify-content:center;background:rgba(0,0,0,.74);font-family:inherit}
    #render-progress-overlay .rp-card{background:#16181d;color:#fff;border-radius:16px;padding:26px 30px;
      min-width:460px;max-width:620px;box-shadow:0 20px 60px rgba(0,0,0,.55)}
    #render-progress-overlay .rp-title{font-size:20px;font-weight:800;margin:0 0 4px;text-align:center}
    #render-progress-overlay .rp-sub{font-size:13px;opacity:.85;margin:0 0 16px;text-align:center;word-break:break-word}
    #render-progress-overlay .rp-track{height:14px;border-radius:7px;background:#2a2e37;overflow:hidden}
    #render-progress-overlay .rp-bar{height:100%;width:0;border-radius:7px;
      background:linear-gradient(90deg,#37d67a,#2bb673);transition:width .25s ease}
    #render-progress-overlay .rp-workers{display:flex;gap:8px;margin-top:14px}
    #render-progress-overlay .rp-wk{flex:1;font-size:10px;opacity:.85}
    #render-progress-overlay .rp-wk .rp-wlabel{margin:0 0 3px;text-align:center}
    #render-progress-overlay .rp-wtrack{height:7px;border-radius:4px;background:#2a2e37;overflow:hidden}
    #render-progress-overlay .rp-wbar{height:100%;width:0;border-radius:4px;background:#4da3ff;transition:width .25s ease}
    #render-progress-overlay .rp-actions{margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
    #render-progress-overlay button{padding:9px 16px;border:0;border-radius:10px;font-weight:700;cursor:pointer}
    #render-progress-overlay .rp-close{background:#3a3f4a;color:#fff;display:none}
    #render-progress-overlay .rp-rerun{background:#f59e0b;color:#06281a;display:none}
    #render-progress-overlay .rp-errbtn{background:#b91c1c;color:#fff;display:none}
    #render-progress-overlay .rp-copy{background:#3a3f4a;color:#fff;display:none}
    #render-progress-overlay .rp-errbox{display:none;margin-top:12px}
    #render-progress-overlay .rp-errbox textarea{width:100%;height:140px;background:#0c0d10;color:#ff9b9b;
      border:1px solid #3a3f4a;border-radius:8px;padding:10px;font-family:monospace;font-size:11px;resize:vertical}`;
  document.head.appendChild(style);

  overlay = document.createElement("div");
  overlay.id = "render-progress-overlay";
  overlay.innerHTML = `
    <div class="rp-card">
      <p class="rp-title" id="rp-title">Rendering video…</p>
      <p class="rp-sub" id="rp-sub">Starting…</p>
      <div class="rp-track"><div class="rp-bar" id="rp-big"></div></div>
      <div class="rp-workers" id="rp-workers"></div>
      <div class="rp-actions">
        <button class="rp-errbtn" id="rp-errbtn">Show error</button>
        <button class="rp-copy" id="rp-copy">Copy error</button>
        <button class="rp-rerun" id="rp-rerun">Rerun</button>
        <button class="rp-close" id="rp-close">Close</button>
      </div>
      <div class="rp-errbox" id="rp-errbox"><textarea id="rp-errtext" readonly></textarea></div>
    </div>`;
  document.body.appendChild(overlay);
  titleEl = overlay.querySelector("#rp-title");
  subEl = overlay.querySelector("#rp-sub");
  bigBar = overlay.querySelector("#rp-big");
  workersWrap = overlay.querySelector("#rp-workers");
  actionsEl = overlay.querySelector(".rp-actions");
  closeBtn = overlay.querySelector("#rp-close");
  rerunBtn = overlay.querySelector("#rp-rerun");
  errBtn = overlay.querySelector("#rp-errbtn");
  copyBtn = overlay.querySelector("#rp-copy");
  errBox = overlay.querySelector("#rp-errbox");

  closeBtn.onclick = () => { overlay.style.display = "none"; };
  errBtn.onclick = () => { errBox.style.display = errBox.style.display === "block" ? "none" : "block"; };
  copyBtn.onclick = async () => {
    const t = overlay.querySelector("#rp-errtext");
    t.select();
    try { await navigator.clipboard.writeText(t.value); copyBtn.textContent = "Copied!"; setTimeout(() => (copyBtn.textContent = "Copy error"), 1500); }
    catch { document.execCommand("copy"); }
  };
}

function resetButtons() {
  [closeBtn, rerunBtn, errBtn, copyBtn].forEach((b) => (b.style.display = "none"));
  errBox.style.display = "none";
}

export function showRenderProgressModal(name) {
  ensureOverlay();
  titleEl.textContent = "Rendering video…";
  subEl.textContent = name ? `“${name}” — preparing…` : "Preparing…";
  bigBar.style.width = "0";
  bigBar.style.background = "linear-gradient(90deg,#37d67a,#2bb673)";
  workersWrap.innerHTML = "";
  workerBars.length = 0;
  resetButtons();
  overlay.style.display = "flex";
}

// Create N small per-worker bars.
export function setRenderWorkers(count) {
  ensureOverlay();
  if (workerBars.length === count) return;
  workersWrap.innerHTML = "";
  workerBars.length = 0;
  for (let i = 0; i < count; i++) {
    const cell = document.createElement("div");
    cell.className = "rp-wk";
    cell.innerHTML = `<p class="rp-wlabel">Part ${i + 1}</p><div class="rp-wtrack"><div class="rp-wbar"></div></div>`;
    workersWrap.appendChild(cell);
    workerBars.push({ fill: cell.querySelector(".rp-wbar"), label: cell.querySelector(".rp-wlabel") });
  }
}

export function updateRenderProgress({ frame, total, workers, label } = {}) {
  ensureOverlay();
  if (Array.isArray(workers)) {
    if (workerBars.length !== workers.length) setRenderWorkers(workers.length);
    workers.forEach((wk, i) => {
      const bar = workerBars[i];
      if (!bar) return;
      const pct = wk.window > 0 ? Math.min(100, Math.round((wk.captured / wk.window) * 100)) : 0;
      bar.fill.style.width = pct + "%";
      bar.label.textContent = `Part ${i + 1} · ${pct}%`;
    });
  }
  const haveCount = Number.isFinite(frame) && Number.isFinite(total) && total > 0;
  if (haveCount) {
    const pct = Math.min(100, Math.round((frame / total) * 100));
    bigBar.style.width = pct + "%";
    const count = `${frame.toLocaleString()} / ${total.toLocaleString()} frames (${pct}%)`;
    const time = `${fmtTime(frame / 60)} / ${fmtTime(total / 60)}`;
    subEl.textContent = (label ? label + " · " : "") + `${count} · ${time}`;
  } else if (label) {
    subEl.textContent = label;
  }
}

export function setRenderProgressDone(path) {
  ensureOverlay();
  titleEl.textContent = "✅ Render complete";
  bigBar.style.width = "100%";
  workerBars.forEach((b) => (b.fill.style.width = "100%"));
  subEl.textContent = path || "Saved.";
  resetButtons();
  closeBtn.style.display = "inline-block";
}

// message: full error text. onRerun: callback for the Rerun button (optional).
export function setRenderProgressError(message, onRerun) {
  ensureOverlay();
  titleEl.textContent = "⚠️ Render failed";
  bigBar.style.background = "#b91c1c";
  subEl.textContent = "Something went wrong. You can rerun it, or copy the error below.";
  overlay.querySelector("#rp-errtext").value = String(message || "Unknown error");
  resetButtons();
  errBtn.style.display = "inline-block";
  copyBtn.style.display = "inline-block";
  closeBtn.style.display = "inline-block";
  if (typeof onRerun === "function") {
    rerunBtn.style.display = "inline-block";
    rerunBtn.onclick = () => { resetButtons(); onRerun(); };
  }
  overlay.style.display = "flex";
}
