/**
 * Save Video Status — shared controller.
 *
 * "Save Video Status" freezes the ENTIRE on-screen video configuration of the
 * currently-loaded save (Adjust Picture offsets, video mode, team +/x, +/- size
 * & year nudges, photos, formation, custom names, voice picks — everything
 * captureCurrentScriptObject() captures) onto its calendar block. When frozen,
 * loading that save (via the calendar OR the controls) applies the snapshot
 * verbatim instead of rebuilding the lineup from the teams list. Toggling OFF
 * reverts to the normal rebuild. The toggle is per-save.
 *
 * The block field is `videoStatus = { enabled, savedAt, frozenScript }`, persisted
 * via the shared recording-status op `setVideoStatus`.
 *
 * Used identically by every runner's recording-queue.js: the heavy lifting
 * (capture/apply) already lives in saved-scripts.js per runner; this module only
 * owns the button, the toggle, the styling/placement, and the "is it frozen?" test.
 */

/** Returns the frozen full-state script for a block if its video status is
 *  enabled and usable, otherwise null. */
export function frozenScriptForBlock(block) {
  const vs = block && block.videoStatus;
  if (
    vs && vs.enabled && vs.frozenScript && typeof vs.frozenScript === "object" &&
    Array.isArray(vs.frozenScript.levels) && vs.frozenScript.levels.length > 0
  ) {
    return vs.frozenScript;
  }
  return null;
}

export function isVideoStatusEnabled(block) {
  return !!(
    block && block.videoStatus && block.videoStatus.enabled &&
    block.videoStatus.frozenScript
  );
}

function injectStylesOnce() {
  if (document.getElementById("__video_status_style")) return;
  const st = document.createElement("style");
  st.id = "__video_status_style";
  st.textContent =
    ".save-video-status-btn{box-sizing:border-box;white-space:normal;line-height:1.05;" +
    "font-size:0.55rem;letter-spacing:0.01em;text-align:center;padding:0.4rem 0.5rem;" +
    "background:#7c2d12;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,0.5),0 2px 5px rgba(124,45,18,0.4);}" +
    ".save-video-status-btn:hover{background:#9a3412;}" +
    ".save-video-status-btn.video-status-on{background:#1f8f4d;color:#fff;" +
    "box-shadow:0 6px 20px rgba(0,0,0,0.5),0 2px 5px rgba(31,143,77,0.5);}" +
    ".save-video-status-btn:disabled{opacity:0.45;cursor:not-allowed;}" +
    // Never let it show up inside a recording/playback.
    "body.play-video-active .save-video-status-btn{display:none!important;}" +
    ".save-video-status-btn[hidden]{display:none;}";
  document.head.appendChild(st);
}

/** Pin the button directly under the Record Video FAB, matching its width, so it
 *  lands consistently regardless of each runner's fixed FAB layout. */
function positionUnderRecord(button) {
  const rec = document.getElementById("record-video-btn");
  if (!rec) return;
  const r = rec.getBoundingClientRect();
  if (!r.width) return;
  button.style.position = "fixed";
  button.style.top = (r.bottom + 8) + "px";
  button.style.left = r.left + "px";
  button.style.width = r.width + "px";
  button.style.zIndex = "600";
}

/**
 * Wire the Save Video Status button.
 * opts:
 *  - button:        the #save-video-status-btn element
 *  - getActiveKey:  () => active block key or null
 *  - getBlock:      (key) => block object or null
 *  - getActiveName: () => current save name (for the snapshot)
 *  - captureScript: (name) => full snapshot (captureCurrentScriptObject)
 *  - persist:       async (key, videoStatus|null) => void   (server write)
 * Returns { refresh } — call after every load/render so the label tracks state.
 */
export function wireVideoStatusButton(opts) {
  const button = opts && opts.button;
  if (!button) return { refresh() {} };
  injectStylesOnce();

  function refresh() {
    positionUnderRecord(button);
    const key = opts.getActiveKey();
    const block = key ? opts.getBlock(key) : null;
    if (!key || !block) {
      button.disabled = true;
      button.classList.remove("video-status-on");
      button.textContent = "Save Video Status";
      button.title = "Load a save first, then freeze its video status.";
      return;
    }
    button.disabled = false;
    const on = isVideoStatusEnabled(block);
    button.classList.toggle("video-status-on", on);
    button.textContent = on ? "Video Status: ON ✓" : "Save Video Status";
    button.title = on
      ? "This save's full video layout is frozen — loading it restores exactly this. Click to turn OFF."
      : "Freeze the current on-screen video layout so this save always loads exactly like this.";
  }

  let busy = false;
  button.addEventListener("click", async () => {
    if (busy) return;
    const key = opts.getActiveKey();
    const block = key ? opts.getBlock(key) : null;
    if (!key || !block) {
      alert("Load a save first, then click Save Video Status.");
      return;
    }
    // Removing an existing freeze is destructive — confirm first (matches the
    // "remove the saved team" prompt style).
    if (isVideoStatusEnabled(block) &&
        !confirm("Are you sure you want to remove the saved video status?")) {
      return;
    }
    busy = true;
    button.disabled = true;
    try {
      if (isVideoStatusEnabled(block)) {
        block.videoStatus = { ...(block.videoStatus || {}), enabled: false };
        await opts.persist(key, block.videoStatus);
      } else {
        button.textContent = "Saving…";
        const name = (opts.getActiveName && opts.getActiveName()) || (block.name || "Recording");
        const frozenScript = opts.captureScript(name);
        if (!frozenScript || !Array.isArray(frozenScript.levels) || !frozenScript.levels.length) {
          throw new Error("Nothing to capture — load and set up the save first.");
        }
        block.videoStatus = { enabled: true, savedAt: Date.now(), frozenScript };
        await opts.persist(key, block.videoStatus);
      }
    } catch (e) {
      console.error("[video-status] toggle failed:", e);
      alert("Couldn't save video status: " + (e && e.message ? e.message : e));
    } finally {
      busy = false;
      button.disabled = false;
      refresh();
    }
  });

  window.addEventListener("resize", () => positionUnderRecord(button));
  return { refresh };
}
