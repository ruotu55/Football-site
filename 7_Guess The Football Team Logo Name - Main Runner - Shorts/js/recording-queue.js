/* Calendar-driven "Saved" tab — replaces the freeform saved-scripts list with
 * a queue of the next 20 upcoming episodes for THIS runner (id + type).
 *
 * Each row is a "block" keyed by `<runnerId>|<type>|<episode>`. EN and ES
 * recordings for the same episode share a block; the block carries the script
 * payload and the EN/ES recording timestamps. Persistence is the shared store
 * at /__recording-status — see .Storage/Scripts/dev_server_recording_status.py
 * for the schema.
 *
 * Calendar tie-in: the calendar polls the same endpoint and renders status
 * badges on each pill using FCRecordingStatus.statusForPill().
 *
 * This module owns the in-tab UI — opening blocks, persisting edits, and
 * stamping recordings on `recording-naturally-finished`. It defers script
 * capture / apply to saved-scripts.js so the underlying schema stays in one
 * place.
 */
import { appState } from "./state.js";
import {
    applyScriptObject,
    setActiveScriptName,
    getActiveScriptName,
    buildScriptFromImportText,
} from "./saved-scripts.js";
import { getLastOutputPath } from "./obs-recorder.js";
import { generateNameDescription } from "../../.Storage/shared/name-description-generator/name-description-generator.js";

const RUNNER_ID = 7;
const RUNNER_TYPE = "short"; // "Shorts" folder = short-form.
const QUEUE_LIMIT = 10;
const SCHEDULE_LOOKAHEAD_MONTHS = 12;
const ENDPOINT = "/__recording-status";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let blocks = Object.create(null);       // server-mirrored: { "<key>": {name,script,recorded,updatedAt} }
let queue = [];                          // computed: array of { key, episode, en: {date}, es: {date} }
let listEl = null;
let activeBlockKey = null;
let saveModal = null;                    // lazily-built inline modal element

// ---------------------------------------------------------------------------
// Schedule walk — find this runner's next 20 episodes (EN+ES dates per episode)
// ---------------------------------------------------------------------------

function fmtDateShort(d) {
    return `${MONTH_SHORT[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHourMin(t) {
    if (!t) return "—";
    return `${String(t.hour).padStart(2, "0")}:${String(t.min).padStart(2, "0")}`;
}

function startOfToday() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function computeQueue() {
    const FC = window.FCSchedule;
    if (!FC || typeof FC.uploadsForMonth !== "function") return [];

    const today = startOfToday();
    // Start one month BEFORE the current month so episodes whose EN already
    // shipped a few days ago (but whose ES is still upcoming) get paired with
    // their EN date instead of showing "EN —" for an episode that obviously
    // had one.
    const startCursor = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // Per-episode aggregate: episode # -> { en: Date|null, es: Date|null }
    const byEpisode = new Map();

    const totalMonths = SCHEDULE_LOOKAHEAD_MONTHS + 1; // +1 for the back-walk
    for (let i = 0; i < totalMonths; i++) {
        const year = startCursor.getFullYear();
        const month = startCursor.getMonth() + i;
        const normYear = year + Math.floor(month / 12);
        const normMonth = ((month % 12) + 12) % 12;
        const monthMap = FC.uploadsForMonth(normYear, normMonth);
        for (const [day, uploads] of monthMap.entries()) {
            const date = new Date(normYear, normMonth, day);
            for (const u of uploads) {
                if (u.runner?.id !== RUNNER_ID) continue;
                if (u.type !== RUNNER_TYPE) continue;
                if (!byEpisode.has(u.episode)) {
                    byEpisode.set(u.episode, { en: null, es: null, enTime: null, esTime: null });
                }
                const entry = byEpisode.get(u.episode);
                if (u.channel === "en" && !entry.en) {
                    entry.en = date;
                    entry.enTime = { hour: u.hour, min: u.min };
                } else if (u.channel === "es" && !entry.es) {
                    entry.es = date;
                    entry.esTime = { hour: u.hour, min: u.min };
                }
            }
        }
    }

    // Build sortable items. Keep episodes where AT LEAST ONE language is still
    // upcoming — even if the other has passed, the recording is still valid
    // (uploads have no hard cutoff). Sort key is the earliest *future* date so
    // partial-past episodes don't get pushed to the top.
    const items = [];
    for (const [episode, dates] of byEpisode.entries()) {
        if (!dates.en && !dates.es) continue;
        const futureDates = [];
        if (dates.en && dates.en >= today) futureDates.push(dates.en);
        if (dates.es && dates.es >= today) futureDates.push(dates.es);
        if (futureDates.length === 0) continue; // both languages already past
        const earliestFuture = futureDates.reduce((a, b) => (a < b ? a : b));
        items.push({
            key: `${RUNNER_ID}|${RUNNER_TYPE}|${episode}`,
            episode,
            en: dates.en,
            es: dates.es,
            enTime: dates.enTime,
            esTime: dates.esTime,
            earliestFuture,
        });
    }

    items.sort((a, b) => a.earliestFuture - b.earliestFuture);

    return items.slice(0, QUEUE_LIMIT);
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
    try {
        await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "replace", payload: { blocks: allBlocks } }),
        });
    } catch (_) { /* offline — silent; the next user save will retry */ }
}

async function postStampRecording(key, language, video) {
    try {
        const r = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                op: "stampRecording",
                key,
                language,
                timestamp: Date.now(),
                video: video || undefined, // { path, title, description, tags }
            }),
        });
        return r.ok;
    } catch (_) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Block status helpers
// ---------------------------------------------------------------------------

function statusOf(block) {
    if (!block) return "empty";
    const en = !!block.recorded?.english;
    const es = !!block.recorded?.spanish;
    if (en && es) return "recordedBoth";
    if (en || es) return "recordedHalf";
    return "ready";
}

function statusLabel(block) {
    if (!block) return "Empty";
    const en = !!block.recorded?.english;
    const es = !!block.recorded?.spanish;
    if (en && es) return "2/2 ✓";
    if (en) return "1/2 EN";
    if (es) return "1/2 ES";
    return "Ready";
}

// ---------------------------------------------------------------------------
// Inline save modal — small, no dependency on existing modals
// ---------------------------------------------------------------------------

function ensureSaveModal() {
    if (saveModal) return saveModal;
    const root = document.createElement("div");
    root.className = "rq-modal";
    root.hidden = true;
    root.innerHTML = `
        <div class="rq-modal-backdrop" data-rq-close></div>
        <div class="rq-modal-panel" role="dialog" aria-labelledby="rq-modal-title">
            <h3 id="rq-modal-title">Fill block</h3>

            <label class="rq-modal-label" for="rq-modal-name">Name</label>
            <input id="rq-modal-name" type="text" class="rq-modal-input" autocomplete="off" />

            <label class="rq-modal-label rq-modal-label-spaced" for="rq-modal-teams">Teams list</label>
            <textarea id="rq-modal-teams" class="rq-modal-textarea" rows="6" autocomplete="off"></textarea>
            <div class="rq-modal-error" hidden></div>

            <div class="rq-modal-actions">
                <button type="button" class="rq-btn rq-btn-secondary" data-rq-close>Cancel</button>
                <button type="button" class="rq-btn rq-btn-primary" data-rq-save>Save block</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    saveModal = root;
    root.addEventListener("click", (e) => {
        const t = e.target;
        if (t.dataset?.rqClose !== undefined) closeSaveModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !root.hidden) closeSaveModal();
    });
    return root;
}

function showSaveError(message) {
    const root = ensureSaveModal();
    const errEl = root.querySelector(".rq-modal-error");
    if (!errEl) return;
    errEl.innerHTML = "";
    if (Array.isArray(message)) {
        for (const line of message) {
            const p = document.createElement("div");
            p.textContent = line;
            errEl.appendChild(p);
        }
    } else {
        errEl.textContent = String(message || "");
    }
    errEl.hidden = false;
}

function clearSaveError() {
    const root = ensureSaveModal();
    const errEl = root.querySelector(".rq-modal-error");
    if (!errEl) return;
    errEl.innerHTML = "";
    errEl.hidden = true;
}

let pendingBlockKey = null;
let pendingItem = null;

function openSaveModal(item) {
    const root = ensureSaveModal();
    pendingBlockKey = item.key;
    pendingItem = item;
    const input = root.querySelector("#rq-modal-name");
    const teamsArea = root.querySelector("#rq-modal-teams");
    // Pre-fill: existing block name, or empty.
    const existing = blocks[item.key];
    input.value = existing?.name || "";
    if (teamsArea) teamsArea.value = "";
    clearSaveError();
    root.hidden = false;
    setTimeout(() => input.focus(), 0);

    const saveBtn = root.querySelector("[data-rq-save]");
    saveBtn.onclick = onConfirmSave;
}

function closeSaveModal() {
    pendingBlockKey = null;
    pendingItem = null;
    if (saveModal) saveModal.hidden = true;
}

async function onConfirmSave() {
    if (!pendingBlockKey || !pendingItem) return;
    const root = ensureSaveModal();
    const input = root.querySelector("#rq-modal-name");
    const teamsArea = root.querySelector("#rq-modal-teams");
    const saveBtn = root.querySelector("[data-rq-save]");
    const name = input.value.trim();
    const importText = (teamsArea?.value || "").trim();

    // Both fields are required — the block has no fallback to "current
    // settings" anymore; every block's script comes from a team list.
    let firstInvalid = null;
    if (!name) {
        input.classList.add("rq-modal-input--error");
        firstInvalid = firstInvalid || input;
    } else {
        input.classList.remove("rq-modal-input--error");
    }
    if (!importText) {
        teamsArea?.classList.add("rq-modal-input--error");
        firstInvalid = firstInvalid || teamsArea;
    } else {
        teamsArea?.classList.remove("rq-modal-input--error");
    }
    if (firstInvalid) {
        showSaveError(
            !name && !importText
                ? "Enter a name and paste a teams list."
                : !name
                  ? "Enter a name."
                  : "Paste a teams list.",
        );
        firstInvalid.focus();
        return;
    }
    clearSaveError();

    // Build the script from the pasted "[Team1, Team2, ...]" list using saved
    // team layouts. Show resolution errors inline; nothing is saved until the
    // list resolves cleanly.
    saveBtn.disabled = true;
    const prevLabel = saveBtn.textContent;
    saveBtn.textContent = "Importing…";
    let script;
    try {
        const result = await buildScriptFromImportText(importText, name);
        if (!result.ok) {
            showSaveError(result.errors || ["Import failed."]);
            return;
        }
        script = result.script;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = prevLabel;
    }

    const previous = blocks[pendingBlockKey];
    const next = {
        name,
        script,
        // Re-saving a block does NOT clear prior recordings — the EN/ES stamps
        // persist. Use the row's ✕ button to wipe a block completely.
        recorded: previous?.recorded || { english: null, spanish: null },
        updatedAt: Date.now(),
    };
    blocks[pendingBlockKey] = next;

    activeBlockKey = pendingBlockKey;
    setActiveScriptName(name);
    appState.activeBlockKey = pendingBlockKey;

    await postReplace(blocks);

    // Apply the freshly-built script so the live UI reflects the teams.
    try {
        await applyScriptObject(script);
    } catch (err) {
        console.error("[recording-queue] applyScriptObject after import failed:", err);
    }

    closeSaveModal();
    render();
}

// ---------------------------------------------------------------------------
// Row click handlers
// ---------------------------------------------------------------------------

async function onBlockClick(item) {
    const existing = blocks[item.key];
    if (existing) {
        // Load the saved script for this block; mark it active so Record Video
        // uses its name. The script-applied event re-renders the queue.
        activeBlockKey = item.key;
        setActiveScriptName(existing.name);
        appState.activeBlockKey = item.key;
        try {
            await applyScriptObject(existing.script);
        } catch (err) {
            console.error("[recording-queue] applyScriptObject failed:", err);
        }
        render();
    } else {
        openSaveModal(item);
    }
}

async function clearBlock(item, evt) {
    evt.stopPropagation();
    if (!blocks[item.key]) return;
    if (!confirm(`Clear block #${item.episode}? The saved script and recording status are removed.`)) return;
    delete blocks[item.key];
    if (activeBlockKey === item.key) {
        activeBlockKey = null;
        setActiveScriptName(null);
        appState.activeBlockKey = null;
    }
    await postReplace(blocks);
    render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
    if (!listEl) return;
    listEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "rq-header";
    header.innerHTML = `
        <span class="rq-header-title">Recording Queue</span>
        <span class="rq-header-sub">Runner #${RUNNER_ID} · ${RUNNER_TYPE === "long" ? "Long-form" : "Short"} · next ${queue.length}/${QUEUE_LIMIT} upcoming</span>
    `;
    listEl.appendChild(header);

    if (queue.length === 0) {
        const empty = document.createElement("div");
        empty.className = "rq-empty";
        empty.textContent = "No upcoming episodes in the next 12 months. Check the calendar.";
        listEl.appendChild(empty);
        return;
    }

    for (const item of queue) {
        listEl.appendChild(renderRow(item));
    }
}

function renderRow(item) {
    const block = blocks[item.key];
    const status = statusOf(block);
    const row = document.createElement("div");
    row.className = `rq-row rq-row--${status}`;
    if (item.key === activeBlockKey) row.classList.add("rq-row--active");
    row.dataset.key = item.key;

    const statusChip = document.createElement("span");
    statusChip.className = `rq-status rq-status--${status}`;
    statusChip.textContent = statusLabel(block);

    const meta = document.createElement("div");
    meta.className = "rq-meta";
    const epLine = document.createElement("div");
    epLine.className = "rq-meta-ep";
    const runnerShort = window.FCSchedule?.RUNNERS?.find?.((r) => r.id === RUNNER_ID)?.short || `R${RUNNER_ID}`;
    epLine.textContent = `#${item.episode} · ${runnerShort}`;
    const dateLine = document.createElement("div");
    dateLine.className = "rq-meta-dates";
    // Post-pairing the schedule guarantees EN and ES land on the same date —
    // show the date once and split out the per-channel upload hours. Fall
    // back to the old two-date format only if the schedule ever drifts.
    const sameDate = item.en && item.es && item.en.getTime() === item.es.getTime();
    if (sameDate) {
        dateLine.textContent = `${fmtDateShort(item.en)} · EN ${fmtHourMin(item.enTime)} · ES ${fmtHourMin(item.esTime)}`;
    } else {
        const enText = item.en ? `EN ${fmtDateShort(item.en)} ${fmtHourMin(item.enTime)}` : "EN —";
        const esText = item.es ? `ES ${fmtDateShort(item.es)} ${fmtHourMin(item.esTime)}` : "ES —";
        dateLine.textContent = `${enText} · ${esText}`;
    }
    if (block?.name) {
        const nameLine = document.createElement("div");
        nameLine.className = "rq-meta-name";
        nameLine.textContent = block.name;
        meta.append(epLine, nameLine, dateLine);
    } else {
        meta.append(epLine, dateLine);
    }

    const actions = document.createElement("div");
    actions.className = "rq-row-actions";
    if (block) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "rq-clear-btn";
        clearBtn.title = "Clear this block";
        clearBtn.textContent = "✕";
        clearBtn.addEventListener("click", (e) => clearBlock(item, e));
        actions.appendChild(clearBtn);
    }

    row.append(statusChip, meta, actions);
    row.addEventListener("click", () => onBlockClick(item));
    return row;
}

// ---------------------------------------------------------------------------
// Recording-finished hook — stamp the active block on each phase finish
// ---------------------------------------------------------------------------

async function onRecordingFinished() {
    const dr = appState.doubleRecording;
    const key = appState.activeBlockKey || activeBlockKey;
    if (!key) return; // No active block (e.g. user is on a legacy save not in the queue)

    // Phase tells us which language just finished. If we aren't in a double-
    // record session (e.g. single Play Video, not Record Video), don't stamp.
    if (!dr || (dr.phase !== 1 && dr.phase !== 2)) return;
    const language = dr.phase === 1 ? "english" : "spanish";

    // Capture the video file path (from OBS) and the generated YouTube metadata
    // for THIS language, so the calendar's "Upload to YouTube" button has
    // everything it needs. Generation reflects the current quiz/language state.
    let video = null;
    try {
        const path = getLastOutputPath();
        // Pass the language so the ES recording gets Spanish title/description/tags.
        const meta = generateNameDescription(language); // { title, description, tags }
        video = {
            path: path || null,
            title: meta.title || "",
            description: meta.description || "",
            tags: Array.isArray(meta.tags) ? meta.tags : [],
        };
    } catch (err) {
        console.warn("[recording-queue] metadata capture failed:", err);
    }

    // Optimistic local update so the queue reflects it immediately even if the
    // POST is slow.
    const block = blocks[key];
    if (block) {
        block.recorded = block.recorded || { english: null, spanish: null };
        block.recorded[language] = Date.now();
        if (video) {
            block.video = block.video || {};
            block.video[language] = video;
        }
        block.updatedAt = block.recorded[language];
        render();
    }
    const ok = await postStampRecording(key, language, video);
    if (!ok) {
        // Server didn't accept — refetch to reconcile.
        blocks = await fetchBlocks();
        render();
    }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initRecordingQueue() {
    listEl = document.getElementById("saved-scripts-list");
    if (!listEl) {
        console.warn("[recording-queue] #saved-scripts-list not found in DOM");
        return;
    }
    listEl.classList.add("rq-list");

    blocks = await fetchBlocks();
    queue = computeQueue();
    render();

    // The legacy loadScript path dispatches this when it finishes applying a
    // script object — we re-render so the active-row highlight follows.
    document.addEventListener("recording-queue:script-applied", () => {
        const name = getActiveScriptName();
        // Find the block whose name matches — activeBlockKey was already set
        // by onBlockClick before applyScriptObject ran, but a legacy code path
        // may set activeScriptName without going through us. Refresh anyway.
        if (!activeBlockKey && name) {
            for (const [key, b] of Object.entries(blocks)) {
                if (b.name === name) {
                    activeBlockKey = key;
                    appState.activeBlockKey = key;
                    break;
                }
            }
        }
        render();
    });

    document.addEventListener("recording-naturally-finished", onRecordingFinished);
}

export function renderRecordingQueue() {
    render();
}
