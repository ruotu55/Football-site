/**
 * Glue between OBS recording and fullscreen lifecycle.
 *
 * - startRecordingAndFullscreen: connects to OBS, enters fullscreen, starts recording.
 *   Rolls everything back on any failure. Returns true on success, false otherwise.
 * - stopRecordingAndExitFullscreen: idempotent teardown (stop, exit fullscreen, disconnect).
 */

import * as obsRecorder from "./obs-recorder.js";
import { ObsLibraryLoadError } from "./obs-recorder.js";
import { appState } from "./state.js";
import { runPreflight } from "./recording-preflight.js";

function showRecordingError(message) {
    const existing = document.getElementById("recording-error-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "recording-error-overlay";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "10000",
        background: "rgba(0,0,0,0.7)", display: "flex",
        alignItems: "center", justifyContent: "center",
    });
    const box = document.createElement("div");
    Object.assign(box.style, {
        background: "#1c1c1c", color: "#fff", padding: "24px 28px",
        borderRadius: "12px", maxWidth: "420px", textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: "system-ui, sans-serif",
    });
    const h = document.createElement("h2");
    h.textContent = "Recording";
    h.style.margin = "0 0 12px";
    h.style.fontSize = "18px";
    const p = document.createElement("p");
    p.textContent = message;
    p.style.margin = "0 0 16px";
    const btn = document.createElement("button");
    btn.textContent = "OK";
    Object.assign(btn.style, {
        background: "#3b82f6", color: "#fff", border: "0",
        padding: "8px 20px", borderRadius: "6px", cursor: "pointer",
        fontSize: "14px",
    });
    btn.onclick = () => overlay.remove();
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

async function enterFullscreen() {
    // Regular runner: do not enter fullscreen — record the windowed Chrome.
    return;
}

function exitFullscreenSafe() {
    /* During the EN→ES double-recording handoff (between phase 1 and phase 2),
       keep fullscreen on — browsers won't grant a fresh requestFullscreen
       without a user gesture, and we don't have one. */
    if (appState?.doubleRecording?.phase === 1) return;
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
}

/**
 * Returns true if recording + fullscreen succeeded, false (with error modal) otherwise.
 * `savedName` must be non-empty — caller validates before calling.
 */
export async function startRecordingAndFullscreen(savedName, language = "english") {
    /* Step 1: fail-fast on the local helper server so a broken setup doesn't
       make the user sit through preflight first. */
    let config;
    try {
        config = await obsRecorder.loadObsConfig(language);
    } catch (err) {
        console.error("[recording-flow] /__obs-config failed:", err);
        showRecordingError("Cannot reach the local server (/__obs-config).");
        return false;
    }

    /* Step 2: preflight — freeze every random pick (reveal phrases) and warm
       every image + voice the recording will need. Runs BEFORE OBS connect so
       we never burn recording time on warmup, and a cancelled preflight leaves
       OBS untouched. */
    try {
        const pre = await runPreflight(language);
        if (!pre.proceed) {
            console.info("[recording-flow] preflight cancelled by user");
            return false;
        }
    } catch (err) {
        console.error("[recording-flow] preflight error:", err);
        // Non-fatal: log and continue. We'd rather record with possible lag than
        // block the user when preflight itself has a bug.
    }

    try {
        await obsRecorder.connect();
    } catch (err) {
        console.error("[recording-flow] OBS connect failed:", err);
        if (err instanceof ObsLibraryLoadError) {
            showRecordingError("Could not load the obs-websocket-js library from the internet (esm.sh). Check the network connection.\n\nSee the browser Console for the underlying error.");
        } else {
            showRecordingError("OBS is not running or its WebSocket server is off.\n\nEnable it in OBS → Tools → WebSocket Server Settings (port 4455, no auth).");
        }
        return false;
    }

    let enteredFullscreen = false;
    try {
        await enterFullscreen();
        enteredFullscreen = !!document.fullscreenElement;
    } catch (err) {
        console.warn("[recording-flow] requestFullscreen failed:", err);
        obsRecorder.disconnect();
        showRecordingError("The browser blocked fullscreen. Click Play Video again — sometimes a second click is needed.");
        return false;
    }

    try {
        await obsRecorder.start(savedName, config.recordingsDir, {
            profile: config.profile,
            sceneCollection: config.sceneCollection,
        });
    } catch (err) {
        console.error("[recording-flow] OBS start failed:", err);
        if (enteredFullscreen) exitFullscreenSafe();
        obsRecorder.disconnect();
        const detail = err && err.message ? "\n\n" + err.message : "";
        showRecordingError("OBS rejected the recording start. Check the profile/scene-collection names exist in OBS." + detail);
        return false;
    }

    return true;
}

/** Idempotent teardown. Safe to call from anywhere (outro, mid-video abort, error path). */
export async function stopRecordingAndExitFullscreen() {
    try {
        await obsRecorder.stop();
    } catch (err) {
        console.warn("[recording-flow] stop error:", err);
    }
    exitFullscreenSafe();
    obsRecorder.disconnect();
}
