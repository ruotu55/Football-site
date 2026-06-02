/* BGM crossfade PREVIEW tool (Voice tab).
 *
 * Lets you pick two Ringhton tracks and hear exactly how the live song→song
 * crossfade sounds: it plays the LAST ~5s of song 1, then crossfades into song 2
 * and plays its FIRST ~5s. The crossfade math here is a faithful copy of
 * audio.js#queueNextBgm (same BGM_CROSSFADE_MS, same trigger threshold, same
 * 30-step linear fade), so what you hear is what the recording does.
 *
 * It uses its OWN <audio> elements and never touches the live `bgMusic`, so
 * previewing is safe while the runner is otherwise idle.
 */

import { BGM_PLAYLIST, BGM_CROSSFADE_MS, BGM_CROSSFADE_BUFFER_S } from "./audio.js";

const PREVIEW_VOLUME = 1.0;          // matches NORMAL_VOL (the volume songs crossfade at)
const PREVIEW_TAIL_S = 5;            // last N seconds of song 1
const PREVIEW_HEAD_S = 5;            // first N seconds of song 2
const CROSSFADE_STEPS = 30;          // identical to queueNextBgm

/* One preview runs at a time. Holds everything we need to tear down cleanly. */
let active = null;

function trackLabel(path) {
  return String(path || "").split("/").pop().replace(/\.mp3$/i, "");
}

function stopActivePreview() {
  if (!active) return;
  const a = active;
  active = null;
  clearInterval(a.crossfadeInterval);
  clearTimeout(a.headStopTimeout);
  for (const audio of [a.outgoing, a.incoming]) {
    if (!audio) continue;
    try { audio.pause(); } catch {}
    audio.onended = null;
    audio.ontimeupdate = null;
    audio.src = "";
  }
}

function onceMetadata(audio) {
  return new Promise((resolve) => {
    if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) {
      resolve();
      return;
    }
    const done = () => { audio.removeEventListener("loadedmetadata", done); resolve(); };
    audio.addEventListener("loadedmetadata", done);
    // Safety: don't hang forever if metadata never fires.
    setTimeout(done, 4000);
  });
}

async function playPreview(path1, path2, setStatus) {
  stopActivePreview();

  const outgoing = new Audio(path1);
  outgoing.preload = "auto";
  outgoing.volume = PREVIEW_VOLUME;
  const session = {
    outgoing, incoming: null, crossfadeInterval: null, headStopTimeout: null,
    crossfading: false, armed: false, effectiveStart: 0,
  };
  active = session;

  setStatus(`Loading "${trackLabel(path1)}"…`);
  await onceMetadata(outgoing);
  if (active !== session) return; // a newer preview/stop superseded us

  const dur = outgoing.duration;
  const hasFiniteDur = Number.isFinite(dur) && dur > 0;

  // Best-effort: seek to the real tail so you hear the actual song *ending*.
  // The dev server doesn't support HTTP Range, so this may be ignored — that's
  // fine, the elapsed-time trigger below guarantees the crossfade still fires.
  if (hasFiniteDur && dur > PREVIEW_TAIL_S + 1) {
    try { outgoing.currentTime = Math.max(0, dur - PREVIEW_TAIL_S); } catch {}
  }

  const threshold = (BGM_CROSSFADE_MS / 1000) + BGM_CROSSFADE_BUFFER_S;
  outgoing.ontimeupdate = () => {
    if (active !== session || session.crossfading || !session.armed) return;
    const ct = outgoing.currentTime;
    const elapsed = ct - session.effectiveStart;
    const timeLeft = (Number.isFinite(outgoing.duration) && outgoing.duration > 0)
      ? outgoing.duration - ct
      : Infinity;
    // Crossfade at the live near-end point (if seeking worked) OR after we've
    // simply played PREVIEW_TAIL_S seconds (robust fallback when seeking can't).
    if (timeLeft <= threshold || elapsed >= PREVIEW_TAIL_S) {
      startCrossfade(session, path2, setStatus);
    }
  };

  setStatus(`Playing "${trackLabel(path1)}"…`);
  try {
    await outgoing.play();
  } catch (err) {
    setStatus(`Couldn't play song 1: ${err?.message || err}`);
    stopActivePreview();
    return;
  }

  // Capture the real start position AFTER any seek has had a chance to land,
  // then arm the trigger (elapsed is measured from here).
  setTimeout(() => {
    if (active !== session) return;
    session.effectiveStart = outgoing.currentTime;
    session.armed = true;
    const seekedToTail = hasFiniteDur && outgoing.currentTime > dur - PREVIEW_TAIL_S - 1;
    setStatus(seekedToTail
      ? `Playing last ${PREVIEW_TAIL_S}s of "${trackLabel(path1)}"…`
      : `Playing ${PREVIEW_TAIL_S}s of "${trackLabel(path1)}" (server can't seek to the end)…`);
  }, 450);
}

function startCrossfade(session, path2, setStatus) {
  if (session.crossfading) return;
  session.crossfading = true;
  const outgoing = session.outgoing;
  const outgoingStartVolume = Math.max(0, Math.min(1, outgoing.volume));

  const incoming = new Audio(path2);
  incoming.preload = "auto";
  incoming.volume = 0;
  try { incoming.currentTime = 0; } catch {}
  session.incoming = incoming;

  setStatus(`Crossfading → "${trackLabel(path2)}" (${(BGM_CROSSFADE_MS / 1000).toFixed(1)}s)…`);

  const stepTime = Math.max(10, BGM_CROSSFADE_MS / CROSSFADE_STEPS);
  let step = 0;

  incoming.play().catch((err) => {
    setStatus(`Couldn't play song 2: ${err?.message || err}`);
    stopActivePreview();
  });

  session.crossfadeInterval = setInterval(() => {
    if (active !== session) { clearInterval(session.crossfadeInterval); return; }
    step++;
    const t = step / CROSSFADE_STEPS;
    outgoing.volume = Math.max(0, outgoingStartVolume * (1 - t));
    incoming.volume = Math.max(0, Math.min(1, outgoingStartVolume * t));

    if (step >= CROSSFADE_STEPS) {
      clearInterval(session.crossfadeInterval);
      session.crossfadeInterval = null;
      try { outgoing.pause(); } catch {}
      outgoing.volume = outgoingStartVolume;
      incoming.volume = outgoingStartVolume;
      setStatus(`Playing first ${PREVIEW_HEAD_S}s of "${trackLabel(path2)}"…`);

      // Stop once song 2 has played its first PREVIEW_HEAD_S seconds.
      incoming.ontimeupdate = () => {
        if (active === session && incoming.currentTime >= PREVIEW_HEAD_S) {
          setStatus("Done.");
          stopActivePreview();
        }
      };
      // Fallback stop in case timeupdate is sparse near the cutoff.
      const remainMs = Math.max(0, (PREVIEW_HEAD_S - incoming.currentTime) * 1000) + 300;
      session.headStopTimeout = setTimeout(() => {
        if (active === session) { setStatus("Done."); stopActivePreview(); }
      }, remainMs);
    }
  }, stepTime);
}

/* Build the Voice-tab section. Returns a DOM node ready to append. Inline styles
   so it renders correctly regardless of CSS cache state. */
export function buildBgmCrossfadePreviewSection() {
  // A fresh build supersedes any previous one — kill a running preview.
  stopActivePreview();

  const wrap = document.createElement("details");
  wrap.className = "voice-tab-section bgm-crossfade-preview";
  wrap.open = true;
  wrap.style.cssText = "margin:10px 0;border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:8px 10px;background:rgba(0,0,0,0.18);";

  const summary = document.createElement("summary");
  summary.className = "voice-tab-section__title";
  summary.textContent = "🎚️ Crossfade preview (BGM)";
  summary.style.cssText = "cursor:pointer;font-weight:800;";
  wrap.appendChild(summary);

  const hint = document.createElement("div");
  hint.textContent = `Plays the last ${PREVIEW_TAIL_S}s of song 1 → crossfades into song 2 (first ${PREVIEW_HEAD_S}s), using the live ${(BGM_CROSSFADE_MS / 1000).toFixed(1)}s crossfade.`;
  hint.style.cssText = "font-size:12px;opacity:0.75;margin:6px 0 8px;";
  wrap.appendChild(hint);

  const makeSelect = (labelText, defaultIndex) => {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0;font-size:13px;";
    const span = document.createElement("span");
    span.textContent = labelText;
    span.style.cssText = "min-width:62px;opacity:0.85;";
    const sel = document.createElement("select");
    sel.style.cssText = "flex:1;min-width:0;padding:4px 6px;border-radius:6px;background:#1b1f27;color:#fff;border:1px solid rgba(255,255,255,0.2);";
    BGM_PLAYLIST.forEach((p, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = trackLabel(p);
      sel.appendChild(o);
    });
    sel.value = String(Math.min(defaultIndex, BGM_PLAYLIST.length - 1));
    row.appendChild(span);
    row.appendChild(sel);
    return { row, sel };
  };

  const s1 = makeSelect("Song 1", 0);
  const s2 = makeSelect("Song 2", 1);
  wrap.appendChild(s1.row);
  wrap.appendChild(s2.row);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;margin-top:8px;align-items:center;";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.textContent = "▶ Play crossfade";
  playBtn.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid rgba(91,141,239,0.85);background:rgba(91,141,239,0.22);color:#fff;font-weight:700;cursor:pointer;";

  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.textContent = "■ Stop";
  stopBtn.style.cssText = "padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.25);color:#fff;cursor:pointer;";

  const status = document.createElement("span");
  status.className = "bgm-crossfade-preview__status";
  status.style.cssText = "font-size:12px;opacity:0.8;margin-left:4px;";
  status.textContent = "Idle.";
  const setStatus = (t) => { status.textContent = t; };

  playBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const i1 = Number(s1.sel.value) || 0;
    const i2 = Number(s2.sel.value) || 0;
    playPreview(BGM_PLAYLIST[i1], BGM_PLAYLIST[i2], setStatus);
  });
  stopBtn.addEventListener("click", (e) => {
    e.preventDefault();
    stopActivePreview();
    setStatus("Stopped.");
  });

  btnRow.appendChild(playBtn);
  btnRow.appendChild(stopBtn);
  btnRow.appendChild(status);
  wrap.appendChild(btnRow);

  return wrap;
}
