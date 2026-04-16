// js/saved-scripts.js (Lineups runner — namespaced storage + one-time legacy import)
import {
    appState,
    DEFAULT_SLOT_FLAG_SCALE,
    DEFAULT_SLOT_TEAM_LOGO_SCALE,
    ensureSlotFrontFaceScales,
} from "./state.js";
import { switchLevel } from "./levels.js";
import { applyCustomSelects } from "./custom-selects.js";
import { createSavedScriptsServerSync } from "./runner-saved-server-sync.js";
import { captureTransitionSettings, applyTransitionSettings } from "./transitions.js";

const KEY_SCRIPTS = "footballQuizScripts_lineups_regular_fcbnew";
const KEY_FOLDERS = "footballQuizFolders_lineups_regular_fcbnew";
const KEY_FOLDER_STATES = "footballQuizFolderStates_lineups_regular_fcbnew";
const LEGACY_SCRIPTS = "footballQuizScripts";
const LEGACY_FOLDERS = "footballQuizFolders";
const LEGACY_FOLDER_STATES = "footballQuizFolderStates";
const FIXED_SHORTS_MODE = false;

const SPECIFIC_TITLE_ICON_PATH_MAP = {
    "Images/Icons/specific-title/premier-league.png": "Images/Icons/specific-title/Premier League.png",
    "Images/Icons/specific-title/la-liga.png": "Images/Icons/specific-title/La Liga.png",
    "Images/Icons/specific-title/serie-a.png": "Images/Icons/specific-title/Seria A.png",
    "Images/Icons/specific-title/bundesliga.png": "Images/Icons/specific-title/Bundesliga.png",
    "Images/Icons/specific-title/ligue-1.png": "Images/Icons/specific-title/Ligue 1.png",
    "Images/Icons/specific-title/fifa-world-cup.png": "Images/Icons/specific-title/World Cup 2026.png",
    "Images/Icons/specific-title/uefa-champions-league.png": "Images/Icons/specific-title/Champions League.png",
    "Images/Icons/specific-title/uefa-europa-league.png": "Images/Icons/specific-title/Europa League.png",
    "Images/Icons/specific-title/uefa-conference-league.png": "Images/Icons/specific-title/Conference League.png",
};

function normalizeSpecificTitleIconPath(iconPath) {
    return SPECIFIC_TITLE_ICON_PATH_MAP[iconPath] || iconPath || "";
}

const SAVE_SERVER = createSavedScriptsServerSync("lineups_regular", {
    KEY_SCRIPTS,
    KEY_FOLDERS,
    KEY_FOLDER_STATES,
});

function persistSaved() {
    SAVE_SERVER.flushLocalAndServer(savedScripts, savedFolders, folderStates);
}

function scriptHasCareer(s) {
    if ((s.landing?.gameMode || "lineup") === "career") return true;
    return (s.levels || []).some((l) => l.gameMode === "career");
}

function migrateLegacyLineups() {
    let scripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
    if (scripts.length > 0) return;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SCRIPTS) || "[]");
    const filtered = legacy.filter((s) => !scriptHasCareer(s));
    if (filtered.length === 0) return;
    localStorage.setItem(KEY_SCRIPTS, JSON.stringify(filtered));
    if (!localStorage.getItem(KEY_FOLDERS)) {
        localStorage.setItem(KEY_FOLDERS, localStorage.getItem(LEGACY_FOLDERS) || "[]");
    }
    if (!localStorage.getItem(KEY_FOLDER_STATES)) {
        localStorage.setItem(KEY_FOLDER_STATES, localStorage.getItem(LEGACY_FOLDER_STATES) || "{}");
    }
}

migrateLegacyLineups();

let savedScripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
let savedFolders = JSON.parse(localStorage.getItem(KEY_FOLDERS) || "[]");
let folderStates = JSON.parse(localStorage.getItem(KEY_FOLDER_STATES) || "{}");
let scriptToDeleteIndex = -1;
let activeScriptName = null; 

let uiCallbacks = {}; 

export function initSavedScripts(callbacks) {
    uiCallbacks = callbacks || {};
    const { els } = appState;

    let pendingSaveDiscardAction = null;

    function hideSaveDiscardModal() {
        pendingSaveDiscardAction = null;
        if (els.saveDiscardModal) els.saveDiscardModal.hidden = true;
    }

    function hideSaveScriptModal() {
        if (els.saveScriptModal) els.saveScriptModal.hidden = true;
        if (els.saveScriptName) els.saveScriptName.value = "";
    }

    function requestCloseSaveScriptModal() {
        const raw = els.saveScriptName?.value?.trim() || "";
        if (!raw) {
            hideSaveScriptModal();
            return;
        }
        pendingSaveDiscardAction = () => hideSaveScriptModal();
        if (els.saveDiscardModal) els.saveDiscardModal.hidden = false;
    }

    if (els.saveDiscardNo) {
        els.saveDiscardNo.onclick = () => hideSaveDiscardModal();
    }
    if (els.saveDiscardYes) {
        els.saveDiscardYes.onclick = () => {
            if (pendingSaveDiscardAction) pendingSaveDiscardAction();
            hideSaveDiscardModal();
        };
    }

    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key !== "Escape") return;
            if (els.saveDiscardModal && !els.saveDiscardModal.hidden) {
                e.preventDefault();
                hideSaveDiscardModal();
                return;
            }
            if (els.saveScriptModal && !els.saveScriptModal.hidden) {
                e.preventDefault();
                requestCloseSaveScriptModal();
            }
        },
        true,
    );

    els.btnCreateFolder.onclick = () => {
        els.createFolderName.value = "";
        els.createFolderModal.hidden = false;
        els.createFolderName.focus();
    };

    els.createFolderCancel.onclick = () => {
        els.createFolderModal.hidden = true;
    };

    els.createFolderConfirm.onclick = () => {
        const name = els.createFolderName.value.trim();
        if (!name) return;
        if (!savedFolders.includes(name)) {
            savedFolders.push(name);
            persistSaved();
        }
        els.createFolderModal.hidden = true;
        renderSavedScripts();
    };

    els.btnSaveScript.onclick = () => {
        els.saveScriptName.value = "";
        els.saveScriptModal.hidden = false;
        els.saveScriptName.focus();
    };

    els.saveScriptCancel.onclick = () => requestCloseSaveScriptModal();
    if (els.saveScriptModalClose) {
        els.saveScriptModalClose.onclick = () => requestCloseSaveScriptModal();
    }

    els.saveScriptConfirm.onclick = () => {
        const name = els.saveScriptName.value.trim();
        if (!name) return;
        
        const levelsToSave = appState.levelsData.map((lvl) => {
            ensureSlotFrontFaceScales(lvl);
            return {
            isLogo: lvl.isLogo,
            isIntro: lvl.isIntro,
            isBonus: lvl.isBonus,
            isOutro: lvl.isOutro,
            gameMode: lvl.gameMode || "lineup", 
            squadType: lvl.squadType,
            selectedEntry: lvl.selectedEntry,
            currentSquad: lvl.currentSquad,
            formationId: lvl.formationId,
            lastFormationId: lvl.lastFormationId,
            displayMode: lvl.displayMode,
            searchText: lvl.searchText,
            customXi: lvl.customXi,
            customNames: lvl.customNames,
            videoMode: lvl.videoMode,
            landingPageType: lvl.landingPageType,
            careerClubsCount: lvl.careerClubsCount,
            careerSilhouetteIndex: lvl.careerSilhouetteIndex,
            silhouetteYOffset: lvl.silhouetteYOffset,
            silhouetteScaleX: lvl.silhouetteScaleX,
            silhouetteScaleY: lvl.silhouetteScaleY,
            headerLogoScale: lvl.headerLogoScale ?? 1,
            headerLogoNudgeX: lvl.headerLogoNudgeX ?? 0,
            headerLogoOverrideRelPath: lvl.headerLogoOverrideRelPath ?? null,
            slotClubCrestOverrideRelPathBySlot:
              lvl.slotClubCrestOverrideRelPathBySlot &&
              typeof lvl.slotClubCrestOverrideRelPathBySlot === "object"
                ? { ...lvl.slotClubCrestOverrideRelPathBySlot }
                : {},
            slotFlagScales: Array.isArray(lvl.slotFlagScales)
                ? [...lvl.slotFlagScales]
                : Array(11).fill(DEFAULT_SLOT_FLAG_SCALE),
            slotTeamLogoScales: Array.isArray(lvl.slotTeamLogoScales)
                ? [...lvl.slotTeamLogoScales]
                : Array(11).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE),
            slotPhotoIndexEntries: Array.from(lvl.slotPhotoIndexBySlot.entries())
            };
        });

        const newScript = {
            name,
            folder: null, 
            landing: {
                gameMode: "lineup",
                quizType: els.inQuizType.value,
                endingType: els.inEndingType ? els.inEndingType.value : "think-you-know",
                specificToggle: els.inSpecificTitleToggle.checked,
                specificText: els.inSpecificTitleText.value,
                specificIcon: els.inSpecificTitleIcon.value,
                easy: els.inEasy.value,
                medium: els.inMedium.value,
                hard: els.inHard.value,
                impossible: els.inImpossible.value
            },
            lineup: {
                videoMode: els.videoModeToggle.checked,
                totalLevels: els.quizLevelsInput.value,
                shortsMode: FIXED_SHORTS_MODE
            },
            transitions: captureTransitionSettings(),
            levels: levelsToSave
        };

        savedScripts.push(newScript);
        persistSaved();
        activeScriptName = name;
        hideSaveScriptModal();
        renderSavedScripts();
    };

    els.deleteScriptNo.onclick = () => {
        els.deleteScriptModal.hidden = true;
        scriptToDeleteIndex = -1;
    };

    els.deleteScriptYes.onclick = () => {
        if (scriptToDeleteIndex > -1) {
            const deletedScript = savedScripts[scriptToDeleteIndex];
            if (deletedScript.name === activeScriptName) activeScriptName = null;
            savedScripts.splice(scriptToDeleteIndex, 1);
            persistSaved();
            renderSavedScripts();
        }
        els.deleteScriptModal.hidden = true;
        scriptToDeleteIndex = -1;
    };

    void SAVE_SERVER.startPull({
        render: renderSavedScripts,
        replaceAll(scripts, folders, states) {
            savedScripts = scripts;
            savedFolders = folders;
            folderStates = states;
            localStorage.setItem(KEY_SCRIPTS, JSON.stringify(savedScripts));
            localStorage.setItem(KEY_FOLDERS, JSON.stringify(savedFolders));
            localStorage.setItem(KEY_FOLDER_STATES, JSON.stringify(folderStates));
        },
        hasLocalData() {
            return (
                savedScripts.length > 0 ||
                savedFolders.length > 0 ||
                Object.keys(folderStates).length > 0
            );
        },
        getSnapshot() {
            return { scripts: savedScripts, folders: savedFolders, folderStates };
        },
    });

    renderSavedScripts();
}

export function renderSavedScripts() {
    const { els } = appState;
    if (!els.savedScriptsList) return;

    els.savedScriptsList.innerHTML = "";

    const currentMode = "lineup";
    const currentSubType = els.inQuizType.value || "nat-by-club";

    savedFolders.forEach((folderName) => {
        const hasScriptsInMode = savedScripts.some(s => 
            s.folder === folderName && 
            (s.landing?.gameMode || "lineup") === currentMode && 
            (s.landing?.quizType || "nat-by-club") === currentSubType
        );
        const isEmptyGlobally = !savedScripts.some(s => s.folder === folderName);

        if (!hasScriptsInMode && !isEmptyGlobally) return;

        const folderDiv = document.createElement("div");
        folderDiv.className = "saved-folder";
        folderDiv.dataset.folder = folderName;
        
        if (folderStates[folderName]) {
            folderDiv.classList.add("collapsed");
        }

        const header = document.createElement("div");
        header.className = "saved-folder-header";
        
        const titleSpan = document.createElement("span");
        titleSpan.className = "folder-title";
        titleSpan.innerHTML = `<span class="folder-toggle-icon">▼</span> 📁 ${folderName}`;
        
        header.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            folderDiv.classList.toggle("collapsed");
            folderStates[folderName] = folderDiv.classList.contains("collapsed");
            persistSaved();
        };

        header.ondragover = (e) => {
            e.preventDefault();
            header.classList.add("drag-over");
        };
        header.ondragleave = () => {
            header.classList.remove("drag-over");
        };
        header.ondrop = (e) => {
            e.preventDefault();
            header.classList.remove("drag-over");
            const draggedIndex = e.dataTransfer.getData("text/plain");
            if (draggedIndex !== "" && savedScripts[draggedIndex]) {
                savedScripts[draggedIndex].folder = folderName;
                folderDiv.classList.remove("collapsed");
                folderStates[folderName] = false;
                persistSaved();
                
                renderSavedScripts();
            }
        };

        const btnDelFolder = document.createElement("button");
        btnDelFolder.textContent = "✖";
        btnDelFolder.style.background = "none";
        btnDelFolder.style.border = "none";
        btnDelFolder.style.color = "#ef4444";
        btnDelFolder.style.cursor = "pointer";
        btnDelFolder.style.fontWeight = "bold";
        btnDelFolder.onclick = () => {
            if(confirm(`Delete folder "${folderName}"? Scripts inside will be moved to the main list.`)) {
                savedFolders = savedFolders.filter(f => f !== folderName);
                savedScripts.forEach(s => { if(s.folder === folderName) s.folder = null; });
                
                delete folderStates[folderName];
                persistSaved();
                renderSavedScripts();
            }
        };
        
        header.appendChild(titleSpan);
        header.appendChild(btnDelFolder);

        const content = document.createElement("div");
        content.className = "saved-folder-content";
        content.style.display = "flex";
        content.style.flexDirection = "column";
        content.style.gap = "0.5rem";
        content.style.paddingLeft = "0.5rem";
        content.style.marginTop = "0.5rem";

        folderDiv.appendChild(header);
        folderDiv.appendChild(content);
        els.savedScriptsList.appendChild(folderDiv);
    });

    savedScripts.forEach((script, index) => {
        const scriptMode = script.landing?.gameMode || "lineup";
        const scriptSubType = script.landing?.quizType || "nat-by-club";

        if (scriptMode !== currentMode || scriptSubType !== currentSubType) return;

        const row = document.createElement("div");
        row.className = "saved-script-item";
        row.draggable = true;
        row.ondragstart = (e) => {
            e.dataTransfer.setData("text/plain", index);
        };

        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.background = "rgba(0,0,0,0.3)";
        row.style.padding = "0.5rem 0.8rem";
        row.style.borderRadius = "4px";
        
        if (script.name === activeScriptName) {
            row.style.borderLeft = "4px solid var(--accent)";
            row.style.background = "rgba(255, 202, 40, 0.15)";
        }

        const btnLoad = document.createElement("button");
        btnLoad.textContent = script.name;
        btnLoad.style.background = "none";
        btnLoad.style.border = "none";
        btnLoad.style.color = script.name === activeScriptName ? "var(--accent)" : "#fff";
        btnLoad.style.cursor = "pointer";
        btnLoad.style.flex = "1";
        btnLoad.style.textAlign = "left";
        btnLoad.style.fontWeight = "bold";
        btnLoad.onclick = () => loadScript(script);

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "0.5rem";
        actions.style.alignItems = "center";

        if (script.folder) {
            const btnMoveOut = document.createElement("button");
            btnMoveOut.innerHTML = "↑";
            btnMoveOut.title = "Move out to Main Saved List";
            btnMoveOut.style.background = "rgba(255,255,255,0.1)";
            btnMoveOut.style.border = "1px solid rgba(255,255,255,0.2)";
            btnMoveOut.style.color = "#fff";
            btnMoveOut.style.cursor = "pointer";
            btnMoveOut.style.borderRadius = "3px";
            btnMoveOut.style.padding = "0.1rem 0.4rem";
            btnMoveOut.style.fontSize = "0.8rem";
            btnMoveOut.onclick = () => {
                script.folder = null;
                persistSaved();
                renderSavedScripts();
            };
            actions.appendChild(btnMoveOut);
        }

        const btnDel = document.createElement("button");
        btnDel.textContent = "✖";
        btnDel.style.background = "none";
        btnDel.style.border = "none";
        btnDel.style.color = "#ef4444";
        btnDel.style.cursor = "pointer";
        btnDel.style.fontWeight = "bold";
        btnDel.style.fontSize = "1.2rem";
        btnDel.onclick = () => {
            scriptToDeleteIndex = index;
            els.deleteScriptModal.hidden = false;
        };
        
        actions.appendChild(btnDel);
        row.append(btnLoad, actions);

        if (script.folder && savedFolders.includes(script.folder)) {
            const targetFolderContent = els.savedScriptsList.querySelector(`.saved-folder[data-folder="${script.folder}"] .saved-folder-content`);
            if (targetFolderContent) {
                targetFolderContent.appendChild(row);
            } else {
                els.savedScriptsList.appendChild(row);
            }
        } else {
            script.folder = null;
            els.savedScriptsList.appendChild(row);
        }
    });
}

async function loadScript(script) {
    const { els } = appState;
    if (!script.levels) {
        alert("This saved script is from an older version and cannot be loaded. Please delete it and create a new one.");
        return;
    }

    activeScriptName = script.name;

    const gameMode = (script.landing && script.landing.gameMode) ? script.landing.gameMode : "lineup";
    const quizType = (script.landing && script.landing.quizType) ? script.landing.quizType : "nat-by-club";

    if(uiCallbacks.populateSubTypes) uiCallbacks.populateSubTypes();
    
    els.inQuizType.value = quizType;
    if(uiCallbacks.updateSetupUI) uiCallbacks.updateSetupUI(); 

    if (script.landing) {
        if (els.inEndingType) {
            els.inEndingType.value = script.landing.endingType || "think-you-know";
            els.inEndingType.dispatchEvent(new Event("change"));
        }
        els.inSpecificTitleToggle.checked = !!script.landing.specificToggle;
        els.inSpecificTitleText.value = script.landing.specificText || "";
        els.inSpecificTitleIcon.value = normalizeSpecificTitleIconPath(script.landing.specificIcon);
        els.inEasy.value = script.landing.easy || 10;
        els.inMedium.value = script.landing.medium || 5;
        els.inHard.value = script.landing.hard || 3;
        els.inImpossible.value = script.landing.impossible || 1;
    }

    if (script.lineup) {
        els.videoModeToggle.checked = !!script.lineup.videoMode;
        els.quizLevelsInput.value = script.lineup.totalLevels || 29;
        if (els.shortsModeToggle) {
            els.shortsModeToggle.checked = FIXED_SHORTS_MODE;
            els.shortsModeToggle.disabled = true;
        }
    }
    
    document.body.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
    if (els.shortsModeBtn && els.shortsModeToggle) {
        els.shortsModeBtn.setAttribute("aria-pressed", FIXED_SHORTS_MODE ? "true" : "false");
    }

    applyTransitionSettings(script.transitions || null);

    if(uiCallbacks.updateLanding) uiCallbacks.updateLanding();

    appState.totalLevelsCount = script.levels.length - 1;
    appState.levelsData = script.levels.map((lvl) => {
        const merged = {
            ...lvl,
            gameMode: lvl.gameMode || gameMode,
            silhouetteYOffset: lvl.silhouetteYOffset || 0,
            silhouetteScaleX: lvl.silhouetteScaleX || 1,
            silhouetteScaleY: lvl.silhouetteScaleY || 1,
            headerLogoScale: lvl.headerLogoScale ?? 1,
            headerLogoNudgeX: lvl.headerLogoNudgeX ?? 0,
            headerLogoOverrideRelPath: lvl.headerLogoOverrideRelPath ?? null,
            slotClubCrestOverrideRelPathBySlot:
              lvl.slotClubCrestOverrideRelPathBySlot &&
              typeof lvl.slotClubCrestOverrideRelPathBySlot === "object"
                ? { ...lvl.slotClubCrestOverrideRelPathBySlot }
                : {},
            slotPhotoIndexBySlot: new Map(lvl.slotPhotoIndexEntries || []),
        };
        ensureSlotFrontFaceScales(merged);
        return merged;
    });
    
    els.teamSearch.value = "";
    els.teamSearch.classList.remove("team-selected");
    els.teamResults.replaceChildren();

    applyCustomSelects(); 
    switchLevel(0);
    renderSavedScripts(); 
}