/**
 * recording-preflight.js
 *
 * Runs ONCE at the very start of every recording. Goal: by the time OBS starts
 * capturing, every image / voice file the recording will need is in RAM (or HTTP
 * cache for audio), and every random pick (which phrase per level, etc.) is
 * frozen. The recording then proceeds with zero network/decoding work on the
 * hot path — eliminating the "image appears 0.2s late" symptom and similar
 * mid-recording glitches.
 *
 * Flow:
 *   1. Pre-roll randomness    — call getOrAssignRevealPhrase for every level so
 *                               level.__revealPhrase is frozen.
 *   2. Collect asset URLs     — team logos, every player photo candidate, the
 *                               reveal voice for the (now frozen) phrase, plus
 *                               cheap globals (emoji images).
 *   3. Warm them              — preloadImage() (which does decode), preloadAudio()
 *                               (which fills the HTTP cache).
 *   4. Show progress UI       — overlay with progress bar + count.
 *   5. On failures, show a    — "X assets missing — Cancel / Record anyway"
 *      blocking modal           modal. User chooses.
 *
 * Returns { proceed: true } if recording should continue, { proceed: false }
 * if the user cancelled.
 */

import { appState } from "./state.js";
import { preloadImage } from "../../.Storage/shared/image-cache.js";
import { projectAssetUrlFresh, projectAssetUrl, withProjectAssetCacheBust } from "./paths.js";
import { getHeaderLogoUrlChain, playerPhotoPaths } from "./photo-helpers.js";
import { resolveHeaderTeamDisplayName } from "./pitch-render.js";
import { translateCountry } from "./i18n.js";
import {
    getOrAssignRevealPhrase,
    buildRevealVoiceCandidates,
} from "./audio.js";
import { EMOJI_IMAGES } from "./emojis.js";

// ─── Pre-roll randomness ───────────────────────────────────────────────────

/** Walk every level once so its random reveal-phrase pick gets locked into
 *  level.__revealPhrase. After this, the same phrase will play during the
 *  recording AND be the one we preload below. */
function preRollRandomness(language) {
    if (!Array.isArray(appState.levelsData)) return;
    appState.levelsData.forEach((lvl, idx) => {
        if (!lvl || typeof lvl !== "object") return;
        try { getOrAssignRevealPhrase(lvl, idx - 1, language); } catch { /* non-fatal */ }
    });
}

// ─── Asset enumeration ─────────────────────────────────────────────────────

/** Collect every image URL the recording will need.
 *
 *  Temporarily moves appState.currentLevelIndex across all levels so that
 *  playerPhotoPaths(player, displayMode) — which internally calls getState() —
 *  reads each level's own selectedEntry / squadType / currentSquad. Restored
 *  on exit, including on exceptions. */
function collectImageLoadUnits() {
    const units = [];
    const urls = new Set();
    if (!Array.isArray(appState.levelsData)) return [];

    const originalIndex = appState.currentLevelIndex;
    try {
        for (let i = 0; i < appState.levelsData.length; i++) {
            const lvl = appState.levelsData[i];
            if (!lvl || typeof lvl !== "object") continue;
            appState.currentLevelIndex = i;

            const headerLogoUrls = getHeaderLogoUrlChain(
                lvl,
                lvl.currentSquad,
                lvl.squadType,
                lvl.selectedEntry?.name,
                lvl.quizType
            ).map((url) => withProjectAssetCacheBust(url));
            if (headerLogoUrls.length) {
                units.push({ label: shortPath(headerLogoUrls[0]), urls: headerLogoUrls });
            }

            // Per-slot crest overrides (e.g., player photos using a different club crest on the front face)
            if (lvl.slotClubCrestOverrideRelPathBySlot && typeof lvl.slotClubCrestOverrideRelPathBySlot === "object") {
                for (const rel of Object.values(lvl.slotClubCrestOverrideRelPathBySlot)) {
                    if (rel) urls.add(projectAssetUrlFresh(rel));
                }
            }

            if (!lvl.currentSquad) continue;
            const players = [
                ...(lvl.currentSquad.goalkeepers || []),
                ...(lvl.currentSquad.defenders || []),
                ...(lvl.currentSquad.midfielders || []),
                ...(lvl.currentSquad.attackers || []),
            ];
            for (const player of players) {
                if (!player) continue;
                const paths = playerPhotoPaths(player, lvl.displayMode);
                for (const rel of paths) {
                    if (rel) urls.add(projectAssetUrlFresh(rel));
                }
            }
        }
    } finally {
        appState.currentLevelIndex = originalIndex;
    }

    // Global emoji sprites used by initFloatingEmojis (one of these is picked at random per spawn)
    for (const rel of EMOJI_IMAGES) {
        urls.add(projectAssetUrlFresh(rel.replace(/^\.\.\//, "")));
    }

    for (const url of urls) {
        units.push({ label: shortPath(url), urls: [url] });
    }

    return units;
}

/** Collect voice URLs based on the (now frozen) phrase pick for each level.
 *  Uses the same candidate chain as reveal playback: selected phrase only,
 *  with English fallback for that same phrase when recording in Spanish. */
function collectVoiceUrlGroups(language) {
    const groups = [];
    if (!Array.isArray(appState.levelsData)) return groups;

    appState.levelsData.forEach((lvl, idx) => {
        if (!lvl || !lvl.currentSquad) return;
        const quizType = lvl.quizType || appState.els?.inQuizType?.value || "club-by-nat";
        let teamName = "";
        try {
            teamName = String(resolveHeaderTeamDisplayName(lvl, quizType) || "").trim();
        } catch {
            teamName = "";
        }
        if (!teamName) {
            teamName = String(lvl.currentSquad.name || lvl.selectedEntry?.name || "").trim();
        }
        if (teamName && lvl.squadType === "national") {
            teamName = translateCountry(teamName);
        }
        if (!teamName) return;
        const phrase = getOrAssignRevealPhrase(lvl, idx - 1, language);

        const candidates = buildRevealVoiceCandidates(teamName, quizType, phrase, language)
            .map((url) => projectAssetUrl(url));
        if (candidates.length) {
            groups.push({ label: `Level ${idx - 1}: ${teamName} (${phrase})`, urls: candidates });
        }
    });
    return groups;
}

// ─── Loading primitives ────────────────────────────────────────────────────

/** Try to load an audio URL. Resolves to true on success, false on failure.
 *  Uses canplaythrough (browser has buffered enough to play start-to-finish
 *  without stalling) so a "success" here means the recording playback won't
 *  stall on this file. */
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
        // Fallback: some browsers don't fire canplaythrough for short clips —
        // accept loadeddata as good enough (data is buffered, just less of it).
        a.addEventListener("loadeddata", onOk, { once: true });
        a.addEventListener("error", onErr, { once: true });
        a.src = url;
        a.load();
        // Hard cap so a stuck request can't freeze preflight forever.
        setTimeout(() => finish(false), 8000);
    });
}

// ─── UI ───────────────────────────────────────────────────────────────────

function createProgressOverlay() {
    const existing = document.getElementById("recording-preflight-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "recording-preflight-overlay";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "20000",
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
        overflow: "hidden", height: "10px",
        margin: "0 0 12px",
    });
    const bar = document.createElement("div");
    Object.assign(bar.style, {
        background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
        height: "100%", width: "0%",
        transition: "width 120ms ease",
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
            position: "fixed", inset: "0", zIndex: "20001",
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
            padding: "8px 18px", borderRadius: "6px",
            cursor: "pointer", fontSize: "14px",
        });
        const proceed = document.createElement("button");
        proceed.textContent = "Record anyway";
        Object.assign(proceed.style, {
            background: "#dc2626", color: "#fff", border: "0",
            padding: "8px 18px", borderRadius: "6px",
            cursor: "pointer", fontSize: "14px",
        });
        cancel.onclick = () => { overlay.remove(); resolve(false); };
        proceed.onclick = () => { overlay.remove(); resolve(true); };
        btnRow.append(cancel, proceed);

        box.append(h, sub, list, btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

// ─── Main entry point ──────────────────────────────────────────────────────

/** Run preflight before recording starts.
 *
 *  @param {"english"|"spanish"} language  Phase language (so we preload the right voices).
 *  @returns {Promise<{proceed: boolean}>}
 */
export async function runPreflight(language = "english") {
    preRollRandomness(language);

    const imageUnits = collectImageLoadUnits();
    const voiceGroups = collectVoiceUrlGroups(language);
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

    // ── Images ─────────────────────────────────────────
    ui.status.textContent = `Pre-loading ${imageUnits.length} images…`;
    const IMG_CHUNK = 24;
    for (let i = 0; i < imageUnits.length; i += IMG_CHUNK) {
        const chunk = imageUnits.slice(i, i + IMG_CHUNK);
        await Promise.all(chunk.map(async (unit) => {
            const results = await Promise.all(unit.urls.map(async (url) => {
                try {
                    const img = await preloadImage(url);
                    return !!(img && img.naturalWidth);
                } catch {
                    return false;
                }
            }));
            if (!results.some(Boolean)) {
                missing.push(`(image) ${unit.label}`);
            }
            tick("images");
        }));
    }

    // ── Voices ─────────────────────────────────────────
    ui.status.textContent = `Pre-loading ${voiceGroups.length} voice files…`;
    const VOICE_CHUNK = 8;
    for (let i = 0; i < voiceGroups.length; i += VOICE_CHUNK) {
        const chunk = voiceGroups.slice(i, i + VOICE_CHUNK);
        await Promise.all(chunk.map(async (group) => {
            // Probe candidates in parallel; if ANY loads, the group is satisfied.
            const results = await Promise.all(group.urls.map((u) => preloadAudio(u)));
            if (!results.some(Boolean)) {
                missing.push(`(voice) ${group.label}`);
            }
            tick("voices");
        }));
    }

    ui.overlay.remove();

    if (missing.length === 0) return { proceed: true };

    const proceed = await showFailureModal(missing);
    return { proceed };
}

/** Trim absolute URLs to something readable in the failure list. */
function shortPath(url) {
    try {
        const u = new URL(url);
        // Strip the project root prefix so the path is relative + readable.
        const path = decodeURIComponent(u.pathname);
        const idx = path.indexOf("/Football Channel/");
        return idx >= 0 ? path.slice(idx + "/Football Channel/".length) : path;
    } catch {
        return String(url);
    }
}
