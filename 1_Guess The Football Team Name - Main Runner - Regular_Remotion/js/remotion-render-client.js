// js/remotion-render-client.js — POST to the render endpoint + a visible status box.
import { buildRemotionState } from "./remotion-state-export.js";
import { getActiveScriptName } from "./saved-scripts.js?v=20260601-autoopen5";

function currentLanguage() {
  try { return (localStorage.getItem("voice-tab.language") || "english").toLowerCase(); } catch { return "english"; }
}

/* ── Status box (inline styles so a stale CSS cache can't hide it) ───────── */
let boxEls = null;
function ensureBox() {
  if (boxEls) return boxEls;
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:200001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(4px)";
  ov.innerHTML = `
    <div style="width:min(560px,92vw);background:#0d141f;border:1px solid #243044;border-radius:14px;padding:24px 26px;box-shadow:0 20px 60px rgba(0,0,0,.6);color:#e6edf3;font-family:system-ui,sans-serif">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span id="rrx-dot" style="width:12px;height:12px;border-radius:50%;background:#e8b500;box-shadow:0 0 10px #e8b500"></span>
        <h2 id="rrx-title" style="margin:0;font-size:20px;font-weight:800;letter-spacing:.02em">Render Video</h2>
      </div>
      <div id="rrx-stage" style="font-size:14px;color:#9fb0c3;margin-bottom:12px">Starting…</div>
      <div style="height:14px;border-radius:8px;background:#1b2533;overflow:hidden;margin-bottom:8px">
        <div id="rrx-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#e8b500,#ffd24a);transition:width .15s"></div>
      </div>
      <div id="rrx-count" style="font-size:13px;color:#c9d6e3;font-variant-numeric:tabular-nums">frame 0 / ?</div>
      <pre id="rrx-msg" style="display:none;white-space:pre-wrap;word-break:break-word;background:#1a1f2b;border:1px solid #33405a;border-radius:8px;padding:10px;margin:12px 0 0;font-size:12px;color:#ffb4b4;max-height:180px;overflow:auto"></pre>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button id="rrx-open" style="display:none;padding:9px 16px;border-radius:8px;border:1px solid #2a6b46;background:#143626;color:#bff0d0;font-weight:700;cursor:pointer">Open folder</button>
        <button id="rrx-close" style="padding:9px 16px;border-radius:8px;border:1px solid #33405a;background:#1b2533;color:#e6edf3;font-weight:700;cursor:pointer">Close</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  boxEls = {
    ov, dot: ov.querySelector("#rrx-dot"), title: ov.querySelector("#rrx-title"),
    stage: ov.querySelector("#rrx-stage"), bar: ov.querySelector("#rrx-bar"),
    count: ov.querySelector("#rrx-count"), msg: ov.querySelector("#rrx-msg"),
    open: ov.querySelector("#rrx-open"), close: ov.querySelector("#rrx-close"),
  };
  boxEls.close.onclick = () => { ov.remove(); boxEls = null; };
  return boxEls;
}
function boxStarting() {
  const b = ensureBox();
  b.title.textContent = "Render Video";
  b.dot.style.background = "#e8b500"; b.dot.style.boxShadow = "0 0 10px #e8b500";
  b.stage.textContent = "Starting render…"; b.bar.style.width = "3%";
  b.count.textContent = "frame 0 / ?"; b.msg.style.display = "none"; b.open.style.display = "none";
}
function boxProgress(frame, total, pct, stage) {
  const b = ensureBox();
  if (typeof pct === "number") b.bar.style.width = Math.max(3, Math.min(100, pct)) + "%";
  if (total) b.count.textContent = `frame ${frame ?? 0} / ${total}` + (typeof pct === "number" ? `  ·  ${pct}%` : "");
  else if (frame != null) b.count.textContent = `frame ${frame}`;
  if (stage) b.stage.textContent = stage;
}
function boxDone(path) {
  const b = ensureBox();
  b.dot.style.background = "#37d67a"; b.dot.style.boxShadow = "0 0 10px #37d67a";
  b.title.textContent = "Render complete ✓"; b.stage.textContent = "Done.";
  b.bar.style.width = "100%";
  if (path) { b.count.textContent = path; b.open.style.display = "inline-block";
    b.open.onclick = () => { fetch("/__open-folder?path=" + encodeURIComponent(path)).catch(() => {}); }; }
}
function boxError(message) {
  const b = ensureBox();
  b.dot.style.background = "#ff5c5c"; b.dot.style.boxShadow = "0 0 10px #ff5c5c";
  b.title.textContent = "Render failed ✗"; b.stage.textContent = "Error";
  b.msg.style.display = "block"; b.msg.textContent = String(message || "Unknown error");
}

export async function startRemotionRender(cfg) {
  boxStarting();
  const script = (getActiveScriptName() || "").trim();
  if (!script) { boxError("Load a saved setting first — the output file is named after it."); return; }
  let state;
  try { state = await buildRemotionState(); }
  catch (e) { boxError("Could not read the on-screen state:\n" + (e?.stack || e?.message || e)); return; }
  const body = { width: cfg.width, height: cfg.height, fps: cfg.fps, script, language: currentLanguage(), stateJson: state };

  let res;
  try {
    res = await fetch("/__remotion-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    boxError("Could not reach the server (Failed to fetch).\nIs the dev server running on this port?\n" + (e?.message || e)); return;
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch {
    boxError(`The server did not return JSON (HTTP ${res.status}).\nThis almost always means the /__remotion-render endpoint is missing — the dev server is running OLD code and must be restarted.\n\nFirst 200 chars of response:\n` + text.slice(0, 200));
    return;
  }
  if (!res.ok || !data.ok) { boxError(data.error || `HTTP ${res.status}`); return; }
  boxProgress(0, null, 3, "Render started — booting Chromium (first frames are slow)…");
  subscribeProgress(data.jobId);
}

function subscribeProgress(jobId) {
  const es = new EventSource(`/__remotion-render/progress?job=${encodeURIComponent(jobId)}`);
  let sawDone = false;
  es.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.stage === "render") boxProgress(m.frame, m.total, m.pct, `Rendering — frame ${m.frame ?? "?"} / ${m.total ?? "?"}`);
    else if (m.stage === "log") boxProgress(undefined, undefined, undefined, m.line ? String(m.line).slice(0, 90) : "Working…");
    else if (m.stage === "done") { sawDone = true; boxDone(m.path); es.close(); }
    else if (m.stage === "error") { boxError(m.message || "Render error"); es.close(); }
    else if (m.stage === "finished") {
      if (!sawDone && typeof m.code === "number" && m.code !== 0)
        boxError("Render process exited with code " + m.code + ".\nCheck the server console window for the Remotion error.");
      es.close();
    }
  };
  es.onerror = () => { /* keep the box open; user can Close. */ };
}
