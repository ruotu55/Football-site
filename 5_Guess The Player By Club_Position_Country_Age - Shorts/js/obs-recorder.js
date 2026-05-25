/**
 * OBS recorder via OBS WebSocket v5 (no auth, localhost).
 *
 * Loads obs-websocket-js as an ES module from esm.sh on first connect.
 * Flow: loadObsConfig → connect → start(savedName, recordingsDir) → stop().
 */

const OBS_URL = "ws://localhost:4455";
const OBS_LIB_URL = "https://esm.sh/obs-websocket-js@5.0.6";

/** Marker class so callers can distinguish "library failed" from "OBS unreachable". */
export class ObsLibraryLoadError extends Error {
    constructor(cause) {
        super("Failed to load obs-websocket-js from " + OBS_LIB_URL);
        this.name = "ObsLibraryLoadError";
        this.cause = cause;
    }
}

let obs = null;             // OBSWebSocket instance
let recording = false;
const configByLang = new Map(); // language → { recordingsDir, obsUrl }
let lastConfig = null;      // remember most recently fetched config (for connect URL)
let ctorPromise = null;     // memoized dynamic import
let cachedPlatform = null;  // "windows" | "macos" | "linux" — only fetched once per session
let audioCleanupDone = false; // run the global-audio strip only once per session
let lastWindowValueSet = null; // last `window` value we wrote to the YouTube source
const AUDIO_WARMUP_MS = 2800;

async function getOBSWebSocketCtor() {
    if (!ctorPromise) {
        ctorPromise = import(/* @vite-ignore */ OBS_LIB_URL)
            .then((mod) => mod.default || mod.OBSWebSocket || mod)
            .catch((err) => {
                ctorPromise = null; // allow retry
                throw new ObsLibraryLoadError(err);
            });
    }
    return ctorPromise;
}

/** Fetch /__obs-config for the given language. Cached per-language. */
export async function loadObsConfig(language = "english") {
    const lang = String(language || "english").trim() || "english";
    if (configByLang.has(lang)) {
        lastConfig = configByLang.get(lang);
        return lastConfig;
    }
    const r = await fetch("/__obs-config?language=" + encodeURIComponent(lang));
    if (!r.ok) throw new Error("/__obs-config returned " + r.status);
    const data = await r.json();
    if (!data.recordingsDir) throw new Error("/__obs-config missing recordingsDir");
    configByLang.set(lang, data);
    lastConfig = data;
    return data;
}

/** Connect to OBS WebSocket. Throws ObsLibraryLoadError or a connection error. */
export async function connect() {
    if (obs) return obs;
    const Ctor = await getOBSWebSocketCtor();
    const instance = new Ctor();
    const url = (lastConfig && lastConfig.obsUrl) || OBS_URL;
    await instance.connect(url);
    obs = instance;
    obs.on("ConnectionClosed", () => {
        obs = null;
        recording = false;
    });
    return obs;
}

export function disconnect() {
    if (obs) {
        try { obs.disconnect(); } catch (_) { /* ignore */ }
    }
    obs = null;
    recording = false;
}

const WINDOW_SOURCE_NAME = "macOS Screen Capture";

/** Ensure a Window Capture source named "YouTube" exists in `sceneName` and points
 *  at the current Chrome window. Idempotent. Logs and continues on errors so a
 *  capture-source hiccup never blocks the recording itself.
 *  Returns `true` if the source was just created or its target window changed —
 *  the caller uses this to decide whether to pay the audio warmup wait. */
async function ensureChromeWindowCapture(sceneName) {
    if (!obs || !sceneName) return false;

    /* Pick the source-kind id by OBS's host platform; cached across calls. */
    if (!cachedPlatform) {
        try {
            const ver = await obs.call("GetVersion");
            cachedPlatform = (ver && ver.platform) || "windows";
        } catch (e) {
            console.warn("[obs-recorder] GetVersion failed:", e);
            cachedPlatform = "windows";
        }
    }
    if (cachedPlatform === "linux") return false;
    const kind = cachedPlatform === "macos" ? "screen_capture" : "window_capture";

    /* Skip create if the source is already in the scene. */
    let alreadyInScene = false;
    try {
        const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });
        alreadyInScene = (sceneItems || []).some((i) => i.sourceName === WINDOW_SOURCE_NAME);
    } catch (e) {
        console.warn("[obs-recorder] GetSceneItemList failed:", e);
        return false;
    }

    /* Platform-specific must-have settings — applied whether we just created the
       source or it already existed (so old sources gain capture_audio etc). */
    const baseSettings = (kind === "screen_capture")
        // macOS Screen Capture (SCK): type 1 = Window. Audio is captured automatically.
        ? { type: 1, show_cursor: false, show_hidden_windows: false, show_empty_names: false }
        // Windows window_capture: WGC method (required for capture_audio), match by title,
        // and capture_audio MUST be true — without it the source produces no sound.
        : { method: 2, priority: 2, client_area: true, cursor: true, force_sdr: false, capture_audio: true };

    /* Track whether we touched the source in a way that requires audio warmup
       (create / re-add / window change). */
    let didReinit = false;

    if (!alreadyInScene) {
        didReinit = true;
        try {
            await obs.call("CreateInput", {
                sceneName,
                inputName: WINDOW_SOURCE_NAME,
                inputKind: kind,
                inputSettings: baseSettings,
            });
        } catch (e) {
            /* Input may already exist globally (just not in this scene). Try to add it. */
            console.warn("[obs-recorder] CreateInput failed; trying CreateSceneItem:", e);
            try {
                await obs.call("CreateSceneItem", { sceneName, sourceName: WINDOW_SOURCE_NAME });
            } catch (e2) {
                console.error("[obs-recorder] CreateSceneItem failed:", e2);
                return false;
            }
        }
    }

    /* Find a Chrome window in OBS's enumeration and write it into the source's `window`. */
    let propItems = [];
    try {
        const res = await obs.call("GetInputPropertiesListPropertyItems", {
            inputName: WINDOW_SOURCE_NAME,
            propertyName: "window",
        });
        propItems = (res && res.propertyItems) || [];
    } catch (e) {
        console.warn("[obs-recorder] GetInputPropertiesListPropertyItems(window) failed:", e);
    }

    const match =
        propItems.find((i) => /Football Quiz Studio/i.test(i.itemName)) ||
        propItems.find((i) => /Chrome/i.test(i.itemName));

    if (!match) {
        console.warn("[obs-recorder] No Chrome window found in OBS property list. Open Chrome and click Play again.");
        return didReinit;
    }

    /* Only push settings when we actually need to — that's when we just created
       the source, OR the target Chrome window changed since last time. Avoiding
       redundant SetInputSettings calls also avoids needless audio re-init. */
    const windowChanged = match.itemValue !== lastWindowValueSet;
    if (didReinit || windowChanged) {
        const settings = { ...baseSettings, window: match.itemValue };
        try {
            await obs.call("SetInputSettings", {
                inputName: WINDOW_SOURCE_NAME,
                inputSettings: settings,
                overlay: true,
            });
            lastWindowValueSet = match.itemValue;
            if (windowChanged) didReinit = true;
        } catch (e) {
            console.warn("[obs-recorder] SetInputSettings failed:", e);
        }
    }

    return didReinit;
}

/** Disable the profile's global mic/desktop audio devices and remove any that
 *  are currently loaded — we only want the Window Capture's audio in the mix. */
async function removeGlobalAudioInputs() {
    /* Once-per-session is enough — the SetProfileParameter writes persist and the
       RemoveInput is idempotent. Doing it every Play click re-initializes OBS's
       audio system, which adds ~5s of silent recording at the start. */
    if (audioCleanupDone) return;
    audioCleanupDone = true;

    /* Permanent disable on the active profile (takes effect after profile/OBS reload). */
    const audioParams = [
        "DesktopDevice1", "DesktopDevice2",
        "AuxDevice1", "AuxDevice2", "AuxDevice3", "AuxDevice4",
    ];
    for (const p of audioParams) {
        try {
            await obs.call("SetProfileParameter", {
                parameterCategory: "Audio",
                parameterName: p,
                parameterValue: "disabled",
            });
        } catch (e) {
            console.warn(`[obs-recorder] Disable Audio.${p} failed:`, e);
        }
    }

    /* Immediate effect for the current session: remove (or mute as fallback) any
       global audio inputs still loaded by the profile. The Window Capture source's
       audio is left intact — we filter by kind, not name. */
    const globalAudioKinds = new Set([
        "coreaudio_input_capture", "coreaudio_output_capture",
        "wasapi_input_capture", "wasapi_output_capture",
        "wasapi_process_output_capture",
        "pulse_input_capture", "pulse_output_capture",
        "alsa_input_capture",
    ]);
    let inputs = [];
    try {
        const res = await obs.call("GetInputList");
        inputs = res.inputs || [];
    } catch (e) {
        console.warn("[obs-recorder] GetInputList failed:", e);
        return;
    }
    for (const inp of inputs) {
        if (!globalAudioKinds.has(inp.inputKind)) continue;
        if (inp.inputName === WINDOW_SOURCE_NAME) continue;
        try {
            await obs.call("RemoveInput", { inputName: inp.inputName });
        } catch (e) {
            console.warn(`[obs-recorder] RemoveInput ${inp.inputName} failed; falling back to mute:`, e);
            try {
                await obs.call("SetInputMute", { inputName: inp.inputName, inputMuted: true });
            } catch (e2) {
                console.warn(`[obs-recorder] Mute ${inp.inputName} also failed:`, e2);
            }
        }
    }
}

/** Apply OBS's "Fit to screen" transform to the source named WINDOW_SOURCE_NAME.
 *  Mirrors what Right-click → Transform → Fit to screen does. */
async function fitSourceToScreen(sceneName) {
    let video;
    try {
        video = await obs.call("GetVideoSettings");
    } catch (e) {
        console.warn("[obs-recorder] GetVideoSettings failed:", e);
        return;
    }

    /* Shorts runner: force a 9:16 portrait canvas (1080×1920). SetVideoSettings
       persists into the active profile so the recording is always 9:16. */
    const TARGET_W = 1080;
    const TARGET_H = 1920;
    if (video.baseWidth !== TARGET_W || video.baseHeight !== TARGET_H ||
        video.outputWidth !== TARGET_W || video.outputHeight !== TARGET_H) {
        try {
            await obs.call("SetVideoSettings", {
                baseWidth: TARGET_W,
                baseHeight: TARGET_H,
                outputWidth: TARGET_W,
                outputHeight: TARGET_H,
            });
            video.baseWidth = TARGET_W;
            video.baseHeight = TARGET_H;
        } catch (e) {
            console.warn("[obs-recorder] SetVideoSettings failed:", e);
        }
    }

    /* Give OBS a moment to settle source dimensions after any window change. */
    await new Promise((r) => setTimeout(r, 250));
    let items = [];
    try {
        const r = await obs.call("GetSceneItemList", { sceneName });
        items = r.sceneItems || [];
    } catch (e) {
        console.warn("[obs-recorder] GetSceneItemList(fit) failed:", e);
        return;
    }
    const item = items.find((i) => i.sourceName === WINDOW_SOURCE_NAME);
    if (!item) return;

    /* Shorts runner: fixed crop values tuned for macOS Screen Capture of the
       Chrome window with the browser left in its normal windowed state. Strips
       macOS chrome + Chrome toolbars (~241 px) from the top and the wider
       window's side padding (1245 px each) so only the 9:16 content column is
       recorded into the 1080×1920 canvas. */
    const cropLeft = 1245;
    const cropRight = 1245;
    const cropTop = 241;
    const cropBottom = 2;
    const t = item.sceneItemTransform || {};
    const srcW = Math.round(t.sourceWidth || 0);
    const srcH = Math.round(t.sourceHeight || 0);
    console.log("[obs-recorder] source", srcW, "x", srcH,
                "→ crop T/L/R/B:", cropTop, cropLeft, cropRight, cropBottom,
                "→ visible:", srcW - cropLeft - cropRight, "x", srcH - cropTop - cropBottom);

    try {
        await obs.call("SetSceneItemTransform", {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemTransform: {
                positionX: 0,
                positionY: 0,
                scaleX: 1.0,
                scaleY: 1.0,
                alignment: 5, // OBS_ALIGN_TOP | OBS_ALIGN_LEFT (matches Fit-to-screen position)
                boundsType: "OBS_BOUNDS_SCALE_INNER",
                boundsAlignment: 0, // OBS_ALIGN_CENTER
                boundsWidth: TARGET_W,
                boundsHeight: TARGET_H,
                cropLeft,
                cropRight,
                cropTop,
                cropBottom,
            },
        });
    } catch (e) {
        console.warn("[obs-recorder] SetSceneItemTransform(fit) failed:", e);
    }
}

/** Configure profile/scene collection + filename + directory, then start recording.
 *  opts: { profile, sceneCollection } — both optional; skipped if empty. */
export async function start(savedName, recordingsDir, opts = {}) {
    if (!obs) throw new Error("OBS not connected");
    if (!savedName) throw new Error("savedName is required");
    if (!recordingsDir) throw new Error("recordingsDir is required");
    if (recording) return;

    /* Profile MUST be switched before SetProfileParameter (which writes to the current profile).
       Scene collection switch can take a moment (1-2s) as OBS reloads sources, so we
       check whether we're already on the right one and skip the switch if so. */
    if (opts.profile) {
        let current = "";
        try {
            const r = await obs.call("GetProfileList");
            current = (r && r.currentProfileName) || "";
        } catch (e) { /* ignore — we'll just switch anyway */ }
        if (current !== String(opts.profile)) {
            await obs.call("SetCurrentProfile", { profileName: String(opts.profile) });
        }
    }
    if (opts.sceneCollection) {
        let current = "";
        try {
            const r = await obs.call("GetSceneCollectionList");
            current = (r && r.currentSceneCollectionName) || "";
        } catch (e) { /* ignore */ }
        if (current !== String(opts.sceneCollection)) {
            await obs.call("SetCurrentSceneCollection", { sceneCollectionName: String(opts.sceneCollection) });
        }
    }

    /* Make sure the "YouTube" Window Capture source exists in the current scene
       and is pointed at the Chrome window; fit it to the canvas; strip the
       profile's global mic/desktop audio devices so only the Chrome tab is heard. */
    let sourceReinitialized = false;
    try {
        const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
        sourceReinitialized = await ensureChromeWindowCapture(currentProgramSceneName);
        await fitSourceToScreen(currentProgramSceneName);
    } catch (e) {
        console.warn("[obs-recorder] window/fit setup skipped:", e);
    }
    try {
        await removeGlobalAudioInputs();
    } catch (e) {
        console.warn("[obs-recorder] removeGlobalAudioInputs skipped:", e);
    }
    /* Lock the Chrome capture source to unity gain (0 dB) and unmuted on every
       start, so the OBS Audio Mixer slider being accidentally dragged between
       sessions can't change the loudness of the next recording. The in-app
       BGM/voice volumes (NORMAL_VOL etc. in audio.js) are the only knobs that
       should affect output level. */
    try {
        await obs.call("SetInputVolume", {
            inputName: WINDOW_SOURCE_NAME,
            inputVolumeDb: 0,
        });
    } catch (e) {
        console.warn("[obs-recorder] SetInputVolume(0dB) skipped:", e);
    }
    try {
        await obs.call("SetInputMute", {
            inputName: WINDOW_SOURCE_NAME,
            inputMuted: false,
        });
    } catch (e) {
        console.warn("[obs-recorder] SetInputMute(false) skipped:", e);
    }

    await obs.call("SetProfileParameter", {
        parameterCategory: "Output",
        parameterName: "FilenameFormatting",
        parameterValue: String(savedName),
    });
    // TEMP (debug): don't override OBS's recording directory — let OBS save wherever it's currently configured. Restore the line below when done testing.
    // await obs.call("SetRecordDirectory", { recordDirectory: String(recordingsDir) });
    void recordingsDir;

    /* Window Capture's audio (WGC on Windows, SCK on macOS) needs a couple of
       seconds after the source is activated before its audio buffer is usable
       by the encoder — without this wait, the first 2-3 seconds of the file
       are silent. We only pay this when the source was actually just created
       or its target window changed; otherwise the audio stream stays warm
       between recordings and StartRecord is instant. */
    if (sourceReinitialized) {
        await new Promise((r) => setTimeout(r, AUDIO_WARMUP_MS));
    }

    await obs.call("StartRecord");
    recording = true;
}

/** Stop recording. Idempotent. */
export async function stop() {
    if (!obs || !recording) return;
    try {
        await obs.call("StopRecord");
    } catch (err) {
        console.warn("[obs-recorder] StopRecord failed:", err);
    } finally {
        recording = false;
    }
}

export function isRecording() {
    return recording;
}
