/* PREP PANEL "Saved" tab — lists EXACTLY the saves the Remotion project
 * renders: blocks in the shared /__recording-status store whose key starts
 * "1|" and whose name is non-empty (the same filter as
 * ___Remotion___/1_…_Remotion/scripts/build-data.mjs).
 *
 * Loading honors a frozen Save Video Status snapshot first, otherwise the
 * lineup is rebuilt from the block's teamsImportText + Save Team layouts —
 * identical to the old recording-queue flow. "💾 Save to save" writes the
 * current panel state back into block.script, which IS what Remotion
 * build-data reads, so panel edits reach the rendered video.
 */
import { appState } from "./state.js";
import {
    applyScriptObject,
    setActiveScriptName,
    getActiveScriptName,
    buildScriptFromImportText,
    captureCurrentScriptObject,
} from "./saved-scripts.js?v=20260612-prep";
import { renderPrepPanel } from "./prep-panel.js";

const RUNNER_ID = 1;
const KEY_PREFIX = `${RUNNER_ID}|`;
const ENDPOINT = "/__recording-status";

let blocks = Object.create(null);
let listEl = null;
let activeBlockKey = null;

export function getActiveBlockKey() {
    return activeBlockKey;
}

// ---------------------------------------------------------------------------
// Persistence — read/write the shared recording-status store
// ---------------------------------------------------------------------------

async function fetchBlocks() {
    try {
        const r = await fetch(ENDPOINT, { cache: "no-store" });
        if (!r.ok) return Object.create(null);
        const data = await r.json();
        return (data && typeof data.blocks === "object" && data.blocks) || Object.create(null);
    } catch (_) {
        return Object.create(null);
    }
}

async function postReplace(allBlocks) {
    const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "replace", payload: { blocks: allBlocks } }),
    });
    if (!r.ok) throw new Error("Server rejected the save (HTTP " + r.status + ")");
}

// ---------------------------------------------------------------------------
// Block script resolution — same flow the recording queue used
// ---------------------------------------------------------------------------

/** Pull team names from a legacy block that only stored a full script object. */
function extractTeamsImportTextFromScript(script) {
    if (!script || !Array.isArray(script.levels)) return "";
    const names = [];
    for (const lvl of script.levels) {
        if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro) continue;
        const name = String(lvl.searchText || lvl.currentSquad?.name || lvl.selectedEntry?.name || "").trim();
        if (name) names.push(name);
    }
    return names.length ? `[${names.join(", ")}]` : "";
}

/** Teams list for a block: stored paste text, or derived once from a legacy script. */
function blockTeamsImportText(block) {
    if (!block) return "";
    const stored = String(block.teamsImportText || "").trim();
    if (stored) return stored;
    return extractTeamsImportTextFromScript(block.script);
}

/** Build a live script from the block's team list + current Save Team layouts. */
async function resolveScriptForBlock(block) {
    const importText = blockTeamsImportText(block);
    const blockName = String(block?.name || "").trim();
    let script;
    if (importText) {
        const result = await buildScriptFromImportText(importText, blockName || "Recording block");
        if (!result.ok) {
            const msg = Array.isArray(result.errors) ? result.errors.join("\n") : "Import failed.";
            throw new Error(msg);
        }
        script = result.script;
    } else if (block?.script && typeof block.script === "object" && Array.isArray(block.script.levels)) {
        script = block.script;
    } else {
        throw new Error("This block has no teams list. Open it and paste a teams list.");
    }
    // Inject any voiceFreeze data the block previously baked in (stashed INSIDE
    // block.script because top-level block fields are server-whitelisted).
    const stashed = block?.script;
    if (stashed && typeof stashed === "object") {
        if (stashed.voiceFreeze) script.voiceFreeze = stashed.voiceFreeze;
        if (Array.isArray(stashed.bgmSongs)) script.bgmSongs = stashed.bgmSongs;
        if (Array.isArray(stashed.levels)) {
            stashed.levels.forEach((stashedLvl, i) => {
                if (stashedLvl && stashedLvl.voiceFreeze && script.levels[i]) {
                    script.levels[i].voiceFreeze = stashedLvl.voiceFreeze;
                }
            });
        }
    }
    return script;
}

/** Mirror freshly-rolled voiceFreeze data back into block.script so it persists. */
async function mirrorVoiceFreezeIntoBlock(block, script, key) {
    const stash = (block.script && typeof block.script === "object") ? block.script : {};
    let stashChanged = false;
    const newTopFreeze = script && script.voiceFreeze;
    if (newTopFreeze && JSON.stringify(stash.voiceFreeze) !== JSON.stringify(newTopFreeze)) {
        stash.voiceFreeze = newTopFreeze;
        stashChanged = true;
    }
    if (Array.isArray(script?.levels)) {
        if (!Array.isArray(stash.levels)) {
            stash.levels = [];
            stashChanged = true;
        }
        script.levels.forEach((lvl, i) => {
            const lvlFreeze = lvl && lvl.voiceFreeze;
            if (!lvlFreeze) return;
            if (!stash.levels[i] || typeof stash.levels[i] !== "object") {
                stash.levels[i] = { voiceFreeze: lvlFreeze };
                stashChanged = true;
                return;
            }
            if (JSON.stringify(stash.levels[i].voiceFreeze) !== JSON.stringify(lvlFreeze)) {
                stash.levels[i].voiceFreeze = lvlFreeze;
                stashChanged = true;
            }
        });
    }
    if (stashChanged) {
        block.script = stash;
        blocks[key] = block;
        await postReplace(blocks);
    }
}

// ---------------------------------------------------------------------------
// AUTO-SAVE — every change is written to block.script (what Remotion reads).
// No manual button: a debounced save fires whenever the prep panel signals a
// change (the "prep:dirty" event) and once right after a save loads.
// ---------------------------------------------------------------------------

let autoSaveTimer = null;
let autoSaveInFlight = false;
let autoSaveQueued = false;

async function writeActiveBlockScript() {
    if (!activeBlockKey || !blocks[activeBlockKey]) return;
    const block = blocks[activeBlockKey];
    const script = captureCurrentScriptObject(block.name || getActiveScriptName() || "Recording");
    if (!script || !Array.isArray(script.levels) || !script.levels.length) return;
    block.script = script;
    blocks[activeBlockKey] = block;
    if (autoSaveInFlight) { autoSaveQueued = true; return; } // coalesce overlapping writes
    autoSaveInFlight = true;
    try {
        await postReplace(blocks);
    } catch (e) {
        console.warn("[save-picker] auto-save failed:", e);
    } finally {
        autoSaveInFlight = false;
        if (autoSaveQueued) { autoSaveQueued = false; void writeActiveBlockScript(); }
    }
}

function scheduleAutoSave() {
    if (!activeBlockKey) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { void writeActiveBlockScript(); }, 700);
}

// ---------------------------------------------------------------------------
// Row click — load the save into the prep panel
// ---------------------------------------------------------------------------

async function onRowClick(key) {
    const block = blocks[key];
    if (!block) return;
    activeBlockKey = key;
    appState.activeBlockKey = key;
    setActiveScriptName(block.name);
    try {
        const script = await resolveScriptForBlock(block);
        await applyScriptObject(script);
        await mirrorVoiceFreezeIntoBlock(block, script, key);
        // Render the prep panel HERE — after applyScriptObject FULLY completes —
        // instead of relying only on the "recording-queue:script-applied" event
        // it fires mid-function (later lines keep mutating state). Fixes "the
        // level doesn't appear until I refresh." A second pass next frame catches
        // any async layout/image settling.
        try { renderPrepPanel(); } catch (e) { console.warn("[save-picker] render failed:", e); }
        requestAnimationFrame(() => { try { renderPrepPanel(); } catch {} });
        // "Take what I have now": persist the freshly-loaded/rebuilt state into
        // block.script so Remotion sees it even before the first edit.
        scheduleAutoSave();
    } catch (err) {
        console.error("[save-picker] load failed:", err);
        alert(err?.message || "Could not load this save.");
    }
    render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function listedSaves() {
    const items = [];
    for (const key of Object.keys(blocks)) {
        if (!key.startsWith(KEY_PREFIX)) continue;
        const block = blocks[key];
        const name = String(block?.name || "").trim();
        if (!name) continue; // build-data skips nameless blocks — so do we
        const parts = key.split("|");
        items.push({ key, name, episode: Number(parts[2]) || 0, block });
    }
    items.sort((a, b) => a.episode - b.episode); // ascending: "… 1" at top, "… 10" at bottom
    return items;
}

function questionLevelCount(block) {
    const levels = block?.script?.levels;
    if (!Array.isArray(levels)) return null;
    return levels.filter((l) => l && !l.isLogo && !l.isIntro && !l.isOutro).length;
}

function render() {
    if (!listEl) return;
    listEl.innerHTML = "";

    const items = listedSaves();
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "rq-empty";
        empty.textContent = "No named runner-1 saves in recording-status.json yet.";
        listEl.appendChild(empty);
        return;
    }

    for (const item of items) {
        const row = document.createElement("div");
        row.className = "rq-row rq-row--ready prep-save-row";
        if (item.key === activeBlockKey) row.classList.add("rq-row--active");
        row.dataset.key = item.key;

        const nameLine = document.createElement("div");
        nameLine.className = "rq-meta-name prep-save-name";
        nameLine.textContent = item.name;

        row.append(nameLine);
        row.addEventListener("click", () => onRowClick(item.key));
        listEl.appendChild(row);
    }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initSavePicker() {
    listEl = document.getElementById("saved-scripts-list");
    if (!listEl) {
        console.warn("[save-picker] #saved-scripts-list not found in DOM");
        return;
    }
    listEl.classList.add("rq-list");

    // Auto-save on every prep-panel change (debounced).
    document.addEventListener("prep:dirty", scheduleAutoSave);

    blocks = await fetchBlocks();
    render();
}
