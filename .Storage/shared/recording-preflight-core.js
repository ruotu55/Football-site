/**
 * recording-preflight-core.js  (shared by all runners)
 *
 * The runner-agnostic half of the recording preflight: the "Preparing recording…"
 * progress overlay, the chunked image/voice warming loop, and the
 * "N missing assets — Cancel / Record anyway" modal. Each runner supplies a tiny
 * adapter (js/recording-preflight.js) that knows how to enumerate ITS own assets
 * and calls runPreflightCore() with three callbacks.
 *
 * Goal: by the time OBS starts capturing, every image the recording needs is
 * decoded in RAM and every reachable voice clip is in the HTTP cache, so playback
 * does zero network/decoding work on the hot path (no "logo pops in 0.2s late").
 *
 * Images are treated as REQUIRED — a unit with no loadable URL is reported in the
 * blocking modal. Voices are BEST-EFFORT by default (warmed but never block the
 * recording), unless the adapter marks a group `blocking: true`; this keeps a
 * slightly-off per-family voice derivation from ever popping a false "missing"
 * modal or aborting a record.
 */

import { preloadImage } from "./image-cache.js";

// ─── Loading primitives ─────────────────────────────────────────────────────

/** Try to load an audio URL. Resolves true on success, false on failure.
 *  Accepts canplaythrough (buffered enough to play start-to-finish without
 *  stalling) or loadeddata (some browsers skip canplaythrough for short clips). */
function preloadAudio(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "auto";
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      a.removeEventListener("canplaythrough", onOk);
      a.removeEventListener("loadeddata", onOk);
      a.removeEventListener("error", onErr);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    a.addEventListener("canplaythrough", onOk, { once: true });
    a.addEventListener("loadeddata", onOk, { once: true });
    a.addEventListener("error", onErr, { once: true });
    a.src = url;
    a.load();
    setTimeout(() => finish(false), 8000); // hard cap so a stuck request can't freeze preflight
  });
}

// ─── UI ─────────────────────────────────────────────────────────────────────

function createProgressOverlay() {
  const existing = document.getElementById("recording-preflight-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "recording-preflight-overlay";
  Object.assign(overlay.style, {
    // Above the Shorts letterbox bands (and the control panel, which is hidden during
    // recording anyway) so the progress overlay is visible in every runner.
    position: "fixed", inset: "0", zIndex: "2147483600",
    background: "rgba(0,0,0,0.88)", display: "flex",
    alignItems: "center", justifyContent: "center",
    fontFamily: "system-ui, -apple-system, sans-serif",
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "#1c1c1c", color: "#fff",
    padding: "28px 32px", borderRadius: "14px",
    minWidth: "380px", maxWidth: "520px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    textAlign: "center",
  });

  const h = document.createElement("h2");
  h.textContent = "Preparing recording…";
  h.style.cssText = "margin: 0 0 6px; font-size: 20px; font-weight: 600;";

  const sub = document.createElement("div");
  sub.textContent = "Pre-loading all images and voices so the recording runs without lag.";
  sub.style.cssText = "margin: 0 0 20px; font-size: 13px; opacity: 0.7;";

  const barWrap = document.createElement("div");
  Object.assign(barWrap.style, {
    background: "#2a2a2a", borderRadius: "8px",
    overflow: "hidden", height: "10px", margin: "0 0 12px",
  });
  const bar = document.createElement("div");
  Object.assign(bar.style, {
    background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
    height: "100%", width: "0%", transition: "width 120ms ease",
  });
  barWrap.appendChild(bar);

  const status = document.createElement("div");
  status.textContent = "Starting…";
  status.style.cssText = "font-size: 13px; opacity: 0.85; min-height: 18px;";

  box.append(h, sub, barWrap, status);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  return { overlay, bar, status };
}

function showFailureModal(missing) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "recording-preflight-failure";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "2147483601",
      background: "rgba(0,0,0,0.88)", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    });
    const box = document.createElement("div");
    Object.assign(box.style, {
      background: "#1c1c1c", color: "#fff",
      padding: "24px 28px", borderRadius: "12px",
      minWidth: "440px", maxWidth: "680px",
      maxHeight: "78vh", overflow: "auto",
      boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
    });
    const h = document.createElement("h2");
    h.textContent = `Preflight: ${missing.length} missing asset${missing.length === 1 ? "" : "s"}`;
    h.style.cssText = "margin: 0 0 8px; font-size: 18px;";

    const sub = document.createElement("p");
    sub.textContent = "These files were referenced but could not be loaded. Cancel to fix them, or record anyway and accept the gaps.";
    sub.style.cssText = "margin: 0 0 14px; font-size: 13px; opacity: 0.8;";

    const list = document.createElement("ul");
    list.style.cssText = "margin: 0 0 16px; padding: 0 0 0 18px; font-size: 12px; font-family: ui-monospace, Menlo, monospace; opacity: 0.85; line-height: 1.5;";
    const shown = missing.slice(0, 80);
    for (const m of shown) {
      const li = document.createElement("li");
      li.textContent = m;
      li.style.cssText = "margin: 0 0 3px; word-break: break-all;";
      list.appendChild(li);
    }
    if (missing.length > shown.length) {
      const li = document.createElement("li");
      li.textContent = `… and ${missing.length - shown.length} more`;
      li.style.cssText = "margin: 0 0 3px; opacity: 0.7;";
      list.appendChild(li);
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display: flex; gap: 10px; justify-content: flex-end;";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    Object.assign(cancel.style, {
      background: "#3a3a3a", color: "#fff", border: "0",
      padding: "8px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
    });
    const proceed = document.createElement("button");
    proceed.textContent = "Record anyway";
    Object.assign(proceed.style, {
      background: "#dc2626", color: "#fff", border: "0",
      padding: "8px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
    });
    cancel.onclick = () => { overlay.remove(); resolve(false); };
    proceed.onclick = () => { overlay.remove(); resolve(true); };
    btnRow.append(cancel, proceed);

    box.append(h, sub, list, btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

/** Trim absolute URLs to something readable in the failure list. */
function shortPath(url) {
  try {
    const u = new URL(url, window.location.href);
    const path = decodeURIComponent(u.pathname);
    const idx = path.indexOf("/Football Channel/");
    return idx >= 0 ? path.slice(idx + "/Football Channel/".length) : path;
  } catch {
    return String(url);
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Run the recording preflight.
 *
 * @param {object} cb
 * @param {() => void} [cb.preRoll]            Freeze the runner's random reveal picks.
 * @param {() => Array<{label,urls}>} [cb.collectImageUnits]  Images (any-url-loads = ok).
 * @param {() => Array<{label,urls,blocking?}>} [cb.collectVoiceGroups]  Voices; blocking only if marked.
 * @param {boolean} [cb.imagesBlocking=true]   When false, a missing image warms-only (never blocks recording).
 * @returns {Promise<{proceed: boolean}>}
 */
export async function runPreflightCore({ preRoll, collectImageUnits, collectVoiceGroups, imagesBlocking = true } = {}) {
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { console.warn("[preflight] callback error:", e); return fallback; } };

  if (preRoll) safe(preRoll, undefined);

  const imageUnits = (collectImageUnits ? safe(collectImageUnits, []) : []) || [];
  const voiceGroups = (collectVoiceGroups ? safe(collectVoiceGroups, []) : []) || [];
  const totalUnits = imageUnits.length + voiceGroups.length;

  const ui = createProgressOverlay();
  let done = 0;
  const missing = [];

  const tick = (label) => {
    done += 1;
    const pct = totalUnits > 0 ? Math.round((done / totalUnits) * 100) : 100;
    ui.bar.style.width = pct + "%";
    ui.status.textContent = `${done} / ${totalUnits} — ${label}`;
  };

  // ── Images (required) ──
  ui.status.textContent = `Pre-loading ${imageUnits.length} images…`;
  const IMG_CHUNK = 24;
  for (let i = 0; i < imageUnits.length; i += IMG_CHUNK) {
    const chunk = imageUnits.slice(i, i + IMG_CHUNK);
    await Promise.all(chunk.map(async (unit) => {
      const urls = (unit && unit.urls) || [];
      const results = await Promise.all(urls.map(async (url) => {
        try {
          const img = await preloadImage(url);
          return !!(img && img.naturalWidth);
        } catch { return false; }
      }));
      if (imagesBlocking && urls.length && !results.some(Boolean)) {
        missing.push(`(image) ${unit.label || shortPath(urls[0])}`);
      }
      tick("images");
    }));
  }

  // ── Voices (best-effort unless group.blocking) ──
  ui.status.textContent = `Pre-loading ${voiceGroups.length} voice files…`;
  const VOICE_CHUNK = 8;
  for (let i = 0; i < voiceGroups.length; i += VOICE_CHUNK) {
    const chunk = voiceGroups.slice(i, i + VOICE_CHUNK);
    await Promise.all(chunk.map(async (group) => {
      const urls = (group && group.urls) || [];
      const results = await Promise.all(urls.map((u) => preloadAudio(u)));
      if (group && group.blocking && urls.length && !results.some(Boolean)) {
        missing.push(`(voice) ${group.label || shortPath(urls[0])}`);
      }
      tick("voices");
    }));
  }

  ui.overlay.remove();

  if (missing.length === 0) return { proceed: true };

  const proceed = await showFailureModal(missing);
  return { proceed };
}
