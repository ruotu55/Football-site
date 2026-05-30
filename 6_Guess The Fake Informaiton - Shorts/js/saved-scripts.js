// js/saved-scripts.js (Career Path runner — namespaced storage + one-time legacy import)
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
import { getOrAssignRevealPhrase } from "./audio.js";
import {
    parseImportText as parseImportTextShared,
    resolvePairEntriesForPlayers,
    loadPlayersForPairEntries,
} from "../../.Storage/shared/import-pair-format.js";

const HAS_BUNDLED_VARIANTS = false;
const pickRandomBundledVariants = () => ({});

/** Force every level to have a reveal phrase picked for both EN + ES, and
 *  ensure the bundled milestone variants are populated. Idempotent — relies on
 *  getOrAssignRevealPhrase and pickRandomBundledVariants being themselves
 *  idempotent (they short-circuit when a pick already exists). */
function freezeVoicePicksForCurrentSession() {
    if (Array.isArray(appState.levelsData)) {
        for (const lang of ["english", "spanish"]) {
            appState.levelsData.forEach((lvl, idx) => {
                if (!lvl || typeof lvl !== "object") return;
                try { getOrAssignRevealPhrase(lvl, idx - 1, lang); } catch { /* non-fatal */ }
            });
        }
    }
    if (HAS_BUNDLED_VARIANTS) {
        const current = appState.bundledVoiceVariants;
        const empty = !current || typeof current !== "object" || Object.keys(current).length === 0;
        if (empty) appState.bundledVoiceVariants = pickRandomBundledVariants();
    }
}

/** Snapshot the per-level reveal-phrase cache into a JSON-serializable shape
 *  suitable for storing inside the saved script. Returns null when no cache. */
function snapshotLevelVoiceFreeze(level) {
    if (!level || typeof level !== "object") return null;
    const out = {};
    for (const [key, val] of Object.entries(level)) {
        if (!key.startsWith("__revealPhrase")) continue;
        const exportKey = key.slice(2);
        if (typeof val === "string" && val) {
            out[exportKey] = val;
        } else if (val && typeof val === "object") {
            const sub = {};
            for (const [k, v] of Object.entries(val)) {
                if (typeof v === "string" && v) sub[k] = v;
            }
            if (Object.keys(sub).length > 0) out[exportKey] = sub;
        }
    }
    if (Object.keys(out).length === 0) return null;
    return out;
}

/** Hydrate level.__revealPhraseByLanguage from a saved voiceFreeze blob.
 *  getOrAssignRevealPhrase already short-circuits when a cached pick exists,
 *  so this is the only restore step needed for reveal phrases. */
function restoreLevelVoiceFreeze(level, frozen) {
    if (!level || !frozen || typeof frozen !== "object") return;
    for (const [key, val] of Object.entries(frozen)) {
        const cacheKey = "__" + key;
        if (typeof val === "string" && val) {
            level[cacheKey] = val;
        } else if (val && typeof val === "object") {
            const sub = {};
            for (const [k, v] of Object.entries(val)) {
                if (typeof v === "string" && v) sub[k] = v;
            }
            if (Object.keys(sub).length > 0) level[cacheKey] = sub;
        }
    }
    if (frozen.revealPhraseByLanguage && !level.__revealPhrase) {
        const byLang = level.__revealPhraseByLanguage;
        if (byLang) {
            if (typeof byLang.english === "string") level.__revealPhrase = byLang.english;
            else if (typeof byLang.spanish === "string") level.__revealPhrase = byLang.spanish;
        }
    }
}

const VOICE_FREEZE_MIGRATION_FLAG = "footballQuizVoiceFreezeMigrated_fake_information_shorts_v2";

/** Walk every persisted script and bake in voiceFreeze for any that lack it.
 *  Runs once per browser via a localStorage flag. Safe to call at module-init
 *  time — audio.js has already finished its top-level by this point because
 *  saved-scripts.js imports it above. */
function migrateVoiceFreeze() {
    if (localStorage.getItem(VOICE_FREEZE_MIGRATION_FLAG) === "1") return;
    let scripts;
    try {
        scripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
    } catch { scripts = []; }
    if (!Array.isArray(scripts) || scripts.length === 0) {
        localStorage.setItem(VOICE_FREEZE_MIGRATION_FLAG, "1");
        return;
    }

    let changed = false;
    for (const script of scripts) {
        if (!script || typeof script !== "object" || !Array.isArray(script.levels)) continue;

        if (HAS_BUNDLED_VARIANTS && !script.voiceFreeze) {
            script.voiceFreeze = { bundledVariants: { ...pickRandomBundledVariants() } };
            changed = true;
        }

        for (let i = 0; i < script.levels.length; i++) {
            const lvl = script.levels[i];
            if (!lvl || typeof lvl !== "object" || lvl.voiceFreeze) continue;
            const synthLevel = {};
            for (const lang of ["english", "spanish"]) {
                try { getOrAssignRevealPhrase(synthLevel, i - 1, lang); } catch {}
            }
            const frozen = snapshotLevelVoiceFreeze(synthLevel);
            if (frozen) {
                lvl.voiceFreeze = frozen;
                changed = true;
            }
        }
    }

    if (changed) {
        try { localStorage.setItem(KEY_SCRIPTS, JSON.stringify(scripts)); }
        catch { /* quota or serialization failure — best-effort */ }
    }
    localStorage.setItem(VOICE_FREEZE_MIGRATION_FLAG, "1");
}

const INCLUDE_INTRO_LEVEL = false;

const KEY_SCRIPTS = "footballQuizScripts_fake_information_shorts_v1";
const KEY_FOLDERS = "footballQuizFolders_fake_information_shorts_v1";
const KEY_FOLDER_STATES = "footballQuizFolderStates_fake_information_shorts_v1";
const LEGACY_SCRIPTS = "footballQuizScripts";
const LEGACY_FOLDERS = "footballQuizFolders";
const LEGACY_FOLDER_STATES = "footballQuizFolderStates";
const FIXED_SHORTS_MODE = true;

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

/** Old saves included a dedicated landing level at index 1 (`isIntro: true`). */
function migrateShortsLevelsRemoveLegacyLanding(levels) {
    if (!Array.isArray(levels) || levels.length < 3) return levels;
    const first = levels[1];
    if (!first || first.isIntro !== true) return levels;
    const migrated = levels.slice();
    migrated.splice(1, 1);
    const total = migrated.length - 1;
    return migrated.map((lvl, i) => ({
        ...lvl,
        isLogo: i === 0,
        isIntro: false,
        isOutro: i === total,
        isBonus: i === total - 1,
    }));
}

const SAVE_SERVER = createSavedScriptsServerSync("fake_information_shorts", {
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
migrateVoiceFreeze();

let savedScripts = JSON.parse(localStorage.getItem(KEY_SCRIPTS) || "[]");
let savedFolders = JSON.parse(localStorage.getItem(KEY_FOLDERS) || "[]");
let folderStates = JSON.parse(localStorage.getItem(KEY_FOLDER_STATES) || "{}");
let scriptToDeleteIndex = -1;
let activeScriptName = null;

/** Name of the currently loaded saved setting (e.g. "Champion League"), or null. */
export function getActiveScriptName() {
    return activeScriptName;
}

/** Used by the calendar-driven Saved tab when a block is loaded — the Record
 *  Video button reads getActiveScriptName() to derive the OBS file name. */
export function setActiveScriptName(name) {
    activeScriptName = name == null ? null : String(name);
}

/** Build a saved-script object from the current quiz UI state. Public so the
 *  calendar-driven Saved tab can persist a block's script. Mirrors what
 *  commitSavedScript() captures below — keep in sync if that handler changes. */
export function captureCurrentScriptObject(name) {
    const { els } = appState;
    freezeVoicePicksForCurrentSession();
    const levelsToSave = appState.levelsData.map((lvl) => ({
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
        careerTeamQuizMode: !!lvl.careerTeamQuizMode,
        voiceFreeze: snapshotLevelVoiceFreeze(lvl) || undefined,
    }));

    return {
        name,
        folder: null,
        landing: {
            gameMode: "career",
            quizType: els.inQuizType.value,
            endingType: els.inEndingType ? els.inEndingType.value : "think-you-know",
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
        voiceFreeze: HAS_BUNDLED_VARIANTS && appState.bundledVoiceVariants ? { bundledVariants: { ...appState.bundledVoiceVariants } } : undefined,
    };
}

/** Apply a previously-captured script object to the current UI. Same semantics
 *  as clicking a saved-scripts row, but exposed so the calendar-driven Saved
 *  tab can load a block. Sets activeScriptName so the Record Video button picks
 *  up the block name as the OBS file name. */
export async function applyScriptObject(script) {
    return loadScript(script);
}

/** Build a script object from a "[Name1, Name2, ...]" paste — the same flow
 *  the Import modal runs, but headless so the calendar-driven Saved tab can
 *  call it from its block-save modal. Returns one of:
 *    { ok: true, script }
 *    { ok: false, errors: string[], searchableNames: Set<string> }
 *  Does NOT mutate UI state (no activeScriptName, no rendering). The caller
 *  decides what to do with the returned script. Ambiguous matches resolve to
 *  the first (longest-name) candidate since there is no interactive picker. */
export async function buildScriptFromImportText(text, name) {
    const { els } = appState;
    const parsed = parseImportText(text);
    if (parsed.error) return { ok: false, errors: [parsed.error] };

    const errors = [];
    const searchableNames = new Set();
    let pairResolved = null;

    if (parsed.entries) {
        // Load ONLY the squads referenced in this save (fast). Fall back to the
        // full player DB only if a player isn't in their listed team's squad.
        const _clubsForImport = appState.teamsIndex?.clubs || [];
        let allPlayers = await loadPlayersForPairEntries(parsed.entries, {
            clubs: _clubsForImport,
            normalizeForImport,
            loadSquadJson,
        });
        let pairResult = await resolvePairEntriesForPlayers(parsed.entries, {
            allPlayers,
            clubs: _clubsForImport,
            findAllPlayerCandidates,
            normalizeForImport,
            applyImportAliasesToNames,
        });
        if (pairResult.errors.length > 0 && typeof appState.loadAllGlobalPlayers === "function") {
            // A player wasn't in their listed team — pay for the full DB once and retry.
            try {
                allPlayers = await appState.loadAllGlobalPlayers();
                pairResult = await resolvePairEntriesForPlayers(parsed.entries, {
                    allPlayers,
                    clubs: _clubsForImport,
                    findAllPlayerCandidates,
                    normalizeForImport,
                    applyImportAliasesToNames,
                });
            } catch (_e) { /* keep the scoped result/errors */ }
        }
        if (pairResult.errors.length > 0) {
            return { ok: false, errors: pairResult.errors, searchableNames: pairResult.searchableNames };
        }
        pairResolved = pairResult.resolved;
    }

    let names;
    let resolved;
    if (!pairResolved) {
        names = await applyImportAliasesToNames(parsed.names);

        let allPlayers;
        try {
            allPlayers = typeof appState.loadAllGlobalPlayers === "function"
                ? await appState.loadAllGlobalPlayers()
                : (appState.allGlobalPlayers || []);
        } catch {
            allPlayers = appState.allGlobalPlayers || [];
        }
        if (!allPlayers || allPlayers.length === 0) {
            return { ok: false, errors: ["Player database not loaded yet. Try again in a moment."] };
        }

        resolved = new Array(names.length).fill(null);
        for (let i = 0; i < names.length; i++) {
            const rawName = names[i];
            const cands = findAllPlayerCandidates(rawName, allPlayers);
            if (cands.length === 0) {
                errors.push(`❌ ${rawName}: player not found.`);
                searchableNames.add(rawName);
            } else if (cands.length === 1) {
                resolved[i] = cands[0];
            } else {
                errors.push(`❌ ${rawName}: multiple players match — be more specific.`);
                searchableNames.add(rawName);
            }
        }
        if (errors.length > 0) return { ok: false, errors, searchableNames };
    }

    const levelDatas = [];
    const appendPlayerLevel = async (player, clubItem, rawName) => {
        if (!clubItem) {
            errors.push(`❌ ${rawName}: missing club reference.`);
            searchableNames.add(rawName);
            return;
        }
        let squad;
        try {
            squad = await loadSquadJson(clubItem);
        } catch {
            errors.push(`❌ ${rawName}: failed to load squad data.`);
            return;
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
    };

    if (pairResolved) {
        for (const { player, clubItem, label } of pairResolved) {
            await appendPlayerLevel(player, clubItem, label);
        }
    } else {
        for (let i = 0; i < resolved.length; i++) {
            await appendPlayerLevel(resolved[i], resolved[i]._clubItem, names[i]);
        }
    }

    if (errors.length > 0) return { ok: false, errors, searchableNames };

    const n = levelDatas.length;
    if (levelDatas.length > 0) levelDatas[levelDatas.length - 1].isBonus = true;
    const allLevels = [
        makeEmptyPlayerImportLevel({ isLogo: true }),
        ...(INCLUDE_INTRO_LEVEL ? [makeEmptyPlayerImportLevel({ isIntro: true })] : []),
        ...levelDatas,
        makeEmptyPlayerImportLevel({ isOutro: true }),
    ];

    const script = {
        name,
        folder: null,
        landing: {
            gameMode: "career",
            quizType: els.inQuizType?.value || "player-by-fake-info",
            endingType: els.inEndingType?.value || "think-you-know",
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

    return { ok: true, script };
}

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
                .replace(/ð/g, "d").replace(/þ/g, "th").replace(/ß/g, "ss").replace(/ł/g, "l").replace(/Ł/g, "l").replace(/đ/g, "d").replace(/Đ/g, "d").replace(/\//g, " ").replace(/-/g, " ")
                .replace(/[''`´']/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, " ").trim()
        );
    } catch {
        return foldTurkishLatinForImport(
            str.trim().toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .replace(/ø/g, "o").replace(/å/g, "a").replace(/æ/g, "ae")
                .replace(/ð/g, "d").replace(/þ/g, "th").replace(/ß/g, "ss").replace(/ł/g, "l").replace(/Ł/g, "l").replace(/đ/g, "d").replace(/Đ/g, "d").replace(/\//g, " ").replace(/-/g, " ")
                .replace(/[''`´']/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, " ").trim()
        );
    }
}

/**
 * Build an in-memory modal that lets the user search a list of items
 * (players or teams) and pick one. Resolves with the picked item or null on
 * cancel. `displayFn(item)` returns the row label.
 */
function showManualSearchModal({ title, items, displayFn }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:10001; display:flex; align-items:center; justify-content:center;";
        const modal = document.createElement("div");
        modal.style.cssText = "background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:1.1rem 1.25rem; width:min(560px, 92vw); max-height:82vh; display:flex; flex-direction:column; gap:0.75rem;";
        const header = document.createElement("h3");
        header.textContent = title || "Search manually";
        header.style.cssText = "margin:0; color:#fff; font-size:1rem;";
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = "Type to filter…";
        input.style.cssText = "padding:0.5rem; background:#000; color:#fff; border:1px solid #333; border-radius:4px; font-size:0.9rem;";
        const list = document.createElement("div");
        list.style.cssText = "overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:0.25rem; min-height:240px;";
        const footer = document.createElement("div");
        footer.style.cssText = "display:flex; gap:0.5rem; justify-content:flex-end;";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText = "padding:0.45rem 0.9rem; background:#333; color:#fff; border:1px solid #555; border-radius:4px; cursor:pointer;";
        footer.appendChild(cancelBtn);
        modal.append(header, input, list, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        function close(result) { try { document.body.removeChild(overlay); } catch {} resolve(result); }
        cancelBtn.onclick = () => close(null);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
        function render() {
            const q = input.value.trim().toLowerCase();
            list.innerHTML = "";
            const filtered = items
                .map((item) => ({ item, label: displayFn(item) }))
                .filter(({ label }) => !q || label.toLowerCase().includes(q))
                .slice(0, 300);
            for (const { item, label } of filtered) {
                const row = document.createElement("button");
                row.type = "button";
                row.textContent = label;
                row.style.cssText = "text-align:left; padding:0.45rem 0.6rem; background:#222; color:#fff; border:1px solid #333; border-radius:4px; cursor:pointer; font-size:0.85rem;";
                row.onmouseover = () => { row.style.background = "#333"; };
                row.onmouseout = () => { row.style.background = "#222"; };
                row.onclick = () => close(item);
                list.appendChild(row);
            }
            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = "No matches.";
                empty.style.cssText = "color:#888; padding:0.5rem;";
                list.appendChild(empty);
            }
        }
        input.addEventListener("input", render);
        render();
        setTimeout(() => input.focus(), 0);
    });
}

const IMPORT_ALIAS_LS_KEY = "quizImport_aliases_v1";
const IMPORT_ALIAS_ENDPOINT = "/__runner-import-aliases";

function normalizeImportAliasKey(name) {
    return String(name || "").trim().toLowerCase();
}

let _importAliasCache = (() => {
    try {
        const raw = localStorage.getItem(IMPORT_ALIAS_LS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
})();

function _writeImportAliasCacheToLS() {
    try { localStorage.setItem(IMPORT_ALIAS_LS_KEY, JSON.stringify(_importAliasCache)); } catch {}
}

async function fetchImportAliasesFromServer() {
    try {
        const res = await fetch(IMPORT_ALIAS_ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (body && typeof body.aliases === "object" && body.aliases !== null) {
            _importAliasCache = body.aliases;
            _writeImportAliasCacheToLS();
        }
    } catch {}
}

const _importAliasInitialSync = fetchImportAliasesFromServer();

function loadImportAliases() {
    return _importAliasCache;
}

async function saveImportAlias(rawName, aliasName) {
    if (!rawName || !aliasName) return;
    const key = normalizeImportAliasKey(rawName);
    _importAliasCache[key] = aliasName;
    _writeImportAliasCacheToLS();
    try {
        const res = await fetch(IMPORT_ALIAS_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merge: { [key]: aliasName } }),
        });
        if (res.ok) {
            const body = await res.json().catch(() => null);
            if (body && typeof body.aliases === "object" && body.aliases !== null) {
                _importAliasCache = body.aliases;
                _writeImportAliasCacheToLS();
            }
        }
    } catch {}
}

async function applyImportAliasesToNames(names) {
    if (!Array.isArray(names) || names.length === 0) return names;
    try { await _importAliasInitialSync; } catch {}
    await fetchImportAliasesFromServer();
    return names.map((n) => _importAliasCache[normalizeImportAliasKey(n)] || n);
}

function showSaveAliasConfirmModal({ rawName, pickedName }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:10002; display:flex; align-items:center; justify-content:center;";
        const modal = document.createElement("div");
        modal.style.cssText = "background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:1.1rem 1.25rem; width:min(440px, 92vw); display:flex; flex-direction:column; gap:0.85rem;";
        const header = document.createElement("h3");
        header.textContent = "Save for next time?";
        header.style.cssText = "margin:0; color:#fff; font-size:1rem;";
        const body = document.createElement("div");
        body.style.cssText = "color:#ddd; font-size:0.9rem; line-height:1.4;";
        body.append("Always use ");
        const pickedB = document.createElement("b");
        pickedB.style.color = "#ffd166";
        pickedB.textContent = String(pickedName ?? "");
        body.append(pickedB, " when the import has ");
        const rawB = document.createElement("b");
        rawB.style.color = "#ffd166";
        rawB.textContent = String(rawName ?? "");
        body.append(rawB, "?");
        const footer = document.createElement("div");
        footer.style.cssText = "display:flex; gap:0.5rem; justify-content:flex-end;";
        const noBtn = document.createElement("button");
        noBtn.type = "button";
        noBtn.textContent = "No";
        noBtn.style.cssText = "padding:0.45rem 1.1rem; background:#333; color:#fff; border:1px solid #555; border-radius:4px; cursor:pointer;";
        const yesBtn = document.createElement("button");
        yesBtn.type = "button";
        yesBtn.textContent = "Yes";
        yesBtn.style.cssText = "padding:0.45rem 1.1rem; background:var(--accent, #ffaa00); color:#000; border:none; border-radius:4px; cursor:pointer; font-weight:600;";
        footer.append(noBtn, yesBtn);
        modal.append(header, body, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        function close(result) { try { document.body.removeChild(overlay); } catch {} resolve(result); }
        noBtn.onclick = () => close(false);
        yesBtn.onclick = () => close(true);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
        setTimeout(() => yesBtn.focus(), 0);
    });
}

/**
 * Render import errors as rows inside `container`. Errors whose `rawName`
 * appears in `searchableNames` get a "Search manually" button that opens the
 * search modal pre-filled with `items` and, on selection, replaces every
 * occurrence of the bad name in `textInput` with the picked item's name and
 * re-clicks `confirmBtn` to retry the import.
 */
function renderImportErrors({ container, errors, searchableNames, items, displayFn, modalTitle, textInput, confirmBtn }) {
    if (!container) return;
    container.innerHTML = "";
    container.style.display = "block";
    for (const errMsg of errors) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;";
        const text = document.createElement("span");
        text.textContent = errMsg;
        text.style.cssText = "color:#f77; flex:1; font-size:0.85rem; white-space:pre-wrap;";
        row.appendChild(text);
        let matchedName = null;
        if (searchableNames) {
            for (const n of searchableNames) {
                if (errMsg.includes(n)) { matchedName = n; break; }
            }
        }
        if (matchedName) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "Search manually";
            btn.style.cssText = "padding:0.25rem 0.6rem; font-size:0.75rem; background:var(--accent, #ffaa00); color:#000; border:none; border-radius:4px; cursor:pointer; white-space:nowrap;";
            btn.onclick = async () => {
                const picked = await showManualSearchModal({
                    title: (modalTitle || "Search manually") + (matchedName ? ` — replace "${matchedName}"` : ""),
                    items,
                    displayFn,
                });
                if (picked && picked.name && textInput) {
                    const wantSave = await showSaveAliasConfirmModal({ rawName: matchedName, pickedName: picked.name });
                    if (wantSave === true) saveImportAlias(matchedName, picked.name);
                    textInput.value = textInput.value.split(matchedName).join(picked.name);
                    if (confirmBtn) confirmBtn.click();
                }
            };
            row.appendChild(btn);
        }
        container.appendChild(row);
    }
}

function parseImportText(text) {
    return parseImportTextShared(text, { legacyItemLabel: "players", entryType: "player-team" });
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

function stripCommonClubPrefixes(norm) {
    return String(norm || "")
        .replace(/^\s*(fk|fc|acf|ac|as|ssc|sc|sv|cf)\s+/i, "")
        .trim();
}

function stripTrailingClubSuffixes(norm) {
    return String(norm || "")
        .replace(/\s+(afc|fc|cf|sc)\s*$/i, "")
        .trim();
}

function squashClubArticles(norm) {
    return String(norm || "")
        .replace(/-/g, " ")
        .replace(/\b(de|del|da|do|the|of)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function clubKeyForMatch(name) {
    return stripTrailingClubSuffixes(
        squashClubArticles(stripCommonClubPrefixes(normalizeForImport(name))),
    );
}

/** Same shape as team-name / fake-info levels in the player-name runner. */
function createSyntheticTeamCareerPlayer(entry) {
    const teamName = String(entry?.name || "").trim();
    return {
        name: teamName,
        club: teamName,
        nationality: String(entry?.country || entry?.region || "").trim(),
        position: "",
        age: null,
        shirt_number: null,
        transfer_history: [{ club: teamName, year: "TEAM" }],
        _clubItem: entry || null,
    };
}

/**
 * Resolve pasted team labels to `teams-index` club entries (exact / fuzzy).
 */
/** alias map shared with family-A runners; normalized key -> normalized canonical name */
const IMPORT_TEAM_ALIASES = {
    "1 fc heidenheim": "1fc heidenheim 1846",
    "1 fc koln": "1fc koln",
    "1 fc union berlin": "1fc union berlin",
    "1 fsv mainz 05": "1fsv mainz 05",
    "aberdeen": "aberdeen fc",
    "ajax": "ajax amsterdam",
    "al ahli saudi": "al ahli sfc",
    "al hilal": "al hilal sfc",
    "al ittihad": "al ittihad club",
    "al nassr": "al nassr fc",
    "arsenal": "arsenal fc",
    "atalanta": "atalanta bc",
    "athletic club": "athletic bilbao",
    "atletico madrid": "atletico de madrid",
    "barcelona": "fc barcelona",
    "bayer leverkusen": "bayer 04 leverkusen",
    "benfica": "sl benfica",
    "boca juniors": "ca boca juniors",
    "bodo glimt": "fk bodo glimt",
    "bologna": "bologna fc 1909",
    "bosnia": "bosnia and herzegovina",
    "breidablik": "breidablik kopavogur",
    "brentford": "brentford fc",
    "burnley": "burnley fc",
    "cagliari": "cagliari calcio",
    "celje": "nk celje",
    "celta vigo": "celta de vigo",
    "celtic": "celtic fc",
    "chelsea": "chelsea fc",
    "club america": "cf america",
    "club brugge": "club brugge kv",
    "como": "como 1907",
    "copenhagen": "fc copenhagen",
    "cremonese": "us cremonese",
    "dinamo zagreb": "gnk dinamo zagreb",
    "drita": "fc drita",
    "england": "england",
    "everton": "everton fc",
    "fc basel": "fc basel 1893",
    "fc bayern munich": "bayern munich",
    "ferencvaros": "ferencvarosi tc",
    "feyenoord": "feyenoord rotterdam",
    "fiorentina": "acf fiorentina",
    "flamengo": "cr flamengo",
    "fulham": "fulham fc",
    "genoa": "genoa cfc",
    "inter miami": "inter miami cf",
    "juventus": "juventus fc",
    "kups kuopio": "kuopion palloseura",
    "la galaxy": "los angeles galaxy",
    "lausanne sport": "fc lausanne sport",
    "lazio": "ss lazio",
    "lecce": "us lecce",
    "lincoln red imps": "lincoln red imps fc",
    "liverpool": "liverpool fc",
    "mainz 05": "1fsv mainz 05",
    "napoli": "ssc napoli",
    "noah": "fc noah yerevan",
    "olympiacos": "olympiacos piraeus",
    "olympique de marseille": "olympique marseille",
    "olympique lyonnais": "olympique lyon",
    "omonoia": "omonia nicosia",
    "pafos": "pafos fc",
    "palmeiras": "sociedade esportiva palmeiras",
    "panathinaikos": "panathinaikos fc",
    "paok": "paok thessaloniki",
    "parma": "parma calcio 1913",
    "pisa": "pisa sporting club",
    "pisa sc": "pisa sporting club",
    "qarabag": "qarabag fk",
    "rangers": "rangers fc",
    "rc celta de vigo": "celta de vigo",
    "rc strasbourg": "rc strasbourg alsace",
    "rcd espanyol": "rcd espanyol barcelona",
    "real betis": "real betis balompie",
    "rijeka": "hnk rijeka",
    "river plate": "ca river plate",
    "roma": "as roma",
    "sassuolo": "us sassuolo",
    "shelbourne": "shelbourne fc",
    "shkendija": "shkendija tetovo",
    "sigma olomouc": "sk sigma olomouc",
    "sk rapid": "rapid vienna",
    "slavia praha": "sk slavia prague",
    "sparta praha": "ac sparta prague",
    "stade rennais": "stade rennais fc",
    "strasbourg": "rc strasbourg alsace",
    "sturm graz": "sk sturm graz",
    "sunderland": "sunderland afc",
    "torino": "torino fc",
    "toulouse fc": "fc toulouse",
    "turkey": "turkiye",
    "udinese": "udinese calcio",
    "usa": "united states",
    "viktoria plzen": "fc viktoria plzen",
    "villarreal": "villarreal cf",
    "young boys": "bsc young boys",
    "zrinjski mostar": "hsk zrinjski mostar",
};

function findAllClubCandidates(rawName, clubs) {
    if (!Array.isArray(clubs) || clubs.length === 0) return [];
    const raw = String(rawName || "").trim();
    let query = clubKeyForMatch(raw);
    if (!query) return [];
    const __aliasTarget = IMPORT_TEAM_ALIASES[normalizeForImport(raw)];
    if (__aliasTarget) {
        const __aliasHits = clubs.filter((c) => normalizeForImport(c.name) === __aliasTarget);
        if (__aliasHits.length) return __aliasHits;
    }

    if (/^rb\s+/i.test(raw)) {
        query = clubKeyForMatch(raw.replace(/^\s*rb\s+/i, "Red Bull "));
    }

    let hits = clubs.filter((c) => clubKeyForMatch(c.name) === query);
    if (hits.length > 0) return hits;

    const nickToSubstring = {
        wolves: "wolverhampton",
        spurs: "tottenham",
    };
    const nickSub = nickToSubstring[query];
    if (nickSub) {
        hits = clubs.filter((c) => clubKeyForMatch(c.name).includes(nickSub));
        if (hits.length > 0) {
            hits.sort((a, b) => clubKeyForMatch(b.name).length - clubKeyForMatch(a.name).length);
            return hits;
        }
    }

    const boundaryRe =
        query.length >= 3
            ? new RegExp(`(?:^|[\\s/])${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s/])`)
            : null;

    hits = clubs.filter((c) => {
        const k = clubKeyForMatch(c.name);
        if (!k) return false;
        if (k === query) return true;
        if (boundaryRe && boundaryRe.test(k)) return true;
        if (query.length >= 6 && k.includes(query)) return true;
        if (query.length >= 6 && query.includes(k)) return true;
        return false;
    });

    if (hits.length > 1) {
        hits.sort((a, b) => clubKeyForMatch(b.name).length - clubKeyForMatch(a.name).length);
    }
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
        freezeVoicePicksForCurrentSession();
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
            careerTeamQuizMode: !!lvl.careerTeamQuizMode,
            voiceFreeze: snapshotLevelVoiceFreeze(lvl) || undefined,
        }));
    }

    function commitSavedScript(name) {
        const newScript = captureCurrentScriptObject(name);
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
        document.body.classList.remove("import-script-modal-open");
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
                document.body.classList.add("import-script-modal-open");
                if (els.importScriptModal.parentElement !== document.body) {
                    document.body.appendChild(els.importScriptModal);
                }
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
                    const isClub = ambig[i]?.kind === "team" || p?.league != null;
                    opt.textContent = isClub
                        ? `${p?.name || "?"} — ${p?.country || p?.region || "?"} / ${p?.league || "?"}`
                        : `${p?.name || "?"} - ${p?._clubItem?.name || "?"}`;
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
                const names = await applyImportAliasesToNames(parsed.names);

                const errors = [];
                const searchableNames = new Set();
                /** @type {Array<null | { kind: "team" | "player", data: object }>} */
                const resolved = new Array(names.length).fill(null);
                const ambiguous = [];
                const clubs = appState.teamsIndex?.clubs || [];
                if (!clubs.length) {
                    showErr("Team list not loaded yet. Wait for the app to finish loading, then try again.");
                    return;
                }

                let allPlayers = null;
                const loadPlayersDb = async () => {
                    if (allPlayers) return allPlayers;
                    try {
                        allPlayers = typeof appState.loadAllGlobalPlayers === "function"
                            ? await appState.loadAllGlobalPlayers()
                            : (appState.allGlobalPlayers || []);
                    } catch {
                        allPlayers = appState.allGlobalPlayers || [];
                    }
                    return allPlayers;
                };

                for (let i = 0; i < names.length; i++) {
                    const rawName = names[i];
                    const clubCands = findAllClubCandidates(rawName, clubs);
                    if (clubCands.length === 1) {
                        resolved[i] = { kind: "team", data: clubCands[0] };
                        continue;
                    }
                    if (clubCands.length > 1) {
                        ambiguous.push({ listIndex: i, rawName, kind: "team", candidates: clubCands });
                        continue;
                    }

                    const players = await loadPlayersDb();
                    if (!players || players.length === 0) {
                        errors.push(`❌ ${rawName}: player database not loaded yet.`);
                        searchableNames.add(rawName);
                        continue;
                    }
                    const playerCands = findAllPlayerCandidates(rawName, players);
                    if (playerCands.length === 0) {
                        errors.push(`❌ ${rawName}: not found as team or player.`);
                        searchableNames.add(rawName);
                    } else if (playerCands.length === 1) {
                        resolved[i] = { kind: "player", data: playerCands[0] };
                    } else {
                        ambiguous.push({ listIndex: i, rawName, kind: "player", candidates: playerCands });
                    }
                }
                if (errors.length > 0) {
                    const players = await loadPlayersDb();
                    const searchItems = [...clubs, ...(players || [])];
                    renderImportErrors({
                        container: els.importScriptError,
                        errors,
                        searchableNames,
                        items: searchItems,
                        displayFn: (item) =>
                            item?.league != null
                                ? `${item?.name || "?"} — ${item?.country || "?"} / ${item?.league || "?"}`
                                : `${item?.name || "?"} - ${item?._clubItem?.name || "?"}`,
                        modalTitle: "Search team or player",
                        textInput: els.importScriptText,
                        confirmBtn: els.importScriptConfirm,
                    });
                    return;
                }

                if (ambiguous.length > 0) {
                    const result = await pickDisambiguations(ambiguous);
                    if (result.cancelled) return;
                    for (let ai = 0; ai < ambiguous.length; ai++) {
                        const picked = result.picks[ai];
                        if (!picked) {
                            showErr(`❌ ${ambiguous[ai].rawName}: no selection made.`);
                            return;
                        }
                        resolved[ambiguous[ai].listIndex] = {
                            kind: ambiguous[ai].kind,
                            data: picked,
                        };
                    }
                }

                const levelDatas = [];
                for (let i = 0; i < resolved.length; i++) {
                    const picked = resolved[i];
                    const rawName = names[i];
                    if (!picked?.data) {
                        errors.push(`❌ ${rawName}: no match resolved.`);
                        continue;
                    }
                    if (picked.kind === "team") {
                        const entry = picked.data;
                        let squad;
                        try {
                            squad = await loadSquadJson(entry);
                        } catch {
                            errors.push(`❌ ${rawName}: failed to load squad data.`);
                            continue;
                        }
                        const teamPlayer = createSyntheticTeamCareerPlayer(entry);
                        levelDatas.push(makeEmptyPlayerImportLevel({
                            gameMode: "career",
                            squadType: "club",
                            selectedEntry: entry,
                            currentSquad: squad,
                            careerPlayer: teamPlayer,
                            careerHistory: [{ club: teamPlayer.club, year: "TEAM" }],
                            careerClubsCount: 1,
                            careerTeamQuizMode: true,
                            searchText: teamPlayer.name,
                            displayMode: "club",
                            landingPageType: "club",
                        }));
                        continue;
                    }

                    const player = picked.data;
                    const clubItem = player._clubItem;
                    if (!clubItem) {
                        errors.push(`❌ ${rawName}: missing club reference.`);
                        continue;
                    }
                    let squad;
                    try {
                        squad = await loadSquadJson(clubItem);
                    } catch {
                        errors.push(`❌ ${rawName}: failed to load squad data.`);
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
                // Fold last imported entry into the bonus slot so we don't append an empty bonus.
                if (levelDatas.length > 0) levelDatas[levelDatas.length - 1].isBonus = true;
                const allLevels = [
                    makeEmptyPlayerImportLevel({ isLogo: true }),
                    ...(INCLUDE_INTRO_LEVEL ? [makeEmptyPlayerImportLevel({ isIntro: true })] : []),
                    ...levelDatas,
                    makeEmptyPlayerImportLevel({ isOutro: true }),
                ];

                const newScript = {
                    name,
                    folder: null,
                    landing: {
                        gameMode: "career",
                        quizType: els.inQuizType?.value || "player-by-fake-info",
                        endingType: els.inEndingType?.value || "think-you-know",
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
                await loadScript(newScript);

            } finally {
                els.importScriptConfirm.disabled = false;
                els.importScriptConfirm.textContent = "Import";
            }
        };
    }
    // -----------------------------------------------------------------------

    const pullFromServer = () => SAVE_SERVER.startPull({
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
    }).then(() => renderSavedScripts());

    pullFromServer();
    renderSavedScripts();
    if (els.tabBtnSaved) {
        els.tabBtnSaved.addEventListener("click", pullFromServer);
    }
}

export function renderSavedScripts() {
    const { els } = appState;
    if (!els.savedScriptsList) return;

    els.savedScriptsList.innerHTML = "";

    savedFolders.forEach((folderName) => {
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
    const quizType = (script.landing && script.landing.quizType) ? script.landing.quizType : "player-by-fake-info";

    if(uiCallbacks.populateSubTypes) uiCallbacks.populateSubTypes();

    els.inQuizType.value = quizType;
    if(uiCallbacks.updateSetupUI) uiCallbacks.updateSetupUI();

    if (script.landing) {
        if (els.inEndingType) {
            els.inEndingType.value = script.landing.endingType || "think-you-know";
            els.inEndingType.dispatchEvent(new Event("change"));
        }
        els.inEasy.value = script.landing.easy || 10;
        els.inMedium.value = script.landing.medium || 5;
        els.inHard.value = script.landing.hard || 3;
        els.inImpossible.value = script.landing.impossible || 1;
    }

    if (script.lineup) {
        els.videoModeToggle.checked = !!script.lineup.videoMode;
        els.quizLevelsInput.value = script.lineup.totalLevels || 5;
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

    const migratedLevels = migrateShortsLevelsRemoveLegacyLanding(script.levels);
    appState.totalLevelsCount = migratedLevels.length - 1;
    appState.levelsData = migratedLevels.map(lvl => {
        const merged = {
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
            careerTeamQuizMode: !!lvl.careerTeamQuizMode,
        };
        restoreLevelVoiceFreeze(merged, lvl.voiceFreeze);
        return merged;
    });

    if (els.quizLevelsInput) {
        const fromLevels = migratedLevels.filter((l) => l && !l.isLogo && !l.isIntro && !l.isBonus && !l.isOutro).length;
        const fromLineup = parseInt(String(script.lineup?.totalLevels ?? ""), 10);
        els.quizLevelsInput.value = String(
            Math.max(1, fromLevels > 0 ? fromLevels : (Number.isFinite(fromLineup) ? fromLineup : 5)),
        );
    }

    if (uiCallbacks.updateLanding) uiCallbacks.updateLanding();

    els.teamSearch.value = "";
    els.teamSearch.classList.remove("team-selected");
    els.teamResults.replaceChildren();

    applyCustomSelects();
    /* The calendar-driven Saved tab listens for "recording-queue:script-applied"
       to re-render with the new active block. The legacy savedScripts list no
       longer mounts, so we skip renderSavedScripts() here. */
    document.dispatchEvent(new CustomEvent("recording-queue:script-applied", {
        detail: { name: activeScriptName },
    }));
    // Back-fill voiceFreeze on the loaded script if any level lacks it.
    // freezeVoicePicksForCurrentSession is idempotent — populated levels skip.
    freezeVoicePicksForCurrentSession();
    let voiceFreezeBackfilled = false;
    for (let i = 0; i < script.levels.length; i++) {
        const lvl = script.levels[i];
        if (!lvl || typeof lvl !== "object" || lvl.voiceFreeze) continue;
        const frozen = snapshotLevelVoiceFreeze(appState.levelsData[i]);
        if (frozen) {
            lvl.voiceFreeze = frozen;
            voiceFreezeBackfilled = true;
        }
    }
    if (HAS_BUNDLED_VARIANTS && !script.voiceFreeze && appState.bundledVoiceVariants) {
        script.voiceFreeze = { bundledVariants: { ...appState.bundledVoiceVariants } };
        voiceFreezeBackfilled = true;
    }
    if (voiceFreezeBackfilled) persistSaved();
    appState.currentLevelIndex = 0;
    switchLevel(1);
}
