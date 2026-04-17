import {
    appState,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
    DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
    getDefaultPlayerPictureValues,
    getState,
    initLevels,
} from "./state.js";
import { migratePlayerImages, projectAssetUrl } from "./paths.js";
import { getClubLogoOtherTeamsUrl } from "./photo-helpers.js";
import { switchLevel } from "./levels.js";
import {
    renderHeader,
    renderCareer,
    cleanCareerHistory,
    syncCareerSlotControlsVisibility,
    applyCareerPictureModeToActiveState,
    persistCareerPictureModeFromActiveState,
    preloadCareerAssets,
} from "./pitch-render.js";
import { loadSquadJson } from "./teams.js";
import { startVideoFlow, stopVideoFlow } from "./video.js";
import { initFloatingEmojis } from "./emojis.js";
import { applyCustomSelects } from "./custom-selects.js";
import { initLevelControls } from "./level-control.js";
import { initSavedScripts, renderSavedScripts } from "./saved-scripts.js";
import { initTransitionsUI } from "./transitions.js";
import {
    isProdMode,
    toggleProdMode,
    runProdValidation,
    showValidationModal,
    markBackgroundColorConfirmed,
    markBackgroundEffectConfirmed,
} from "./prod-validation.js";
import { bindDomElements } from "./dom-bindings.js";
import { wireMainTabs, wireControlPanelToggle } from "./ui-panels.js";
import { initOptionalBootstrapUtilities } from "./bootstrap-hybrid.js";
import { initSharedBackgroundTheme } from "../../.Storage/shared/backgrounds/background-theme.js";
import {
    clearCareerPictureFavorite,
    hasCareerPictureFavorite,
    loadCareerPictureFavoritesFromFile,
    saveCareerPictureFavorite,
} from "./career-size-favorites.js";
import {
    applyDevLiveReloadControls,
    captureDevLiveReloadSnapshot,
    consumeDevLiveReloadSnapshot,
    getInitialLevelCountFromSnapshot,
    restoreDevLiveReloadState,
} from "./dev-live-reload-state.js";

const PERFORMANCE_MODE_SESSION_KEY = "lineups:performance-mode";
const SESSION_JSON_CACHE_PREFIX = "lineups:session-json:v1:";
const PERFORMANCE_MODE_QUERY_VALUES = new Set(["1", "true", "on", "yes"]);
const PERFORMANCE_MODE_QUERY_OFF_VALUES = new Set(["0", "false", "off", "no"]);

function shouldBypassSessionJsonCache() {
    return !!window.__RUNNER_LIVE_RELOAD__;
}

function applyPerformanceModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get("perf") || "").trim().toLowerCase();
    let enabled;
    if (PERFORMANCE_MODE_QUERY_VALUES.has(raw)) {
        enabled = true;
    } else if (PERFORMANCE_MODE_QUERY_OFF_VALUES.has(raw)) {
        enabled = false;
    } else {
        enabled = sessionStorage.getItem(PERFORMANCE_MODE_SESSION_KEY) === "1";
    }
    sessionStorage.setItem(PERFORMANCE_MODE_SESSION_KEY, enabled ? "1" : "0");
    document.body.classList.toggle("performance-mode", enabled);
    return enabled;
}

async function fetchJsonSessionCached(path, fallbackValue = null) {
    const cacheKey = `${SESSION_JSON_CACHE_PREFIX}${path}`;
    const bypass = shouldBypassSessionJsonCache();
    if (!bypass) {
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch {
            // Ignore malformed session cache and fetch fresh copy.
        }
    }
    try {
        const res = await fetch(projectAssetUrl(path), { cache: "default" });
        const data = await res.json();
        if (!bypass) {
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(data));
            } catch {
                // Ignore quota/storage failures.
            }
        }
        return data;
    } catch (err) {
        if (fallbackValue !== null) return fallbackValue;
        throw err;
    }
}

// ==========================================
// SHARED UI HELPERS (Exported for Sub-Modules)
// ==========================================

const QUIZ_TYPE_VOICE_FILES = {
    "player-by-career-stats": "../.Storage/Voices/Game name/Guess the football player by career stats !!!.mp3",
    "player-by-career": "../.Storage/Voices/Game name/Guess the football player by career path !!!.mp3",
};
// ==========================================
// ENDING TYPE VOICE CONTROLS
// ==========================================
const ENDING_TYPE_TEXTS = {
    "think-you-know": "THINK YOU KNOW THE ANSWER?",
    "how-many": "HOW MANY DID YOU GET?",
};
const ENDING_VOICE_STATUS_ENDPOINT = "__ending-voice/status";
const ENDING_VOICE_GENERATE_ENDPOINT = "__ending-voice/generate";
const ENDING_VOICE_DELETE_ENDPOINT = "__ending-voice/delete";
const ENDING_VOICE_FIXED_VOICE = "en-US-AndrewNeural";
const endingTypeVoiceStatusByType = {};
let endingTypePreviewAudioEl = null;
let endingTypePreviewAudioSrc = "";

function getEndingTypeBaseLabel(optionEl) {
    const savedBase = optionEl?.dataset?.baseLabel;
    if (savedBase) return savedBase;
    return String(optionEl?.textContent || "").trim();
}

function setEndingTypeOptionLabel(optionEl, hasVoice) {
    if (!optionEl) return;
    const baseLabel = getEndingTypeBaseLabel(optionEl);
    optionEl.dataset.baseLabel = baseLabel;
    endingTypeVoiceStatusByType[optionEl.value] = !!hasVoice;
    optionEl.textContent = baseLabel;
}

function stopEndingTypeVoicePreview() {
    if (!endingTypePreviewAudioEl) return;
    endingTypePreviewAudioEl.pause();
    endingTypePreviewAudioEl.currentTime = 0;
    endingTypePreviewAudioEl = null;
    endingTypePreviewAudioSrc = "";
}

function playEndingTypeVoicePreview(src) {
    const clipSrc = String(src || "").trim();
    if (!clipSrc) return;
    stopEndingTypeVoicePreview();
    const audio = new Audio(clipSrc);
    endingTypePreviewAudioEl = audio;
    endingTypePreviewAudioSrc = clipSrc;
    audio.addEventListener("ended", () => {
        if (endingTypePreviewAudioEl === audio) {
            endingTypePreviewAudioEl = null;
            endingTypePreviewAudioSrc = "";
        }
    }, { once: true });
    audio.play().catch(() => {});
}

function setEndingTypeVoiceBusy(endingType, isBusy) {
    const volBtns = document.querySelectorAll(`button[data-ending-type-voice-vol="${endingType}"]`);
    const delBtns = document.querySelectorAll(`button[data-ending-type-voice-del="${endingType}"]`);
    volBtns.forEach((volBtn) => {
        volBtn.disabled = !!isBusy;
        volBtn.textContent = isBusy ? "..." : "Vol";
    });
    delBtns.forEach((delBtn) => {
        delBtn.disabled = !!isBusy || !endingTypeVoiceStatusByType[endingType];
    });
}

async function fetchEndingTypeVoiceStatus(endingType) {
    const params = new URLSearchParams({ endingType: String(endingType || "") });
    const res = await fetch(`${endpointUrl(ENDING_VOICE_STATUS_ENDPOINT)}?${params.toString()}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Status failed (${res.status})`);
    const exists = !!body.exists;
    endingTypeVoiceStatusByType[endingType] = exists;
    return { exists, src: String(body?.src || "") };
}

async function ensureEndingTypeVoiceThenPlay(endingType) {
    setEndingTypeVoiceBusy(endingType, true);
    try {
        const status = await fetchEndingTypeVoiceStatus(endingType);
        let previewSrc = status.src;
        if (!status.exists) {
            const res = await fetch(endpointUrl(ENDING_VOICE_GENERATE_ENDPOINT), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    endingType,
                    voice: ENDING_VOICE_FIXED_VOICE,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
            endingTypeVoiceStatusByType[endingType] = true;
            previewSrc = String(body?.src || "");
        }
        renderEndingTypeVoiceStatusPanel();
        playEndingTypeVoicePreview(previewSrc);
    } catch (err) {
        alert(`Could not generate ending voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setEndingTypeVoiceBusy(endingType, false);
    }
}

async function resolveEndingVoiceSrcForPlayback(endingType) {
    const status = await fetchEndingTypeVoiceStatus(endingType).catch(() => ({ exists: false, src: "" }));
    if (status.exists && status.src) {
        return String(status.src || "");
    }
    const res = await fetch(endpointUrl(ENDING_VOICE_GENERATE_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            endingType,
            voice: ENDING_VOICE_FIXED_VOICE,
        }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
    endingTypeVoiceStatusByType[endingType] = true;
    return String(body?.src || "");
}

window.__resolveEndingVoiceSrc = resolveEndingVoiceSrcForPlayback;

async function deleteEndingTypeVoice(endingType) {
    if (!endingTypeVoiceStatusByType[endingType]) return;
    setEndingTypeVoiceBusy(endingType, true);
    try {
        stopEndingTypeVoicePreview();
        const res = await fetch(endpointUrl(ENDING_VOICE_DELETE_ENDPOINT), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endingType }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
        endingTypeVoiceStatusByType[endingType] = false;
        renderEndingTypeVoiceStatusPanel();
    } catch (err) {
        alert(`Could not delete ending voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setEndingTypeVoiceBusy(endingType, false);
    }
}

function renderEndingTypeVoiceStatusPanel() {
    const endingTypeSelect = appState?.els?.inEndingType;
    if (!endingTypeSelect) return;
    let panel = document.getElementById("ending-type-voice-status");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "ending-type-voice-status";
        panel.style.marginTop = "0.4rem";
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.gap = "0.25rem";
        panel.style.fontSize = "0.72rem";
        panel.style.color = "rgba(255,255,255,0.9)";
        const anchor = endingTypeSelect.nextElementSibling || endingTypeSelect;
        anchor.insertAdjacentElement("afterend", panel);
    }
    panel.replaceChildren();

    Array.from(endingTypeSelect.options || []).filter((opt) => opt.value && !opt.disabled).forEach((opt) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.gap = "0.5rem";
        row.style.padding = "0.15rem 0";

        const text = document.createElement("span");
        text.textContent = getEndingTypeBaseLabel(opt);
        text.style.opacity = "0.92";

        const controls = document.createElement("div");
        controls.style.display = "inline-flex";
        controls.style.alignItems = "center";
        controls.style.gap = "0.3rem";

        const volBtn = document.createElement("button");
        volBtn.type = "button";
        volBtn.textContent = "Vol";
        volBtn.dataset.endingTypeVoiceVol = opt.value;
        volBtn.style.padding = "0.12rem 0.4rem";
        volBtn.style.borderRadius = "999px";
        volBtn.style.border = "1px solid rgba(255,255,255,0.35)";
        volBtn.style.background = "rgba(255,255,255,0.08)";
        volBtn.style.color = "#fff";
        volBtn.style.fontSize = "0.68rem";
        volBtn.style.fontWeight = "700";
        volBtn.onclick = () => { void ensureEndingTypeVoiceThenPlay(opt.value); };

        const xBtn = document.createElement("button");
        xBtn.type = "button";
        xBtn.textContent = "X";
        xBtn.dataset.endingTypeVoiceDel = opt.value;
        xBtn.style.padding = "0.12rem 0.45rem";
        xBtn.style.borderRadius = "999px";
        xBtn.style.border = "1px solid rgba(239,68,68,0.7)";
        xBtn.style.background = "rgba(239,68,68,0.2)";
        xBtn.style.color = "#fff";
        xBtn.style.fontSize = "0.68rem";
        xBtn.style.fontWeight = "800";
        xBtn.disabled = !endingTypeVoiceStatusByType[opt.value];
        xBtn.onclick = () => { void deleteEndingTypeVoice(opt.value); };

        controls.appendChild(volBtn);
        controls.appendChild(xBtn);
        row.appendChild(text);
        row.appendChild(controls);
        panel.appendChild(row);
    });
}

async function refreshEndingTypeVoiceLabels() {
    const { els } = appState;
    const endingTypeSelect = els?.inEndingType;
    if (!endingTypeSelect) return;
    const options = Array.from(endingTypeSelect.options || []).filter((opt) => opt.value && !opt.disabled);
    if (options.length === 0) return;
    await Promise.all(
        options.map(async (opt) => {
            let hasVoice = false;
            try {
                const status = await fetchEndingTypeVoiceStatus(opt.value);
                hasVoice = !!status.exists;
            } catch {
                hasVoice = false;
            }
            setEndingTypeOptionLabel(opt, hasVoice);
        }),
    );
    applyCustomSelects();
    renderEndingTypeVoiceStatusPanel();
}

function getSelectedEndingType() {
    return String(appState?.els?.inEndingType?.value || "think-you-know");
}

function updateOutroText() {
    const endingType = getSelectedEndingType();
    const outroTitle = document.getElementById("outro-title");
    const outroSubtitle = document.getElementById("outro-subtitle");
    if (outroTitle) {
        outroTitle.textContent = ENDING_TYPE_TEXTS[endingType] || ENDING_TYPE_TEXTS["think-you-know"];
    }
    if (outroSubtitle) {
        outroSubtitle.textContent = "LET US KNOW IN THE COMMENTS!";
    }
}

window.__getSelectedEndingType = getSelectedEndingType;

const QUIZ_TITLE_VOICE_STATUS_ENDPOINT = "__quiz-title-voice/status";
const QUIZ_TITLE_VOICE_GENERATE_ENDPOINT = "__quiz-title-voice/generate";
const QUIZ_TITLE_VOICE_DELETE_ENDPOINT = "__quiz-title-voice/delete";
const QUIZ_TITLE_FIXED_VOICE = "en-US-AndrewNeural";
const quizTypeVoiceStatusByType = {};
let quizTypePreviewAudioEl = null;
let quizTypePreviewAudioSrc = "";

function getQuizTypeBaseLabel(optionEl) {
    const savedBase = optionEl?.dataset?.baseLabel;
    if (savedBase) return savedBase;
    const current = String(optionEl?.textContent || "").trim();
    return current.replace(/\s+\[(?:VOL|X)\]$/i, "").trim();
}

function setQuizTypeOptionLabel(optionEl, hasVoice) {
    if (!optionEl) return;
    const baseLabel = getQuizTypeBaseLabel(optionEl);
    optionEl.dataset.baseLabel = baseLabel;
    quizTypeVoiceStatusByType[optionEl.value] = !!hasVoice;
    optionEl.textContent = baseLabel;
}

function normalizeVoiceSrc(src) {
    try {
        return new URL(String(src || ""), window.location.href).href;
    } catch {
        return String(src || "").trim();
    }
}

function stopQuizTypeVoicePreview() {
    if (!quizTypePreviewAudioEl) return;
    quizTypePreviewAudioEl.pause();
    quizTypePreviewAudioEl.currentTime = 0;
    quizTypePreviewAudioEl = null;
    quizTypePreviewAudioSrc = "";
}

function playQuizTypeVoicePreview(src) {
    const clipSrc = String(src || "").trim();
    if (!clipSrc) return;
    stopQuizTypeVoicePreview();
    const audio = new Audio(clipSrc);
    quizTypePreviewAudioEl = audio;
    quizTypePreviewAudioSrc = clipSrc;
    audio.addEventListener(
        "ended",
        () => {
            if (quizTypePreviewAudioEl === audio) {
                quizTypePreviewAudioEl = null;
                quizTypePreviewAudioSrc = "";
            }
        },
        { once: true },
    );
    audio.play().catch(() => {});
}

function endpointUrl(relPath) {
    return projectAssetUrl(relPath);
}

function getSpecificTitleForQuizType(quizType) {
    const { els } = appState;
    const selectedType = String(els?.inQuizType?.value || "");
    if (selectedType !== String(quizType || "")) return "";
    if (!els?.inSpecificTitleToggle?.checked) return "";
    return String(els?.inSpecificTitleText?.value || "").trim();
}

function setQuizTypeVoiceBusy(quizType, isBusy) {
    const volBtns = document.querySelectorAll(`button[data-quiz-type-voice-vol="${quizType}"]`);
    const delBtns = document.querySelectorAll(`button[data-quiz-type-voice-del="${quizType}"]`);
    volBtns.forEach((volBtn) => {
        volBtn.disabled = !!isBusy;
        volBtn.textContent = isBusy ? "..." : "Vol";
    });
    delBtns.forEach((delBtn) => {
        delBtn.disabled = !!isBusy || !quizTypeVoiceStatusByType[quizType];
    });
}

async function fetchQuizTypeVoiceStatus(quizType, specificTitle = "") {
    const params = new URLSearchParams({
        quizType: String(quizType || ""),
        specificTitle: String(specificTitle || ""),
    });
    const res = await fetch(`${endpointUrl(QUIZ_TITLE_VOICE_STATUS_ENDPOINT)}?${params.toString()}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Status failed (${res.status})`);
    const exists = !!body.exists;
    quizTypeVoiceStatusByType[quizType] = exists;
    return { exists, src: String(body?.src || "") };
}

async function ensureQuizTypeVoiceThenPlay(quizType) {
    setQuizTypeVoiceBusy(quizType, true);
    const specificTitleText = getSpecificTitleForQuizType(quizType);
    try {
        const status = await fetchQuizTypeVoiceStatus(quizType, specificTitleText);
        let previewSrc = status.src;
        if (!status.exists) {
            const res = await fetch(endpointUrl(QUIZ_TITLE_VOICE_GENERATE_ENDPOINT), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    quizType,
                    voice: QUIZ_TITLE_FIXED_VOICE,
                    specificTitle: specificTitleText,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
            quizTypeVoiceStatusByType[quizType] = true;
            previewSrc = String(body?.src || "");
        }
        renderQuizTypeVoiceStatusPanel();
        renderLandingTitleVoiceControls();
        playQuizTypeVoicePreview(previewSrc);
    } catch (err) {
        alert(`Could not generate quiz title voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setQuizTypeVoiceBusy(quizType, false);
    }
}

async function resolveQuizTitleVoiceSrcForPlayback(quizType) {
    const specificTitleText = getSpecificTitleForQuizType(quizType);
    const status = await fetchQuizTypeVoiceStatus(quizType, specificTitleText).catch(() => ({ exists: false, src: "" }));
    if (status.exists && status.src) {
        return String(status.src || "");
    }
    const res = await fetch(endpointUrl(QUIZ_TITLE_VOICE_GENERATE_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            quizType,
            voice: QUIZ_TITLE_FIXED_VOICE,
            specificTitle: specificTitleText,
        }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
    quizTypeVoiceStatusByType[quizType] = true;
    return String(body?.src || "");
}

window.__resolveQuizTitleVoiceSrc = resolveQuizTitleVoiceSrcForPlayback;

async function deleteQuizTypeVoice(quizType) {
    if (!quizTypeVoiceStatusByType[quizType]) return;
    setQuizTypeVoiceBusy(quizType, true);
    const specificTitleText = getSpecificTitleForQuizType(quizType);
    try {
        stopQuizTypeVoicePreview();
        const res = await fetch(endpointUrl(QUIZ_TITLE_VOICE_DELETE_ENDPOINT), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quizType, specificTitle: specificTitleText }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
        quizTypeVoiceStatusByType[quizType] = false;
        renderQuizTypeVoiceStatusPanel();
        renderLandingTitleVoiceControls();
    } catch (err) {
        alert(`Could not delete quiz title voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setQuizTypeVoiceBusy(quizType, false);
    }
}

function renderQuizTypeVoiceStatusPanel() {
    const quizTypeSelect = appState?.els?.inQuizType;
    if (!quizTypeSelect) return;
    let panel = document.getElementById("quiz-type-voice-status");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "quiz-type-voice-status";
        panel.style.marginTop = "0.4rem";
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.gap = "0.25rem";
        panel.style.fontSize = "0.72rem";
        panel.style.color = "rgba(255,255,255,0.9)";
        const anchor = quizTypeSelect.nextElementSibling || quizTypeSelect;
        anchor.insertAdjacentElement("afterend", panel);
    }
    panel.replaceChildren();

    Array.from(quizTypeSelect.options || []).forEach((opt) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.gap = "0.5rem";
        row.style.padding = "0.15rem 0";

        const text = document.createElement("span");
        text.textContent = getQuizTypeBaseLabel(opt);
        text.style.opacity = "0.92";

        const controls = document.createElement("div");
        controls.style.display = "inline-flex";
        controls.style.alignItems = "center";
        controls.style.gap = "0.3rem";

        const volBtn = document.createElement("button");
        volBtn.type = "button";
        volBtn.textContent = "Vol";
        volBtn.dataset.quizTypeVoiceVol = opt.value;
        volBtn.style.padding = "0.12rem 0.4rem";
        volBtn.style.borderRadius = "999px";
        volBtn.style.border = "1px solid rgba(255,255,255,0.35)";
        volBtn.style.background = "rgba(255,255,255,0.08)";
        volBtn.style.color = "#fff";
        volBtn.style.fontSize = "0.68rem";
        volBtn.style.fontWeight = "700";
        volBtn.onclick = () => { void ensureQuizTypeVoiceThenPlay(opt.value); };

        const xBtn = document.createElement("button");
        xBtn.type = "button";
        xBtn.textContent = "X";
        xBtn.dataset.quizTypeVoiceDel = opt.value;
        xBtn.style.padding = "0.12rem 0.45rem";
        xBtn.style.borderRadius = "999px";
        xBtn.style.border = "1px solid rgba(239,68,68,0.7)";
        xBtn.style.background = "rgba(239,68,68,0.2)";
        xBtn.style.color = "#fff";
        xBtn.style.fontSize = "0.68rem";
        xBtn.style.fontWeight = "800";
        xBtn.disabled = !quizTypeVoiceStatusByType[opt.value];
        xBtn.onclick = () => { void deleteQuizTypeVoice(opt.value); };

        controls.appendChild(volBtn);
        controls.appendChild(xBtn);
        row.appendChild(text);
        row.appendChild(controls);
        panel.appendChild(row);
    });
}

function renderLandingTitleVoiceControls() {
    const { els } = appState;
    const quizType = String(els?.inQuizType?.value || "");
    const host = document.getElementById("landing-title-voice-controls");
    if (!host || !quizType) return;
    const videoModeEnabled = !!getState()?.videoMode;
    const hideForVideoFlow = videoModeEnabled || !!appState.isVideoPlaying;
    host.hidden = hideForVideoFlow;
    host.replaceChildren();
    if (hideForVideoFlow) return;

    const controls = document.createElement("div");
    controls.style.display = "inline-flex";
    controls.style.alignItems = "center";
    controls.style.gap = "0.585rem";

    const volBtn = document.createElement("button");
    volBtn.type = "button";
    volBtn.textContent = "Vol";
    volBtn.dataset.quizTypeVoiceVol = quizType;
    volBtn.style.padding = "0.26rem 0.806rem";
    volBtn.style.borderRadius = "999px";
    volBtn.style.border = "1px solid rgba(255,255,255,0.38)";
    volBtn.style.background = "rgba(255,255,255,0.08)";
    volBtn.style.color = "#fff";
    volBtn.style.fontSize = "1.014rem";
    volBtn.style.fontWeight = "800";
    volBtn.style.cursor = "pointer";
    volBtn.onclick = () => { void ensureQuizTypeVoiceThenPlay(quizType); };

    const xBtn = document.createElement("button");
    xBtn.type = "button";
    xBtn.textContent = "X";
    xBtn.dataset.quizTypeVoiceDel = quizType;
    xBtn.style.padding = "0.26rem 0.858rem";
    xBtn.style.borderRadius = "999px";
    xBtn.style.border = "1px solid rgba(239,68,68,0.75)";
    xBtn.style.background = "rgba(239,68,68,0.2)";
    xBtn.style.color = "#fff";
    xBtn.style.fontSize = "1.014rem";
    xBtn.style.fontWeight = "900";
    xBtn.style.cursor = "pointer";
    xBtn.disabled = !quizTypeVoiceStatusByType[quizType];
    xBtn.onclick = () => { void deleteQuizTypeVoice(quizType); };

    controls.appendChild(volBtn);
    controls.appendChild(xBtn);
    host.appendChild(controls);
}

async function refreshQuizTypeVoiceLabels() {
    const { els } = appState;
    const quizTypeSelect = els?.inQuizType;
    if (!quizTypeSelect) return;
    const options = Array.from(quizTypeSelect.options || []);
    if (options.length === 0) return;

    await Promise.all(
        options.map(async (opt) => {
            let hasVoice = false;
            try {
                const status = await fetchQuizTypeVoiceStatus(opt.value, getSpecificTitleForQuizType(opt.value));
                hasVoice = !!status.exists;
            } catch {
                hasVoice = false;
            }
            setQuizTypeOptionLabel(opt, hasVoice);
        }),
    );

    applyCustomSelects();
    renderQuizTypeVoiceStatusPanel();
    renderLandingTitleVoiceControls();
}

export function updateSetupUI() {
    const { els } = appState;
    if (els.setupPitchControls) els.setupPitchControls.style.display = "none";
    if (els.setupCareerControls) els.setupCareerControls.style.display = "flex";
    if (els.setupCareerClubsField) els.setupCareerClubsField.style.display = "flex";
    if (els.setupCareerSilhouetteField) els.setupCareerSilhouetteField.style.display = "none";
    if (els.btnPictureControls) els.btnPictureControls.style.display = "block";
    if (els.btnRevealPhoto) els.btnRevealPhoto.style.display = "block";
}

export function populateSubTypes() {
    const { els } = appState;
    els.inQuizType.innerHTML = `
      <option value="player-by-career-stats" selected>guess the player by career stats</option>
    `;

    if (els.inQuizType.options.length > 0) {
        els.inQuizType.selectedIndex = 0;
    }

    Array.from(els.inQuizType.options).forEach((opt) => {
        opt.dataset.baseLabel = String(opt.textContent || "").trim();
    });

    updateSetupUI();
    applyCustomSelects();
    renderQuizTypeVoiceStatusPanel();
    renderLandingTitleVoiceControls();
    void refreshQuizTypeVoiceLabels();
}

function computeLandingDifficultyDistribution(totalQuestions) {
    const total = Math.max(0, Number(totalQuestions) || 0);
    if (total === 0) {
        return { easy: 0, medium: 0, hard: 0, impossible: 0 };
    }

    const targetEasy = total * 0.4;
    const targetMedium = total * 0.3;
    const targetHard = total * 0.2;
    const targetImpossible = total * 0.1;

    let bestStrict = null;
    let bestRelaxed = null;

    for (let impossible = 0; impossible <= total; impossible += 1) {
        for (let hard = impossible; hard <= total - impossible; hard += 1) {
            for (let medium = hard; medium <= total - impossible - hard; medium += 1) {
                const easy = total - impossible - hard - medium;
                if (easy < medium) continue;

                const score =
                    Math.abs(easy - targetEasy) +
                    Math.abs(medium - targetMedium) +
                    Math.abs(hard - targetHard) +
                    Math.abs(impossible - targetImpossible);
                const candidate = { easy, medium, hard, impossible, score };
                const isStrict = easy > medium && medium > hard && hard > impossible;

                if (isStrict) {
                    if (!bestStrict || candidate.score < bestStrict.score) bestStrict = candidate;
                } else if (!bestRelaxed || candidate.score < bestRelaxed.score) {
                    bestRelaxed = candidate;
                }
            }
        }
    }

    const best = bestStrict || bestRelaxed || { easy: total, medium: 0, hard: 0, impossible: 0 };
    return {
        easy: best.easy,
        medium: best.medium,
        hard: best.hard,
        impossible: best.impossible,
    };
}

function landingDifficultyTotalQuestionsForLevels() {
    const endingType = getSelectedEndingType();
    const isHowMany = endingType === "how-many";
    return isHowMany
        ? Math.max(0, appState.totalLevelsCount - 2)
        : Math.max(0, appState.totalLevelsCount - 3);
}

function setLandingDifficultySpan(id, value) {
    const el = document.getElementById(id);
    if (!el || el.getAttribute("contenteditable") === "true") return;
    el.textContent = value;
}

export function updateLanding() {
    const { els } = appState;
    const title = document.getElementById("landing-title");
    const isShorts = document.body.classList.contains("shorts-mode");

    title.innerHTML = isShorts
        ? "GUESS THE<br>PLAYER<br>BY CAREER STATS"
        : "GUESS THE PLAYER<br>BY CAREER STATS";
    renderLandingTitleVoiceControls();

    setLandingDifficultySpan("val-easy", els.inEasy.value);
    setLandingDifficultySpan("val-medium", els.inMedium.value);
    setLandingDifficultySpan("val-hard", els.inHard.value);
    setLandingDifficultySpan("val-impossible", els.inImpossible.value);

    const showSpecial = document.getElementById("in-specific-title-toggle").checked;
    document.getElementById("specific-title-settings").style.display = showSpecial ? "flex" : "none";
    document.getElementById("landing-special-badge").hidden = !showSpecial;
    document.getElementById("landing-special-text").textContent = els.inSpecificTitleText.value;

    const iconVal = els.inSpecificTitleIcon.value;
    const iconImg = document.getElementById("landing-special-icon-img");
    const iconSpan = document.getElementById("landing-special-icon");
    const useSpecificTitleImage =
        iconVal.startsWith("icons/") || iconVal.startsWith("Images/");
    if (useSpecificTitleImage) {
        iconImg.src = projectAssetUrl(iconVal);
        iconImg.hidden = false;
        iconSpan.hidden = true;
    } else {
        iconSpan.textContent = iconVal;
        iconSpan.hidden = false;
        iconImg.hidden = true;
    }
}

function wireLandingDifficultyValEditors(els) {
    const pairs = [
        ["val-easy", els.inEasy],
        ["val-medium", els.inMedium],
        ["val-hard", els.inHard],
        ["val-impossible", els.inImpossible],
    ];
    for (const [spanId, input] of pairs) {
        const span = document.getElementById(spanId);
        if (!span || !input) continue;
        span.addEventListener("dblclick", () => {
            span.contentEditable = "true";
            span.focus();
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                const r = document.createRange();
                r.selectNodeContents(span);
                sel.addRange(r);
            }
        });
        const commit = () => {
            if (span.getAttribute("contenteditable") !== "true") return;
            span.contentEditable = "false";
            let n = parseInt(String(span.textContent || "").replace(/\D/g, ""), 10);
            if (!Number.isFinite(n) || n < 0) n = 0;
            input.value = String(n);
            updateLanding();
        };
        span.addEventListener("blur", commit);
        span.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                span.blur();
            } else if (e.key === "Escape") {
                e.preventDefault();
                span.textContent = input.value;
                span.contentEditable = "false";
            }
        });
    }
}

export function syncShortsCirclePreviewPanel() {
    const { els } = appState;
    const shortsOn = document.body.classList.contains("shorts-mode");
    if (els.setupShortsCirclePreviewField) {
        els.setupShortsCirclePreviewField.style.display = shortsOn ? "flex" : "none";
    }
    if (els.shortsCirclePreviewToggle) {
        els.shortsCirclePreviewToggle.disabled = !shortsOn;
    }
    if (els.shortsCirclePreviewCount) {
        const prevOn = shortsOn && els.shortsCirclePreviewToggle && els.shortsCirclePreviewToggle.checked;
        els.shortsCirclePreviewCount.disabled = !prevOn;
    }
}

export function applyShortsCirclePreviewFromControls() {
    const { els } = appState;
    if (!els.shortsCirclePreviewToggle || !els.shortsCirclePreviewCount) return;
    const shortsOn = document.body.classList.contains("shorts-mode");
    let count = parseInt(els.shortsCirclePreviewCount.value, 10);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > 24) count = 24;
    els.shortsCirclePreviewCount.value = String(count);
    const enabled = shortsOn && els.shortsCirclePreviewToggle.checked;
    appState.careerShortsCirclePreview = { enabled, count };
    renderCareer();
    renderHeader();
}

// ==========================================
// CORE SYSTEM INIT
// ==========================================

const FIXED_SHORTS_MODE = false;

function applyFixedShortsMode(els) {
    if (els.shortsModeToggle) {
        els.shortsModeToggle.checked = FIXED_SHORTS_MODE;
        els.shortsModeToggle.disabled = true;
    }
    document.body.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
}

async function init() {
    initOptionalBootstrapUtilities();
    const { els } = appState;
    const devLiveReloadSnapshot = consumeDevLiveReloadSnapshot();

    bindDomElements();
    applyPerformanceModeFromUrl();
    initSharedBackgroundTheme(
        document.getElementById("in-background-color"),
        document.getElementById("in-background-effect"),
        document.getElementById("in-background-opacity"),
        document.getElementById("btn-save-background-opacity"),
    );
    // Track explicit user selection for PROD validation
    const bgColorSel = document.getElementById("in-background-color");
    const bgEffectSel = document.getElementById("in-background-effect");
    if (bgColorSel) bgColorSel.addEventListener("change", () => markBackgroundColorConfirmed());
    if (bgEffectSel) bgEffectSel.addEventListener("change", () => markBackgroundEffectConfirmed());

    function syncShortsModeFab() {
        if (!els.shortsModeBtn || !els.shortsModeToggle) return;
        els.shortsModeBtn.setAttribute("aria-pressed", els.shortsModeToggle.checked ? "true" : "false");
    }
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    syncShortsModeFab();
    await loadCareerPictureFavoritesFromFile();
    window.__captureRunnerState = () => {
        captureDevLiveReloadSnapshot(appState, appState.els);
    };
    window.addEventListener("beforeunload", window.__captureRunnerState);

    // Call initialized modules
    initFloatingEmojis();
    initLevelControls();
    initTransitionsUI();
    initSavedScripts({
        populateSubTypes,
        updateSetupUI,
        updateLanding,
        syncShortsCirclePreviewPanel,
    });

    const initialLevelCount = getInitialLevelCountFromSnapshot(devLiveReloadSnapshot, 29);
    initLevels(initialLevelCount);
    const didRestoreState = restoreDevLiveReloadState(appState, devLiveReloadSnapshot);
    if (!didRestoreState) {
        const totalQuestions = landingDifficultyTotalQuestionsForLevels();
        const { easy, medium, hard, impossible } =
            computeLandingDifficultyDistribution(totalQuestions);
        els.inEasy.value = String(easy);
        els.inMedium.value = String(medium);
        els.inHard.value = String(hard);
        els.inImpossible.value = String(impossible);
    }
    const initialLevelIndex = didRestoreState
        ? Math.min(
            Math.max(1, appState.currentLevelIndex),
            Math.max(0, appState.levelsData.length - 1),
        )
        : 1;
    switchLevel(initialLevelIndex);
    syncShortsCirclePreviewPanel();
    syncShortsModeFab();

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && appState.isVideoPlaying) {
            stopVideoFlow();
        }
    });

    wireMainTabs(els);

    // Listeners
    els.inQuizType.onchange = () => {
        updateSetupUI();
        updateLanding();
        renderSavedScripts();
    };

    els.inEndingType.onchange = () => {
        updateOutroText();
        updateLanding();
        renderEndingTypeVoiceStatusPanel();
    };

    if (els.btnRevealPhoto) {
        els.btnRevealPhoto.onclick = () => {
            const silhouette = document.querySelector(".career-silhouette");
            if (silhouette) {
                silhouette.classList.toggle("revealed");
            }
        };
    }

    if (els.btnPictureControls) {
        els.btnPictureControls.onclick = () => {
            els.rightPanel.hidden = false;
            renderPictureControls();
        };
    }

    els.inEasy.oninput = updateLanding;
    els.inMedium.oninput = updateLanding;
    els.inHard.oninput = updateLanding;
    els.inImpossible.oninput = updateLanding;
    wireLandingDifficultyValEditors(els);
    els.inSpecificTitleToggle.onchange = updateLanding;
    els.inSpecificTitleText.oninput = updateLanding;
    els.inSpecificTitleIcon.onchange = updateLanding;

    // ── Specific title YES/NO buttons ──
    const specificTitleYes = document.getElementById("specific-title-yes");
    const specificTitleNo = document.getElementById("specific-title-no");
    if (specificTitleYes && specificTitleNo) {
        specificTitleYes.onclick = () => {
            specificTitleYes.setAttribute("aria-pressed", "true");
            specificTitleNo.setAttribute("aria-pressed", "false");
            els.inSpecificTitleToggle.checked = true;
            updateLanding();
        };
        specificTitleNo.onclick = () => {
            specificTitleNo.setAttribute("aria-pressed", "true");
            specificTitleYes.setAttribute("aria-pressed", "false");
            els.inSpecificTitleToggle.checked = false;
            updateLanding();
        };
    }

    /* Landing shirt: double-click to edit the number; saved per-level. */
    const shirtEl = document.getElementById("landing-shirt");
    const shirtNum = document.getElementById("landing-shirt-number");
    if (shirtEl && shirtNum) {
        shirtEl.addEventListener("dblclick", () => {
            shirtNum.contentEditable = "true";
            shirtNum.focus();
            const sel = window.getSelection();
            sel.selectAllChildren(shirtNum);
        });
        const commitShirtNumber = () => {
            shirtNum.contentEditable = "false";
            const text = shirtNum.textContent.trim();
            if (!text) shirtNum.textContent = "?";
            const st = getState();
            if (st) st.shirtNumber = shirtNum.textContent;
        };
        shirtNum.addEventListener("blur", commitShirtNumber);
        shirtNum.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                shirtNum.blur();
            }
        });
    }

    els.updateLevelsBtn.onclick = () => {
        let levels = parseInt(els.quizLevelsInput.value, 10);
        if (isNaN(levels) || levels < 1) levels = 29;
        initLevels(levels);
        const totalQuestions = landingDifficultyTotalQuestionsForLevels();
        const { easy, medium, hard, impossible } =
            computeLandingDifficultyDistribution(totalQuestions);
        els.inEasy.value = String(easy);
        els.inMedium.value = String(medium);
        els.inHard.value = String(hard);
        els.inImpossible.value = String(impossible);
        updateLanding();
        switchLevel(appState.currentLevelIndex);
    };

    if (els.shortsCirclePreviewToggle) {
        els.shortsCirclePreviewToggle.onchange = () => {
            applyShortsCirclePreviewFromControls();
            syncShortsCirclePreviewPanel();
        };
    }
    if (els.shortsCirclePreviewCount) {
        els.shortsCirclePreviewCount.addEventListener("input", applyShortsCirclePreviewFromControls);
        els.shortsCirclePreviewCount.addEventListener("change", applyShortsCirclePreviewFromControls);
    }

    /* Test club count control — checkbox activates, number adds/removes team slots. */
    const clubsPreviewToggle = document.getElementById("career-clubs-preview-toggle");
    if (clubsPreviewToggle && els.inCareerClubs) {
        const applyClubCount = () => {
            if (!clubsPreviewToggle.checked) return;
            const val = Math.min(12, Math.max(1, parseInt(els.inCareerClubs.value, 10) || 5));
            els.inCareerClubs.value = val;
            const state = getState();
            const history = state.careerHistory || [];
            if (val > history.length) {
                /* Add empty slots to reach the target count. */
                while (history.length < val) history.push({});
            } else if (val < history.length) {
                /* Remove from the end to reach the target count. */
                history.length = val;
            }
            state.careerHistory = history;
            state.careerClubsCount = val;
            renderCareer();
        };
        clubsPreviewToggle.addEventListener("change", () => {
            if (clubsPreviewToggle.checked) {
                applyClubCount();
            }
        });
        els.inCareerClubs.addEventListener("input", applyClubCount);
        els.inCareerClubs.addEventListener("change", applyClubCount);
    }

    els.shortsModeToggle.onchange = (e) => {
        const state = getState();
        const wasShorts = document.body.classList.contains("shorts-mode");
        persistCareerPictureModeFromActiveState(state, wasShorts);
        if (e.target.checked) document.body.classList.add("shorts-mode");
        else document.body.classList.remove("shorts-mode");
        applyCareerPictureModeToActiveState(state, e.target.checked);
        updateLanding();
        syncShortsCirclePreviewPanel();
        applyShortsCirclePreviewFromControls();
        switchLevel(appState.currentLevelIndex);
        syncShortsModeFab();
    };

    if (els.shortsModeBtn && els.shortsModeToggle) {
        els.shortsModeBtn.onclick = () => {
            els.shortsModeToggle.checked = !els.shortsModeToggle.checked;
            els.shortsModeToggle.dispatchEvent(new Event("change"));
        };
    }

    function syncYoutubeThumbnailsButton() {
        if (!els.youtubeThumbnailsBtn) return;
        const on = document.body.classList.contains("youtube-thumbnails-mode");
        els.youtubeThumbnailsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }

    if (els.youtubeThumbnailsBtn) {
        els.youtubeThumbnailsBtn.onclick = () => {
            document.body.classList.toggle("youtube-thumbnails-mode");
            syncYoutubeThumbnailsButton();
            switchLevel(appState.currentLevelIndex);
        };
        syncYoutubeThumbnailsButton();
    }

    function syncVideoModeButton(isEnabled) {
        if (!els.videoModeBtn) return;
        const pressed = !!isEnabled;
        els.videoModeBtn.setAttribute("aria-pressed", pressed ? "true" : "false");
    }

    function areAllLevelsVideoModeEnabled() {
        return (appState.levelsData || []).every((lvl) => !!lvl.videoMode);
    }

    function syncApplyVideoAllButton(isEnabled) {
        if (!els.applyVideoAllBtn) return;
        const pressed = !!isEnabled;
        els.applyVideoAllBtn.setAttribute("aria-pressed", pressed ? "true" : "false");
        if (pressed) {
            els.applyVideoAllBtn.style.background = "#22c55e";
            els.applyVideoAllBtn.style.color = "#001408";
            els.applyVideoAllBtn.style.boxShadow = "0 2px 5px rgba(34, 197, 94, 0.45)";
            els.applyVideoAllBtn.style.borderColor = "#22c55e";
            return;
        }
        els.applyVideoAllBtn.style.background = "";
        els.applyVideoAllBtn.style.color = "";
        els.applyVideoAllBtn.style.boxShadow = "";
        els.applyVideoAllBtn.style.borderColor = "";
    }

    function clearVideoModePreviewFx() {
        const wrap = appState.els.careerWrap;
        if (!wrap) return;
        const overlay = document.getElementById("career-reveal-overlay");
        const revealName = document.getElementById("career-reveal-name");
        const silhouette = wrap.querySelector(".career-silhouette");
        document.body.classList.remove("career-cinematic-reveal");
        document.body.classList.remove("career-reveal-sync-drop");
        wrap.classList.remove("cinematic-reveal-active");
        if (overlay) overlay.classList.remove("show");
        if (revealName) revealName.classList.remove("show");
        if (silhouette) {
            silhouette.classList.remove("drop-away");
            silhouette.classList.remove("revealed");
        }
    }

    els.videoModeToggle.onchange = (e) => {
        const state = getState();
        state.videoMode = e.target.checked;
        if (appState.currentLevelIndex === 0) {
            const logoImg = appState.els?.logoPage?.querySelector(".logo-img-anim");
            if (logoImg) {
                if (state.videoMode && !appState.isVideoPlaying) {
                    // Keep intro logo hidden while waiting for Play Video.
                    logoImg.classList.remove("reveal");
                } else if (!state.videoMode && !appState.isVideoPlaying) {
                    logoImg.classList.remove("reveal");
                    void logoImg.offsetWidth;
                    logoImg.classList.add("reveal");
                }
            }
        }
        syncVideoModeButton(state.videoMode);
        syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
        syncCareerSlotControlsVisibility();
        clearTimeout(appState.videoModeToggleFxTimeout);
        appState.videoModeToggleFxTimeout = null;
        if (!state.videoMode) {
            clearVideoModePreviewFx();
        }
        if (!e.target.checked && appState.isVideoPlaying) {
            stopVideoFlow();
        }
        const isQuestionLevel =
            appState.currentLevelIndex > 1 &&
            appState.currentLevelIndex < appState.totalLevelsCount;
        if (isQuestionLevel) {
            renderCareer();
        }
        renderHeader();
        renderLandingTitleVoiceControls();
    };

    if (els.videoModeBtn && els.videoModeToggle) {
        els.videoModeBtn.onclick = () => {
            els.videoModeToggle.checked = !els.videoModeToggle.checked;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        };
    }

    els.applyVideoAllBtn.onclick = () => {
        const nextVideoMode = !areAllLevelsVideoModeEnabled();
        appState.levelsData.forEach((lvl) => {
            lvl.videoMode = nextVideoMode;
        });
        syncApplyVideoAllButton(nextVideoMode);
        if (els.videoModeToggle.checked !== nextVideoMode) {
            els.videoModeToggle.checked = nextVideoMode;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        }
    };

    // ── PROD button ──
    if (els.prodBtn) {
        els.prodBtn.onclick = () => {
            toggleProdMode();
            syncVideoModeButton(!!getState()?.videoMode);
            syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
        };
    }

    els.playVideoBtn.onclick = () => {
        if (isProdMode()) {
            const result = runProdValidation();
            if (!result.allPassed) {
                showValidationModal(result);
                return;
            }
        }
        renderLandingTitleVoiceControls();
        startVideoFlow();
        setTimeout(() => {
            renderLandingTitleVoiceControls();
        }, 0);
    };

    // --- CAREER EDIT MODAL EVENT HANDLERS ---
    
    // Core function to search our dataset 
    function renderCareerTeamSearch(query) {
        if (!els.careerEditSearchResults) return;
        els.careerEditSearchResults.innerHTML = "";

        const allTeams = [
            ...(appState.teamsIndex.clubs || []),
            ...(appState.teamsIndex.nationalities || [])
        ];

        const filtered = allTeams.filter(t => t.name.toLowerCase().includes(query)).slice(0, 50);

        filtered.forEach(team => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.style.padding = "0.6rem";
            btn.style.background = "rgba(255,255,255,0.05)";
            btn.style.border = "1px solid rgba(255,255,255,0.1)";
            btn.style.color = "#fff";
            btn.style.textAlign = "left";
            btn.style.cursor = "pointer";
            btn.style.borderRadius = "4px";
            btn.textContent = team.name;

            btn.onmouseover = () => btn.style.background = "rgba(255,202,40,0.2)";
            btn.onmouseout = () => btn.style.background = "rgba(255,255,255,0.05)";

            btn.onclick = () => {
                const state = getState();
                if (!state.careerHistory) state.careerHistory = [];
                while (state.careerHistory.length <= appState.careerActiveSlotIndex) {
                    state.careerHistory.push({ club: "Unknown", year: "YYYY" });
                }

                const slot = state.careerHistory[appState.careerActiveSlotIndex];
                slot.club = team.name;

                let customImageUrl = "";
                if (team.country && team.league) {
                    customImageUrl = projectAssetUrl(
                        `Teams Images/${team.country}/${team.league}/${team.name}.png`
                    );
                } else if (team.region) {
                    customImageUrl = projectAssetUrl(`Nationality images/${team.region}/${team.name}.png`);
                } else {
                    const ot = getClubLogoOtherTeamsUrl(team.name);
                    if (ot) customImageUrl = ot;
                }

                if (customImageUrl) {
                    slot.customImage = customImageUrl;
                } else {
                    delete slot.customImage;
                }

                els.careerEditModal.hidden = true;
                renderCareer();
            };
            
            els.careerEditSearchResults.appendChild(btn);
        });
    }

    if (els.careerEditClose) {
        els.careerEditClose.onclick = () => els.careerEditModal.hidden = true;
    }

    if (els.careerEditImgBtn) {
        els.careerEditImgBtn.onclick = () => {
            els.careerEditOptions.style.display = "none";
            els.careerEditSearchContainer.style.display = "flex";
            els.careerEditSearchInput.value = "";
            renderCareerTeamSearch("");
            els.careerEditSearchInput.focus();
        };
    }

    if (els.careerEditBackBtn) {
        els.careerEditBackBtn.onclick = () => {
            els.careerEditSearchContainer.style.display = "none";
            els.careerEditOptions.style.display = "flex";
        };
    }

    if (els.careerEditSearchInput) {
        els.careerEditSearchInput.oninput = (e) => {
            renderCareerTeamSearch(e.target.value.toLowerCase());
        };
    }

    if (els.careerEditTeamBtn) {
        els.careerEditTeamBtn.onclick = () => {
            const state = getState();
            if (!state.careerHistory) state.careerHistory = [];
            while (state.careerHistory.length <= appState.careerActiveSlotIndex) {
                state.careerHistory.push({ club: "", year: "YYYY" });
            }
            const item = state.careerHistory[appState.careerActiveSlotIndex];
            const newName = prompt("Enter new team name:", item.club);
            
            if (newName !== null) {
                item.club = newName.trim();
                item.customImage = null; // Clear manual image so app attempts to find the logo via text
                els.careerEditModal.hidden = true;
                renderCareer();
            }
        };
    }

    if (els.careerEditYearBtn) {
        els.careerEditYearBtn.onclick = () => {
            const state = getState();
            if (!state.careerHistory) state.careerHistory = [];
            while (state.careerHistory.length <= appState.careerActiveSlotIndex) {
                state.careerHistory.push({ club: "Unknown", year: "YYYY" });
            }
            const item = state.careerHistory[appState.careerActiveSlotIndex];
            const newYear = prompt("Enter new year:", item.year);
            if (newYear !== null) {
                item.year = newYear.trim();
                els.careerEditModal.hidden = true;
                renderCareer();
            }
        };
    }

    // Load indexes
    const [idx, photos, flags] = await Promise.all([
        fetchJsonSessionCached(".Storage/data/teams-index.json"),
        fetchJsonSessionCached(".Storage/data/player-images.json", { club: {}, nationality: {} }),
        fetchJsonSessionCached(".Storage/data/country-to-flagcode.json", { codes: {} }),
    ]);
    appState.teamsIndex = idx;
    appState.playerImages = migratePlayerImages(photos);
    appState.flagcodes = flags.codes || {};

    // --- Career Hierarchical Browser Logic ---
    let browseState = { mode: 'team', step: 'country', country: null, team: null, list: [], allPlayers: [] };
    let allGlobalPlayersLoadPromise = null;

    function removeAccents(str) {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function shouldShowGlobalPlayersLoadProgress() {
        return (
            els.careerBrowseContainer &&
            els.careerBrowseContainer.style.display !== "none" &&
            browseState.mode === "name"
        );
    }

    async function loadAllGlobalPlayers() {
        if (appState.allGlobalPlayers) return appState.allGlobalPlayers;
        if (allGlobalPlayersLoadPromise) return allGlobalPlayersLoadPromise;

        allGlobalPlayersLoadPromise = (async () => {
            const allPlayers = [];
            const clubs = appState.teamsIndex.clubs || [];
            const batchSize = 10;

            for (let i = 0; i < clubs.length; i += batchSize) {
                const percentage = clubs.length ? Math.round((i / clubs.length) * 100) : 0;
                if (shouldShowGlobalPlayersLoadProgress() && els.careerBrowseList) {
                    els.careerBrowseList.innerHTML = `<div style='color:#ffca28; padding:0.5rem; font-size:0.85rem; font-weight:bold;'>Loading databases... ${percentage}%</div>`;
                }

                const batch = clubs.slice(i, i + batchSize);
                const promises = batch.map(async (clubItem) => {
                    try {
                        const squad = await loadSquadJson(clubItem);
                        const players = [
                            ...(squad.goalkeepers || []),
                            ...(squad.defenders || []),
                            ...(squad.midfielders || []),
                            ...(squad.attackers || [])
                        ];
                        players.forEach(p => {
                            if (p && p.name) {
                                allPlayers.push({ ...p, _clubItem: clubItem });
                            }
                        });
                    } catch (e) {
                        console.warn("Failed to load club:", clubItem?.name);
                    }
                });
                await Promise.all(promises);
            }

            if (shouldShowGlobalPlayersLoadProgress() && els.careerBrowseList) {
                els.careerBrowseList.innerHTML = `<div style='color:#fff; padding:0.5rem; font-size:0.85rem;'>Finalizing list...</div>`;
            }

            const uniqueMap = new Map();
            allPlayers.forEach(p => {
                if (!uniqueMap.has(p.name)) {
                    uniqueMap.set(p.name, p);
                }
            });
            const uniquePlayers = Array.from(uniqueMap.values());
            uniquePlayers.sort((a, b) => a.name.localeCompare(b.name));

            appState.allGlobalPlayers = uniquePlayers;
            return uniquePlayers;
        })().finally(() => {
            allGlobalPlayersLoadPromise = null;
        });

        return allGlobalPlayersLoadPromise;
    }

    void loadAllGlobalPlayers();

    function applyCareerPlayerSelection(pData, teamLabel) {
        if (!pData) return;
        const state = getState();

        state.careerPlayer = pData;
        state.careerHistory = cleanCareerHistory(pData.transfer_history || []);

        // Eagerly preload all career logos + player photo into RAM cache
        preloadCareerAssets(state);

        const historyLen = state.careerHistory.length;
        const finalCount = Math.max(2, historyLen);
        state.careerClubsCount = finalCount;
        if (els.inCareerClubs) {
            els.inCareerClubs.value = finalCount;
        }

        const sourceClub = (pData._clubItem && pData._clubItem.name) ? pData._clubItem.name : "";
        const context = teamLabel || sourceClub || "";
        if (els.careerSelectedInfo) {
            els.careerSelectedInfo.innerHTML = context
                ? `Selected: <span style="color:#fff;">${pData.name}</span> (${context})`
                : `Selected: <span style="color:#fff;">${pData.name}</span>`;
        }
        if (els.careerBrowseContainer) {
            els.careerBrowseContainer.style.display = 'none';
        }

        const shouldEnableVideoMode = !state.videoMode && !!els.videoModeToggle;
        if (shouldEnableVideoMode) {
            // Reuse existing video mode change handler so all related UI/state stays in sync.
            els.videoModeToggle.checked = true;
            els.videoModeToggle.dispatchEvent(new Event("change"));
            return;
        }

        renderCareer();
        renderHeader();
    }

    async function renderInlineCareerPlayerSearch(queryText = "") {
        try {
            const inlineList = document.getElementById("career-inline-player-results");
            if (!inlineList) return;

            const rawQ = String(queryText || "").toLowerCase();
            const q = removeAccents(rawQ.trim());

            if (!q) {
                inlineList.innerHTML = "<div class='career-inline-player-hint'>Type player name to search.</div>";
                return;
            }

            inlineList.innerHTML = "<div class='career-inline-player-hint'>Loading players...</div>";
            const players = await loadAllGlobalPlayers();

            const activeInlineList = document.getElementById("career-inline-player-results");
            if (!activeInlineList) return;

            const filtered = players.filter((p) => {
                if (!p || !p.name) return false;
                return removeAccents(p.name.toLowerCase()).includes(q);
            }).slice(0, 25);

            activeInlineList.innerHTML = "";
            if (filtered.length === 0) {
                activeInlineList.innerHTML = "<div class='career-inline-player-hint'>No players found.</div>";
                return;
            }

            filtered.forEach((p) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "career-inline-player-result";
                btn.dataset.playerName = p.name;
                const clubName = (p._clubItem && p._clubItem.name) ? p._clubItem.name : "";
                btn.innerHTML = `
                    <span>${p.name}</span>
                    <small>${clubName}</small>
                `;
                btn.onclick = () => applyCareerPlayerSelection(p, clubName);
                activeInlineList.appendChild(btn);
            });
        } catch (err) {
            const inlineList = document.getElementById("career-inline-player-results");
            if (inlineList) {
                inlineList.innerHTML = "<div class='career-inline-player-hint'>Could not load players.</div>";
            }
            console.error("Inline career picker failed:", err);
        }
    }

    async function renderCareerBrowser() {
        if (!els.careerBrowseContainer) return;

        if (browseState.mode === 'team') {
            els.btnBrowseModeTeam.style.background = "var(--accent)";
            els.btnBrowseModeTeam.style.color = "#000";
            els.btnBrowseModeName.style.background = "rgba(255,255,255,0.1)";
            els.btnBrowseModeName.style.color = "#fff";
        } else {
            els.btnBrowseModeName.style.background = "var(--accent)";
            els.btnBrowseModeName.style.color = "#000";
            els.btnBrowseModeTeam.style.background = "rgba(255,255,255,0.1)";
            els.btnBrowseModeTeam.style.color = "#fff";
        }

        const rawQ = els.careerBrowseSearch.value.toLowerCase();
        const q = removeAccents(rawQ);
        let itemsToRender = [];

        if (browseState.mode === 'name') {
            els.btnCareerBrowseBack.style.display = 'none';
            
            if (els.careerBrowseSearch.disabled) return; 

            const players = await loadAllGlobalPlayers();
            
            els.careerBrowseList.innerHTML = "";
            const filtered = players.filter(p => {
                if (!p || !p.name) return false;
                return removeAccents(p.name.toLowerCase()).includes(q);
            });
            
            itemsToRender = filtered.slice(0, 100).map(p => ({ 
                label: `${p.name} <span style="font-size:0.75em; color:#aaa;">(${p._clubItem.name})</span>`, 
                value: p, 
                isGlobalPlayer: true 
            }));
            
            if (itemsToRender.length === 0 && rawQ.length > 0) {
                 els.careerBrowseList.innerHTML = "<div style='color:#aaa; padding:0.5rem; font-size:0.85rem;'>No players found.</div>";
            }
        } else {
            els.careerBrowseList.innerHTML = "";

            if (browseState.step === 'country') {
                els.btnCareerBrowseBack.style.display = 'none';
                els.careerBrowseSearch.placeholder = "Search country...";
                
                const countries = new Set();
                appState.teamsIndex.clubs.forEach(c => {
                    if (c.country) countries.add(c.country);
                });
                itemsToRender = Array.from(countries).sort()
                    .filter(c => removeAccents(c.toLowerCase()).includes(q))
                    .map(c => ({ label: c, value: c }));
                
            } else if (browseState.step === 'team') {
                els.btnCareerBrowseBack.style.display = 'block';
                els.careerBrowseSearch.placeholder = `Search teams in ${browseState.country}...`;

                const teams = appState.teamsIndex.clubs.filter(c => c.country === browseState.country);
                teams.sort((a, b) => a.name.localeCompare(b.name));
                itemsToRender = teams.filter(t => removeAccents(t.name.toLowerCase()).includes(q))
                    .map(t => ({ label: t.name, value: t, isTeam: true }));
                
            } else if (browseState.step === 'player') {
                els.btnCareerBrowseBack.style.display = 'block';
                els.careerBrowseSearch.placeholder = `Search players in ${browseState.team.name}...`;

                itemsToRender = browseState.allPlayers
                    .filter(p => p && p.name && removeAccents(p.name.toLowerCase()).includes(q))
                    .map(p => ({ label: p.name, value: p, isPlayer: true }));
            }
            
            if (itemsToRender.length === 0 && rawQ.length > 0) {
                 els.careerBrowseList.innerHTML = "<div style='color:#aaa; padding:0.5rem; font-size:0.85rem;'>No results found.</div>";
            }
        }

        browseState.list = itemsToRender;

        itemsToRender.forEach(item => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.style.padding = "0.5rem";
            btn.style.background = "rgba(255,255,255,0.05)";
            btn.style.border = "1px solid rgba(255,255,255,0.1)";
            btn.style.color = "#fff";
            btn.style.textAlign = "left";
            btn.style.cursor = "pointer";
            btn.style.borderRadius = "4px";
            btn.innerHTML = item.label;

            btn.onmouseover = () => btn.style.background = "rgba(255,202,40,0.2)";
            btn.onmouseout = () => btn.style.background = "rgba(255,255,255,0.05)";

            btn.onclick = async () => {
                if (item.isGlobalPlayer) {
                    const pData = item.value;
                    const clubName = (pData && pData._clubItem && pData._clubItem.name) ? pData._clubItem.name : "";
                    applyCareerPlayerSelection(pData, clubName);
                } else if (browseState.mode === 'team') {
                    if (browseState.step === 'country') {
                        browseState.country = item.value;
                        browseState.step = 'team';
                        els.careerBrowseSearch.value = "";
                        renderCareerBrowser();
                        
                    } else if (browseState.step === 'team') {
                        try {
                            btn.textContent = "Loading...";
                            const squad = await loadSquadJson(item.value);
                            browseState.team = item.value;
                            browseState.step = 'player';
                            
                            const allPlayers = [
                                ...(squad.goalkeepers || []),
                                ...(squad.defenders || []),
                                ...(squad.midfielders || []),
                                ...(squad.attackers || [])
                            ];
                            allPlayers.sort((a, b) => a.name.localeCompare(b.name));
                            browseState.allPlayers = allPlayers;
                            
                            els.careerBrowseSearch.value = "";
                            renderCareerBrowser();
                        } catch (e) {
                            console.error(e);
                            btn.textContent = "Error loading team";
                        }
                        
                    } else if (browseState.step === 'player') {
                        const pData = item.value;
                        applyCareerPlayerSelection(pData, browseState.team.name);
                    }
                }
            };
            els.careerBrowseList.appendChild(btn);
        });
    }

    if (els.btnBrowseModeTeam) {
        els.btnBrowseModeTeam.onclick = () => {
            if (browseState.mode !== 'team') {
                browseState.mode = 'team';
                els.careerBrowseSearch.value = "";
                els.careerBrowseSearch.disabled = false;
                els.careerBrowseSearch.placeholder = "Filter...";
                renderCareerBrowser();
            }
        };
    }

    if (els.btnBrowseModeName) {
        els.btnBrowseModeName.onclick = async () => {
            if (browseState.mode !== 'name') {
                browseState.mode = 'name';
                els.careerBrowseSearch.value = "";
                
                if (!appState.allGlobalPlayers) {
                    els.careerBrowseSearch.placeholder = "Fetching databases... please wait.";
                    els.careerBrowseSearch.disabled = true; 
                    await loadAllGlobalPlayers();
                    els.careerBrowseSearch.disabled = false; 
                }
                
                els.careerBrowseSearch.placeholder = "Search player name...";
                els.careerBrowseSearch.focus();
                renderCareerBrowser();
            }
        };
    }

    if (els.btnCareerBrowse) {
        els.btnCareerBrowse.onclick = () => {
            const isHidden = els.careerBrowseContainer.style.display === "none";
            els.careerBrowseContainer.style.display = isHidden ? "flex" : "none";
            if (isHidden) {
                if (browseState.mode === 'team' && !browseState.country) {
                    browseState.step = 'country';
                }
                els.careerBrowseSearch.value = "";
                renderCareerBrowser();
            }
        };
    }

    if (els.btnCareerBrowseBack) {
        els.btnCareerBrowseBack.onclick = () => {
            if (browseState.step === 'player') {
                browseState.step = 'team';
            } else if (browseState.step === 'team') {
                browseState.step = 'country';
            }
            els.careerBrowseSearch.value = "";
            renderCareerBrowser();
        };
    }

    if (els.careerBrowseSearch) {
        els.careerBrowseSearch.oninput = () => {
            renderCareerBrowser();
        };
    }

    document.addEventListener("input", (e) => {
        if (e.target && e.target.id === "career-inline-player-search") {
            renderInlineCareerPlayerSearch(e.target.value || "");
        }
    });

    // ---------------------------------------------

    wireControlPanelToggle(els);

    populateSubTypes();
    renderEndingTypeVoiceStatusPanel();
    void refreshEndingTypeVoiceLabels();
    updateOutroText();
    updateLanding();
    applyCustomSelects();
    syncVideoModeButton(!!getState()?.videoMode);
    syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
}

function renderPictureControls() {
    const { els } = appState;
    if (!els.rightPanel) return;

    const state = getState();

    els.rightPanel.innerHTML = `
    <div class="panel-header">
      <h1>Adjust Picture</h1>
      <button type="button" class="panel-toggle" id="btn-close-right-panel">Hide</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
      <label class="field">
        <span class="label">Up / Down (Y-Offset)</span>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" id="pic-up" class="panel-toggle" style="flex:1;">▲</button>
          <span id="val-y" style="width: 2rem; text-align:center;">${state.silhouetteYOffset || 0}</span>
          <button type="button" id="pic-down" class="panel-toggle" style="flex:1;">▼</button>
          <button type="button" id="pic-favorite" class="panel-toggle${hasCareerPictureFavorite(state) ? " is-active" : ""}" style="flex:1;">${hasCareerPictureFavorite(state) ? "&#9829;" : "&#9825;"}</button>
        </div>
      </label>
      <label class="field">
        <span class="label">Width (Thinner / Wider)</span>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" id="pic-narrow" class="panel-toggle" style="flex:1;">-</button>
          <span id="val-x" style="width: 2rem; text-align:center;">${(state.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X).toFixed(2)}</span>
          <button type="button" id="pic-wide" class="panel-toggle" style="flex:1;">+</button>
        </div>
      </label>
      <label class="field">
        <span class="label">Height (Shorter / Longer)</span>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" id="pic-short" class="panel-toggle" style="flex:1;">-</button>
          <span id="val-y-scale" style="width: 2rem; text-align:center;">${(state.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y).toFixed(2)}</span>
          <button type="button" id="pic-tall" class="panel-toggle" style="flex:1;">+</button>
        </div>
      </label>
      <button type="button" id="pic-reset" class="panel-toggle" style="margin-top: 1rem; background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid rgba(239,68,68,0.5);">Reset to Default</button>
    </div>
  `;

    document.getElementById("btn-close-right-panel").onclick = () => {
        els.rightPanel.hidden = true;
    };

    const updateVal = () => {
        const s = getState();
        const isShorts = document.body.classList.contains("shorts-mode");
        persistCareerPictureModeFromActiveState(s, isShorts);
        document.getElementById("val-y").textContent = s.silhouetteYOffset || 0;
        document.getElementById("val-x").textContent = (s.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X).toFixed(2);
        document.getElementById("val-y-scale").textContent = (s.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y).toFixed(2);
        const favoriteBtn = document.getElementById("pic-favorite");
        if (favoriteBtn) {
            const isFavorite = hasCareerPictureFavorite(s);
            favoriteBtn.innerHTML = isFavorite ? "&#9829;" : "&#9825;";
            favoriteBtn.classList.toggle("is-active", isFavorite);
        }
        renderCareer();
    };

    document.getElementById("pic-up").onclick = () => { getState().silhouetteYOffset = (getState().silhouetteYOffset || 0) - 1; updateVal(); };
    document.getElementById("pic-down").onclick = () => { getState().silhouetteYOffset = (getState().silhouetteYOffset || 0) + 1; updateVal(); };

    document.getElementById("pic-narrow").onclick = () => { getState().silhouetteScaleX = Math.max(0.1, (getState().silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X) - 0.05); updateVal(); };
    document.getElementById("pic-wide").onclick = () => { getState().silhouetteScaleX = (getState().silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X) + 0.05; updateVal(); };

    document.getElementById("pic-short").onclick = () => { getState().silhouetteScaleY = Math.max(0.1, (getState().silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y) - 0.05); updateVal(); };
    document.getElementById("pic-tall").onclick = () => { getState().silhouetteScaleY = (getState().silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y) + 0.05; updateVal(); };
    document.getElementById("pic-favorite").onclick = () => {
        const s = getState();
        if (hasCareerPictureFavorite(s)) clearCareerPictureFavorite(s);
        else saveCareerPictureFavorite(s);
        updateVal();
    };

    document.getElementById("pic-reset").onclick = () => {
        const pictureDefaults = getDefaultPlayerPictureValues(document.body.classList.contains("shorts-mode"));
        getState().silhouetteYOffset = pictureDefaults.silhouetteYOffset;
        getState().silhouetteScaleX = pictureDefaults.silhouetteScaleX;
        getState().silhouetteScaleY = pictureDefaults.silhouetteScaleY;
        getState().careerSlotBadgeScales = [];
        getState().careerSlotYearNudges = [];
        updateVal();
    };
}

// START
init();