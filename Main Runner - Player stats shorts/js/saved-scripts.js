// js/saved-scripts.js — Main Runner - Player stats shorts (storage isolated from Career Path)
import {
    appState,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
} from "./state.js";
import { switchLevel } from "./levels.js";
import { applyCustomSelects } from "./custom-selects.js";
import { createSavedScriptsServerSync } from "./runner-saved-server-sync.js";

const KEY_SCRIPTS = "footballQuizScripts_placholder2_shorts_v1";
const KEY_FOLDERS = "footballQuizFolders_placholder2_shorts_v1";
const KEY_FOLDER_STATES = "footballQuizFolderStates_placholder2_shorts_v1";
const FIXED_SHORTS_MODE = true;

const SAVE_SERVER = createSavedScriptsServerSync("playerstats_shorts", {
    KEY_SCRIPTS,
    KEY_FOLDERS,
    KEY_FOLDER_STATES,
});

function persistSaved() {
    SAVE_SERVER.flushLocalAndServer(savedScripts, savedFolders, folderStates);
}

function jsonSafeClone(value) {
    if (value == null) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
}

function cloneCareerPlayerForStorage(p) {
    if (!p || typeof p !== "object") return null;
    const raw = jsonSafeClone(p);
    if (raw && typeof raw === "object") delete raw._clubItem;
    return raw;
}

function cloneCareerHistoryForStorage(h) {
    if (!Array.isArray(h)) return [];
    const raw = jsonSafeClone(h);
    return Array.isArray(raw) ? raw : [];
}

function loadSavedScriptsWithPlaceholderMigration() {
    const scripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
    let changed = false;
    const migrated = scripts.map((s) => {
        const next = { ...s };
        if (next.landing && typeof next.landing === "object") {
            const land = { ...next.landing };
            if (land.gameMode === "placeholder") {
                land.gameMode = "career";
                changed = true;
            }
            if (land.quizType === "placholder") {
                land.quizType = "player-by-career-stats";
                changed = true;
            }
            next.landing = land;
        }
        if (Array.isArray(next.levels)) {
            next.levels = next.levels.map((lvl) => {
                if (!lvl || typeof lvl !== "object") return lvl;
                if (lvl.gameMode === "placeholder") {
                    changed = true;
                    return { ...lvl, gameMode: "career" };
                }
                return lvl;
            });
        }
        return next;
    });
    if (changed) {
        localStorage.setItem(KEY_SCRIPTS, JSON.stringify(migrated));
    }
    return { scripts: migrated, changed };
}

const _loadedScripts = loadSavedScriptsWithPlaceholderMigration();
let savedScripts = _loadedScripts.scripts;
let savedFolders = JSON.parse(localStorage.getItem(KEY_FOLDERS) || "[]");
let folderStates = JSON.parse(localStorage.getItem(KEY_FOLDER_STATES) || "{}");
if (_loadedScripts.changed) {
    persistSaved();
}
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
            persistSaved();
        }
        els.createFolderModal.hidden = true;
        renderSavedScripts();
    };

    function buildLevelsSnapshot() {
        return appState.levelsData.map((lvl) => ({
            isLogo: lvl.isLogo,
            isIntro: lvl.isIntro,
            isBonus: lvl.isBonus,
            isOutro: lvl.isOutro,
            gameMode: lvl.gameMode || "career",
            squadType: lvl.squadType,
            selectedEntry: jsonSafeClone(lvl.selectedEntry),
            currentSquad: jsonSafeClone(lvl.currentSquad),
            careerPlayer: cloneCareerPlayerForStorage(lvl.careerPlayer),
            careerHistory: cloneCareerHistoryForStorage(lvl.careerHistory),
            formationId: lvl.formationId,
            lastFormationId: lvl.lastFormationId,
            displayMode: lvl.displayMode,
            searchText: lvl.searchText,
            customXi: jsonSafeClone(lvl.customXi),
            customNames: jsonSafeClone(lvl.customNames) || {},
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
            slotPhotoIndexEntries: Array.from(lvl.slotPhotoIndexBySlot.entries()),
        }));
    }

    function commitSavedScript(name) {
        const levelsToSave = buildLevelsSnapshot();
        const newScript = {
            name,
            folder: null,
            landing: {
                gameMode: "career",
                quizType: els.inQuizType.value,
                specificToggle: els.inSpecificTitleToggle.checked,
                specificText: els.inSpecificTitleText.value,
                specificIcon: els.inSpecificTitleIcon.value,
                easy: els.inEasy?.value ?? "10",
                medium: els.inMedium?.value ?? "5",
                hard: els.inHard?.value ?? "3",
                impossible: els.inImpossible?.value ?? "1",
            },
            lineup: {
                videoMode: els.videoModeToggle.checked,
                totalLevels: els.quizLevelsInput.value,
                shortsMode: FIXED_SHORTS_MODE,
            },
            levels: levelsToSave,
        };
        savedScripts.push(newScript);
        persistSaved();
        activeScriptName = name;
        renderSavedScripts();
    }

    function openSaveSettingsRightPanel() {
        if (!els.rightPanel) return;
        els.rightPanel.hidden = false;
        els.rightPanel.innerHTML = `
      <div class="panel-header">
        <h1>Save Current Settings</h1>
        <button type="button" class="panel-toggle" id="btn-close-save-right-panel">Hide</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
        <label class="field" style="margin: 0;">
          <span class="label">Name</span>
          <input type="text" id="save-settings-panel-name" placeholder="Enter name..." autocomplete="off"
            style="width: 100%; padding: 0.6rem; background: #000; color: #fff; border: 1px solid #333; border-radius: 4px; box-sizing: border-box;" />
        </label>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button type="button" class="panel-toggle" id="save-settings-panel-cancel">Cancel</button>
          <button type="button" class="panel-toggle" id="save-settings-panel-confirm" style="background: var(--accent); color: #000; font-weight: bold;">Save</button>
        </div>
      </div>
    `;

        const nameInput = document.getElementById("save-settings-panel-name");
        document.getElementById("btn-close-save-right-panel").onclick = () => {
            els.rightPanel.hidden = true;
        };
        document.getElementById("save-settings-panel-cancel").onclick = () => {
            els.rightPanel.hidden = true;
        };
        document.getElementById("save-settings-panel-confirm").onclick = () => {
            const name = nameInput.value.trim();
            if (!name) return;
            commitSavedScript(name);
            els.rightPanel.hidden = true;
        };
        if (nameInput) nameInput.focus();
    }

    els.btnSaveScript.onclick = () => {
        openSaveSettingsRightPanel();
    };

    els.saveScriptCancel.onclick = () => {
        if (els.saveScriptModal) els.saveScriptModal.hidden = true;
    };

    els.saveScriptConfirm.onclick = () => {
        const name = els.saveScriptName.value.trim();
        if (!name) return;
        commitSavedScript(name);
        if (els.saveScriptModal) els.saveScriptModal.hidden = true;
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

    const currentMode = "career";
    const currentSubType = els.inQuizType.value || "player-by-career-stats";

    savedFolders.forEach((folderName) => {
        const hasScriptsInMode = savedScripts.some(s => 
            s.folder === folderName && 
            (s.landing?.gameMode || "career") === currentMode && 
            (s.landing?.quizType || "player-by-career-stats") === currentSubType
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
        const scriptMode = script.landing?.gameMode || "career";
        const scriptSubType = script.landing?.quizType || "player-by-career-stats";

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

    const gameMode = (script.landing && script.landing.gameMode) ? script.landing.gameMode : "career";
    const quizType = (script.landing && script.landing.quizType) ? script.landing.quizType : "player-by-career-stats";

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
        careerPlayer: cloneCareerPlayerForStorage(lvl.careerPlayer),
        careerHistory: cloneCareerHistoryForStorage(lvl.careerHistory),
    }));
    
    els.teamSearch.value = "";
    els.teamSearch.classList.remove("team-selected");
    els.teamResults.replaceChildren();

    applyCustomSelects(); 
    switchLevel(0);
    renderSavedScripts(); 
}