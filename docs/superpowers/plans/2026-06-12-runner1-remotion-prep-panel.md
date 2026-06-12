# Runner 1 Regular → Remotion Prep Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip `1_Guess The Football Team Name - Main Runner - Regular` of all play/record/render machinery and turn it into a prep control panel: pick a save (the same named `1|` blocks Remotion's build-data reads), see every level's 11 player cards stacked on one page, and use the kept tools (photos, names, voices, Update Data, Name & Description, PROD validation, bulk photos, BGM preview, save-back to block).

**Architecture:** Keep the data layer (state, saved-scripts, teams, layouts, photo/voice modules) and the slot-rendering core of `pitch-render.js`. Add two new modules: `save-picker.js` (replaces `recording-queue.js` as the Saved tab) and `prep-panel.js` (renders all levels as stacked sections by swapping `appState.currentLevelIndex` + `appState.els.pitchSlots` per section — the existing handlers all read "current level" at click time, so a pointerdown context-switch makes every existing slot control work unchanged). Slim `levels.js` and `transitions.js` to keep their import surface alive. Delete everything else.

**Tech Stack:** Vanilla ES modules, existing `run_site.py` (untouched), existing server endpoints.

**Spec:** `docs/superpowers/specs/2026-06-12-runner1-remotion-prep-panel-design.md`

**Working directory for all tasks:** `1_Guess The Football Team Name - Main Runner - Regular/` (call it `R1/` below). NOTHING outside this folder is edited except `.Storage/docs/` in Task 8. `run_site.py`, `run_site.bat`, and the script-object schema are untouched.

**Key facts the engineer must know (verified against code):**
- Remotion's `___Remotion___/1_…_Remotion/scripts/build-data.mjs` reads `.Storage/storage/recording-status.json` → blocks whose key starts `1|` and have a non-empty `name`, and uses **`block.script.levels`** (preferring saved-team-layout `customXi` for the XI). So the panel's save list = named `1|` blocks, and save-back must write `block.script`.
- `renderPitch()` (`js/pitch-render.js:1971`) renders into `appState.els.pitchSlots` and expects the 11 `.player-slot` nodes to ALREADY exist inside it (it fills them: `appState.els.pitchSlots.querySelectorAll(".player-slot").forEach(...)` at line 2000). It returns early if the current level has no `currentSquad`.
- `renderHeader()` (`pitch-render.js:2359`) renders into the single `#team-header` element (bound as `els.teamHeader` + child refs `els.headerName`, `els.headerFlag` by `dom-bindings.js`). Do NOT clone it per level — keep it as a single sticky "active level" header.
- All slot/header control handlers (PHOTO / X / CROP / scale / name edit) read the CURRENT level via `getState()` at click time. Setting `appState.currentLevelIndex` + `appState.els.pitchSlots` on `pointerdown` (capture phase) before the click handler runs makes them operate on the right level with zero refactor.
- Cache-busting gotcha (from project memory): if two importers load the same module with different `?v=` tokens you get TWO module instances (split-brain). Every importer of `saved-scripts.js` must use the SAME new token `?v=20260612-prep`.
- `node --check` does NOT catch missing import files; a single unresolved import blanks the whole runner. Task 7 has an import-graph resolver script — run it.
- `.bat` files must stay CRLF (none are edited in this plan; do not Write any).

---

### Task 1: Slim `levels.js` and `transitions.js` (keep the import surface alive)

**Files:**
- Rewrite: `R1/js/levels.js`
- Rewrite: `R1/js/transitions.js`

Survivor modules import from these two: `saved-scripts.js` imports `switchLevel` (levels) and `captureTransitionSettings`/`applyTransitionSettings` (transitions); `level-control.js` imports `switchLevel`; `app.js` imports `switchLevel`, `initTransitionsUI`, `transitionSettings`; `prod-validation.js` imports `transitionSettings`. Everything else in these files is play-flow and dies.

- [ ] **Step 1: Replace `R1/js/levels.js` entirely with:**

```js
/**
 * PREP PANEL slim replacement (2026-06-12). The old play-flow switchLevel
 * (stage transitions, audio, recording teardown) lives in git history.
 * switchLevel now only moves the "active level" pointer; prep-panel.js
 * listens for the event and re-renders / scrolls.
 */
import { appState } from "./state.js";

export async function switchLevel(index) {
  const i = Math.max(0, Math.min(Number(index) || 0, (appState.levelsData?.length || 1) - 1));
  appState.currentLevelIndex = i;
  document.dispatchEvent(new CustomEvent("prep:level-switched", { detail: { index: i } }));
}
```

- [ ] **Step 2: Replace `R1/js/transitions.js` entirely with:**

```js
/**
 * PREP PANEL slim replacement (2026-06-12). The browser transition overlays
 * are gone (Remotion owns transitions now); this file only preserves the
 * script-schema fields (`transitions: {effect, random}`) and the Look-tab
 * select so captureCurrentScriptObject()/applyScriptObject() stay
 * byte-compatible with every existing save.
 */
export const transitionSettings = {
  effect: "grid-overlay",
  random: false,
};

export function initTransitionsUI() {
  const effectSel = document.getElementById("in-transition-effect");
  if (!effectSel) return;
  effectSel.value = transitionSettings.effect;
  effectSel.addEventListener("change", () => {
    transitionSettings.effect = effectSel.value || "grid-overlay";
  });
}

export function applyTransitionSettings(saved) {
  if (!saved) return;
  transitionSettings.random = !!saved.random;
  transitionSettings.effect = saved.effect || "grid-overlay";
  const effectSel = document.getElementById("in-transition-effect");
  const randomChk = document.getElementById("in-transition-random");
  if (effectSel) effectSel.value = transitionSettings.effect;
  if (randomChk) randomChk.checked = transitionSettings.random;
}

export function captureTransitionSettings() {
  return {
    effect: transitionSettings.effect,
    random: transitionSettings.random,
  };
}
```

- [ ] **Step 3: Fix the one survivor that imports a dead symbol.** `R1/js/level-control.js` imports `renderProgressSteps` from `./progress.js` (progress.js dies in Task 6). Open `level-control.js`, delete the `import { renderProgressSteps } ...` line and every call to `renderProgressSteps(...)` in it. Its `switchLevel` import stays (slim version). Also align its levels.js import token to `./levels.js?v=20260612-prep`, and do the same in `saved-scripts.js` (line 8) and `app.js` (line 5) — all importers of levels.js use the SAME token.

- [ ] **Step 4: Syntax check**

Run (from `R1/`): `node --check js/levels.js; node --check js/transitions.js; node --check js/level-control.js`
Expected: no output (all pass).

- [ ] **Step 5: Commit**

```bash
git add -A "1_Guess The Football Team Name - Main Runner - Regular/js"
git commit -m "refactor(r1-prep): slim levels.js + transitions.js to prep-panel surface"
```

---

### Task 2: New `save-picker.js` (Saved tab = the Remotion save list)

**Files:**
- Create: `R1/js/save-picker.js`
- Reference (copy from, deleted later): `R1/js/recording-queue.js`

The picker lists **exactly** what Remotion renders: blocks with key prefix `1|`, non-empty `name`. Loading honors a frozen Video Status first, else rebuilds from `teamsImportText` (same as `onBlockClick` in recording-queue.js:488). Save-back writes `block.script` via the existing `replace` op (the server's mass-delete safeguard already protects it).

- [ ] **Step 1: Copy the plumbing verbatim from `recording-queue.js` into the new file.** Create `R1/js/save-picker.js` starting with these functions copied UNCHANGED from `recording-queue.js` (they are self-contained): `fetchBlocks()` (line ~163), `postReplace(allBlocks)` (line ~174), `postSetVideoStatus(key, videoStatus)` (line ~186), `extractTeamsImportTextFromScript(script)`, `blockTeamsImportText(block)` (line ~230), `resolveScriptForBlock(block)` (line ~238), and the voiceFreeze stash-mirror logic from `onBlockClick` (lines ~511–546). Keep the `RUNNER_ID = 1` / `RUNNER_TYPE = "long"` constants.

- [ ] **Step 2: Write the module around them.** Imports and API:

```js
import { appState } from "./state.js";
import {
  applyScriptObject,
  buildScriptFromImportText,
  setActiveScriptName,
  getActiveScriptName,
  captureCurrentScriptObject,
} from "./saved-scripts.js?v=20260612-prep";
import { frozenScriptForBlock, wireVideoStatusButton, isVideoStatusEnabled } from "../../.Storage/shared/video-status.js";

let blocks = {};
let activeBlockKey = null;
let listEl = null;
let videoStatusController = null;

export function getActiveBlockKey() { return activeBlockKey; }

export async function initSavePicker() {
  listEl = document.getElementById("saved-scripts-list");
  blocks = await fetchBlocks();
  wireVideoStatus();
  wireSaveToBlockButton();
  render();
}
```

`render()` builds one row per block where `key.startsWith("1|")` and `String(block.name||"").trim()` is non-empty, sorted by episode number (third key segment) descending. Each row: save name, episode number, level count (`block.script?.levels?.length` minus intro/logo/outro, or "—"), a `❄` marker when `isVideoStatusEnabled(block)`, and a `Remotion ✓` tag (every listed row qualifies by construction — the tag is a reminder of the contract). Highlight the `activeBlockKey` row. Reuse the existing `rq-list` / `rq-row` CSS classes so it inherits the Saved-tab styling.

Row click handler (mirror of `onBlockClick`, recording-queue.js:488–551, minus calendar bits):

```js
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
      await mirrorVoiceFreezeIntoBlock(block, script, key); // the stash-mirror copied in Step 1
    }
  } catch (err) {
    console.error("[save-picker] load failed:", err);
    alert(err?.message || "Could not load this save.");
  }
  render();
}
```

- [ ] **Step 3: Save-back ("Save to save" button).** This is what makes panel edits reach Remotion (build-data reads `block.script`):

```js
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
  alert("Saved. Remotion build-data will now see these changes.");
}

function wireSaveToBlockButton() {
  const btn = document.getElementById("save-to-block-btn");
  if (btn) btn.onclick = () => { saveActiveToBlock().catch((e) => alert(e?.message || e)); };
}
```

- [ ] **Step 4: Video Status wiring** — copy the `wireVideoStatusButton({...})` call from recording-queue.js (~line 720–735) into `wireVideoStatus()`, with `getActiveKey: () => activeBlockKey`, `getBlock: (k) => blocks[k]`, `getActiveName: getActiveScriptName`, `captureScript: captureCurrentScriptObject`, `persist: async (k, vs) => { await postSetVideoStatus(k, vs); }`. Store the returned controller and call `videoStatusController.refresh()` at the end of `render()`.

- [ ] **Step 5: Syntax check**

Run: `node --check js/save-picker.js`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/save-picker.js"
git commit -m "feat(r1-prep): save-picker — lists the named 1| blocks Remotion renders, save-back to block.script"
```

---

### Task 3: New `prep-panel.js` + `prep-panel.css` (all levels stacked)

**Files:**
- Create: `R1/js/prep-panel.js`
- Create: `R1/css/components/prep-panel.css`

- [ ] **Step 1: Create `R1/js/prep-panel.js`:**

```js
/**
 * PREP PANEL — renders EVERY question level of the loaded save as a stacked
 * section of 11 player cards, reusing pitch-render's renderSlot/slot-controls
 * unchanged. Trick: all existing slot/header handlers act on the "current"
 * level (getState() at click time), so we keep one .pitch-slots clone per
 * section and swap appState.currentLevelIndex + appState.els.pitchSlots on
 * pointerdown (capture phase) before any click handler runs.
 */
import { appState } from "./state.js";
import { renderPitch, renderHeader, resolveHeaderTeamDisplayName } from "./pitch-render.js";

let root = null;
let slotsTemplate = null; // pristine clone of pitch.html's .pitch-slots (11 .player-slot nodes)
let sections = [];        // [{ levelIndex, sectionEl, slotsEl }]

function questionLevelIndexes() {
  const out = [];
  (appState.levelsData || []).forEach((lvl, i) => {
    if (!lvl || lvl.isLogo || lvl.isIntro || lvl.isOutro) return;
    out.push(i); // bonus levels are questions too — keep them
  });
  return out;
}

function setActiveLevel(levelIndex) {
  appState.currentLevelIndex = levelIndex;
  const sec = sections.find((s) => s.levelIndex === levelIndex);
  if (sec) {
    appState.els.pitchSlots = sec.slotsEl;
    sections.forEach((s) => s.sectionEl.classList.toggle("prep-section--active", s === sec));
  }
  renderHeader(); // single sticky #team-header tracks the active level (crest controls + dblclick name edit live there)
}

export function renderPrepPanel() {
  if (!root) return;
  sections = [];
  root.innerHTML = "";
  for (const levelIndex of questionLevelIndexes()) {
    const lvl = appState.levelsData[levelIndex];
    const sectionEl = document.createElement("section");
    sectionEl.className = "prep-section";
    sectionEl.dataset.levelIndex = String(levelIndex);

    const head = document.createElement("div");
    head.className = "prep-section__head";
    const teamName = lvl.currentSquad
      ? (resolveHeaderTeamDisplayName?.() && false) || (lvl.currentSquad.name || "?")
      : "(no team loaded)";
    const players = lvl.currentSquad ? "11 players" : "—";
    head.innerHTML =
      `<span class="prep-section__level">Level ${sections.length + 1}</span>` +
      `<span class="prep-section__team">${teamName}</span>` +
      `<span class="prep-section__meta">${lvl.formationId || ""} · ${players}</span>`;
    sectionEl.appendChild(head);

    const slotsEl = slotsTemplate.cloneNode(true);
    sectionEl.appendChild(slotsEl);
    root.appendChild(sectionEl);
    sections.push({ levelIndex, sectionEl, slotsEl });
  }
  // Render every section's slots with the context swapped in.
  for (const s of sections) {
    appState.currentLevelIndex = s.levelIndex;
    appState.els.pitchSlots = s.slotsEl;
    try { renderPitch(); } catch (e) { console.warn("[prep] renderPitch level", s.levelIndex, e); }
  }
  if (sections.length) setActiveLevel(sections[0].levelIndex);
}

export function initPrepPanel() {
  root = document.getElementById("prep-root");
  const originalSlots = appState.els.pitchSlots; // bound by dom-bindings from pitch.html
  if (!root || !originalSlots) {
    console.error("[prep] missing #prep-root or .pitch-slots template");
    return;
  }
  slotsTemplate = originalSlots.cloneNode(true);
  // Context switch BEFORE any click handler fires (capture phase).
  root.addEventListener(
    "pointerdown",
    (e) => {
      const sec = e.target?.closest?.(".prep-section");
      if (sec) setActiveLevel(Number(sec.dataset.levelIndex));
    },
    true
  );
  document.addEventListener("recording-queue:script-applied", () => renderPrepPanel());
  document.addEventListener("prep:level-switched", (e) => {
    const sec = sections.find((s) => s.levelIndex === e.detail?.index);
    if (sec) {
      setActiveLevel(sec.levelIndex);
      sec.sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  renderPrepPanel();
}
```

NOTE for the engineer: the `teamName` expression above is intentionally simple — use `lvl.currentSquad?.name`. `resolveHeaderTeamDisplayName()` reads the CURRENT level, so if you want translated display names, call it inside the per-section render loop (after the context swap) and patch the head text there. Either is acceptable; do not block on it.

- [ ] **Step 2: Create `R1/css/components/prep-panel.css`:**

```css
/* PREP PANEL — stacked level sections with flat card grids. */
.stage { overflow-y: auto !important; }

/* Hide the original pitch template (it stays in the DOM as the clone source). */
#pitch-wrap, .pitch-wrap { display: none !important; }

#prep-root {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 4.5rem 2rem 4rem;
  max-width: 1500px;
  margin: 0 auto;
}

.prep-section {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 0.8rem 1rem 1.1rem;
}
.prep-section--active { border-color: var(--accent, #ffd54f); }

.prep-section__head {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  margin-bottom: 0.7rem;
}
.prep-section__level { font-weight: 800; color: var(--accent, #ffd54f); }
.prep-section__team { font-weight: 800; font-size: 1.1rem; }
.prep-section__meta { opacity: 0.65; font-size: 0.85rem; }

/* Defeat the absolute pitch-formation positioning: flat responsive grid. */
.prep-section .pitch-slots {
  position: static !important;
  display: grid !important;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 0.9rem;
  width: auto !important;
  height: auto !important;
}
.prep-section .player-slot {
  position: static !important;
  left: auto !important;
  top: auto !important;
  transform: none !important;
  width: auto !important;
}

/* The single #team-header becomes a sticky "active level" toolbar. */
#team-header {
  position: sticky !important;
  top: 0;
  z-index: 500;
}
```

(The exact selector for the slots container/class comes from `html/pitch.html` — verify the container class is `.pitch-slots` and the wrapper id is `pitch-wrap` (used at `pitch-render.js:1093`) and adjust if they differ.)

- [ ] **Step 3: Register the CSS.** In `R1/css/styles.css`, add next to the other component imports: `@import url("components/prep-panel.css");` — then bump the stylesheet token in `index.html` (Task 4 rewrites it anyway; token `styles.css?v=20260612-prep`).

- [ ] **Step 4: Syntax check** — `node --check js/prep-panel.js`. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A "1_Guess The Football Team Name - Main Runner - Regular"
git commit -m "feat(r1-prep): prep-panel — all levels stacked as card grids with context-swapped slot controls"
```

---

### Task 4: Rewire `index.html` + `app.js`

**Files:**
- Modify: `R1/index.html`
- Modify: `R1/js/app.js`
- Modify: `R1/html/controls.html`

- [ ] **Step 1: `index.html` — strip the stage to prep panel.** Edit in place (one Write):
  - Title → `Football Quiz Studio - Lineups - PREP PANEL (Remotion)`.
  - DELETE: the two `.side-text` divs, `#countdown-timer`, the gooey `<svg id="ball-gooey-svg">`, the whole `#ball-preloader` block.
  - FABs: DELETE `#video-mode-btn`, `#render-video-btn`, `#record-video-btn`, `#play-video-btn`, `#render-test-clips-btn`. KEEP `#panel-fab`, `#btn-save-current-team-fab`, `#prod-btn`, `#save-video-status-btn`. ADD a new FAB next to them: `<button type="button" class="panel-fab save-to-block-btn" id="save-to-block-btn">💾 Save to save</button>`.
  - Stage: inside `<div id="stage-main">` add `<div id="prep-root"></div>`.
  - Partial loading: `stageComponents` becomes `['html/pitch.html']` only. Keep the `controls/progress/modals` Promise.all but DROP `html/progress.html` from it (file deleted in Task 6) — keep the `#quiz-progress-container` div or remove both; removing both is cleaner.
  - Keep the team-header move snippet and the `app.js?v=Date.now()` injection unchanged. Keep all 5 shared `<script>` tags (debug/loading/modal-layer/schedule/recording-status-client).
  - CSS link token → `css/styles.css?v=20260612-prep`. DELETE the `thumbnail-studio.css` link.

- [ ] **Step 2: `app.js` — remove dead imports.** Delete these import lines (numbers from the current file): `startVideoFlow, stopVideoFlow` (24), `initRenderModeIfRequested` (30), `askRenderOptions` (31), the render-progress-ui import block (32–38), `initRenderTestClipsUi, setRenderTestClipsBusy` (39), `initRecordingQueue, renderRecordingQueue` (40), `initThumbnailStudio` (41), `startRecordingAndFullscreen` (42), `askRecordingLanguage` (43). REPLACE line 40's role with: `import { initSavePicker } from "./save-picker.js";` and ADD `import { initPrepPanel, renderPrepPanel } from "./prep-panel.js";`. Align `saved-scripts.js` import (29) to `?v=20260612-prep` and `levels.js` (5) to `?v=20260612-prep`.

- [ ] **Step 3: `app.js` — remove dead wiring, keep feature wiring.** Work anchor-by-anchor:
  - KEEP: `initOptionalBootstrapUtilities` (961), `initSharedBackgroundTheme` (968), `initTeamVoiceManager` (986), `initLevelControls` (996), `initTransitionsUI` (997), `initUpdateData` (1004), `initSavedTeamLayouts` (1056), name-edit dblclick wiring (1803 — see Step 4), `els.headerName` dblclick (1834), `initHeaderLogoZoom` (1875), `initNameDescriptionGenerator` (1215), the PROD button handler (1304), language buttons, `recording-queue:script-applied` listener (1166) — append `renderPrepPanel()` is NOT needed there (prep-panel has its own listener), just keep what it does.
  - REPLACE `void initRecordingQueue();` (1003) with `void initSavePicker();`.
  - DELETE: `initThumbnailStudio()` (1005), the whole Video Mode button block (~1226–1303), everything from the "Mirrors what startVideoFlow does" comment (~1321) through the `els.playVideoBtn.onclick` / `els.recordVideoBtn.onclick` handlers (~1412–1460), the render-video onclick + `askRenderOptions` block (~1635–1646), `initRenderTestClipsUi({...})` (~1647–1660), and `initRenderModeIfRequested()` (1881).
  - At the end of the boot sequence (right after `initSavePicker()` resolves or after the last init call), ADD: `initPrepPanel();`.
  - If any remaining line references a deleted symbol, delete that line too — Task 7's import-graph check is the safety net.

- [ ] **Step 4: Retarget the slot name-edit dblclick.** At app.js:1803 `els.pitchSlots.addEventListener("dblclick", ...)` — `els.pitchSlots` is now the hidden template. Change the target to the prep root with the SAME handler body:

```js
document.getElementById("prep-root").addEventListener("dblclick", (e) => {
  /* existing handler body unchanged — it resolves the slot via e.target.closest(".player-slot")
     and acts on the current level, which pointerdown already set. */
});
```

- [ ] **Step 5: `controls.html` cleanup.** Delete the `#btn-youtube-thumbnails` and `#btn-generate-thumbnail` buttons (Quiz tab). Everything else stays (Language, Ending type, Total Levels, Levels Control, Update Data, Name & Description, the whole Look tab incl. the Transition select — schema compatibility — Voice tab, Saved tab).

- [ ] **Step 6: Syntax check** — `node --check js/app.js`. Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add -A "1_Guess The Football Team Name - Main Runner - Regular"
git commit -m "feat(r1-prep): boot straight into the prep panel; strip play/record/render wiring"
```

---

### Task 5: Sever remaining survivor → dead-module imports

**Files:**
- Modify: `R1/js/saved-scripts.js`
- Modify: `R1/js/pitch-render.js` (only if needed)
- Check-only: `R1/js/prod-validation.js`, `R1/js/teams.js`, `R1/js/voice-tab.js`, `R1/js/audio.js`, `R1/js/i18n.js`

- [ ] **Step 1: `saved-scripts.js`** — its imports of `switchLevel` (slim), `captureTransitionSettings`/`applyTransitionSettings` (slim) now resolve fine. Verify it does NOT import anything else that dies (`grep -n "import" js/saved-scripts.js` and compare against the Task 6 delete list). Align every `?v=` it carries to `20260612-prep` for levels.js, and verify all importers of saved-scripts.js (`app.js`, `save-picker.js`) use `?v=20260612-prep`.

- [ ] **Step 2: `pitch-render.js`** — imports `EASE_FLIP, EASE_OUT` from `./render-ease.js`: **render-ease.js is KEPT** (tiny easing constants, used by the kept slot flip rendering). No edit expected. Confirm it has no import from any Task-6 deleted file: `grep -n '^import\|from "\./' js/pitch-render.js | grep -E 'video|record|render-mode|render-segments|transitions|progress|thumbnail'` — expect no hits (its `render-segments` coupling is indirect-only per the dependency map).

- [ ] **Step 3: Survivor sweep.** Run from `R1/js`:

```bash
grep -nE 'from "\./(video|progress|obs-recorder|recording-flow|recording-preflight|recording-queue|render-mode|render-segments|render-options-dialog|render-progress-ui|render-test-clips-ui|thumbnail-studio)' *.js
```

Expected: ZERO hits in kept files (hits inside the soon-deleted files themselves are fine). Fix any survivor hit by deleting the import + its call sites.

- [ ] **Step 4: Commit**

```bash
git add -A "1_Guess The Football Team Name - Main Runner - Regular/js"
git commit -m "refactor(r1-prep): sever survivor imports from play/record/render modules"
```

---

### Task 6: Delete the dead files

**Files (delete):**
- `R1/js/`: `video.js`, `progress.js`, `obs-recorder.js`, `recording-flow.js`, `recording-preflight.js`, `recording-queue.js`, `render-mode.js`, `render-segments.js`, `render-options-dialog.js`, `render-progress-ui.js`, `render-test-clips-ui.js`, `thumbnail-studio.js`
- `R1/html/`: `landing.html`, `logo.html`, `outro.html`, `progress.html`
- `R1/render/` (entire Node headless-render folder)
- `R1/css/thumbnail-studio.css`
- `R1/tests/`: delete only files that test render/record (inspect first; if every test targets the render pipeline, delete the folder)

KEEP (explicitly): `audio.js` (voice-tab/saved-scripts/prod-validation need `renderTeamPhrase`, `getOrAssignRevealPhrase`, `pickRandomBgmSongs`; BGM playback functions are simply never called), `bgm-crossfade-preview.js` (BGM viewer in the voice tab), `render-ease.js`, `recording-queue`-replacement `save-picker.js`, all photo/voice/team/layout modules, `prod-validation.js`, `level-control.js`, `dev-live-reload-state.js`, `bootstrap-hybrid.js`.

- [ ] **Step 1: Delete the files** with `git rm` (from repo root):

```bash
cd "1_Guess The Football Team Name - Main Runner - Regular"
git rm js/video.js js/progress.js js/obs-recorder.js js/recording-flow.js js/recording-preflight.js js/recording-queue.js js/render-mode.js js/render-segments.js js/render-options-dialog.js js/render-progress-ui.js js/render-test-clips-ui.js js/thumbnail-studio.js
git rm html/landing.html html/logo.html html/outro.html html/progress.html
git rm -r render
git rm css/thumbnail-studio.css
```

- [ ] **Step 2: CSS dead-mode sweep.** Open `R1/css/styles.css` and the `css/modes/` folder: remove `@import` lines that point at landing/outro/logo/render/record-only mode sheets and delete those files (`git rm`). KEEP `css/components/pitch.css` (the card look) and anything the controls/modals/voice tab use. When unsure whether a sheet is used, keep it — CSS is cheap; broken imports are not (a missing CSS file only 404s, but keep it clean where obvious).

- [ ] **Step 3: Commit**

```bash
git add -A .
git commit -m "chore(r1-prep): delete play/record/render machinery (browser pipeline retired; Remotion renders now)"
```

---

### Task 7: Verification — import graph + live smoke test

- [ ] **Step 1: Import-graph resolver** (catches the "one missing module blanks the runner" failure that `node --check` misses). Save NOTHING — run this inline from `R1/`:

```bash
node -e "
const fs=require('fs'),path=require('path');
const seen=new Set();const missing=[];
function walk(f){f=f.split('?')[0];const abs=path.resolve(f);if(seen.has(abs))return;seen.add(abs);
let src;try{src=fs.readFileSync(abs,'utf8')}catch(e){missing.push(abs);return}
const re=/from\s+[\"']([^\"']+)[\"']/g;let m;
while((m=re.exec(src))){let spec=m[1].split('?')[0];if(!spec.startsWith('.'))continue;
walk(path.join(path.dirname(abs),spec));}}
walk('js/app.js');
if(missing.length){console.log('MISSING:');missing.forEach(x=>console.log(' ',x));process.exit(1)}
console.log('OK -',seen.size,'modules resolve');"
```

Expected: `OK - <n> modules resolve`. Any `MISSING:` line = a survivor still imports a deleted file; fix before continuing.

- [ ] **Step 2: Boot smoke test.** Start the server (PowerShell): `& ".\run_site.bat" --no-browser`, open the printed URL in a browser. Checklist:
  - Page boots with the control panel; no blank screen (if blank: check the browser console for the failing import).
  - **Saved tab** lists the named `1|` saves. Clicking one fills the prep panel: every level section shows 11 cards with photos + names.
  - Card controls: PHOTO opens the 3-source chooser; X removes; CROP opens the crop modal; double-click a name edits it — on a level OTHER than the first (proves the pointerdown context swap).
  - Sticky header shows the active section's team; crest zoom/nudge buttons work.
  - **Voice tab** renders all levels + intro + ending rows; "Create voice for all" button present; BGM preview section present.
  - **Quiz tab**: Update Data opens its modal; Name & Description generates (needs a loaded save).
  - **PROD** button runs validation. **Save Video Status** toggles. **💾 Save to save** writes (verify: reload page, reload save, edits persist; or check `recording-status.json` mtime).
  - Compare one save side-by-side with Remotion Studio (`___Remotion___/Open Remotion.bat`) — same save name appears in `npm run build-data` output after save-back.
- [ ] **Step 3: Fix anything found, re-run Step 1 + the relevant smoke item.** Use the systematic-debugging skill for any non-obvious failure.

- [ ] **Step 4: Commit fixes**

```bash
git add -A "1_Guess The Football Team Name - Main Runner - Regular"
git commit -m "fix(r1-prep): smoke-test fixes"
```

---

### Task 8: Documentation + memory write-back

**Files:**
- Modify: `.Storage/docs/runner-architecture.md`
- Modify: `.Storage/docs/video-record-render.md`
- Modify: `.Storage/docs/INDEX.md` (only if a row's description changes)

- [ ] **Step 1: `runner-architecture.md`** — in the runners table, change runner 1 Regular's role to "PREP PANEL (Remotion)" and add a short section: what the prep panel is, the two new modules (`save-picker.js`, `prep-panel.js`), the context-swap rendering trick, the slimmed `levels.js`/`transitions.js`, the save-back → `block.script` contract with Remotion build-data, and the explicit list of deleted subsystems. Update the "Pitch player cards" section note that the card look is reused by the prep grid.

- [ ] **Step 2: `video-record-render.md`** — add a note at the top of the runner-1 sections: the browser play/record/headless-render pipeline was REMOVED from runner 1 Regular on 2026-06-12 (git history has it; other runners unaffected); runner 1 videos are rendered by the Remotion project.

- [ ] **Step 3: Commit**

```bash
git add .Storage/docs
git commit -m "docs: runner 1 Regular is now the Remotion prep panel"
```

---

## Self-review notes (already applied)

- Spec coverage: save list/connection (Task 2), stacked levels + cards + controls (Task 3), voice/update-data/name-desc/PROD/bulk/BGM kept (Tasks 4–6 keep lists), save-back (Task 2 Step 3), deletions (Task 6), run_site untouched (no task touches it), docs (Task 8).
- `bulk-photo-picker.js` is invoked from within `pitch-render.js` (`installBulkPhotoButton`) — kept automatically, no wiring task needed.
- BGM viewer = the existing `buildBgmCrossfadePreviewSection` inside the voice tab — kept automatically via voice-tab.js.
- Token consistency: every importer of `saved-scripts.js` and `levels.js` uses `?v=20260612-prep` (Tasks 1/2/4/5).
