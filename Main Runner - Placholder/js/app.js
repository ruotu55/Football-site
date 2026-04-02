import {
    appState,
    getState,
    initLevels,
} from "./state.js";
import { projectAssetUrl } from "./paths.js";
import { switchLevel } from "./levels.js";
import {
    renderHeader,
    renderCareer,
    syncCareerSlotControlsVisibility,
    applyCareerPictureModeToActiveState,
    persistCareerPictureModeFromActiveState,
} from "./pitch-render.js";
import { startVideoFlow, stopVideoFlow } from "./video.js";
import { initFloatingEmojis } from "./emojis.js";
import { applyCustomSelects } from "./custom-selects.js";
import { initLevelControls } from "./level-control.js";
import { initSavedScripts, renderSavedScripts } from "./saved-scripts.js";
import { bindDomElements } from "./dom-bindings.js";
import { wireMainTabs, wireControlPanelToggle } from "./ui-panels.js";
import { initOptionalBootstrapUtilities } from "./bootstrap-hybrid.js";
import { loadCareerPictureFavoritesFromFile } from "./career-size-favorites.js";
import {
    applyDevLiveReloadControls,
    captureDevLiveReloadSnapshot,
    consumeDevLiveReloadSnapshot,
    getInitialLevelCountFromSnapshot,
    restoreDevLiveReloadState,
} from "./dev-live-reload-state.js";

export function updateSetupUI() {
    const { els } = appState;
    if (els.setupPitchControls) els.setupPitchControls.style.display = "none";
    if (els.setupCareerControls) els.setupCareerControls.style.display = "none";
}

export function populateSubTypes() {
    const { els } = appState;
    els.inQuizType.innerHTML = `<option value="placholder" selected>Placholder</option>`;
    if (els.inQuizType.options.length > 0) els.inQuizType.selectedIndex = 0;
    updateSetupUI();
    applyCustomSelects();
}

function shortsLandingTitleFromQuizSubtype(els) {
    const raw = (els.inQuizType?.options?.[els.inQuizType?.selectedIndex]?.textContent || "").trim();
    if (!raw) return "Placholder";
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
    const isShorts = document.body.classList.contains("shorts-mode");

    title.innerHTML = isShorts
        ? shortsLandingTitleFromQuizSubtype(els)
        : "PLACHOLDER";

    const landingQCount = document.getElementById("landing-q-count");
    if (landingQCount) landingQCount.textContent = appState.totalLevelsCount - 3;
    const valEasy = document.getElementById("val-easy");
    if (valEasy) valEasy.textContent = els.inEasy.value;
    const valMedium = document.getElementById("val-medium");
    if (valMedium) valMedium.textContent = els.inMedium.value;
    const valHard = document.getElementById("val-hard");
    if (valHard) valHard.textContent = els.inHard.value;
    const valImpossible = document.getElementById("val-impossible");
    if (valImpossible) valImpossible.textContent = els.inImpossible.value;

    const showSpecial = document.getElementById("in-specific-title-toggle").checked;
    document.getElementById("specific-title-settings").style.display = showSpecial ? "flex" : "none";
    const badgeEl = document.getElementById("landing-special-badge");
    if (isShorts && showSpecial) {
        if (!appState.isVideoPlaying) {
            badgeEl.hidden = true;
        }
    } else {
        badgeEl.hidden = !showSpecial;
    }
    document.getElementById("landing-special-text").textContent = els.inSpecificTitleText.value;

    const iconVal = els.inSpecificTitleIcon.value;
    const iconImg = document.getElementById("landing-special-icon-img");
    const iconSpan = document.getElementById("landing-special-icon");
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

export function syncShortsCirclePreviewPanel() {}

export function applyShortsCirclePreviewFromControls() {}

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

    initFloatingEmojis();
    initLevelControls();
    initSavedScripts({
        populateSubTypes,
        updateSetupUI,
        updateLanding,
        syncShortsCirclePreviewPanel,
    });

    const initialLevelCount = getInitialLevelCountFromSnapshot(devLiveReloadSnapshot, 20);
    initLevels(initialLevelCount);
    const didRestoreState = restoreDevLiveReloadState(appState, devLiveReloadSnapshot);
    const initialLevelIndex = didRestoreState
        ? Math.min(
            Math.max(0, appState.currentLevelIndex),
            Math.max(0, appState.levelsData.length - 1),
        )
        : 0;
    switchLevel(initialLevelIndex);
    syncShortsModeFab();

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && appState.isVideoPlaying) {
            stopVideoFlow();
        }
    });

    wireMainTabs(els);

    els.inQuizType.onchange = () => {
        updateSetupUI();
        updateLanding();
        renderSavedScripts();
    };

    els.inEasy.oninput = updateLanding;
    els.inMedium.oninput = updateLanding;
    els.inHard.oninput = updateLanding;
    els.inImpossible.oninput = updateLanding;
    els.inSpecificTitleToggle.onchange = updateLanding;
    els.inSpecificTitleText.oninput = updateLanding;
    els.inSpecificTitleIcon.onchange = updateLanding;

    els.updateLevelsBtn.onclick = () => {
        let levels = parseInt(els.quizLevelsInput.value, 10);
        if (isNaN(levels) || levels < 1) levels = 20;
        initLevels(levels);
        updateLanding();
        switchLevel(appState.currentLevelIndex);
    };

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

    function syncVideoModeButton(isEnabled) {
        if (!els.videoModeBtn) return;
        els.videoModeBtn.setAttribute("aria-pressed", isEnabled ? "true" : "false");
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
                    logoImg.classList.remove("reveal");
                } else if (!state.videoMode && !appState.isVideoPlaying) {
                    logoImg.classList.remove("reveal");
                    void logoImg.offsetWidth;
                    logoImg.classList.add("reveal");
                }
            }
        }
        syncVideoModeButton(state.videoMode);
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
    };

    if (els.videoModeBtn && els.videoModeToggle) {
        els.videoModeBtn.onclick = () => {
            els.videoModeToggle.checked = !els.videoModeToggle.checked;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        };
    }

    if (els.applyVideoAllBtn && els.videoModeToggle) {
        els.applyVideoAllBtn.onclick = () => {
            appState.levelsData.forEach((lvl) => {
                lvl.videoMode = true;
            });
            els.videoModeToggle.checked = true;
            els.videoModeToggle.dispatchEvent(new Event("change"));
        };
    }

    els.playVideoBtn.onclick = () => startVideoFlow();

    wireControlPanelToggle(els);

    populateSubTypes();
    updateLanding();
    applyCustomSelects();
    syncVideoModeButton(!!getState()?.videoMode);
}

init();
