// js/saved-scripts.js (Career Path runner — namespaced storage + one-time legacy import)
import {
    appState,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
} from "./state.js";
import { switchLevel } from "./levels.js";
import { applyCustomSelects } from "./custom-selects.js";

const KEY_SCRIPTS = "footballQuizScripts_career_regular_fcbnew";
const KEY_FOLDERS = "footballQuizFolders_career_regular_fcbnew";
const KEY_FOLDER_STATES = "footballQuizFolderStates_career_regular_fcbnew";
const LEGACY_SCRIPTS = "footballQuizScripts";
const LEGACY_FOLDERS = "footballQuizFolders";
const LEGACY_FOLDER_STATES = "footballQuizFolderStates";
const FIXED_SHORTS_MODE = false;

function scriptHasCareer(s) {
    if ((s.landing?.gameMode || "lineup") === "career") return true;
    return (s.levels || []).some((l) => l.gameMode === "career");
}

function migrateLegacyCareer() {
    let scripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
    if (scripts.length > 0) return;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SCRIPTS) || "[]");
    const filtered = legacy.filter((s) => scriptHasCareer(s));
    if (filtered.length === 0) return;
    localStorage.setItem(KEY_SCRIPTS, JSON.stringify(filtered));
    if (!localStorage.getItem(KEY_FOLDERS)) {
        localStorage.setItem(KEY_FOLDERS, localStorage.getItem(LEGACY_FOLDERS) || "[]");
    }
    if (!localStorage.getItem(KEY_FOLDER_STATES)) {
        localStorage.setItem(KEY_FOLDER_STATES, localStorage.getItem(LEGACY_FOLDER_STATES) || "{}");
    }
}

migrateLegacyCareer();

let savedScripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
let savedFolders = JSON.parse(localStorage.getItem(KEY_FOLDERS) || "[]");
let folderStates = JSON.parse(localStorage.getItem(KEY_FOLDER_STATES) || "{}");
let scriptToDeleteIndex = -1;
let activeScriptName = null; 

let uiCallbacks = {}; 

export function initSavedScripts(callbacks) {
    uiCallbacks = callbacks || {};
    const { els } = appState;

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
            localStorage.setItem(KEY_FOLDERS, JSON.stringify(savedFolders));
        }
        els.createFolderModal.hidden = true;
        renderSavedScripts();
    };

    els.btnSaveScript.onclick = () => {
        els.saveScriptName.value = "";
        els.saveScriptModal.hidden = false;
        els.saveScriptName.focus();
    };

    els.saveScriptCancel.onclick = () => {
        els.saveScriptModal.hidden = true;
    };

    els.saveScriptConfirm.onclick = () => {
        const name = els.saveScriptName.value.trim();
        if (!name) return;
        
        const levelsToSave = appState.levelsData.map(lvl => ({
            isLogo: lvl.isLogo,
            isIntro: lvl.isIntro,
            isBonus: lvl.isBonus,
            isOutro: lvl.isOutro,
            gameMode: lvl.gameMode || "career", 
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
            silhouetteVideoYOffset: lvl.silhouetteVideoYOffset,
            silhouetteVideoScaleX: lvl.silhouetteVideoScaleX,
            silhouetteVideoScaleY: lvl.silhouetteVideoScaleY,
            silhouetteNormalYOffset: lvl.silhouetteNormalYOffset,
            silhouetteNormalScaleX: lvl.silhouetteNormalScaleX,
            silhouetteNormalScaleY: lvl.silhouetteNormalScaleY,
            silhouetteShortsVideoYOffset: lvl.silhouetteShortsVideoYOffset,
            silhouetteShortsVideoScaleX: lvl.silhouetteShortsVideoScaleX,
            silhouetteShortsVideoScaleY: lvl.silhouetteShortsVideoScaleY,
            silhouetteShortsNormalYOffset: lvl.silhouetteShortsNormalYOffset,
            silhouetteShortsNormalScaleX: lvl.silhouetteShortsNormalScaleX,
            silhouetteShortsNormalScaleY: lvl.silhouetteShortsNormalScaleY,
            careerSlotBadgeScales: Array.isArray(lvl.careerSlotBadgeScales)
                ? [...lvl.careerSlotBadgeScales]
                : [],
            careerSlotBadgeScalesRegular: Array.isArray(lvl.careerSlotBadgeScalesRegular)
                ? [...lvl.careerSlotBadgeScalesRegular]
                : [],
            careerSlotBadgeScalesShorts: Array.isArray(lvl.careerSlotBadgeScalesShorts)
                ? [...lvl.careerSlotBadgeScalesShorts]
                : [],
            careerSlotYearNudges: Array.isArray(lvl.careerSlotYearNudges)
                ? [...lvl.careerSlotYearNudges]
                : [],
            slotPhotoIndexEntries: Array.from(lvl.slotPhotoIndexBySlot.entries())
        }));

        const newScript = {
            name,
            folder: null, 
            landing: {
                gameMode: "career",
                quizType: els.inQuizType.value,
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
            levels: levelsToSave
        };

        savedScripts.push(newScript);
        localStorage.setItem(KEY_SCRIPTS, JSON.stringify(savedScripts));
        activeScriptName = name; 
        els.saveScriptModal.hidden = true;
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
            localStorage.setItem(KEY_SCRIPTS, JSON.stringify(savedScripts));
            renderSavedScripts();
        }
        els.deleteScriptModal.hidden = true;
        scriptToDeleteIndex = -1;
    };

    renderSavedScripts();
}

export function renderSavedScripts() {
    const { els } = appState;
    if (!els.savedScriptsList) return;

    els.savedScriptsList.innerHTML = "";

    const currentMode = "career";
    const currentSubType = els.inQuizType.value || "player-by-career";

    savedFolders.forEach((folderName) => {
        const hasScriptsInMode = savedScripts.some(s => 
            s.folder === folderName && 
            (s.landing?.gameMode || "career") === currentMode && 
            (s.landing?.quizType || "player-by-career") === currentSubType
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
            localStorage.setItem(KEY_FOLDER_STATES, JSON.stringify(folderStates));
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
                localStorage.setItem(KEY_SCRIPTS, JSON.stringify(savedScripts));
                
                folderDiv.classList.remove("collapsed");
                folderStates[folderName] = false;
                localStorage.setItem(KEY_FOLDER_STATES, JSON.stringify(folderStates));
                
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
                localStorage.setItem(KEY_FOLDER_STATES, JSON.stringify(folderStates));
                
                localStorage.setItem(KEY_FOLDERS, JSON.stringify(savedFolders));
                localStorage.setItem(KEY_SCRIPTS, JSON.stringify(savedScripts));
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
        const scriptMode = script.landing?.gameMode || "career";
        const scriptSubType = script.landing?.quizType || "player-by-career";

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
                localStorage.setItem(KEY_SCRIPTS, JSON.stringify(savedScripts));
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

    const gameMode = (script.landing && script.landing.gameMode) ? script.landing.gameMode : "career";
    const quizType = (script.landing && script.landing.quizType) ? script.landing.quizType : "player-by-career";

    if(uiCallbacks.populateSubTypes) uiCallbacks.populateSubTypes();
    
    els.inQuizType.value = quizType;
    if(uiCallbacks.updateSetupUI) uiCallbacks.updateSetupUI(); 

    if (script.landing) {
        els.inSpecificTitleToggle.checked = !!script.landing.specificToggle;
        els.inSpecificTitleText.value = script.landing.specificText || "";
        els.inSpecificTitleIcon.value = script.landing.specificIcon || "";
        els.inEasy.value = script.landing.easy || 10;
        els.inMedium.value = script.landing.medium || 5;
        els.inHard.value = script.landing.hard || 3;
        els.inImpossible.value = script.landing.impossible || 1;
    }

    if (script.lineup) {
        els.videoModeToggle.checked = !!script.lineup.videoMode;
        els.quizLevelsInput.value = script.lineup.totalLevels || 20;
        if (els.shortsModeToggle) {
            els.shortsModeToggle.checked = FIXED_SHORTS_MODE;
            els.shortsModeToggle.disabled = true;
        }
    }
    
    document.body.classList.toggle("shorts-mode", FIXED_SHORTS_MODE);
    if (els.shortsModeBtn && els.shortsModeToggle) {
        els.shortsModeBtn.setAttribute("aria-pressed", FIXED_SHORTS_MODE ? "true" : "false");
    }

    if (uiCallbacks.syncShortsCirclePreviewPanel) uiCallbacks.syncShortsCirclePreviewPanel();

    if(uiCallbacks.updateLanding) uiCallbacks.updateLanding();

    appState.totalLevelsCount = script.levels.length - 1;
    appState.levelsData = script.levels.map(lvl => ({
        ...lvl,
        gameMode: lvl.gameMode || gameMode, 
        silhouetteYOffset: lvl.silhouetteYOffset || 0,
        silhouetteScaleX: lvl.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
        silhouetteScaleY: lvl.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
        silhouetteVideoYOffset: lvl.silhouetteVideoYOffset ?? lvl.silhouetteYOffset ?? 0,
        silhouetteVideoScaleX: lvl.silhouetteVideoScaleX ?? lvl.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
        silhouetteVideoScaleY: lvl.silhouetteVideoScaleY ?? lvl.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
        silhouetteNormalYOffset: lvl.silhouetteNormalYOffset ?? lvl.silhouetteYOffset ?? 0,
        silhouetteNormalScaleX: lvl.silhouetteNormalScaleX ?? lvl.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
        silhouetteNormalScaleY: lvl.silhouetteNormalScaleY ?? lvl.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
        silhouetteShortsVideoYOffset:
          lvl.silhouetteShortsVideoYOffset ??
          lvl.silhouetteShortsNormalYOffset ??
          lvl.silhouetteVideoYOffset ??
          lvl.silhouetteYOffset ??
          0,
        silhouetteShortsVideoScaleX:
          lvl.silhouetteShortsVideoScaleX ??
          lvl.silhouetteShortsNormalScaleX ??
          lvl.silhouetteVideoScaleX ??
          lvl.silhouetteScaleX ??
          DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
        silhouetteShortsVideoScaleY:
          lvl.silhouetteShortsVideoScaleY ??
          lvl.silhouetteShortsNormalScaleY ??
          lvl.silhouetteVideoScaleY ??
          lvl.silhouetteScaleY ??
          DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
        silhouetteShortsNormalYOffset:
          lvl.silhouetteShortsNormalYOffset ?? lvl.silhouetteNormalYOffset ?? lvl.silhouetteYOffset ?? 0,
        silhouetteShortsNormalScaleX:
          lvl.silhouetteShortsNormalScaleX ?? lvl.silhouetteNormalScaleX ?? lvl.silhouetteScaleX ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
        silhouetteShortsNormalScaleY:
          lvl.silhouetteShortsNormalScaleY ?? lvl.silhouetteNormalScaleY ?? lvl.silhouetteScaleY ?? DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
        careerSlotBadgeScales: Array.isArray(lvl.careerSlotBadgeScales)
            ? [...lvl.careerSlotBadgeScales]
            : undefined,
        careerSlotBadgeScalesRegular: Array.isArray(lvl.careerSlotBadgeScalesRegular)
            ? [...lvl.careerSlotBadgeScalesRegular]
            : (Array.isArray(lvl.careerSlotBadgeScales) ? [...lvl.careerSlotBadgeScales] : undefined),
        careerSlotBadgeScalesShorts: Array.isArray(lvl.careerSlotBadgeScalesShorts)
            ? [...lvl.careerSlotBadgeScalesShorts]
            : (Array.isArray(lvl.careerSlotBadgeScales) ? [...lvl.careerSlotBadgeScales] : undefined),
        careerSlotYearNudges: Array.isArray(lvl.careerSlotYearNudges)
            ? [...lvl.careerSlotYearNudges]
            : undefined,
        slotPhotoIndexBySlot: new Map(lvl.slotPhotoIndexEntries || []),
    }));
    
    els.teamSearch.value = "";
    els.teamSearch.classList.remove("team-selected");
    els.teamResults.replaceChildren();

    applyCustomSelects(); 
    switchLevel(0);
    renderSavedScripts(); 
}