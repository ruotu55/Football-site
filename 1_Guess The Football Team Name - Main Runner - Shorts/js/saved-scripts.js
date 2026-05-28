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
import { loadSquadJson } from "./teams.js";
import {
    ensureSavedLayoutsLoaded,
    hasSavedLayoutForEntry,
    buildImportLevelDataFromSavedLayout,
} from "./saved-team-layouts.js";

const KEY_SCRIPTS = "footballQuizScripts_lineups_shorts_fcbnew";
const KEY_FOLDERS = "footballQuizFolders_lineups_shorts_fcbnew";
const KEY_FOLDER_STATES = "footballQuizFolderStates_lineups_shorts_fcbnew";
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

const SAVE_SERVER = createSavedScriptsServerSync("lineups_shorts", {
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
export function getActiveScriptName() { return activeScriptName; }

/** Used by the calendar-driven Saved tab when a block is loaded — the Record
 *  Video button reads getActiveScriptName() to derive the OBS file name. */
export function setActiveScriptName(name) {
    activeScriptName = name == null ? null : String(name);
}

/** Build a saved-script object from the current quiz UI state. Public so the
 *  calendar-driven Saved tab can persist a block's script. Mirrors what
 *  els.saveScriptConfirm.onclick captures below — keep in sync if that handler changes. */
export function captureCurrentScriptObject(name) {
    const { els } = appState;
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
            slotPhotoIndexEntries: Array.from(lvl.slotPhotoIndexBySlot.entries()),
        };
    });

    const newScript = {
        name,
        folder: null,
        landing: {
            gameMode: "lineup",
            quizType: els.inQuizType.value,
            endingType: els.inEndingType ? els.inEndingType.value : "think-you-know",
            easy: els.inEasy.value,
            medium: els.inMedium.value,
            hard: els.inHard.value,
            impossible: els.inImpossible.value,
        },
        lineup: {
            videoMode: els.videoModeToggle.checked,
            totalLevels: els.quizLevelsInput.value,
            shortsMode: FIXED_SHORTS_MODE,
        },
        transitions: captureTransitionSettings(),
        levels: levelsToSave,
    };
    return newScript;
}

/** Apply a previously-captured script object to the current UI. Same semantics
 *  as clicking a saved-scripts row, but exposed so the calendar-driven Saved
 *  tab can load a block. Sets activeScriptName so the Record Video button picks
 *  up the block name as the OBS file name. */
export async function applyScriptObject(script) {
    return loadScript(script);
}

/** Build a script object from a "[Team1, Team2, ...]" paste — the same flow
 *  the legacy Import modal ran, but headless so the calendar-driven Saved tab
 *  can call it from its block-save modal. Returns one of:
 *    { ok: true, script }
 *    { ok: false, errors: string[], searchableNames: Set<string> }  // resolution needed
 *    { ok: false, errors: ["..."] }                                   // parse failure
 *  Does NOT mutate UI state (no activeScriptName, no rendering). The caller
 *  decides what to do with the returned script. */
export async function buildScriptFromImportText(text, name) {
    const { els } = appState;
    const parsed = parseImportText(text);
    if (parsed.error) return { ok: false, errors: [parsed.error] };

    const names = await applyImportAliasesToNames(parsed.names);
    await ensureSavedLayoutsLoaded();

    const allClubs = appState.teamsIndex?.clubs || [];
    const allNats = appState.teamsIndex?.nationalities || [];
    const allEntries = [...allClubs, ...allNats];

    const errors = [];
    const searchableNames = new Set();
    const resolved = [];

    for (const rawName of names) {
        const normTeam = resolveTeamAlias(normalizeForImport(rawName));
        let entry = allEntries.find((t) => normalizeForImport(t.name) === normTeam);
        if (!entry) {
            entry = allEntries.find(
                (t) =>
                    normalizeForImport(t.name).includes(normTeam) ||
                    normTeam.includes(normalizeForImport(t.name)),
            );
        }
        if (!entry) {
            errors.push(`❌ ${rawName}: team not found.`);
            searchableNames.add(rawName);
            continue;
        }
        if (!hasSavedLayoutForEntry(entry)) {
            errors.push(`❌ ${rawName} dont have a save team.`);
            searchableNames.add(rawName);
            continue;
        }
        const isNational = allNats.some((t) => t.path === entry.path);
        resolved.push({ rawName, entry, isNational });
    }

    if (errors.length > 0) return { ok: false, errors, searchableNames };

    const levelDatas = [];
    for (const { rawName, entry, isNational } of resolved) {
        let squad;
        try {
            squad = await loadSquadJson(entry);
        } catch {
            errors.push(`❌ ${rawName}: failed to load squad data.`);
            continue;
        }
        const layout = await buildImportLevelDataFromSavedLayout(entry, squad);
        if (!layout) {
            errors.push(`❌ ${rawName} dont have a save team.`);
            searchableNames.add(rawName);
            continue;
        }
        levelDatas.push(makeEmptyImportLevel({
            squadType: layout.squadType ?? (isNational ? "national" : "club"),
            selectedEntry: entry,
            currentSquad: squad,
            formationId: layout.formationId,
            lastFormationId: layout.lastFormationId,
            displayMode: layout.displayMode ?? (isNational ? "country" : "club"),
            searchText: squad.name || entry.name,
            customXi: layout.customXi,
            customNames: layout.customNames || {},
            landingPageType: isNational ? "nationality" : "club",
            headerLogoScale: layout.headerLogoScale ?? 1,
            headerLogoNudgeX: layout.headerLogoNudgeX ?? 0,
            headerLogoOverrideRelPath: layout.headerLogoOverrideRelPath ?? null,
            slotClubCrestOverrideRelPathBySlot: layout.slotClubCrestOverrideRelPathBySlot || {},
            slotFlagScales: Array.isArray(layout.slotFlagScales)
                ? [...layout.slotFlagScales]
                : Array(11).fill(DEFAULT_SLOT_FLAG_SCALE),
            slotTeamLogoScales: Array.isArray(layout.slotTeamLogoScales)
                ? [...layout.slotTeamLogoScales]
                : Array(11).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE),
            slotPhotoIndexEntries: Array.isArray(layout.slotPhotoIndexEntries)
                ? layout.slotPhotoIndexEntries
                : [],
        }));
    }

    if (errors.length > 0) return { ok: false, errors, searchableNames };

    const n = levelDatas.length;
    if (levelDatas.length > 0) levelDatas[levelDatas.length - 1].isBonus = true;
    const allLevels = [
        makeEmptyImportLevel({ isLogo: true }),
        ...levelDatas,
        makeEmptyImportLevel({ isOutro: true }),
    ];

    const script = {
        name,
        folder: null,
        landing: {
            gameMode: "lineup",
            quizType: els.inQuizType?.value || "club-by-nat",
            endingType: els.inEndingType?.value || "think-you-know",
            easy: 10,
            medium: 5,
            hard: 3,
            impossible: 1,
        },
        lineup: {
            videoMode: false,
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
// Import helpers
// ---------------------------------------------------------------------------

/** Turkish letters that do not fold cleanly with NFD + strip marks (e.g. ı vs i). */
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
            str.trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/\p{M}/gu, "")
                .replace(/ø/g, "o")
                .replace(/å/g, "a")
                .replace(/æ/g, "ae")
                .replace(/ð/g, "d")
                .replace(/þ/g, "th")
                .replace(/ß/g, "ss")
                .replace(/ł/g, "l").replace(/Ł/g, "l")
                .replace(/đ/g, "d").replace(/Đ/g, "d")
                .replace(/\//g, " ")
                .replace(/-/g, " ")
                .replace(/[''`´']/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, " ")
                .trim(),
        );
    } catch {
        return foldTurkishLatinForImport(
            str.trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/ø/g, "o")
                .replace(/å/g, "a")
                .replace(/æ/g, "ae")
                .replace(/ð/g, "d")
                .replace(/þ/g, "th")
                .replace(/ß/g, "ss")
                .replace(/ł/g, "l").replace(/Ł/g, "l")
                .replace(/đ/g, "d").replace(/Đ/g, "d")
                .replace(/\//g, " ")
                .replace(/-/g, " ")
                .replace(/[''`´']/g, "")
                .replace(/\./g, "")
                .replace(/\s+/g, " ")
                .trim(),
        );
    }
}

/** Common alternate team names → normalized database name.
 *  Keys/values are already normalizeForImport()-folded (lowercase, no diacritics,
 *  hyphen→space). Covers the channel's club list so pasted names resolve EXACTLY
 *  instead of relying on the fragile substring fallback. */
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

function resolveTeamAlias(normName) {
    return IMPORT_TEAM_ALIASES[normName] ?? normName;
}

/**
 * Parse "[Team1, Team2, Team3]" (or "Team1,Team2,Team3") into an ordered list
 * of trimmed team names.
 */
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
    let s = String(text || "").trim();
    if (!s) return { error: "Paste the import text first." };
    if (s.startsWith("[")) s = s.slice(1);
    if (s.endsWith("]")) s = s.slice(0, -1);
    const names = s.split(",").map(n => n.trim()).filter(Boolean);
    if (names.length === 0) {
        return { error: "No teams found. Use format: [Team1, Team2, Team3]" };
    }
    return { names };
}

function makeEmptyImportLevel(overrides = {}) {
    return {
        isLogo: false,
        isIntro: false,
        isBonus: false,
        isOutro: false,
        gameMode: "lineup",
        squadType: "club",
        selectedEntry: null,
        currentSquad: null,
        slotPhotoIndexEntries: [],
        formationId: "433",
        lastFormationId: null,
        displayMode: "club",
        searchText: "",
        customXi: null,
        customNames: {},
        videoMode: false,
        landingPageType: "club",
        careerClubsCount: 5,
        careerSilhouetteIndex: 0,
        silhouetteYOffset: 0,
        silhouetteScaleX: 1,
        silhouetteScaleY: 1,
        headerLogoScale: 1,
        headerLogoNudgeX: 0,
        headerLogoOverrideRelPath: null,
        slotClubCrestOverrideRelPathBySlot: {},
        slotFlagScales: Array(11).fill(DEFAULT_SLOT_FLAG_SCALE),
        slotTeamLogoScales: Array(11).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE),
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

                await ensureSavedLayoutsLoaded();

                const allClubs = appState.teamsIndex?.clubs || [];
                const allNats = appState.teamsIndex?.nationalities || [];
                const allEntries = [...allClubs, ...allNats];

                const errors = [];
                const searchableNames = new Set();
                const resolved = [];

                for (const rawName of names) {
                    const normTeam = resolveTeamAlias(normalizeForImport(rawName));
                    let entry = allEntries.find(t => normalizeForImport(t.name) === normTeam);
                    if (!entry) {
                        entry = allEntries.find(t => normalizeForImport(t.name).includes(normTeam) || normTeam.includes(normalizeForImport(t.name)));
                    }
                    if (!entry) {
                        errors.push(`\u274C ${rawName}: team not found.`);
                        searchableNames.add(rawName);
                        continue;
                    }
                    if (!hasSavedLayoutForEntry(entry)) {
                        errors.push(`\u274C ${rawName} dont have a save team.`);
                        searchableNames.add(rawName);
                        continue;
                    }
                    const isNational = allNats.some(t => t.path === entry.path);
                    resolved.push({ rawName, entry, isNational });
                }

                if (errors.length > 0) {
                    renderImportErrors({
                        container: els.importScriptError,
                        errors,
                        searchableNames,
                        items: allClubs.filter((e) => hasSavedLayoutForEntry(e)),
                        displayFn: (t) => t && t.country ? `${t.name} - ${t.country}` : (t && t.name) || "?",
                        modalTitle: "Search a team",
                        textInput: els.importScriptText,
                        confirmBtn: els.importScriptConfirm,
                    });
                    return;
                }

                const levelDatas = [];
                for (const { rawName, entry, isNational } of resolved) {
                    let squad;
                    try {
                        squad = await loadSquadJson(entry);
                    } catch {
                        errors.push(`\u274C ${rawName}: failed to load squad data.`);
                        continue;
                    }
                    const layout = await buildImportLevelDataFromSavedLayout(entry, squad);
                    if (!layout) {
                        errors.push(`\u274C ${rawName} dont have a save team.`);
                        searchableNames.add(rawName);
                        continue;
                    }
                    levelDatas.push(makeEmptyImportLevel({
                        squadType: layout.squadType ?? (isNational ? "national" : "club"),
                        selectedEntry: entry,
                        currentSquad: squad,
                        formationId: layout.formationId,
                        lastFormationId: layout.lastFormationId,
                        displayMode: layout.displayMode ?? (isNational ? "country" : "club"),
                        searchText: squad.name || entry.name,
                        customXi: layout.customXi,
                        customNames: layout.customNames || {},
                        landingPageType: isNational ? "nationality" : "club",
                        headerLogoScale: layout.headerLogoScale ?? 1,
                        headerLogoNudgeX: layout.headerLogoNudgeX ?? 0,
                        headerLogoOverrideRelPath: layout.headerLogoOverrideRelPath ?? null,
                        slotClubCrestOverrideRelPathBySlot: layout.slotClubCrestOverrideRelPathBySlot || {},
                        slotFlagScales: Array.isArray(layout.slotFlagScales)
                            ? [...layout.slotFlagScales]
                            : Array(11).fill(DEFAULT_SLOT_FLAG_SCALE),
                        slotTeamLogoScales: Array.isArray(layout.slotTeamLogoScales)
                            ? [...layout.slotTeamLogoScales]
                            : Array(11).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE),
                        slotPhotoIndexEntries: Array.isArray(layout.slotPhotoIndexEntries)
                            ? layout.slotPhotoIndexEntries
                            : [],
                    }));
                }

                if (errors.length > 0) {
                    renderImportErrors({
                        container: els.importScriptError,
                        errors,
                        searchableNames,
                        items: allClubs.filter((e) => hasSavedLayoutForEntry(e)),
                        displayFn: (t) => t && t.country ? `${t.name} - ${t.country}` : (t && t.name) || "?",
                        modalTitle: "Search a team",
                        textInput: els.importScriptText,
                        confirmBtn: els.importScriptConfirm,
                    });
                    return;
                }

                const n = levelDatas.length;
                // Fold last imported entry into the bonus slot so we don't append an empty bonus.
                if (levelDatas.length > 0) levelDatas[levelDatas.length - 1].isBonus = true;
                const allLevels = [
                    makeEmptyImportLevel({ isLogo: true }),
                    ...levelDatas,
                    makeEmptyImportLevel({ isOutro: true }),
                ];

                const newScript = {
                    name,
                    folder: null,
                    landing: {
                        gameMode: "lineup",
                        quizType: els.inQuizType?.value || "club-by-nat",
                        endingType: els.inEndingType?.value || "think-you-know",
                        easy: 10,
                        medium: 5,
                        hard: 3,
                        impossible: 1,
                    },
                    lineup: {
                        videoMode: false,
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

    const gameMode = (script.landing && script.landing.gameMode) ? script.landing.gameMode : "lineup";
    /* This runner only supports `club-by-nat`. Saved scripts copied from sibling
       runner 2 (Lineups Shorts, `nat-by-club`) would otherwise set an unknown
       value on the select, which becomes empty string, which then breaks every
       `|| "<default>"` fallback that reads it. */
    const rawQuizType = (script.landing && script.landing.quizType) ? script.landing.quizType : "club-by-nat";

    if(uiCallbacks.populateSubTypes) uiCallbacks.populateSubTypes();

    els.inQuizType.value = rawQuizType;
    /* If the loaded script's quizType didn't match any option in the select
       (e.g. a cross-runner saved script), the assignment silently sets value
       to "". Force it back to this runner's only valid key. */
    if (!els.inQuizType.value) els.inQuizType.value = "club-by-nat";
    const quizType = els.inQuizType.value;
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

    applyTransitionSettings(script.transitions || null);

    const migratedLevels = migrateShortsLevelsRemoveLegacyLanding(script.levels);
    appState.totalLevelsCount = migratedLevels.length - 1;
    appState.levelsData = migratedLevels.map((lvl) => {
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

    if (els.quizLevelsInput) {
        const fromLevels = migratedLevels.filter((l) => l && !l.isLogo && !l.isIntro && !l.isOutro).length;
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
    appState.currentLevelIndex = 0;
    switchLevel(1);
}