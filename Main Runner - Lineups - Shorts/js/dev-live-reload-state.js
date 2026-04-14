const SNAPSHOT_KEY = "lineups-shorts-fcbnew-dev-live-reload-snapshot-v1";
const FIXED_SHORTS_MODE = true;

function isLiveReloadSession() {
    return typeof window !== "undefined" && window.__RUNNER_LIVE_RELOAD__ === true;
}

function safeJsonParse(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function coerceNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function serializeLevel(level) {
    if (!level || typeof level !== "object") return null;
    const rawMap = level.slotPhotoIndexBySlot;
    return {
        ...level,
        slotPhotoIndexBySlotEntries:
            rawMap instanceof Map ? Array.from(rawMap.entries()) : [],
    };
}

function deserializeLevel(raw) {
    if (!raw || typeof raw !== "object") return null;
    const mapEntries = Array.isArray(raw.slotPhotoIndexBySlotEntries)
        ? raw.slotPhotoIndexBySlotEntries
        : [];
    const level = { ...raw };
    delete level.slotPhotoIndexBySlotEntries;
    level.slotPhotoIndexBySlot = new Map(mapEntries);
    return level;
}

export function consumeDevLiveReloadSnapshot() {
    if (!isLiveReloadSession()) return null;
    const parsed = safeJsonParse(sessionStorage.getItem(SNAPSHOT_KEY));
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
}

export function captureDevLiveReloadSnapshot(appState, els) {
    if (!isLiveReloadSession()) return;
    if (!appState || !Array.isArray(appState.levelsData) || appState.levelsData.length === 0) return;
    if (!Number.isFinite(appState.totalLevelsCount) || appState.totalLevelsCount < 4) return;
    if (!Number.isFinite(appState.currentLevelIndex)) return;
    const payload = {
        version: 1,
        totalLevelsCount: appState.totalLevelsCount,
        currentLevelIndex: appState.currentLevelIndex,
        levelsData: appState.levelsData.map(serializeLevel).filter(Boolean),
        controls: {
            quizLevelsInput: els.quizLevelsInput?.value ?? null,
            inEasy: els.inEasy?.value ?? null,
            inMedium: els.inMedium?.value ?? null,
            inHard: els.inHard?.value ?? null,
            inImpossible: els.inImpossible?.value ?? null,
            inSpecificTitleToggle: !!els.inSpecificTitleToggle?.checked,
            inShotsSizeToggle: !!els.inShotsSizeToggle?.checked,
            inSpecificTitleText: els.inSpecificTitleText?.value ?? null,
            inSpecificTitleIcon: els.inSpecificTitleIcon?.value ?? null,
            shortsModeToggle: FIXED_SHORTS_MODE,
            inQuizType: els.inQuizType?.value ?? null,
            squadType: els.squadType?.value ?? null,
            displayMode: els.displayMode?.value ?? null,
            formation: els.formation?.value ?? null,
            videoModeToggle: !!els.videoModeToggle?.checked,
            searchMode: els.searchMode?.value ?? null,
            teamSearch: els.teamSearch?.value ?? null,
        },
    };
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
}

export function applyDevLiveReloadControls(els, snapshot) {
    if (!snapshot || !snapshot.controls) return;
    const c = snapshot.controls;
    if (els.quizLevelsInput && c.quizLevelsInput != null) els.quizLevelsInput.value = c.quizLevelsInput;
    if (els.inEasy && c.inEasy != null) els.inEasy.value = c.inEasy;
    if (els.inMedium && c.inMedium != null) els.inMedium.value = c.inMedium;
    if (els.inHard && c.inHard != null) els.inHard.value = c.inHard;
    if (els.inImpossible && c.inImpossible != null) els.inImpossible.value = c.inImpossible;
    if (els.inSpecificTitleToggle) els.inSpecificTitleToggle.checked = !!c.inSpecificTitleToggle;
    if (els.inShotsSizeToggle) {
        els.inShotsSizeToggle.checked = !!c.inShotsSizeToggle;
        const overlay = document.getElementById("shots-size-overlay");
        if (overlay) overlay.hidden = !els.inShotsSizeToggle.checked;
    }
    if (els.inSpecificTitleText && c.inSpecificTitleText != null) els.inSpecificTitleText.value = c.inSpecificTitleText;
    if (els.inSpecificTitleIcon && c.inSpecificTitleIcon != null) els.inSpecificTitleIcon.value = c.inSpecificTitleIcon;
    if (els.shortsModeToggle) {
        els.shortsModeToggle.checked = FIXED_SHORTS_MODE;
        els.shortsModeToggle.disabled = true;
    }
    if (els.inQuizType && c.inQuizType != null) els.inQuizType.value = c.inQuizType;
    if (els.squadType && c.squadType != null) els.squadType.value = c.squadType;
    if (els.displayMode && c.displayMode != null) els.displayMode.value = c.displayMode;
    if (els.formation && c.formation != null) els.formation.value = c.formation;
    if (els.videoModeToggle) els.videoModeToggle.checked = !!c.videoModeToggle;
    if (els.searchMode && c.searchMode != null) els.searchMode.value = c.searchMode;
    if (els.teamSearch && c.teamSearch != null) els.teamSearch.value = c.teamSearch;
    document.body.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
    if (els.shortsModeBtn && els.shortsModeToggle) {
        els.shortsModeBtn.setAttribute("aria-pressed", FIXED_SHORTS_MODE ? "true" : "false");
    }
}

export function getInitialLevelCountFromSnapshot(snapshot, fallbackCount = 20) {
    if (!snapshot || !Number.isFinite(snapshot.totalLevelsCount)) return fallbackCount;
    return Math.max(1, Math.floor(snapshot.totalLevelsCount) - 3);
}

export function restoreDevLiveReloadState(appState, snapshot) {
    if (!snapshot || !Array.isArray(snapshot.levelsData)) return false;
    const levels = snapshot.levelsData.map(deserializeLevel).filter(Boolean);
    if (levels.length === 0) return false;

    const totalLevelsCount = Math.max(4, Math.floor(coerceNumber(snapshot.totalLevelsCount, levels.length)));
    appState.totalLevelsCount = totalLevelsCount;
    appState.levelsData = levels;
    appState.currentLevelIndex = Math.min(
        Math.max(0, Math.floor(coerceNumber(snapshot.currentLevelIndex, 0))),
        Math.max(0, appState.levelsData.length - 1),
    );
    return true;
}
