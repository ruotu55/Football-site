# Save Voice Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every saved script remember the random voice picks it used, so reloading a save replays the exact same audio. Apply across all 16 quiz runners.

**Architecture:** Add a `voiceFreeze` field to each save object (top-level for the bundled milestone variant map — Regular runners only — and per-level for the reveal-phrase-by-language map). At save time, force-roll any missing picks before snapshotting. At load time, restore the freeze into in-memory state (`appState.bundledVoiceVariants`, `level.__revealPhraseByLanguage`) so existing voice code paths short-circuit instead of re-rolling. On module init, bulk-migrate any existing saves that lack the freeze fields.

**Tech Stack:** Vanilla JS ES modules, browser localStorage, Python flask dev server (`run_site.py`), no automated test framework — verification is manual reload-and-observe.

**Codebase notes:**
- 16 runner folders: `1_...Regular`, `1_...Shorts`, … `8_...Regular`, `8_...Shorts`. Each is a self-contained app with its own `js/` folder. Code is duplicated across runners.
- All 16 runners have `js/audio.js` with `getOrAssignRevealPhrase(level, questionIndex, language)` that caches into `level.__revealPhraseByLanguage[lang]`.
- All 8 Regular runners have `js/bundled-level-voices.js` with `pickRandomBundledVariants()` returning `{ warmUp, serious, nerds, genius }`. Shorts runners do NOT have this file.
- All 16 runners have `js/saved-scripts.js` with `captureCurrentScriptObject()` and a script-apply path that calls `pickRandomBundledVariants()` (Regular) on the loaded script.
- Cache-busting via `?v=N` tokens in each runner's `index.html`. Bump them when JS changes don't appear after reload.
- User memory: "Avoid edit storms with run_site live-reload — prefer one Write per file over many Edits". Each file gets ONE write.

---

## File Structure

For each runner, the changes are confined to two files:

- **`js/saved-scripts.js`** (modify) — capture at save, restore at load, run migration once on module init.
- **`index.html`** (modify) — bump `?v=N` tokens on `js/saved-scripts.js` (and any other JS we touch) so the browser pulls the new code.

No new files. The capture/restore/migration helpers live as private functions inside `saved-scripts.js` for each runner. Duplication across runners matches the existing pattern in this repo.

The Regular vs Shorts variance is handled by a single boolean at the top of each runner's `saved-scripts.js`:

```js
// Regular runners (have bundled-level-voices.js):
import { pickRandomBundledVariants } from "./bundled-level-voices.js";
const HAS_BUNDLED_VARIANTS = true;

// Shorts runners (no bundled-level-voices.js — provide a stub so the gated
// references in the helper functions resolve cleanly without runtime errors):
const HAS_BUNDLED_VARIANTS = false;
const pickRandomBundledVariants = () => ({});
```

All code paths that touch `pickRandomBundledVariants()` / `appState.bundledVoiceVariants` are gated by `HAS_BUNDLED_VARIANTS` so the Shorts stub is never actually called.

---

## Task 1: Runner 1 Regular — capture voice freeze at save time

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js` (around the existing `captureCurrentScriptObject` function, currently at lines 99–164)

- [ ] **Step 1: Add the `freezeVoicePicksForLevels` helper near the top of the file**

Insert just below the import block (after the line `import { renderVoiceTab } from "./voice-tab.js";`):

```js
import { getOrAssignRevealPhrase } from "./audio.js";

const HAS_BUNDLED_VARIANTS = true;

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
 *  suitable for storing inside the saved script. */
function snapshotLevelVoiceFreeze(level) {
    const cache = level && level.__revealPhraseByLanguage;
    if (!cache || typeof cache !== "object") return null;
    const out = {};
    for (const [lang, key] of Object.entries(cache)) {
        if (typeof key === "string" && key) out[lang] = key;
    }
    if (Object.keys(out).length === 0) return null;
    return { revealPhraseByLanguage: out };
}
```

- [ ] **Step 2: Call the freeze + snapshot inside `captureCurrentScriptObject`**

Find this block (lines 99–164):

```js
export function captureCurrentScriptObject(name) {
    const { els } = appState;
    const levelsToSave = appState.levelsData.map((lvl) => {
        ensureSlotFrontFaceScales(lvl);
        return {
            isLogo: lvl.isLogo,
            ...
            slotPhotoIndexEntries: Array.from(lvl.slotPhotoIndexBySlot.entries()),
        };
    });

    return {
        name,
        folder: null,
        landing: { ... },
        lineup: { ... },
        transitions: captureTransitionSettings(),
        levels: levelsToSave,
    };
}
```

Modify by:
1. Adding `freezeVoicePicksForCurrentSession();` as the first line of the function body.
2. Adding `voiceFreeze: snapshotLevelVoiceFreeze(lvl) || undefined,` as a new field in each `levelsToSave` map entry.
3. Adding `voiceFreeze: HAS_BUNDLED_VARIANTS && appState.bundledVoiceVariants ? { bundledVariants: { ...appState.bundledVoiceVariants } } : undefined,` to the returned script object.

The diff target:

```js
export function captureCurrentScriptObject(name) {
    const { els } = appState;
    freezeVoicePicksForCurrentSession();
    const levelsToSave = appState.levelsData.map((lvl) => {
        ensureSlotFrontFaceScales(lvl);
        return {
            isLogo: lvl.isLogo,
            // …all existing fields unchanged…
            slotPhotoIndexEntries: Array.from(lvl.slotPhotoIndexBySlot.entries()),
            voiceFreeze: snapshotLevelVoiceFreeze(lvl) || undefined,
        };
    });

    return {
        name,
        folder: null,
        landing: { /* unchanged */ },
        lineup: { /* unchanged */ },
        transitions: captureTransitionSettings(),
        levels: levelsToSave,
        voiceFreeze: HAS_BUNDLED_VARIANTS && appState.bundledVoiceVariants
            ? { bundledVariants: { ...appState.bundledVoiceVariants } }
            : undefined,
    };
}
```

- [ ] **Step 3: Manual sanity check — open the runner, click Save on an existing setting, then inspect `localStorage.getItem("footballQuizScripts_lineups_regular_fcbnew")` in DevTools**

Expected: the JSON for the saved entry now contains a top-level `voiceFreeze.bundledVariants` map AND each `levels[i]` has `voiceFreeze.revealPhraseByLanguage`. (Skip this if doing subagent execution — the smoke test in Task 4 covers it.)

- [ ] **Step 4: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js"
git commit -m "feat(runner-1-regular): freeze voice picks into saved scripts at save time"
```

---

## Task 2: Runner 1 Regular — restore voice freeze at load time

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js` (around the `applyScriptObject` function, lines 1380–1428)

- [ ] **Step 1: Add the `restoreLevelVoiceFreeze` helper next to the existing helpers**

Add below `snapshotLevelVoiceFreeze`:

```js
/** Hydrate level.__revealPhraseByLanguage from a saved voiceFreeze blob.
 *  getOrAssignRevealPhrase already short-circuits when a cached pick exists,
 *  so this is the only restore step needed for reveal phrases. */
function restoreLevelVoiceFreeze(level, frozen) {
    if (!level || !frozen || typeof frozen !== "object") return;
    const src = frozen.revealPhraseByLanguage;
    if (!src || typeof src !== "object") return;
    const out = {};
    for (const [lang, key] of Object.entries(src)) {
        if (typeof key === "string" && key) out[lang] = key;
    }
    if (Object.keys(out).length === 0) return;
    level.__revealPhraseByLanguage = out;
    // Legacy single-key cache used by older code paths — keep in sync.
    if (typeof out.english === "string") level.__revealPhrase = out.english;
    else if (typeof out.spanish === "string") level.__revealPhrase = out.spanish;
}
```

- [ ] **Step 2: Wire restoration into `applyScriptObject` — per-level**

In `applyScriptObject`, around line 1380, find the `appState.levelsData = script.levels.map((lvl) => { ... })` block. Inside the map callback, after `ensureSlotFrontFaceScales(merged);` and before `return merged;`, add:

```js
restoreLevelVoiceFreeze(merged, lvl.voiceFreeze);
```

- [ ] **Step 3: Wire restoration of the bundled milestone variants**

Find the existing line (around line 1422):

```js
appState.bundledVoiceVariants = pickRandomBundledVariants();
```

Replace with:

```js
if (HAS_BUNDLED_VARIANTS) {
    const frozen = script.voiceFreeze && script.voiceFreeze.bundledVariants;
    appState.bundledVoiceVariants =
        frozen && typeof frozen === "object" && Object.keys(frozen).length > 0
            ? { ...frozen }
            : pickRandomBundledVariants();
}
```

- [ ] **Step 4: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js"
git commit -m "feat(runner-1-regular): restore frozen voice picks when loading a saved script"
```

---

## Task 3: Runner 1 Regular — bulk-migrate existing saves on module init

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js` (add migration after the existing `migrateLegacyLineups()` call at line 75)

- [ ] **Step 1: Add the migration helper next to `migrateLegacyLineups`**

After the existing `migrateLegacyLineups` function (after line 73), add:

```js
const VOICE_FREEZE_MIGRATION_FLAG = "footballQuizVoiceFreezeMigrated_lineups_regular_v1";

/** Walk every persisted script and bake in voiceFreeze for any that lack it.
 *  Idempotent: marked complete via a localStorage flag; safe to re-run if the
 *  flag is cleared manually. */
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

        // Script-level: bundled milestone variants (Regular runners only)
        if (HAS_BUNDLED_VARIANTS && !script.voiceFreeze) {
            script.voiceFreeze = { bundledVariants: { ...pickRandomBundledVariants() } };
            changed = true;
        }

        // Per-level: reveal phrases. Synthesize a throwaway level object,
        // let getOrAssignRevealPhrase write into its __revealPhraseByLanguage
        // using the same RNG path the live UI uses, then snapshot it back into
        // the persisted level entry. Safe to call at module-init time —
        // audio.js has finished its top-level by the time saved-scripts.js's
        // top-level runs (saved-scripts.js imports audio.js).
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
        try {
            localStorage.setItem(KEY_SCRIPTS, JSON.stringify(scripts));
            // Trigger server sync next time it flushes; the in-memory savedScripts
            // var is re-read from localStorage below at line 77.
        } catch { /* quota or serialization failure — best-effort */ }
    }
    localStorage.setItem(VOICE_FREEZE_MIGRATION_FLAG, "1");
}

migrateVoiceFreeze();
```

**NOTE on the per-level migration:** Calling `getOrAssignRevealPhrase` against a synthetic empty level object advances the shared English / Spanish phrase queues in `audio.js`. That's fine — the user hasn't started playing yet at module-init time, so the queue state is "fresh" anyway, and a few extra advances at migration time has the same effect as the user playing a few levels would. After migration runs, the live phrase queue resumes from wherever it left off.

- [ ] **Step 2: Place the call after `migrateLegacyLineups()`**

Find the existing line:

```js
migrateLegacyLineups();
```

Add immediately below:

```js
migrateVoiceFreeze();
```

- [ ] **Step 3: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/js/saved-scripts.js"
git commit -m "feat(runner-1-regular): bulk-migrate existing saves with voice freeze"
```

---

## Task 4: Runner 1 Regular — bump cache buster + smoke test

**Files:**
- Modify: `1_Guess The Football Team Name - Main Runner - Regular/index.html`

- [ ] **Step 1: Bump `?v=` token on `saved-scripts.js` (and any other JS we touched)**

Find the line that loads saved-scripts.js — something like:

```html
<script type="module" src="./js/saved-scripts.js?v=NN"></script>
```

Increment `NN`. Since each runner has its own cache-buster counter, check the current value in this runner's index.html first.

If there is a global "bump all" token (rare), bump it once.

- [ ] **Step 2: Smoke test**

Start the dev server:

```bash
cd "1_Guess The Football Team Name - Main Runner - Regular"
python run_site.py
```

In a browser, with the dev page loaded:

1. **Create a fresh save:** Set up a session with 3+ levels, click Save under a new name.
2. **Inspect storage in DevTools:** `JSON.parse(localStorage.getItem("footballQuizScripts_lineups_regular_fcbnew"))[N]` where `N` is the index of the new save. Verify:
   - `voiceFreeze.bundledVariants` exists with four keys: `warmUp`, `serious`, `nerds`, `genius`.
   - Each `levels[i].voiceFreeze.revealPhraseByLanguage` exists with `english` (and `spanish` if Spanish playback was used).
3. **Reload + re-load the save:** Hard reload (Ctrl+F5), open the Saved tab, click the save. Open the Voice tab. The four milestone variants displayed (`In game: #X`) must match what they were before reload.
4. **Play a level:** Hit Play and listen — the reveal phrase MP3 should be the same one that played before reload.

- [ ] **Step 3: Verify bulk migration**

In DevTools:

```js
localStorage.removeItem("footballQuizVoiceFreezeMigrated_lineups_regular_v1");
// then refresh the page
JSON.parse(localStorage.getItem("footballQuizScripts_lineups_regular_fcbnew"))
    .forEach((s, i) => console.log(i, s.name, !!s.voiceFreeze?.bundledVariants));
```

Expected: every script logs `true` for `voiceFreeze.bundledVariants`.

- [ ] **Step 4: Commit**

```bash
git add "1_Guess The Football Team Name - Main Runner - Regular/index.html"
git commit -m "chore(runner-1-regular): bump cache buster for voice freeze rollout"
```

---

## Tasks 5–19: Mirror to the other 15 runners

Each of the following 15 runners gets the **same three changes** as Tasks 1–3 plus the cache-buster bump from Task 4. The only differences are:

- **`HAS_BUNDLED_VARIANTS`** is `true` for the 8 Regular runners and `false` for the 8 Shorts runners.
- **Storage key names** differ per runner — read each runner's `saved-scripts.js` header for `KEY_SCRIPTS` and use that name in the `VOICE_FREEZE_MIGRATION_FLAG` (replace the suffix after the underscore).
- **`pickRandomBundledVariants` import** — only present in Regular runners. For Shorts, omit the import AND drop the `if (HAS_BUNDLED_VARIANTS)` branches (since the flag is `false`, the dead code can be removed for clarity OR left in — pick consistency).

### Runner table

| # | Runner folder | `HAS_BUNDLED_VARIANTS` |
|---|---------------|------------------------|
| 5  | `2_Guess The Football National Team - Main Runner - Regular` | `true` |
| 6  | `2_Guess The Football National Team - Main Runner - Shorts`  | `false` |
| 7  | `3_Guess The Player By Carrer Path - Main Runner - Regular`  | `true` |
| 8  | `3_Guess The Player By Carrer Path - Main Runner - Shorts`   | `false` |
| 9  | `4_Guess The Player By Carrer Stats - Regular`               | `true` |
| 10 | `4_Guess The Player By Carrer Stats - Shorts`                | `false` |
| 11 | `5_Guess The Player By Club_Position_Country_Age - Regular`  | `true` |
| 12 | `5_Guess The Player By Club_Position_Country_Age - Shorts`   | `false` |
| 13 | `6_Guess The Fake Informaiton - Regular`                     | `true` |
| 14 | `6_Guess The Fake Informaiton - Shorts`                      | `false` |
| 15 | `7_Guess The Football Team Logo Name - Main Runner - Regular`| `true` |
| 16 | `7_Guess The Football Team Logo Name - Main Runner - Shorts` | `false` |
| 17 | `8_Guess The Football Player Name - Main Runner - Regular`   | `true` |
| 18 | `8_Guess The Football Player Name - Main Runner - Shorts`    | `false` |
| 19 | `1_Guess The Football Team Name - Main Runner - Shorts`      | `false` |

### Per-runner steps (for each row above)

- [ ] **Step 1: Read the runner's `js/saved-scripts.js` to find:**
  - Its `KEY_SCRIPTS` constant (the localStorage key name).
  - The exact line numbers of `captureCurrentScriptObject` and `applyScriptObject` (or the analogous load function — name may vary slightly).
  - Where `pickRandomBundledVariants` is currently called inside the load path (Regular only).
  - Whether `js/audio.js` exports `getOrAssignRevealPhrase` (it should — confirmed across all 16).

- [ ] **Step 2: Apply the three modifications from Tasks 1, 2, and 3 to this runner's `saved-scripts.js`** — same helper code, same wiring, with:
  - `HAS_BUNDLED_VARIANTS` set per the table.
  - `VOICE_FREEZE_MIGRATION_FLAG` value matching this runner's `KEY_SCRIPTS` namespace (e.g., `footballQuizVoiceFreezeMigrated_lineups_shorts_v1` if `KEY_SCRIPTS` is `footballQuizScripts_lineups_shorts_fcbnew`).
  - For Shorts: omit the `import { pickRandomBundledVariants } ...` line AND add the stub `const pickRandomBundledVariants = () => ({});` so the gated references in the helper code resolve cleanly at runtime.

- [ ] **Step 3: Bump `?v=` token in this runner's `index.html`** for any modified script tags.

- [ ] **Step 4: Smoke test this runner using the same procedure as Task 4 Step 2.**

- [ ] **Step 5: Commit (one commit per runner) using the message template:**

```bash
git add "<runner folder>/js/saved-scripts.js" "<runner folder>/index.html"
git commit -m "feat(<short-runner-id>): freeze voice picks into saved scripts"
```

Where `<short-runner-id>` is a slug like `runner-2-regular`, `runner-2-shorts`, etc.

---

## Task 20: Final cross-runner smoke pass

- [ ] **Step 1: Open each of the 16 runner pages in turn (no rebuild needed; the dev servers all share live-reload via run_site.py).**

For each runner:
1. Confirm the saved-scripts list still renders.
2. Click into one existing save → Voice tab should show frozen variants (Regular) or just play the same reveal phrase twice in a row (Shorts).
3. Save a new script → DevTools confirms `voiceFreeze` is present.

- [ ] **Step 2: Verify no regression in recording-preflight**

For runner 1 Regular only (it's the canonical preflight host), kick off a Record Video. The preflight overlay should still show "Pre-rolling randomness…" and the recording should play with the same reveal phrases as the Saved tab preview.

- [ ] **Step 3: Final commit + memory update**

```bash
git commit --allow-empty -m "chore: voice-freeze rollout complete across all 16 runners"
```

After this, add a `project_voice_freeze_save_schema.md` memory entry summarizing the new schema fields so future work on saved-scripts doesn't accidentally drop them.

---

## Risk notes

- **Save-time force-roll requires the audio module to be initialized.** `getOrAssignRevealPhrase` only needs `appState.levelsData` — no audio playback — so calling it from `captureCurrentScriptObject` is safe even if the user hasn't pressed Play yet. Confirmed by reading `audio.js` lines 781–799 (no DOM or audio context requirement).
- **Spanish phrase queue state is per-language and runs through the same `getOrAssignRevealPhrase` cache.** Calling `getOrAssignRevealPhrase(lvl, idx, "spanish")` for every level at save time will populate `__revealPhraseByLanguage.spanish` and is safe to call alongside the English version.
- **Server sync** uses `SAVE_SERVER.flushLocalAndServer()` — existing path. New fields are JSON-serializable so the server stores them transparently with no endpoint change.
- **Cache-buster bumps:** at least one per runner. If you forget, the browser keeps the old `saved-scripts.js` and the freeze silently doesn't apply.
