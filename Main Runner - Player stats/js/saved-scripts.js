// js/saved-scripts.js — Main Runner - Player stats (regular; storage isolated from Career Path)
import {
    appState,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
    DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
} from "./state.js";
import { switchLevel } from "./levels.js";
import { applyCustomSelects } from "./custom-selects.js";
import { createSavedScriptsServerSync } from "./runner-saved-server-sync.js";
import { captureTransitionSettings, applyTransitionSettings } from "./transitions.js";
import { loadSquadJson } from "./teams.js";
import { cleanCareerHistory } from "./pitch-render.js";

const INCLUDE_INTRO_LEVEL = true;

const KEY_SCRIPTS = "footballQuizScripts_placholder2_regular_v1";
const KEY_FOLDERS = "footballQuizFolders_placholder2_regular_v1";
const KEY_FOLDER_STATES = "footballQuizFolderStates_placholder2_regular_v1";
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

const SAVE_SERVER = createSavedScriptsServerSync("playerstats_regular", {
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

// ---------------------------------------------------------------------------
// Player-import helpers
// ---------------------------------------------------------------------------

function foldTurkishLatinForImport(s) {
    return s
        .replace(/ğ/g, "g").replace(/Ğ/g, "g")
        .replace(/ı/g, "i").replace(/İ/g, "i")
        .replace(/ş/g, "s").replace(/Ş/g, "s")
        .replace(/ö/g, "o").replace(/Ö/g, "o")
        .replace(/ü/g, "u").replace(/Ü/g, "u")
        .replace(/ç/g, "c").replace(/Ç/g, "c");
}

function normalizeForImport(str) {
    if (!str) return "";
    try {
        return foldTurkishLatinForImport(
            str.trim().toLowerCase()
                .normalize("NFD")
                .replace(/\p{M}/gu, "")
                .replace(/ø/g, "o").replace(/å/g, "a").replace(/æ/g, "ae")
                .replace(/ð/g, "d").replace(/þ/g, "th").replace(/ß/g, "ss")
                .replace(/[''`´']/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, " ").trim()
        );
    } catch {
        return foldTurkishLatinForImport(
            str.trim().toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/ø/g, "o").replace(/å/g, "a").replace(/æ/g, "ae")
                .replace(/ð/g, "d").replace(/þ/g, "th").replace(/ß/g, "ss")
                .replace(/[''`´']/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, " ").trim()
        );
    }
}

function parseImportText(text) {
    let s = String(text || "").trim();
    if (!s) return { error: "Paste the import text first." };
    if (s.startsWith("[")) s = s.slice(1);
    if (s.endsWith("]")) s = s.slice(0, -1);
    const names = s.split(",").map(n => n.trim()).filter(Boolean);
    if (names.length === 0) {
        return { error: "No players found. Use format: [Player1, Player2, Player3]" };
    }
    return { names };
}

function findAllBySurnameInitialsPattern(rawName, allPlayers) {
    const trimmed = String(rawName || "").trim();
    const m = trimmed.match(/^(\S+)\s+((?:[A-Za-z]\.)+)\s*$/);
    if (!m) return [];
    const familyWant = normalizeForImport(m[1]);
    const initialsWant = Array.from(m[2].matchAll(/[A-Za-z]/g), (x) => x[0].toLowerCase());
    if (initialsWant.length === 0) return [];
    const out = [];
    for (const p of allPlayers) {
        if (!p?.name) continue;
        const parts = String(p.name).trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) continue;
        const familyDb = normalizeForImport(parts[parts.length - 1]);
        if (familyDb !== familyWant) continue;
        const givenJoined = parts.slice(0, -1).join("-");
        const segments = givenJoined.split(/[-\s]+/).filter(Boolean);
        if (segments.length < initialsWant.length) continue;
        const initialsDb = segments.map((seg) => seg[0].toLowerCase());
        let ok = true;
        for (let i = 0; i < initialsWant.length; i++) {
            if (initialsDb[i] !== initialsWant[i]) { ok = false; break; }
        }
        if (ok) out.push(p);
    }
    return out;
}

/** All players matching `name` at the first successful matching tier. Empty if none. */
function findAllPlayerCandidates(name, allPlayers) {
    const norm = normalizeForImport(name);
    if (!norm) return [];

    let hits = allPlayers.filter(p => p?.name && normalizeForImport(p.name) === norm);
    if (hits.length > 0) return hits;

    hits = findAllBySurnameInitialsPattern(name, allPlayers);
    if (hits.length > 0) return hits;

    const initialMatch = String(name || "").trim().match(/^([a-zA-Z])\.\s+(.+)$/);
    if (initialMatch) {
        const initial = initialMatch[1].toLowerCase();
        const lastName = normalizeForImport(initialMatch[2]);
        hits = allPlayers.filter(p => {
            if (!p?.name) return false;
            const parts = normalizeForImport(p.name).split(" ");
            const pLast = parts[parts.length - 1];
            const pFirst = parts[0];
            return pLast === lastName && pFirst.startsWith(initial);
        });
        if (hits.length > 0) return hits;
    }

    if (!norm.includes(" ")) {
        hits = allPlayers.filter(p => {
            if (!p?.name) return false;
            const parts = normalizeForImport(p.name).split(" ").filter(Boolean);
            return parts.some(t => t === norm);
        });
        if (hits.length > 0) return hits;
    }

    hits = allPlayers.filter(p => p?.name && normalizeForImport(p.name).includes(norm));
    return hits;
}

function makeEmptyPlayerImportLevel(overrides = {}) {
    return {
        isLogo: false,
        isIntro: false,
        isBonus: false,
        isOutro: false,
        gameMode: "career",
        squadType: "club",
        selectedEntry: null,
        currentSquad: null,
        careerPlayer: null,
        careerHistory: [],
        formationId: "3421",
        lastFormationId: null,
        displayMode: "club",
        searchText: "",
        customXi: null,
        customNames: {},
        videoMode: true,
        landingPageType: "club",
        careerClubsCount: 5,
        careerSilhouetteIndex: 0,
        careerReadyPhotoVariantIndex: 1,
        silhouetteYOffset: 0,
        silhouetteScaleX: DEFAULT_PLAYER_SILHOUETTE_SCALE_X,
        silhouetteScaleY: DEFAULT_PLAYER_SILHOUETTE_SCALE_Y,
        careerSlotBadgeScales: [],
        careerSlotBadgeScalesRegular: [],
        careerSlotBadgeScalesShorts: [],
        careerSlotYearNudges: [],
        slotPhotoIndexEntries: [],
        ...overrides,
    };
}

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

    function requestCloseSaveRightPanel(nameInput) {
        if (!els.rightPanel) return;
        const raw = nameInput?.value?.trim() || "";
        if (!raw) {
            els.rightPanel.hidden = true;
            return;
        }
        pendingSaveDiscardAction = () => {
            els.rightPanel.hidden = true;
        };
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
                return;
            }
            if (els.rightPanel && !els.rightPanel.hidden) {
                const nameInput = document.getElementById("save-settings-panel-name");
                if (nameInput) {
                    e.preventDefault();
                    requestCloseSaveRightPanel(nameInput);
                }
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
            careerReadyPhotoVariantIndex: lvl.careerReadyPhotoVariantIndex ?? 1,
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
                endingType: els.inEndingType ? els.inEndingType.value : "think-you-know",
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
            transitions: captureTransitionSettings(),
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
            requestCloseSaveRightPanel(nameInput);
        };
        document.getElementById("save-settings-panel-cancel").onclick = () => {
            requestCloseSaveRightPanel(nameInput);
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

    els.saveScriptCancel.onclick = () => requestCloseSaveScriptModal();
    if (els.saveScriptModalClose) {
        els.saveScriptModalClose.onclick = () => requestCloseSaveScriptModal();
    }

    els.saveScriptConfirm.onclick = () => {
        const name = els.saveScriptName.value.trim();
        if (!name) return;
        commitSavedScript(name);
        hideSaveScriptModal();
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

    // -----------------------------------------------------------------------
    // Import modal
    // -----------------------------------------------------------------------
    function closeImportModal() {
        if (els.importScriptModal) els.importScriptModal.hidden = true;
        if (els.importScriptError) {
            els.importScriptError.textContent = "";
            els.importScriptError.style.display = "none";
        }
    }

    function closeDisambigModal() {
        if (els.importDisambigModal) els.importDisambigModal.hidden = true;
        if (els.importDisambigList) els.importDisambigList.innerHTML = "";
    }

    if (els.btnImportScript) {
        els.btnImportScript.onclick = () => {
            if (els.importScriptText) els.importScriptText.value = "";
            if (els.importScriptName) els.importScriptName.value = "";
            if (els.importScriptError) {
                els.importScriptError.textContent = "";
                els.importScriptError.style.display = "none";
            }
            if (els.importScriptModal) {
                els.importScriptModal.hidden = false;
                els.importScriptText?.focus();
            }
        };
    }

    if (els.importScriptModalClose) els.importScriptModalClose.onclick = closeImportModal;
    if (els.importScriptCancel) els.importScriptCancel.onclick = closeImportModal;
    if (els.importDisambigModalClose) els.importDisambigModalClose.onclick = closeDisambigModal;

    function pickDisambiguations(ambig) {
        return new Promise((resolve) => {
            if (!els.importDisambigModal || !els.importDisambigList) {
                resolve({ cancelled: true });
                return;
            }
            els.importDisambigList.innerHTML = "";
            for (let i = 0; i < ambig.length; i++) {
                const { rawName, candidates } = ambig[i];
                const row = document.createElement("div");
                row.style.cssText = "display:flex; flex-direction:column; gap:0.35rem;";
                const label = document.createElement("div");
                label.textContent = `"${rawName}"`;
                label.style.cssText = "font-weight:bold; color:#fff; font-size:0.9rem;";
                const select = document.createElement("select");
                select.dataset.index = String(i);
                select.style.cssText = "width:100%; padding:0.5rem; background:#000; color:#fff; border:1px solid #333; border-radius:4px;";
                for (let ci = 0; ci < candidates.length; ci++) {
                    const p = candidates[ci];
                    const opt = document.createElement("option");
                    opt.value = String(ci);
                    const club = (p?._clubItem?.name) || p?.club || "?";
                    opt.textContent = `${p.name} (${club})`;
                    select.appendChild(opt);
                }
                row.appendChild(label);
                row.appendChild(select);
                els.importDisambigList.appendChild(row);
            }

            const done = (result) => {
                if (els.importDisambigCancel) els.importDisambigCancel.onclick = null;
                if (els.importDisambigConfirm) els.importDisambigConfirm.onclick = null;
                if (els.importDisambigModalClose) els.importDisambigModalClose.onclick = closeDisambigModal;
                closeDisambigModal();
                resolve(result);
            };

            if (els.importDisambigCancel) {
                els.importDisambigCancel.onclick = () => done({ cancelled: true });
            }
            if (els.importDisambigModalClose) {
                els.importDisambigModalClose.onclick = () => done({ cancelled: true });
            }
            if (els.importDisambigConfirm) {
                els.importDisambigConfirm.onclick = () => {
                    const picks = [];
                    const selects = els.importDisambigList.querySelectorAll("select");
                    selects.forEach((sel) => {
                        const idx = parseInt(sel.dataset.index, 10);
                        const ci = parseInt(sel.value, 10);
                        picks[idx] = ambig[idx].candidates[ci] || null;
                    });
                    done({ picks });
                };
            }

            els.importDisambigModal.hidden = false;
        });
    }

    if (els.importScriptConfirm) {
        els.importScriptConfirm.onclick = async () => {
            const showErr = (msg) => {
                if (!els.importScriptError) return;
                els.importScriptError.textContent = msg;
                els.importScriptError.style.display = "block";
            };
            if (els.importScriptError) {
                els.importScriptError.textContent = "";
                els.importScriptError.style.display = "none";
            }

            const text = els.importScriptText?.value?.trim() || "";
            const name = els.importScriptName?.value?.trim() || "";

            if (!text) { showErr("Paste the import text first."); return; }
            if (!name) { showErr("Enter a save name."); return; }

            els.importScriptConfirm.disabled = true;
            els.importScriptConfirm.textContent = "Importing…";

            try {
                const parsed = parseImportText(text);
                if (parsed.error) { showErr(parsed.error); return; }
                const { names } = parsed;

                let allPlayers;
                try {
                    allPlayers = typeof appState.loadAllGlobalPlayers === "function"
                        ? await appState.loadAllGlobalPlayers()
                        : (appState.allGlobalPlayers || []);
                } catch {
                    allPlayers = appState.allGlobalPlayers || [];
                }
                if (!allPlayers || allPlayers.length === 0) {
                    showErr("Player database not loaded yet. Try again in a moment.");
                    return;
                }

                const errors = [];
                const resolved = new Array(names.length).fill(null);
                const ambiguous = [];
                for (let i = 0; i < names.length; i++) {
                    const rawName = names[i];
                    const cands = findAllPlayerCandidates(rawName, allPlayers);
                    if (cands.length === 0) {
                        errors.push(`\u274C ${rawName}: player not found.`);
                    } else if (cands.length === 1) {
                        resolved[i] = cands[0];
                    } else {
                        ambiguous.push({ listIndex: i, rawName, candidates: cands });
                    }
                }
                if (errors.length > 0) {
                    showErr(errors.join("\n"));
                    return;
                }

                if (ambiguous.length > 0) {
                    const result = await pickDisambiguations(ambiguous);
                    if (result.cancelled) return;
                    for (let ai = 0; ai < ambiguous.length; ai++) {
                        const picked = result.picks[ai];
                        if (!picked) {
                            showErr(`\u274C ${ambiguous[ai].rawName}: no selection made.`);
                            return;
                        }
                        resolved[ambiguous[ai].listIndex] = picked;
                    }
                }

                const levelDatas = [];
                for (let i = 0; i < resolved.length; i++) {
                    const player = resolved[i];
                    const rawName = names[i];
                    const clubItem = player._clubItem;
                    if (!clubItem) {
                        errors.push(`\u274C ${rawName}: missing club reference.`);
                        continue;
                    }
                    let squad;
                    try {
                        squad = await loadSquadJson(clubItem);
                    } catch {
                        errors.push(`\u274C ${rawName}: failed to load squad data.`);
                        continue;
                    }
                    const history = cleanCareerHistory(player.transfer_history || []);
                    const careerClubsCount = Math.max(2, history.length);
                    levelDatas.push(makeEmptyPlayerImportLevel({
                        gameMode: "career",
                        squadType: "club",
                        selectedEntry: clubItem,
                        currentSquad: squad,
                        careerPlayer: player,
                        careerHistory: history,
                        careerClubsCount,
                        searchText: player.name,
                        displayMode: "club",
                        landingPageType: "club",
                    }));
                }

                if (errors.length > 0) {
                    showErr(errors.join("\n"));
                    return;
                }

                const n = levelDatas.length;
                const allLevels = [
                    makeEmptyPlayerImportLevel({ isLogo: true }),
                    ...(INCLUDE_INTRO_LEVEL ? [makeEmptyPlayerImportLevel({ isIntro: true })] : []),
                    ...levelDatas,
                    makeEmptyPlayerImportLevel({ isBonus: true }),
                    makeEmptyPlayerImportLevel({ isOutro: true }),
                ];

                const newScript = {
                    name,
                    folder: null,
                    landing: {
                        gameMode: "career",
                        quizType: els.inQuizType?.value || "nat-by-club",
                        endingType: els.inEndingType?.value || "think-you-know",
                        specificToggle: els.inSpecificTitleToggle?.checked || false,
                        specificText: els.inSpecificTitleText?.value || "",
                        specificIcon: els.inSpecificTitleIcon?.value || "",
                        easy: els.inEasy?.value ?? "10",
                        medium: els.inMedium?.value ?? "5",
                        hard: els.inHard?.value ?? "3",
                        impossible: els.inImpossible?.value ?? "1",
                    },
                    lineup: {
                        videoMode: true,
                        totalLevels: n,
                        shortsMode: FIXED_SHORTS_MODE,
                    },
                    transitions: {},
                    levels: allLevels,
                };

                savedScripts.push(newScript);
                persistSaved();
                activeScriptName = name;
                closeImportModal();
                renderSavedScripts();

            } finally {
                els.importScriptConfirm.disabled = false;
                els.importScriptConfirm.textContent = "Import";
            }
        };
    }
    // -----------------------------------------------------------------------

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
        if (els.inEndingType) {
            els.inEndingType.value = script.landing.endingType || "think-you-know";
            els.inEndingType.dispatchEvent(new Event("change"));
        }
        els.inSpecificTitleToggle.checked = !!script.landing.specificToggle;
        els.inSpecificTitleText.value = script.landing.specificText || "";
        els.inSpecificTitleIcon.value = normalizeSpecificTitleIconPath(script.landing.specificIcon);
        // Sync YES/NO buttons with restored toggle state
        const specYes = document.getElementById("specific-title-yes");
        const specNo = document.getElementById("specific-title-no");
        if (specYes && specNo) {
            specYes.setAttribute("aria-pressed", els.inSpecificTitleToggle.checked ? "true" : "false");
            specNo.setAttribute("aria-pressed", els.inSpecificTitleToggle.checked ? "false" : "true");
        }
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

    if (uiCallbacks.syncShortsCirclePreviewPanel) uiCallbacks.syncShortsCirclePreviewPanel();

    applyTransitionSettings(script.transitions || null);

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
        careerReadyPhotoVariantIndex: lvl.careerReadyPhotoVariantIndex ?? 1,
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