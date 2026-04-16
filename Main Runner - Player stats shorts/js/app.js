import {
    appState,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
    DEFAULT_PLAYER_SILHOUETTE_Y_OFFSET,
    getDefaultPlayerPictureValuesForCareerMode,
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
} from "./pitch-render.js";
import { loadSquadJson } from "./teams.js";
import { startVideoFlow, stopVideoFlow } from "./video.js";
import { applyCustomSelects } from "./custom-selects.js";
import { initLevelControls, renderLevelsReorderList } from "./level-control.js";
import { initSavedScripts, renderSavedScripts } from "./saved-scripts.js";
import { initTransitionsUI } from "./transitions.js";
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

function endpointUrl(relPath) {
    return projectAssetUrl(relPath);
}

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

    Array.from(endingTypeSelect.options || []).forEach((opt) => {
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
    const options = Array.from(endingTypeSelect.options || []);
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

export function updateSetupUI() {
    const { els } = appState;
    if (els.setupPitchControls) els.setupPitchControls.style.display = "none";
    if (els.setupCareerControls) els.setupCareerControls.style.display = "flex";
    if (els.setupCareerClubsField) els.setupCareerClubsField.style.display = "flex";
    if (els.setupCareerSilhouetteField) els.setupCareerSilhouetteField.style.display = "none";
    if (els.btnPictureControls) els.btnPictureControls.style.display = "block";
}

export function populateSubTypes() {
    const { els } = appState;
    els.inQuizType.innerHTML = `
      <option value="player-by-career-stats" selected>guess the player by career stats</option>
    `;

    if (els.inQuizType.options.length > 0) {
        els.inQuizType.selectedIndex = 0;
    }

    updateSetupUI();
    applyCustomSelects();
}

/** Shorts landing: same wording as quiz sub-type option, line break before first " by " (sentence case). */
function shortsLandingTitleFromQuizSubtype(els) {
    const sel = els.inQuizType;
    const raw = (sel?.options?.[sel?.selectedIndex]?.textContent || "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    const by = " by ";
    const i = lower.indexOf(by);
    if (i > 0) {
        return `${raw.slice(0, i).trim()}<br>${raw.slice(i).trim()}`;
    }
    return raw;
}

export function updateLanding() {
    const { els } = appState;
    const title = document.getElementById("landing-title");
    if (!title) return;
    const isShorts = document.body.classList.contains("shorts-mode");

    title.innerHTML = isShorts
        ? shortsLandingTitleFromQuizSubtype(els)
        : "GUESS THE PLAYER<br>BY CAREER STATS";

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
    const badgeEl = document.getElementById("landing-special-badge");
    if (!badgeEl) return;
    if (isShorts && showSpecial) {
        if (!appState.isVideoPlaying) {
            badgeEl.hidden = true;
        }
    } else {
        badgeEl.hidden = !showSpecial;
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
    applyPerformanceModeFromUrl();
    initSharedBackgroundTheme(
        document.getElementById("in-background-color"),
        document.getElementById("in-background-effect"),
        document.getElementById("in-background-opacity"),
        document.getElementById("btn-save-background-opacity"),
    );
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
    initLevelControls();
    initTransitionsUI();
    initSavedScripts({
        populateSubTypes,
        updateSetupUI,
        updateLanding,
        syncShortsCirclePreviewPanel,
    });

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
    els.inSpecificTitleToggle.onchange = updateLanding;
    els.inSpecificTitleText.oninput = updateLanding;
    els.inSpecificTitleIcon.onchange = updateLanding;

    els.inShotsSizeToggle.onchange = () => {
        els.shotsSizeOverlay.hidden = !els.inShotsSizeToggle.checked;
    };

    els.updateLevelsBtn.onclick = () => {
        let levels = parseInt(els.quizLevelsInput.value, 10);
        if (isNaN(levels) || levels < 1) levels = 4;
        initLevels(levels);
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

    els.shortsModeToggle.onchange = (e) => {
        const state = getState();
        const wasShorts = document.body.classList.contains("shorts-mode");
        persistCareerPictureModeFromActiveState(state, wasShorts);
        if (e.target.checked) document.body.classList.add("shorts-mode");
        else document.body.classList.remove("shorts-mode");
        document.documentElement.classList.toggle("shorts-mode", e.target.checked);
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
            appState.currentLevelIndex >= 1 &&
            appState.currentLevelIndex < appState.totalLevelsCount;
        if (isQuestionLevel) {
            renderCareer();
        }
        renderHeader();
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

    els.playVideoBtn.onclick = () => startVideoFlow();

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

    let allGlobalPlayersLoadPromise = null;

    function removeAccents(str) {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    async function loadAllGlobalPlayers() {
        if (appState.allGlobalPlayers) return appState.allGlobalPlayers;
        if (allGlobalPlayersLoadPromise) return allGlobalPlayersLoadPromise;

        allGlobalPlayersLoadPromise = (async () => {
            const allPlayers = [];
            const clubs = appState.teamsIndex.clubs || [];
            const batchSize = 10;

            for (let i = 0; i < clubs.length; i += batchSize) {
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

        const historyLen = state.careerHistory.length;
        const finalCount = Math.max(2, historyLen);
        state.careerClubsCount = finalCount;
        if (els.inCareerClubs) {
            els.inCareerClubs.value = finalCount;
        }

        /* Reset picture settings to defaults when selecting a new player. */
        state.silhouetteYOffset = 0;
        state.silhouetteScaleX = 1.0;
        state.silhouetteScaleY = 1.0;
        state.silhouetteVideoYOffset = 0;
        state.silhouetteVideoScaleX = 1.0;
        state.silhouetteVideoScaleY = 1.0;
        state.silhouetteNormalYOffset = 0;
        state.silhouetteNormalScaleX = 1.0;
        state.silhouetteNormalScaleY = 1.0;
        state.silhouetteShortsVideoYOffset = 13;
        state.silhouetteShortsVideoScaleX = 0.85;
        state.silhouetteShortsVideoScaleY = 1.0;
        state.silhouetteShortsNormalYOffset = 0;
        state.silhouetteShortsNormalScaleX = 1.0;
        state.silhouetteShortsNormalScaleY = 1.0;

        const sourceClub = (pData._clubItem && pData._clubItem.name) ? pData._clubItem.name : "";
        const context = teamLabel || sourceClub || "";
        if (els.careerSelectedInfo) {
            els.careerSelectedInfo.innerHTML = context
                ? `Selected: <span style="color:#fff;">${pData.name}</span> (${context})`
                : `Selected: <span style="color:#fff;">${pData.name}</span>`;
        }
        function refreshLevelsControlNamesIfOpen() {
            if (
                els.rightPanel &&
                !els.rightPanel.hidden &&
                document.getElementById("levels-reorder-container")
            ) {
                renderLevelsReorderList();
            }
        }

        const shouldEnableVideoMode = !state.videoMode && !!els.videoModeToggle;
        if (shouldEnableVideoMode) {
            // Reuse existing video mode change handler so all related UI/state stays in sync.
            els.videoModeToggle.checked = true;
            els.videoModeToggle.dispatchEvent(new Event("change"));
            refreshLevelsControlNamesIfOpen();
            return;
        }

        renderCareer();
        renderHeader();
        refreshLevelsControlNamesIfOpen();
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
        const isShorts = document.body.classList.contains("shorts-mode");
        const pictureDefaults = getDefaultPlayerPictureValuesForCareerMode(isShorts, !!getState().videoMode);
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