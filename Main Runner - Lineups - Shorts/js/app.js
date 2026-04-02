import { FORMATIONS } from "./formations.js";
import { appState, clearSlotPhotoIndices, getState, initLevels } from "./state.js";
import { migratePlayerImages, projectAssetUrl, projectAssetUrlFresh } from "./paths.js";
import { playerPhotoPaths } from "./photo-helpers.js";
import { switchLevel } from "./levels.js";
import {
    clearPitchWrapTransitionOverride,
    renderHeader,
    renderPitch,
    renderSwapList,
    scheduleTeamHeaderNameCenterShift,
    scheduleShortsTeamNameFit,
    shouldUseVideoQuestionLayout,
    syncQuestionPitchVideoModeInPlace,
    syncTeamHeaderLogoVarsFromLevel,
} from "./pitch-render.js";
import { filterTeams, showResults, filterLeagues } from "./teams.js";
import { startVideoFlow, stopVideoFlow } from "./video.js";
import { initFloatingEmojis } from "./emojis.js";
import { applyCustomSelects } from "./custom-selects.js";
import { initLevelControls } from "./level-control.js";
import { initSavedScripts, renderSavedScripts } from "./saved-scripts.js";
import { bindDomElements } from "./dom-bindings.js";
import { wireMainTabs, wireControlPanelToggle } from "./ui-panels.js";
import { initOptionalBootstrapUtilities } from "./bootstrap-hybrid.js";
import {
    applyDevLiveReloadControls,
    captureDevLiveReloadSnapshot,
    consumeDevLiveReloadSnapshot,
    getInitialLevelCountFromSnapshot,
    restoreDevLiveReloadState,
} from "./dev-live-reload-state.js";

const HEADER_LOGO_SCALE_STEP = 0.1;
const HEADER_LOGO_SCALE_MIN_POSITIVE = 0.001;

const HEADER_LOGO_NUDGE_STEP = 6;
const HEADER_LOGO_NUDGE_ABS_MAX = 4000;

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

function initHeaderLogoZoom() {
    const th = appState.els.teamHeader;
    const zoomOut = document.getElementById("team-header-zoom-out");
    const zoomIn = document.getElementById("team-header-zoom-in");
    const nudgeLeft = document.getElementById("team-header-nudge-left");
    const nudgeRight = document.getElementById("team-header-nudge-right");
    if (!th || !zoomOut || !zoomIn || !nudgeLeft || !nudgeRight) return;
    syncTeamHeaderLogoVarsFromLevel();
    zoomOut.onclick = () => {
        applyHeaderLogoScale(currentLevelHeaderLogoScale() - HEADER_LOGO_SCALE_STEP);
        scheduleTeamHeaderNameCenterShift();
    };
    zoomIn.onclick = () => {
        applyHeaderLogoScale(currentLevelHeaderLogoScale() + HEADER_LOGO_SCALE_STEP);
        scheduleTeamHeaderNameCenterShift();
    };
    nudgeLeft.onclick = () =>
        applyHeaderLogoNudge(currentLevelHeaderLogoNudge() - HEADER_LOGO_NUDGE_STEP);
    nudgeRight.onclick = () =>
        applyHeaderLogoNudge(currentLevelHeaderLogoNudge() + HEADER_LOGO_NUDGE_STEP);
    window.addEventListener("resize", () => {
        scheduleTeamHeaderNameCenterShift();
        scheduleShortsTeamNameFit();
    });
}

// ==========================================
// SHARED UI HELPERS (Exported for Sub-Modules)
// ==========================================

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

    updateSetupUI();
    applyCustomSelects();
}

export function updateLanding() {
    const { els } = appState;
    const type = els.inQuizType.value;
    const title = document.getElementById("landing-title");
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

// ==========================================
// CORE SYSTEM INIT
// ==========================================

const FIXED_SHORTS_MODE = true;

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

    // Call initialized modules
    initFloatingEmojis();
    initLevelControls();
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

    for (let i = 0; i < 11; i++) {
        const div = document.createElement("div");
        div.className = "player-slot empty";
        div.dataset.slotIndex = String(i);
        els.pitchSlots.appendChild(div);
    }

    const initialLevelCount = getInitialLevelCountFromSnapshot(devLiveReloadSnapshot, 20);
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
        if (e.target.checked) document.body.classList.add("shorts-mode");
        else document.body.classList.remove("shorts-mode");
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

    els.videoModeToggle.onchange = (e) => {
        const state = getState();
        state.videoMode = e.target.checked;
        syncVideoModeButton(state.videoMode);
        clearPitchWrapTransitionOverride();
        renderHeader();
        if (!syncQuestionPitchVideoModeInPlace(getState())) {
            renderPitch();
        }
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
    els.swapClose.onclick = () => els.swapModal.hidden = true;

    els.swapSearch.oninput = (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = appState.swapAvailablePlayers.filter((p) => p.name.toLowerCase().includes(q));
        renderSwapList(filtered);
    };

    // Load indexes
    const fetchJsonNoCache = (path) => fetch(projectAssetUrl(path), { cache: "no-store" }).then((r) => r.json());
    const [idx, photos, flags] = await Promise.all([
        fetchJsonNoCache("data/teams-index.json"),
        fetchJsonNoCache("data/player-images.json").catch(() => ({ club: {}, nationality: {} })),
        fetchJsonNoCache("data/country-to-flagcode.json").catch(() => ({ codes: {} })),
    ]);
    appState.teamsIndex = idx;
    appState.playerImages = migratePlayerImages(photos);
    appState.flagcodes = flags.codes || {};

    const handleSearchInput = () => {
        els.teamSearch.classList.remove("team-selected");
        const mode = els.searchMode.value;

        if (mode === "team") {
            getState().searchText = els.teamSearch.value;
            const results = filterTeams(els.teamSearch.value);
            showResults(results);
        } else {
            const results = filterLeagues(els.teamSearch.value);
            if (typeof showLeagueResults === 'function') {
                showLeagueResults(results);
            }
        }
    };

    els.teamSearch.onfocus = handleSearchInput;
    els.teamSearch.oninput = handleSearchInput;

    els.searchMode.onchange = () => {
        els.teamSearch.value = "";
        els.teamSearch.classList.remove("team-selected");
        els.teamResults.replaceChildren();
        handleSearchInput();
    };

    els.squadType.onchange = () => {
        const state = getState();
        state.squadType = els.squadType.value;
        state.currentSquad = null;
        state.selectedEntry = null;
        state.searchText = "";
        state.customXi = null;
        state.customNames = {};

        els.teamSearch.value = "";
        els.teamSearch.classList.remove("team-selected");

        clearSlotPhotoIndices();
        els.teamResults.replaceChildren();

        renderHeader();
        renderPitch();
        handleSearchInput();
    };

    els.formation.onchange = () => {
        const state = getState();
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
            img.src = projectAssetUrlFresh(paths[next]);
        }
    });

    populateSubTypes();
    applyDevLiveReloadControls(els, devLiveReloadSnapshot);
    applyFixedShortsMode(els);
    updateSetupUI();
    if (didRestoreState) {
        switchLevel(appState.currentLevelIndex);
    }
    updateLanding();
    applyCustomSelects();
    syncVideoModeButton(!!getState()?.videoMode);
    initHeaderLogoZoom();
    document.fonts?.ready?.then(() => scheduleShortsTeamNameFit());
}

// START
init();