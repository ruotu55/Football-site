// Per-team saved lineup (video mode off): localStorage + optional dev-server JSON blob sync.
import {
    appState,
    clearSlotPhotoIndices,
    DEFAULT_SLOT_FLAG_SCALE,
    DEFAULT_SLOT_TEAM_LOGO_SCALE,
    ensureSlotFrontFaceScales,
    getState,
} from "./state.js";
import { applyCustomSelects } from "./custom-selects.js";
import { formationById } from "./formations.js";
import { ensureInternationalClubPoolLoaded } from "./pitch-render.js";
import { getInternationalClubPlayersForNation } from "./nationality-pool-key.js";
import { pickStartingXI } from "./pick-xi.js";

/** Shared across Main Runner - Lineups Shorts and Regular (same team paths = same saves). */
const STORAGE_BUCKET = "lineups_runner_team_layouts_shared";
const LS_KEY = "footballLineupsSavedTeamLayouts_v1_runner_shared";

const LEGACY_LS_KEYS = [
    "footballLineupsSavedTeamLayouts_v1_lineups_shorts",
    "footballLineupsSavedTeamLayouts_v1_lineups_regular",
];

const LEGACY_STORAGE_BUCKETS = ["lineups_shorts_team_layouts", "lineups_regular_team_layouts"];

/** @type {Record<string, object>} */
let layoutsByPath = {};
let pushTimer = null;

function isNonEmptyLayoutsMap(obj) {
    return !!(obj && typeof obj === "object" && !Array.isArray(obj) && Object.keys(obj).length > 0);
}

/** Merge older per-runner saves once so nothing is lost (later keys win on duplicate paths). */
function migrateLayoutsFromLegacyLocalStorage() {
    let merged = {};
    for (const key of LEGACY_LS_KEYS) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (isNonEmptyLayoutsMap(parsed)) {
                merged = { ...merged, ...parsed };
            }
        } catch {
            /* ignore */
        }
    }
    if (isNonEmptyLayoutsMap(merged)) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(merged));
        } catch {
            /* quota or private mode */
        }
    }
    return merged;
}

function loadLayoutsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (isNonEmptyLayoutsMap(parsed)) {
            return { ...parsed };
        }
    } catch {
        /* fall through */
    }
    const fromLegacy = migrateLayoutsFromLegacyLocalStorage();
    return isNonEmptyLayoutsMap(fromLegacy) ? { ...fromLegacy } : {};
}

function persist() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(layoutsByPath));
    } catch (_) {
        /* quota or private mode */
    }
    syncToServer();
}

function syncToServer() {
    const active =
        typeof location !== "undefined" &&
        location.protocol === "http:" &&
        location.hostname !== "";
    if (!active) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        fetch(`/__runner-json-blob/${encodeURIComponent(STORAGE_BUCKET)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(layoutsByPath),
        }).catch(() => {});
    }, 300);
}

function startPull() {
    const active =
        typeof location !== "undefined" &&
        location.protocol === "http:" &&
        location.hostname !== "";
    if (!active) return;
    (async () => {
        try {
            let data = null;
            const r = await fetch(`/__runner-json-blob/${encodeURIComponent(STORAGE_BUCKET)}`);
            if (r.ok) {
                const j = await r.json();
                if (isNonEmptyLayoutsMap(j)) {
                    data = j;
                }
            }
            if (!isNonEmptyLayoutsMap(data)) {
                const merged = {};
                for (const bucket of LEGACY_STORAGE_BUCKETS) {
                    try {
                        const lr = await fetch(`/__runner-json-blob/${encodeURIComponent(bucket)}`);
                        if (!lr.ok) continue;
                        const lj = await lr.json();
                        if (isNonEmptyLayoutsMap(lj)) {
                            Object.assign(merged, lj);
                        }
                    } catch {
                        /* ignore */
                    }
                }
                if (isNonEmptyLayoutsMap(merged)) {
                    data = merged;
                    await fetch(`/__runner-json-blob/${encodeURIComponent(STORAGE_BUCKET)}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(merged),
                    }).catch(() => {});
                }
            }
            if (isNonEmptyLayoutsMap(data)) {
                layoutsByPath = { ...data };
                try {
                    localStorage.setItem(LS_KEY, JSON.stringify(layoutsByPath));
                } catch (_) {
                    /* ignore */
                }
                refreshSaveTeamButtonUi();
                return;
            }
            let local = {};
            try {
                local = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
            } catch (_) {
                local = {};
            }
            if (local && typeof local === "object" && Object.keys(local).length > 0) {
                await fetch(`/__runner-json-blob/${encodeURIComponent(STORAGE_BUCKET)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(local),
                }).catch(() => {});
            }
        } catch (_) {
            /* file:// or offline */
        }
    })();
}

function serializeTeamLayoutSnapshot(state) {
    ensureSlotFrontFaceScales(state);
    return {
        squadType: state.squadType,
        formationId: state.formationId,
        lastFormationId: state.lastFormationId,
        displayMode: state.displayMode,
        customXi: state.customXi,
        customNames:
            state.customNames && typeof state.customNames === "object" ? { ...state.customNames } : {},
        headerLogoScale: state.headerLogoScale ?? 1,
        headerLogoNudgeX: state.headerLogoNudgeX ?? 0,
        headerLogoOverrideRelPath: state.headerLogoOverrideRelPath ?? null,
        slotClubCrestOverrideRelPathBySlot:
            state.slotClubCrestOverrideRelPathBySlot &&
            typeof state.slotClubCrestOverrideRelPathBySlot === "object"
                ? { ...state.slotClubCrestOverrideRelPathBySlot }
                : {},
        slotFlagScales: Array.isArray(state.slotFlagScales)
            ? [...state.slotFlagScales]
            : Array(11).fill(DEFAULT_SLOT_FLAG_SCALE),
        slotTeamLogoScales: Array.isArray(state.slotTeamLogoScales)
            ? [...state.slotTeamLogoScales]
            : Array(11).fill(DEFAULT_SLOT_TEAM_LOGO_SCALE),
        slotPhotoIndexEntries: Array.from(state.slotPhotoIndexBySlot.entries()),
    };
}

function flattenSquadPlayers(squad) {
    if (!squad) return [];
    return [
        ...(squad.goalkeepers || []),
        ...(squad.defenders || []),
        ...(squad.midfielders || []),
        ...(squad.attackers || []),
    ];
}

function playerNameKeyExact(name) {
    return String(name || "")
        .trim()
        .toLowerCase();
}

/** ASCII-ish fold for when squad JSON spelling differs slightly from saved snapshot (diacritics, etc.). */
function playerNameKeyFolded(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    try {
        return raw
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase();
    } catch {
        return raw
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }
}

/** Extra normalization for initials, apostrophes, and punctuation mismatches between save and squad JSON. */
function normalizeNameForLooseMatch(name) {
    return playerNameKeyFolded(name)
        .replace(/[''`´]/g, "")
        .replace(/\./g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Disambiguate same display name (e.g. two "Danilo") and track assigned players during rehydrate/repair. */
function playerIdentityKey(p) {
    if (!p?.name) return "";
    const n = playerNameKeyExact(p.name);
    const c = normalizeNameForLooseMatch(String(p.club || ""));
    return c ? `${n}\x1e${c}` : n;
}

/** National XIs: swap pool pulls club-based players not listed in the nationality JSON — merge for save/load. */
function buildRehydrationPlayerPool(state, squad) {
    const base = flattenSquadPlayers(squad);
    if (state.squadType !== "national") {
        return base;
    }
    const nation = String(squad?.name || "").trim();
    const extra = getInternationalClubPlayersForNation(appState.internationalClubPool, nation);
    if (!extra.length) {
        return base;
    }
    const seen = new Set(base.map((p) => playerIdentityKey(p)));
    const out = [...base];
    for (const p of extra) {
        if (!p?.name) continue;
        const k = playerIdentityKey(p);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(p);
        }
    }
    return out;
}

function nameMatchesSavedStrict(savedName, playerName) {
    if (!savedName || !playerName) return false;
    return (
        playerNameKeyExact(playerName) === playerNameKeyExact(savedName) ||
        playerNameKeyFolded(playerName) === playerNameKeyFolded(savedName) ||
        normalizeNameForLooseMatch(playerName) === normalizeNameForLooseMatch(savedName)
    );
}

function uniqPlayersByIdentity(players) {
    const seen = new Set();
    const out = [];
    for (const p of players) {
        if (!p?.name) continue;
        const k = playerIdentityKey(p);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(p);
    }
    return out;
}

/** When strict name tokens fail (e.g. saved "Militão" vs JSON "Éder Militão"). */
function candidatesByFuzzySavedName(savedName, available) {
    const ls = normalizeNameForLooseMatch(savedName);
    if (!ls) return [];
    const looseTokens = ls.split(" ").filter((t) => t.length > 1);
    const lastTok = looseTokens.length ? looseTokens[looseTokens.length - 1] : "";
    const acc = [];
    if (lastTok && lastTok.length >= 4) {
        for (const p of available) {
            const ptoks = normalizeNameForLooseMatch(p.name).split(" ").filter((t) => t.length > 1);
            if (ptoks.length && ptoks[ptoks.length - 1] === lastTok) {
                acc.push(p);
            }
        }
    }
    if (acc.length === 0 && ls.length >= 6) {
        for (const p of available) {
            const pn = normalizeNameForLooseMatch(p.name);
            if (pn.includes(ls) || ls.includes(pn)) {
                acc.push(p);
            }
        }
    }
    return uniqPlayersByIdentity(acc);
}

/**
 * Map one saved slot (name + club + position from snapshot) to a live pool player.
 * `used` is identity keys already placed in other slots.
 */
function findPoolPlayerForSavedSlot(savedPlain, pool, used) {
    if (!savedPlain?.name) return null;
    const savedName = savedPlain.name;
    const available = pool.filter((p) => p?.name && !used.has(playerIdentityKey(p)));
    if (available.length === 0) return null;

    let cands = available.filter((p) => nameMatchesSavedStrict(savedName, p.name));
    if (cands.length === 0) {
        cands = candidatesByFuzzySavedName(savedName, available);
    }
    cands = uniqPlayersByIdentity(cands);
    if (cands.length === 1) return cands[0];

    const savedClub = normalizeNameForLooseMatch(String(savedPlain.club || ""));
    if (savedClub && cands.length > 1) {
        const byClub = cands.filter((p) => {
            const pc = normalizeNameForLooseMatch(String(p.club || ""));
            if (!pc) return false;
            return pc === savedClub || pc.includes(savedClub) || savedClub.includes(pc);
        });
        if (byClub.length === 1) return byClub[0];
        if (byClub.length > 1) cands = byClub;
    }

    const savedPos = String(savedPlain.position || "").trim();
    if (savedPos && cands.length > 1) {
        const byPos = cands.filter((p) => String(p.position || "").trim() === savedPos);
        if (byPos.length === 1) return byPos[0];
    }

    if (cands.length === 1) return cands[0];
    return null;
}

function rehydrateCustomXiFromPool(state, pool) {
    if (!state.customXi || !Array.isArray(state.customXi)) return;
    const used = new Set();
    state.customXi = state.customXi.map((slot) => {
        if (!slot?.name) return null;
        const p = findPoolPlayerForSavedSlot(slot, pool, used);
        if (p) used.add(playerIdentityKey(p));
        return p;
    });
}

/** Same person in two slots (duplicate refs) — keep first so repair can use per-slot saved rows. */
function dedupeCustomXiByPlayerIdentity(state) {
    if (!state.customXi || !Array.isArray(state.customXi)) return;
    const seen = new Set();
    state.customXi = state.customXi.map((p) => {
        if (!p?.name) return null;
        const k = playerIdentityKey(p);
        if (!k || seen.has(k)) return null;
        seen.add(k);
        return p;
    });
}

/** Fill holes using each slot's saved row from `snap`, then default XI. */
function repairCustomXiMissingPlayers(state, snap, pool) {
    if (!state.currentSquad || !state.customXi || !Array.isArray(state.customXi)) return;
    const formation = formationById(state.formationId);
    if (!formation || state.customXi.length !== formation.slots.length) return;

    const defaultXi = pickStartingXI(formation, state.currentSquad);
    const savedXi = Array.isArray(snap?.customXi) ? snap.customXi : [];

    const used = new Set(
        state.customXi.filter(Boolean).map((p) => playerIdentityKey(p)).filter(Boolean)
    );

    for (let i = 0; i < state.customXi.length; i++) {
        if (state.customXi[i]) continue;
        const savedRow = savedXi[i];
        const fromSaved = findPoolPlayerForSavedSlot(savedRow, pool, used);
        if (fromSaved) {
            state.customXi[i] = fromSaved;
            used.add(playerIdentityKey(fromSaved));
            continue;
        }

        let filled = false;
        const pref = defaultXi[i];
        if (pref) {
            const k = playerIdentityKey(pref);
            if (k && !used.has(k)) {
                state.customXi[i] = pref;
                used.add(k);
                filled = true;
            }
        }
        if (filled) continue;
        for (const cand of defaultXi) {
            if (!cand) continue;
            const k = playerIdentityKey(cand);
            if (k && !used.has(k)) {
                state.customXi[i] = cand;
                used.add(k);
                break;
            }
        }
    }
}

function applyTeamLayoutSnapshot(state, snap) {
    state.squadType = snap.squadType;
    state.formationId = snap.formationId;
    state.lastFormationId = snap.lastFormationId;
    state.displayMode = snap.displayMode;
    state.customXi = snap.customXi;
    state.customNames = snap.customNames && typeof snap.customNames === "object" ? { ...snap.customNames } : {};
    state.headerLogoScale = snap.headerLogoScale ?? 1;
    state.headerLogoNudgeX = snap.headerLogoNudgeX ?? 0;
    state.headerLogoOverrideRelPath = snap.headerLogoOverrideRelPath ?? null;
    state.slotClubCrestOverrideRelPathBySlot =
        snap.slotClubCrestOverrideRelPathBySlot && typeof snap.slotClubCrestOverrideRelPathBySlot === "object"
            ? { ...snap.slotClubCrestOverrideRelPathBySlot }
            : {};
    if (Array.isArray(snap.slotFlagScales)) {
        state.slotFlagScales = [...snap.slotFlagScales];
    }
    if (Array.isArray(snap.slotTeamLogoScales)) {
        state.slotTeamLogoScales = [...snap.slotTeamLogoScales];
    }
    state.slotPhotoIndexBySlot = new Map(snap.slotPhotoIndexEntries || []);
    ensureSlotFrontFaceScales(state);
}

function syncSetupControlsFromState(state) {
    const { els } = appState;
    if (els.squadType) els.squadType.value = state.squadType;
    if (els.formation) els.formation.value = state.formationId;
    if (els.displayMode) els.displayMode.value = state.displayMode;
    applyCustomSelects();
}

/**
 * After squad JSON is loaded: restore saved layout for this team path, or reset to defaults.
 */
export async function applySavedTeamLayoutAfterLoad(state, teamEntry) {
    const path = teamEntry && teamEntry.path;
    const snap = path && layoutsByPath[path];
    if (!snap) {
        state.customXi = null;
        state.customNames = {};
        state.headerLogoOverrideRelPath = null;
        state.slotClubCrestOverrideRelPathBySlot = {};
        clearSlotPhotoIndices();
        state.formationId = "433";
        state.lastFormationId = null;
        const { els } = appState;
        if (els.formation) els.formation.value = "433";
        applyCustomSelects();
        return;
    }
    if (state.squadType === "national") {
        await ensureInternationalClubPoolLoaded();
    }
    applyTeamLayoutSnapshot(state, snap);
    if (state.currentSquad) {
        const pool = buildRehydrationPlayerPool(state, state.currentSquad);
        rehydrateCustomXiFromPool(state, pool);
        dedupeCustomXiByPlayerIdentity(state);
        repairCustomXiMissingPlayers(state, snap, pool);
    }
    syncSetupControlsFromState(state);
}

function applySaveTeamButtonState(el, vm, hasTeam, saved) {
    if (!el) return;
    el.hidden = vm || !hasTeam;
    el.disabled = !hasTeam || vm;
    el.classList.toggle("btn-save-current-team--saved", saved);
    el.setAttribute("aria-pressed", saved ? "true" : "false");
}

function saveTeamToggleTargets() {
    const e = appState.els;
    return [
        e.btnSaveCurrentTeam,
        e.btnSaveCurrentTeamFab,
        e.btnSaveCurrentTeamLanding,
    ].filter(Boolean);
}

export function refreshSaveTeamButtonUi() {
    const targets = saveTeamToggleTargets();
    if (targets.length === 0) return;
    const state = getState();
    if (!state) {
        targets.forEach((el) => {
            el.hidden = true;
        });
        return;
    }
    const vm = !!state.videoMode;
    const hasTeam = !!(state.selectedEntry && state.selectedEntry.path && state.currentSquad);
    const path = state.selectedEntry && state.selectedEntry.path;
    const saved = !!(path && layoutsByPath[path]);
    targets.forEach((el) => applySaveTeamButtonState(el, vm, hasTeam, saved));
}

function wireSaveTeamToggleClick() {
    const handler = () => {
        const state = getState();
        if (!state || state.videoMode) return;
        const path = state.selectedEntry && state.selectedEntry.path;
        if (!path) return;
        if (layoutsByPath[path]) {
            delete layoutsByPath[path];
        } else {
            layoutsByPath[path] = serializeTeamLayoutSnapshot(state);
        }
        persist();
        refreshSaveTeamButtonUi();
    };
    saveTeamToggleTargets().forEach((el) => {
        el.onclick = handler;
    });
}

export function initSavedTeamLayouts() {
    layoutsByPath = loadLayoutsFromLocalStorage();
    if (!layoutsByPath || typeof layoutsByPath !== "object" || Array.isArray(layoutsByPath)) {
        layoutsByPath = {};
    }

    wireSaveTeamToggleClick();

    startPull();
    refreshSaveTeamButtonUi();
}
