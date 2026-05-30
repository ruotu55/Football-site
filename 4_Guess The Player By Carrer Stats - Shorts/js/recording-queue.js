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
import { switchLevel } from "./levels.js";
import {
    applyScriptObject,
    setActiveScriptName,
    getActiveScriptName,
    buildScriptFromImportText,
} from "./saved-scripts.js?v=20260529b";
import { getLastOutputPath } from "./obs-recorder.js";
import { generateNameDescription } from "../../.Storage/shared/name-description-generator/name-description-generator.js";

const RUNNER_ID = 4;
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

function publishScheduleAvailability() {
    try {
        if (!window.FCSchedule || typeof window.FCSchedule.setBlockEpisodes !== "function") return;
        const out = {};
        for (const key of Object.keys(blocks)) {
            const b = blocks[key];
            const text = String((b && b.teamsImportText) || "").trim();
            if (!text) continue;
            const parts = key.split("|");
            if (parts.length !== 3) continue;
            const rid = Number(parts[0]);
            const t = parts[1];
            const ep = Number(parts[2]);
            if (!rid || (t !== "long" && t !== "short") || !ep) continue;
            const opener = ((text.split("\n").find((l) => l.trim())) || "").split(" - ")[0].trim();
            const mk = t + "|" + rid;
            (out[mk] || (out[mk] = [])).push({ ep, opener });
        }
        for (const mk of Object.keys(out)) out[mk].sort((a, b) => a.ep - b.ep);
        window.FCSchedule.setBlockEpisodes(out);
    } catch (_e) { /* non-fatal */ }
}

function computeQueue() {
    publishScheduleAvailability();
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

            <!-- Shorts: block name is auto-generated; field hidden so only the list is needed -->
            <label class="rq-modal-label" for="rq-modal-name" hidden>Name</label>
            <input id="rq-modal-name" type="text" class="rq-modal-input" autocomplete="off" hidden />

            <label class="rq-modal-label rq-modal-label-spaced" for="rq-modal-teams">Levels</label>
            <p class="rq-modal-hint">One line per level, e.g. Real Madrid - Spain or Player Name - Team Name.</p>
            <textarea id="rq-modal-teams" class="rq-modal-textarea" rows="12" autocomplete="off"></textarea>
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
    setTimeout(() => (teamsArea || input).focus(), 0);

    const saveBtn = root.querySelector("[data-rq-save]");
    saveBtn.onclick = onConfirmSave;
}

function closeSaveModal() {
    pendingBlockKey = null;
    pendingItem = null;
    if (saveModal) saveModal.hidden = true;
}

/** Shorts: derive a block name when the Name field is left blank — first item
 *  from the pasted list (filesystem-safe), else the episode number. */
function autoBlockName(importText, item) {
    const first = String(importText || "")
        .replace(/^[\s[]+/, "")
        .split(/[,\n]/)[0]
        .replace(/[[\]]/g, "")
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (first) return first;
    return `Episode ${item?.episode ?? ""}`.trim();
}

async function onConfirmSave() {
    if (!pendingBlockKey || !pendingItem) return;
    const root = ensureSaveModal();
    const input = root.querySelector("#rq-modal-name");
    const teamsArea = root.querySelector("#rq-modal-teams");
    const saveBtn = root.querySelector("[data-rq-save]");
    const importText = (teamsArea?.value || "").trim();

    // Shorts: only the teams/players list is required. The block name is
    // optional — fall back to the existing name (when re-filling) or an
    // auto-generated one derived from the list / episode.
    if (!importText) {
        teamsArea?.classList.add("rq-modal-input--error");
        showSaveError("Paste a teams/players list.");
        teamsArea?.focus();
        return;
    }
    teamsArea?.classList.remove("rq-modal-input--error");
    input.classList.remove("rq-modal-input--error");
    const existingBlock = blocks[pendingBlockKey];
    const name = (RUNNER_TYPE === "short") ? "" : (input.value.trim() || existingBlock?.name || autoBlockName(importText, pendingItem));
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
        activeBlockKey = item.key;
        setActiveScriptName(existing.name);
        appState.activeBlockKey = item.key;
        const _vfSig = (s) => JSON.stringify({
            vf: (s && s.voiceFreeze) || null,
            lvl: (s && Array.isArray(s.levels) ? s.levels : []).map((l) => (l && l.voiceFreeze) || null),
        });
        try {
            let script = null;
            const importText = String(existing.teamsImportText || "").trim();
            if (importText) {
                const result = await buildScriptFromImportText(importText, existing.name || "Recording block");
                if (!result.ok) {
                    throw new Error(Array.isArray(result.errors) ? result.errors.join("\n") : "Import failed.");
                }
                script = result.script;
            } else if (existing.script && Array.isArray(existing.script.levels) && existing.script.levels.length) {
                script = existing.script;
            } else {
                throw new Error("This block has no teams list. Open it and paste a teams list.");
            }
            const stash = (existing.script && typeof existing.script === "object") ? existing.script : null;
            if (stash && script) {
                if (stash.voiceFreeze) script.voiceFreeze = stash.voiceFreeze;
                if (Array.isArray(stash.levels) && Array.isArray(script.levels)) {
                    stash.levels.forEach((lvl, i) => {
                        if (lvl && lvl.voiceFreeze && script.levels[i]) script.levels[i].voiceFreeze = lvl.voiceFreeze;
                    });
                }
            }
            const _vfBefore = _vfSig(stash);
            await applyScriptObject(script);
            if (stash) {
                if (script.voiceFreeze) stash.voiceFreeze = script.voiceFreeze;
                if (Array.isArray(script.levels)) {
                    if (!Array.isArray(stash.levels)) stash.levels = [];
                    script.levels.forEach((lvl, i) => {
                        if (lvl && lvl.voiceFreeze) {
                            stash.levels[i] = stash.levels[i] && typeof stash.levels[i] === "object"
                                ? { ...stash.levels[i], voiceFreeze: lvl.voiceFreeze }
                                : { voiceFreeze: lvl.voiceFreeze };
                        }
                    });
                }
                if (_vfSig(stash) !== _vfBefore) {
                    try { await postReplace(blocks); } catch (_) { /* offline */ }
                }
            }
        } catch (err) {
            console.error("[recording-queue] block load failed:", err);
            alert(err && err.message ? err.message : "Could not load this block.");
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
    // Auto-open a saved competition when launched from the calendar
    // (?open=<runnerId>|<type>|<episode>) -> show a loading box while the page
    // finishes booting (team index + player DB + blocks store can take several
    // seconds on some runners), then load the block and land on the first quiz level.
    const _loader = {
        show(title) {
            if (document.getElementById("__ao_loader")) return;
            if (!document.getElementById("__ao_loader_style")) {
                const st = document.createElement("style");
                st.id = "__ao_loader_style";
                st.textContent =
                    "@keyframes __aoSpin{to{transform:rotate(360deg)}}" +
                    "body.play-video-active #__ao_loader{display:none!important}";
                document.head.appendChild(st);
            }
            const el = document.createElement("div");
            el.id = "__ao_loader";
            el.style.cssText = "position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 38%,rgba(11,74,38,0.97),rgba(4,26,14,0.985));font-family:Montserrat,Arial,sans-serif;";
            el.innerHTML =
                '<div style="text-align:center;color:#fff;padding:40px 56px;border:1px solid rgba(255,255,255,0.14);border-radius:18px;background:rgba(0,0,0,0.30);box-shadow:0 18px 60px rgba(0,0,0,0.5);">' +
                  '<div style="width:64px;height:64px;margin:0 auto 22px;border:6px solid rgba(255,255,255,0.18);border-top-color:#2ecc71;border-radius:50%;animation:__aoSpin 0.9s linear infinite;"></div>' +
                  '<div style="font-size:24px;font-weight:800;letter-spacing:0.5px;">' + (title || "Loading…") + '</div>' +
                  '<div id="__ao_loader_sub" style="margin-top:10px;font-size:14px;color:#bfe8cf;min-height:18px;">Preparing…</div>' +
                '</div>';
            document.body.appendChild(el);
        },
        sub(msg) { const s = document.getElementById("__ao_loader_sub"); if (s) s.textContent = msg; },
        hide() { const el = document.getElementById("__ao_loader"); if (el) el.remove(); },
    };
    try {
        const _p = new URLSearchParams(location.search);
        const _open = _p.get("open");
        if (_open) {
            const _pp = _open.split("|");
            if (_pp.length === 3 && Number(_pp[0]) === RUNNER_ID && _pp[1] === RUNNER_TYPE) {
                const _ep = Number(_pp[2]);
                const _key = `${RUNNER_ID}|${RUNNER_TYPE}|${_ep}`;
                _loader.show(`Loading episode #${_ep}…`);
                _p.delete("open");
                const _qs = _p.toString();
                history.replaceState(null, "", location.pathname + (_qs ? "?" + _qs : ""));

                // Wait until the team index AND this episode's block are ready;
                // both load async during bootstrap and can take several seconds.
                let _block = blocks[_key];
                let _tiReady = false;
                for (let _i = 0; _i < 150; _i++) { // ~30s ceiling (150 * 200ms)
                    const _ti = appState.teamsIndex;
                    _tiReady = !!(_ti && (((_ti.clubs || []).length) || ((_ti.nationalities || []).length)));
                    if (!_block) _block = blocks[_key];
                    if (!_block && _i % 10 === 9) {
                        try {
                            const _fresh = await fetchBlocks();
                            if (_fresh && Object.keys(_fresh).length) { blocks = _fresh; _block = blocks[_key]; }
                        } catch (_x) { /* ignore, retry */ }
                    }
                    if (_tiReady && _block) break;
                    _loader.sub(`Preparing… ${Math.floor(_i / 5)}s`);
                    await new Promise((res) => setTimeout(res, 200));
                }


                if (!_block) {
                    _loader.sub("Couldn't find this episode, please open it manually.");
                    setTimeout(() => _loader.hide(), 2500);
                } else {
                    const _item = queue.find((q) => q.episode === _ep) || { key: _key, episode: _ep };
                    _loader.sub("Building lineups…");
                    // loadScript lands on the first quiz level on its own.
                    await onBlockClick(_item);
                    // Let the first-quiz transition get going under the box, then drop it.
                    await new Promise((res) => setTimeout(res, 300));
                    _loader.hide();
                }
            }
        }
    } catch (_e) {
        _loader.sub("Something went wrong, please open it manually.");
        setTimeout(() => _loader.hide(), 2500);
    }


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
