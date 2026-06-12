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
import { frozenScriptForBlock, isVideoStatusEnabled, wireVideoStatusButton } from "../../.Storage/shared/video-status.js";

const RUNNER_ID = 1;
const KEY_PREFIX = `${RUNNER_ID}|`;
const ENDPOINT = "/__recording-status";

let blocks = Object.create(null);
let listEl = null;
let activeBlockKey = null;
let videoStatusController = null;

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

/** Persist a block's Save Video Status freeze (or pass null to clear). */
async function postSetVideoStatus(key, videoStatus) {
    const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setVideoStatus", key, videoStatus: videoStatus || null }),
    });
    if (!r.ok) throw new Error("Server rejected setVideoStatus (HTTP " + r.status + ")");
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
// Save-back — block.script is what Remotion build-data reads
// ---------------------------------------------------------------------------

async function saveActiveToBlock() {
    if (!activeBlockKey || !blocks[activeBlockKey]) {
        alert("Load a save first.");
        return;
    }
    const block = blocks[activeBlockKey];
    const script = captureCurrentScriptObject(block.name || getActiveScriptName() || "Recording");
    if (!script || !Array.isArray(script.levels) || !script.levels.length) {
        alert("Nothing to save — the panel is empty.");
        return;
    }
    block.script = script;
    blocks[activeBlockKey] = block;
    await postReplace(blocks);
    alert("Saved ✔ — Remotion build-data will now see these changes.");
}

function wireSaveToBlockButton() {
    const btn = document.getElementById("save-to-block-btn");
    if (!btn) return;
    btn.onclick = () => {
        saveActiveToBlock().catch((e) => alert("Couldn't save: " + (e?.message || e)));
    };
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
        const frozen = frozenScriptForBlock(block);
        if (frozen) {
            await applyScriptObject(frozen);
        } else {
            const script = await resolveScriptForBlock(block);
            await applyScriptObject(script);
            await mirrorVoiceFreezeIntoBlock(block, script, key);
        }
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
    items.sort((a, b) => b.episode - a.episode);
    return items;
}

function questionLevelCount(block) {
    const levels = block?.script?.levels;
    if (!Array.isArray(levels)) return null;
    return levels.filter((l) => l && !l.isLogo && !l.isIntro && !l.isOutro).length;
}

function render() {
    if (!listEl) return;
    if (videoStatusController) videoStatusController.refresh();
    listEl.innerHTML = "";

    const items = listedSaves();
    const header = document.createElement("div");
    header.className = "rq-header";
    header.innerHTML = `
        <span class="rq-header-title">Remotion Saves</span>
        <span class="rq-header-sub">Runner #${RUNNER_ID} · ${items.length} named saves · same list as build-data</span>
    `;
    listEl.appendChild(header);

    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "rq-empty";
        empty.textContent = "No named runner-1 saves in recording-status.json yet.";
        listEl.appendChild(empty);
        return;
    }

    for (const item of items) {
        const row = document.createElement("div");
        row.className = "rq-row rq-row--ready";
        if (item.key === activeBlockKey) row.classList.add("rq-row--active");
        row.dataset.key = item.key;

        const statusChip = document.createElement("span");
        statusChip.className = "rq-status rq-status--ready";
        const n = questionLevelCount(item.block);
        statusChip.textContent = n != null ? `${n} lvls` : "list";

        const meta = document.createElement("div");
        meta.className = "rq-meta";
        const epLine = document.createElement("div");
        epLine.className = "rq-meta-ep";
        epLine.textContent = `#${item.episode}` + (isVideoStatusEnabled(item.block) ? " · ❄ frozen" : "");
        const nameLine = document.createElement("div");
        nameLine.className = "rq-meta-name";
        nameLine.textContent = item.name;
        meta.append(epLine, nameLine);

        row.append(statusChip, meta);
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

    videoStatusController = wireVideoStatusButton({
        button: document.getElementById("save-video-status-btn"),
        getActiveKey: () => activeBlockKey,
        getBlock: (k) => blocks[k] || null,
        getActiveName: () => (activeBlockKey && blocks[activeBlockKey] && blocks[activeBlockKey].name) || "Recording",
        captureScript: (name) => captureCurrentScriptObject(name),
        persist: async (k, vs) => { await postSetVideoStatus(k, vs); },
    });

    wireSaveToBlockButton();
    blocks = await fetchBlocks();
    render();
}
