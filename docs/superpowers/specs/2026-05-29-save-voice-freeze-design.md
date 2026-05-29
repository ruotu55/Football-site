# Save Voice Freeze — Design

**Date:** 2026-05-29
**Scope:** All 16 quiz runners (runners 1–8, Regular + Shorts variants)

## Goal

Every saved script must persist the random voice picks used by that script, so that loading the save replays the same audio — same milestone voice variants, same per-level reveal phrases — instead of re-rolling on each load.

## Background

Each runner has two sources of voice randomness that affect playback:

1. **Bundled milestone variants** (Regular runners only) — `pickRandomBundledVariants()` in `js/bundled-level-voices.js` rolls one variant per milestone group (`warmUp`, `serious`, `nerds`, `genius`). Result lives on `appState.bundledVoiceVariants`. Currently re-rolled on every new level / every script load.
2. **Per-level reveal phrase** (all 16 runners) — `getOrAssignRevealPhrase(level, idx, lang)` in `js/audio.js` picks one phrase key per level per language. Result cached on `level.__revealPhraseByLanguage[lang]`. Sticky within a session but not persisted to disk.

Other randomness (BGM track, visual transitions, emojis) is **out of scope** — the user only wants voices frozen.

Runner 6 (Fake Information) has a kind-aware sentence queue (`team` / `player`) — the per-level result still lands in `level.__revealPhrase` via the same code path, so no special schema is needed.

## Save schema additions

Both fields are optional. Saves without them load via the legacy path (see migration below).

**Top-level on the script object** (Regular runners only):

```js
script.voiceFreeze = {
  bundledVariants: { warmUp: 3, serious: 1, nerds: 2, genius: 5 }
}
```

**Per-level inside `script.levels[i]`** (all 16 runners):

```js
level.voiceFreeze = {
  revealPhraseByLanguage: { en: "phrase-key-a", es: "phrase-key-b" }
}
```

## Save-time capture (force-roll on save)

In each runner's `js/saved-scripts.js` `captureCurrentScriptObject()`:

1. **Force-roll missing picks:**
   - If `appState.bundledVoiceVariants` is missing or empty (Regular only): call `pickRandomBundledVariants()` and assign.
   - For every level: call `getOrAssignRevealPhrase(level, idx, "en")` and `getOrAssignRevealPhrase(level, idx, "es")`. These functions already cache on `level.__revealPhraseByLanguage` and are idempotent.
2. **Snapshot into the script object:**
   - `script.voiceFreeze = { bundledVariants: { ...appState.bundledVoiceVariants } }` (Regular).
   - For each `script.levels[i]`: `levels[i].voiceFreeze = { revealPhraseByLanguage: { ...level.__revealPhraseByLanguage } }`.

After capture, every level in the saved object has phrases for both languages and (for Regular) the bundled-variant map is complete.

## Load-time restore

In each runner's `js/saved-scripts.js`, at the point where the loaded script's levels are restored into state (currently calls `pickRandomBundledVariants()` immediately after — see runner 1's line ~1422):

1. **Per-level reveal phrases (all 16):** For each loaded level, if `level.voiceFreeze?.revealPhraseByLanguage` exists, copy it into `level.__revealPhraseByLanguage`. `getOrAssignRevealPhrase()` already short-circuits when the cache is populated, so no other code change is required.
2. **Bundled milestones (Regular only):** If `script.voiceFreeze?.bundledVariants` exists, set `appState.bundledVoiceVariants = { ...script.voiceFreeze.bundledVariants }` and **skip** the auto-call to `pickRandomBundledVariants()`. If the field is missing (legacy save that somehow escaped migration), fall back to rolling fresh.

## Bulk migration of existing saves

Runs once per runner on app boot, idempotent:

1. Read all save records from this runner's localStorage key (`footballQuizScripts_<runner-storage-key>` — name varies per runner).
2. For each save, if `script.voiceFreeze` already exists AND every `script.levels[i].voiceFreeze` exists, skip.
3. Otherwise, run the same force-roll + snapshot path used by `captureCurrentScriptObject()`, but against the loaded save object (not the current session state).
4. Write each upgraded save back to localStorage and trigger the existing server-sync flush.

Migration runs **before** the user interacts with the save list, so by the time the UI is usable every save is sticky. A version flag in localStorage (`footballQuizScripts_voiceFreezeMigrated_v1 = true`) prevents re-runs after a refresh.

## Per-runner deltas

| Runner | Bundled variants? | Per-level reveal phrase? | Notes |
|--------|-------------------|--------------------------|-------|
| 1 Regular | Yes | Yes | Canonical case |
| 1 Shorts | No | Yes | Skip step 2 of load + step 1a of capture |
| 2 Regular | Yes | Yes | Same as runner 1 Regular |
| 2 Shorts | No | Yes | Same as runner 1 Shorts |
| 3 Regular | Yes | Yes | Player-reveal phrase (same `__revealPhrase` cache) |
| 3 Shorts | No | Yes | |
| 4 Regular | Yes | Yes | |
| 4 Shorts | No | Yes | |
| 5 Regular | Yes | Yes | |
| 5 Shorts | No | Yes | |
| 6 Regular | Yes | Yes | Kind-aware queue (team/player) — still caches into `__revealPhrase` |
| 6 Shorts | No | Yes | |
| 7 Regular | Yes | Yes | Uses `.career-team-quiz-card` element but same audio cache |
| 7 Shorts | No | Yes | |
| 8 Regular | Yes | Yes | |
| 8 Shorts | No | Yes | |

The schema and capture/restore code is identical across runners; only the **presence** of the `bundledVariants` field varies (Regular vs Shorts).

## Testing strategy

For each runner, manual smoke test:

1. Open the runner, create a new save with 3+ levels.
2. Reload page, open the save list, load the save.
3. Play back: the reveal phrase on each level must match the previous load (same MP3 file on disk).
4. For Regular: the milestone voices on the Voice tab must show the same variant numbers as the previous load.
5. Repeat on a fresh browser profile to confirm server-sync brings the freeze along.

Bulk migration smoke: keep a pre-migration backup of one runner's save file. After running the migration, every save should have `voiceFreeze` on the script and on every level entry.

## Risk / blast radius

- Each runner's `saved-scripts.js` and `audio.js` get small edits; no cross-file API changes.
- Legacy load fallback (re-roll then snapshot) keeps the system resilient if migration ever misses a save.
- Server sync uses the existing `SAVE_SERVER.flushLocalAndServer()` path — no new endpoints.
- BGM and visual randomness stay untouched, per the scoping decision.
