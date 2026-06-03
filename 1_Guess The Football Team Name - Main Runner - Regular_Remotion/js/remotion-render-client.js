// js/remotion-render-client.js
import { buildRemotionState } from "./remotion-state-export.js";
import { getActiveScriptName } from "./saved-scripts.js?v=20260601-autoopen5";

function currentLanguage() {
  try { return (localStorage.getItem("voice-tab.language") || "english").toLowerCase(); } catch { return "english"; }
}

export async function startRemotionRender(cfg) {
  const state = buildRemotionState();
  const script = (getActiveScriptName() || "").trim();
  const body = { width: cfg.width, height: cfg.height, fps: cfg.fps, script, language: currentLanguage(), stateJson: state };
  const res = await fetch("/__remotion-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.ok) { alert("Render failed to start: " + (data.error || "unknown")); return; }
  subscribeProgress(data.jobId);
}

function subscribeProgress(jobId) {
  const es = new EventSource(`/__remotion-render/progress?job=${encodeURIComponent(jobId)}`);
  es.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.stage === "done" || m.stage === "finished") { es.close(); alert("Render complete" + (m.path ? ": " + m.path : "")); }
    else if (m.stage === "error") { es.close(); alert("Render error: " + (m.message || "unknown")); }
    else { console.log("[remotion-render]", m); }
  };
  es.onerror = () => { es.close(); };
}
