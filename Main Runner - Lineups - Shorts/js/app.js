import { FORMATIONS } from "./formations.js";
import { appState, clearSlotPhotoIndices, getState, initLevels } from "./state.js";
import { migratePlayerImages, projectAssetUrl, projectAssetUrlFresh } from "./paths.js";
import { playerPhotoPaths } from "./photo-helpers.js";
import { switchLevel } from "./levels.js";
import {
    applySwapSearchAllNationality,
    applyPlayerPhotoFramingForSourceRelPath,
    isCurrentHeaderTeamNameEditable,
    openSwapLogoModal,
    refreshSwapLogoListFromSearch,
    refreshSwapPlayerListFromSearch,
    renameCurrentClubByNatTeamName,
    renderHeader,
    renderPitch,
    resolveHeaderTeamDisplayName,
    scheduleTeamHeaderNameCenterShift,
    scheduleShortsTeamNameFit,
    shouldUseVideoQuestionLayout,
    syncTeamHeaderLogoVarsFromLevel,
} from "./pitch-render.js";
import { filterTeams, showResults } from "./teams.js";
import { startVideoFlow, stopVideoFlow } from "./video.js";
import { syncShortsVideoModeIdleTimerBar } from "./shorts-idle-timer-bar.js";
import { applyCustomSelects } from "./custom-selects.js";
import { getCurrentLanguage } from "./voice-tab.js";
import { initLevelControls } from "./level-control.js";
import { initSavedScripts, renderSavedScripts } from "./saved-scripts.js";
import { initTransitionsUI } from "./transitions.js";
import { isProdMode, toggleProdMode, runProdValidation, showValidationModal, markBackgroundColorConfirmed, markBackgroundEffectConfirmed } from "./prod-validation.js";
import {
    initSavedTeamLayouts,
    refreshSaveTeamButtonUi,
    confirmAndDeleteSaveIfPresent,
} from "./saved-team-layouts.js";
import { bindDomElements } from "./dom-bindings.js";
import { refreshTeamHeaderHatchGrid } from "./team-header-hatch.js";
import { wireMainTabs, wireControlPanelToggle } from "./ui-panels.js";
import { initOptionalBootstrapUtilities } from "./bootstrap-hybrid.js";
import { initTeamVoiceManager } from "./team-voice-manager.js";
import { initSharedBackgroundTheme } from "../../.Storage/shared/backgrounds/background-theme.js";
import {
    applyDevLiveReloadControls,
    captureDevLiveReloadSnapshot,
    consumeDevLiveReloadSnapshot,
    getInitialLevelCountFromSnapshot,
    restoreDevLiveReloadState,
} from "./dev-live-reload-state.js";

const HEADER_LOGO_SCALE_STEP = 0.1;
const HEADER_LOGO_SCALE_MIN_POSITIVE = 0.001;
const PERFORMANCE_MODE_SESSION_KEY = "lineups:performance-mode";
const SESSION_JSON_CACHE_PREFIX = "lineups:session-json:v1:";
const PERFORMANCE_MODE_QUERY_VALUES = new Set(["1", "true", "on", "yes"]);
const PERFORMANCE_MODE_QUERY_OFF_VALUES = new Set(["0", "false", "off", "no"]);

const HEADER_LOGO_NUDGE_STEP = 6;
const HEADER_LOGO_NUDGE_ABS_MAX = 4000;
const AUTO_FETCH_TEAM_LOGO_ENDPOINT = "/__team-logo/fetch";

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

function sanitizeHeaderLogoScale(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 1;
    const r = Math.round(x * 1000) / 1000;
    if (r < HEADER_LOGO_SCALE_MIN_POSITIVE) return HEADER_LOGO_SCALE_MIN_POSITIVE;
    return r;
}

function currentLevelHeaderLogoScale() {
    const st = getState();
    if (!st) return 1;
    return sanitizeHeaderLogoScale(st.headerLogoScale ?? 1);
}

function sanitizeHeaderLogoNudge(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    const r = Math.round(x);
    return Math.min(HEADER_LOGO_NUDGE_ABS_MAX, Math.max(-HEADER_LOGO_NUDGE_ABS_MAX, r));
}

function currentLevelHeaderLogoNudge() {
    const st = getState();
    if (!st) return 0;
    return sanitizeHeaderLogoNudge(st.headerLogoNudgeX ?? 0);
}

function applyHeaderLogoNudge(px) {
    const n = sanitizeHeaderLogoNudge(px);
    const st = getState();
    if (st) {
        st.headerLogoNudgeX = n;
    }
    const th = appState.els.teamHeader;
    if (th) {
        th.style.setProperty("--header-logo-nudge-x", `${n}px`);
    }
}

function applyHeaderLogoScale(scale) {
    const s = sanitizeHeaderLogoScale(scale);
    const st = getState();
    if (st) {
        st.headerLogoScale = s;
    }
    const th = appState.els.teamHeader;
    if (th) {
        th.style.setProperty("--header-logo-scale", String(s));
    }
}

function initHeaderLogoZoom(onClearTeamSelection) {
    const th = appState.els.teamHeader;
    const zoomOut = document.getElementById("team-header-zoom-out");
    const zoomIn = document.getElementById("team-header-zoom-in");
    const swapLogo = document.getElementById("team-header-swap-logo");
    const fetchLogo = document.getElementById("team-header-fetch-logo");
    const pitchSwapLogo = document.getElementById("pitch-swap-logo");
    const clearTeamBtn = document.getElementById("team-header-clear-team");
    if (pitchSwapLogo) {
        pitchSwapLogo.onclick = () => {
            openSwapLogoModal();
        };
    }
    if (!th || !zoomOut || !zoomIn) return;
    if (swapLogo) {
        swapLogo.onclick = () => {
            openSwapLogoModal();
        };
    }
    if (clearTeamBtn) {
        clearTeamBtn.onclick = () => {
            if (typeof onClearTeamSelection === "function") {
                onClearTeamSelection();
            }
        };
    }
    if (fetchLogo) {
        fetchLogo.onclick = async () => {
            const st = getState();
            if (!st?.currentSquad) return;
            if (fetchLogo.disabled) return;
            const prevText = fetchLogo.textContent || "Get logo";
            fetchLogo.disabled = true;
            fetchLogo.textContent = "...";
            try {
                const res = await fetch(AUTO_FETCH_TEAM_LOGO_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        squadType: st.squadType || "",
                        selectedEntry: st.selectedEntry || {},
                        currentSquadName: st.currentSquad?.name || st.selectedEntry?.name || "",
                        currentSquadImagePath: st.currentSquad?.imagePath || "",
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.ok) {
                    throw new Error(data?.error || "Could not fetch team logo.");
                }
                if (data?.relativePath) {
                    const rel = String(data.relativePath);
                    st.headerLogoOverrideRelPath = `${rel}${rel.includes("?") ? "&" : "?"}_logo=${Date.now()}`;
                    if (st.currentSquad && typeof st.currentSquad === "object") {
                        st.currentSquad.imagePath = rel;
                    }
                }
                renderHeader();
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Could not fetch team logo.";
                window.alert(msg);
            } finally {
                fetchLogo.disabled = false;
                fetchLogo.textContent = prevText;
            }
        };
    }
    syncTeamHeaderLogoVarsFromLevel();
    zoomOut.onclick = () => {
        applyHeaderLogoScale(currentLevelHeaderLogoScale() - HEADER_LOGO_SCALE_STEP);
        scheduleTeamHeaderNameCenterShift();
    };
    zoomIn.onclick = () => {
        applyHeaderLogoScale(currentLevelHeaderLogoScale() + HEADER_LOGO_SCALE_STEP);
        scheduleTeamHeaderNameCenterShift();
    };
    window.addEventListener("resize", () => {
        scheduleTeamHeaderNameCenterShift();
        scheduleShortsTeamNameFit();
    });
}

// ==========================================
// SHARED UI HELPERS (Exported for Sub-Modules)
// ==========================================

const QUIZ_TYPE_VOICE_FILES = {
    "nat-by-club": "../.Storage/Voices/Game name/Guess the football national team name by players' club !!!.mp3",
    "club-by-nat": "../.Storage/Voices/Game name/Guess the football team name by players' nationality !!!.mp3",
};

// ==========================================
// ENDING TYPE VOICE CONTROLS
// ==========================================
const ENDING_TYPE_TEXTS = {
    "think-you-know": "THINK YOU KNOW<br>THE ANSWER?",
    "how-many": "HOW MANY<br>DID YOU GET?",
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
    const params = new URLSearchParams({
        endingType: String(endingType || ""),
        language: getCurrentLanguage(),
    });
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
                    language: getCurrentLanguage(),
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
            language: getCurrentLanguage(),
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
            body: JSON.stringify({ endingType, language: getCurrentLanguage() }),
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
    document.getElementById("ending-type-voice-status")?.remove();
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
        outroTitle.innerHTML = ENDING_TYPE_TEXTS[endingType] || ENDING_TYPE_TEXTS["think-you-know"];
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
    const volBtn = document.querySelector(`button[data-quiz-type-voice-vol="${quizType}"]`);
    const delBtn = document.querySelector(`button[data-quiz-type-voice-del="${quizType}"]`);
    if (volBtn) {
        volBtn.disabled = !!isBusy;
        volBtn.textContent = isBusy ? "..." : "Vol";
    }
    if (delBtn) {
        delBtn.disabled = !!isBusy || !quizTypeVoiceStatusByType[quizType];
    }
}

async function fetchQuizTypeVoiceStatus(quizType, specificTitle = "") {
    const params = new URLSearchParams({
        quizType: String(quizType || ""),
        specificTitle: String(specificTitle || ""),
        language: getCurrentLanguage(),
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
                    language: getCurrentLanguage(),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
            quizTypeVoiceStatusByType[quizType] = true;
            previewSrc = String(body?.src || "");
        }
        renderQuizTypeVoiceStatusPanel();
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
            language: getCurrentLanguage(),
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
            body: JSON.stringify({
                quizType,
                specificTitle: specificTitleText,
                language: getCurrentLanguage(),
            }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
        quizTypeVoiceStatusByType[quizType] = false;
        renderQuizTypeVoiceStatusPanel();
    } catch (err) {
        alert(`Could not delete quiz title voice.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setQuizTypeVoiceBusy(quizType, false);
    }
}

function renderQuizTypeVoiceStatusPanel() {
    document.getElementById("quiz-type-voice-status")?.remove();
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
}

export function updateSetupUI() {
    const { els } = appState;
    if (!els.setupPitchControls) {
        return;
    }
    const subType = els.inQuizType.value;

    els.setupPitchControls.style.display = "flex";

    let targetSquad = "national";
    let targetDisplay = "club";

    if (subType === "club-by-nat") {
        targetSquad = "club";
        targetDisplay = "country";
    }

    let changed = false;
    if (els.squadType.value !== targetSquad) {
        els.squadType.value = targetSquad;
        changed = true;
    }
    if (els.displayMode.value !== targetDisplay) {
        els.displayMode.value = targetDisplay;
        changed = true;
    }

    if (appState.levelsData) {
        appState.levelsData.forEach(lvl => {
            lvl.squadType = targetSquad;
            lvl.displayMode = targetDisplay;
        });
    }

    if (changed && els.squadType.onchange) {
        els.squadType.dispatchEvent(new Event('change'));
        els.displayMode.dispatchEvent(new Event('change'));
    }
}

export function populateSubTypes() {
    const { els } = appState;
    els.inQuizType.innerHTML = `
      <option value="nat-by-club">Guess the football national team name by players' club</option>
      <option value="club-by-nat">Guess the football team name by players' nationality</option>
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

export function updateLanding() {
    const { els } = appState;
    const type = els.inQuizType.value;
    const title = document.getElementById("landing-title");
    if (!title) return;
    const isShorts = document.body.classList.contains("shorts-mode");

    if (isShorts) {
        if (type === "club-by-nat") {
            title.innerHTML =
                "Guess the football <br>team name by <br>players' nationality";
        } else {
            title.innerHTML =
                "Guess the football <br>national team name<br>by players' club";
        }
    } else if (type === "club-by-nat") {
        title.innerHTML = "GUESS THE FOOTBALL<br>TEAM NAME BY<br>PLAYERS' NATIONALITY";
    } else {
        title.innerHTML = "GUESS THE FOOTBALL<br>NATIONAL TEAM NAME<br>BY PLAYERS' CLUB";
    }
    const valEasy = document.getElementById("val-easy");
    if (valEasy) valEasy.textContent = els.inEasy.value;
    const valMedium = document.getElementById("val-medium");
    if (valMedium) valMedium.textContent = els.inMedium.value;
    const valHard = document.getElementById("val-hard");
    if (valHard) valHard.textContent = els.inHard.value;
    const valImpossible = document.getElementById("val-impossible");
    if (valImpossible) valImpossible.textContent = els.inImpossible.value;

    const showSpecial = document.getElementById("in-specific-title-toggle").checked;
    const specificTitleSettings = document.getElementById("specific-title-settings");
    if (specificTitleSettings) {
        specificTitleSettings.style.display = showSpecial ? "flex" : "none";
    }
    const levelState = getState();
    const isWaitingForLandingSpecialBadgeReveal =
        appState.isVideoPlaying && appState.landingSpecialBadgeRevealTimeoutId != null;
    const hideSpecificTitleUntilPlayVideo =
        !!levelState?.videoMode && (!appState.isVideoPlaying || isWaitingForLandingSpecialBadgeReveal);
    const landingSpecialBadge = document.getElementById("landing-special-badge");
    if (landingSpecialBadge) {
        landingSpecialBadge.hidden = !showSpecial || hideSpecificTitleUntilPlayVideo;
    }
    const landingSpecialText = document.getElementById("landing-special-text");
    if (landingSpecialText) {
        landingSpecialText.textContent = els.inSpecificTitleText.value;
    }

    const iconVal = els.inSpecificTitleIcon.value;
    const iconImg = document.getElementById("landing-special-icon-img");
    const iconSpan = document.getElementById("landing-special-icon");
    if (!iconImg || !iconSpan) return;
    if (iconVal.startsWith("icons/")) {
        iconImg.src = projectAssetUrl(iconVal);
        iconImg.hidden = false;
        iconSpan.hidden = true;
    } else {
        iconSpan.textContent = iconVal;
        iconSpan.hidden = false;
        iconImg.hidden = true;
    }
}

// ==========================================
// CORE SYSTEM INIT
// ==========================================

const FIXED_SHORTS_MODE = true;

function applyFixedShortsMode(els) {
    if (els.shortsModeToggle) {
        els.shortsModeToggle.checked = FIXED_SHORTS_MODE;
        els.shortsModeToggle.disabled = true;
    }
    document.documentElement.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
    document.body.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
}

async function init() {
    initOptionalBootstrapUtilities();
    const { els } = appState;
    const devLiveReloadSnapshot = consumeDevLiveReloadSnapshot();

    bindDomElements();
    refreshTeamHeaderHatchGrid(appState.els.teamHeader);
    applyPerformanceModeFromUrl();
    initSharedBackgroundTheme(
        document.getElementById("in-background-color"),
        document.getElementById("in-background-effect"),
        document.getElementById("in-background-opacity"),
        document.getElementById("btn-save-background-opacity"),
    );
    const bgColorSel = document.getElementById("in-background-color");
    const bgEffectSel = document.getElementById("in-background-effect");
    if (bgColorSel) bgColorSel.addEventListener("change", () => markBackgroundColorConfirmed());
    if (bgEffectSel) bgEffectSel.addEventListener("change", () => markBackgroundEffectConfirmed());
    await initTeamVoiceManager();
    function syncShortsModeFab() {
        if (!els.shortsModeBtn || !els.shortsModeToggle) return;
        els.shortsModeBtn.setAttribute("aria-pressed", els.shortsModeToggle.checked ? "true" : "false");
    }
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    syncShortsModeFab();

    // Call initialized modules
    initLevelControls();
    initTransitionsUI();
    initSavedScripts({ populateSubTypes, updateSetupUI, updateLanding });

    FORMATIONS.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.label;
        els.formation.appendChild(opt);
    });
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    syncShortsModeFab();
    window.__captureRunnerState = () => {
        captureDevLiveReloadSnapshot(appState, appState.els);
    };
    window.addEventListener("beforeunload", window.__captureRunnerState);
    window.addEventListener("pagehide", window.__captureRunnerState);

    for (let i = 0; i < 11; i++) {
        const div = document.createElement("div");
        div.className = "player-slot empty";
        div.dataset.slotIndex = String(i);
        const mount = document.createElement("div");
        mount.className = "slot-mount";
        div.appendChild(mount);
        els.pitchSlots.appendChild(div);
    }

    const initialLevelCount = getInitialLevelCountFromSnapshot(devLiveReloadSnapshot, 4);
    initLevels(initialLevelCount);
    const didRestoreState = restoreDevLiveReloadState(appState, devLiveReloadSnapshot);
    const initialLevelIndex = didRestoreState
        ? Math.min(
            Math.max(1, appState.currentLevelIndex),
            Math.max(0, appState.levelsData.length - 1),
        )
        : 1;
    switchLevel(initialLevelIndex);
    syncShortsModeFab();
    initSavedTeamLayouts();

    // Expose for pitch-render.js (avoids circular ES module dependency).
    window.__confirmAndDeleteSaveIfPresent = confirmAndDeleteSaveIfPresent;

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
        renderHeader();
    };

    els.inEndingType.onchange = () => {
        updateOutroText();
        updateLanding();
        renderEndingTypeVoiceStatusPanel();
    };

    els.inEasy.oninput = updateLanding;
    els.inMedium.oninput = updateLanding;
    els.inHard.oninput = updateLanding;
    els.inImpossible.oninput = updateLanding;
    els.inSpecificTitleToggle.onchange = updateLanding;
    els.inSpecificTitleText.oninput = updateLanding;
    els.inSpecificTitleIcon.onchange = updateLanding;

    const specificTitleYes = document.getElementById("specific-title-yes");
    const specificTitleNo = document.getElementById("specific-title-no");
    if (specificTitleYes && specificTitleNo) {
        specificTitleYes.onclick = () => { specificTitleYes.setAttribute("aria-pressed", "true"); specificTitleNo.setAttribute("aria-pressed", "false"); els.inSpecificTitleToggle.checked = true; els.inSpecificTitleToggle.dispatchEvent(new Event("change")); };
        specificTitleNo.onclick = () => { specificTitleNo.setAttribute("aria-pressed", "true"); specificTitleYes.setAttribute("aria-pressed", "false"); els.inSpecificTitleToggle.checked = false; els.inSpecificTitleToggle.dispatchEvent(new Event("change")); };
    }

    els.inShotsSizeToggle.onchange = () => {
        els.shotsSizeOverlay.hidden = !els.inShotsSizeToggle.checked;
    };

    els.updateLevelsBtn.onclick = () => {
        let levels = parseInt(els.quizLevelsInput.value, 10);
        if (isNaN(levels) || levels < 1) levels = 4;
        initLevels(levels);
        const totalQuestions = Math.max(0, appState.totalLevelsCount - 2);
        const { easy, medium, hard, impossible } = computeLandingDifficultyDistribution(totalQuestions);
        els.inEasy.value = String(easy);
        els.inMedium.value = String(medium);
        els.inHard.value = String(hard);
        els.inImpossible.value = String(impossible);
        updateLanding();
        switchLevel(appState.currentLevelIndex);
    };

    els.shortsModeToggle.onchange = (e) => {
        if (e.target.checked) document.body.classList.add("shorts-mode");
        else document.body.classList.remove("shorts-mode");
        document.documentElement.classList.toggle("shorts-mode", e.target.checked);
        updateLanding();
        switchLevel(appState.currentLevelIndex);
        scheduleTeamHeaderNameCenterShift();
        scheduleShortsTeamNameFit();
        syncShortsModeFab();
    };

    if (els.shortsModeBtn && els.shortsModeToggle) {
        els.shortsModeBtn.onclick = () => {
            els.shortsModeToggle.checked = !els.shortsModeToggle.checked;
            els.shortsModeToggle.dispatchEvent(new Event("change"));
        };
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

    els.videoModeToggle.onchange = (e) => {
        const state = getState();
        state.videoMode = e.target.checked;
        if (appState.currentLevelIndex === 0) {
            const logoImg = appState.els?.logoPage?.querySelector(".logo-img-anim");
            if (logoImg) {
                if (state.videoMode && !appState.isVideoPlaying) {
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
        refreshSaveTeamButtonUi();
        if (!e.target.checked && appState.isVideoPlaying) {
            stopVideoFlow();
        }
        const isQuestionLevel =
            appState.currentLevelIndex >= 1 &&
            appState.currentLevelIndex < appState.totalLevelsCount;
        if (isQuestionLevel) {
            renderPitch();
        }
        renderHeader();
        updateLanding();
        syncShortsVideoModeIdleTimerBar();
    };

    if (els.videoModeBtn && els.videoModeToggle) {
        els.videoModeBtn.onclick = () => {
            els.videoModeToggle.checked = !els.videoModeToggle.checked;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        };
    }

    if (els.applyVideoAllBtn && els.videoModeToggle) {
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
    }

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
            if (!result.allPassed) { showValidationModal(result); return; }
        }
        startVideoFlow();
    };
    els.swapClose.onclick = () => els.swapModal.hidden = true;

    els.swapSearch.oninput = () => {
        refreshSwapPlayerListFromSearch();
    };

    if (els.swapSearchAll) {
        els.swapSearchAll.onclick = () => applySwapSearchAllNationality();
    }

    if (els.swapLogoClose && els.swapLogoModal) {
        els.swapLogoClose.onclick = () => {
            els.swapLogoModal.hidden = true;
            appState.swapLogoPickContext = null;
        };
    }
    if (els.swapLogoSearch) {
        els.swapLogoSearch.oninput = () => refreshSwapLogoListFromSearch();
    }
    if (els.swapLogoReset) {
        els.swapLogoReset.onclick = () => {
            const ctx = appState.swapLogoPickContext;
            const st = getState();
            if (ctx?.kind === "slot") {
                const k = String(ctx.slotIndex);
                if (st.slotClubCrestOverrideRelPathBySlot) {
                    delete st.slotClubCrestOverrideRelPathBySlot[k];
                }
                els.swapLogoModal.hidden = true;
                appState.swapLogoPickContext = null;
                renderPitch();
                return;
            }
            st.headerLogoOverrideRelPath = null;
            if (els.swapLogoModal) els.swapLogoModal.hidden = true;
            appState.swapLogoPickContext = null;
            renderHeader();
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

    {
      const quizIdx = appState.currentLevelIndex;
      if (
        quizIdx >= 1 &&
        quizIdx < appState.totalLevelsCount &&
        getState()?.currentSquad
      ) {
        renderPitch();
        renderHeader();
      }
    }

    const clearCurrentTeamSelection = () => {
        const state = getState();
        if (!state) return;

        state.currentSquad = null;
        state.selectedEntry = null;
        state.searchText = "";
        state.customXi = null;
        state.customNames = {};
        state.headerLogoOverrideRelPath = null;
        state.slotClubCrestOverrideRelPathBySlot = {};

        els.teamSearch.value = "";
        els.teamSearch.classList.remove("team-selected");
        els.teamResults.replaceChildren();
        clearSlotPhotoIndices();

        renderHeader();
        renderPitch();
        refreshSaveTeamButtonUi();
    };

    const handleSearchInput = () => {
        els.teamSearch.classList.remove("team-selected");
        getState().searchText = els.teamSearch.value;
        const results = filterTeams(els.teamSearch.value);
        showResults(results);
    };

    els.teamSearch.onfocus = handleSearchInput;
    els.teamSearch.oninput = handleSearchInput;

    els.squadType.onchange = () => {
        const state = getState();
        state.squadType = els.squadType.value;
        state.currentSquad = null;
        state.selectedEntry = null;
        state.searchText = "";
        state.customXi = null;
        state.customNames = {};
        state.headerLogoOverrideRelPath = null;
        state.slotClubCrestOverrideRelPathBySlot = {};

        els.teamSearch.value = "";
        els.teamSearch.classList.remove("team-selected");

        clearSlotPhotoIndices();
        els.teamResults.replaceChildren();

        renderHeader();
        renderPitch();
        handleSearchInput();
        refreshSaveTeamButtonUi();
    };

    els.formation.onchange = () => {
        const state = getState();
        if (!confirmAndDeleteSaveIfPresent()) {
            // User cancelled — revert the select to the current formation.
            els.formation.value = state.formationId;
            applyCustomSelects();
            return;
        }
        state.formationId = els.formation.value;
        clearSlotPhotoIndices();
        renderPitch();
    };

    els.displayMode.onchange = () => {
        const state = getState();
        state.displayMode = els.displayMode.value;
        clearSlotPhotoIndices();
        renderPitch();
    };
    wireControlPanelToggle(els);

    els.pitchSlots.addEventListener("dblclick", (e) => {
        if (appState.isVideoPlaying) return;
        const slot = e.target.closest(".player-slot");
        if (
            e.target.closest(".slot-name") ||
            e.target.closest(".slot-swap-btn") ||
            e.target.closest(".slot-badge-controls")
        )
            return;
        if (!slot || !els.pitchSlots.contains(slot)) return;
        const i = Number(slot.dataset.slotIndex);
        if (Number.isNaN(i)) return;
        const player = appState.currentXi[i];
        if (!player) return;
        const state = getState();
        if (shouldUseVideoQuestionLayout(state) && !e.target.closest(".slot-back")) return;

        const paths = playerPhotoPaths(player, state.displayMode);
        if (paths.length <= 1) return;
        const next = ((state.slotPhotoIndexBySlot.get(i) ?? 0) + 1) % paths.length;
        state.slotPhotoIndexBySlot.set(i, next);
        const img = shouldUseVideoQuestionLayout(state)
            ? slot.querySelector(".slot-back .slot-avatar .slot-img")
            : slot.querySelector(".slot-avatar .slot-img");
        if (img) {
            applyPlayerPhotoFramingForSourceRelPath(img, paths[next]);
            img.src = projectAssetUrlFresh(paths[next]);
        }
    });

    if (els.headerName) {
        els.headerName.addEventListener("dblclick", () => {
            if (appState.isVideoPlaying) return;
            if (!isCurrentHeaderTeamNameEditable()) return;
            const state = getState();
            if (!state?.currentSquad) return;
            const currentDisplay = resolveHeaderTeamDisplayName(
                state,
                els.inQuizType?.value || "nat-by-club"
            );
            const nextName = window.prompt(
                "Enter a custom team name for this nationality quiz.\nLeave empty to reset.",
                currentDisplay || ""
            );
            if (nextName === null) return;
            renameCurrentClubByNatTeamName(nextName);
        });
    }

    populateSubTypes();
    renderEndingTypeVoiceStatusPanel();
    void refreshEndingTypeVoiceLabels();
    updateOutroText();
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    updateSetupUI();
    if (didRestoreState) {
        switchLevel(appState.currentLevelIndex);
    }
    updateLanding();
    applyCustomSelects();
    syncVideoModeButton(!!getState()?.videoMode);
    syncApplyVideoAllButton(areAllLevelsVideoModeEnabled());
    initHeaderLogoZoom(clearCurrentTeamSelection);
    document.fonts?.ready?.then(() => scheduleShortsTeamNameFit());
    appState.refreshLandingUi = updateLanding;
}

// START
init();