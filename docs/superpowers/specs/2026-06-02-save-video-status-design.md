# Save Video Status — design spec

**Date:** 2026-06-02
**Scope:** All 17 recording runners (quiz runners 1–9, Regular + Shorts). Server piece is in the shared `.Storage/Scripts`.

## Goal

Add a **Save Video Status** button under the Record Video button. When toggled ON for the
currently-loaded save, it freezes the **entire on-screen video configuration** so that loading
that save again — via the calendar **or** the controls — restores it exactly, instead of
rebuilding the lineup from defaults/Save Team files. Toggling OFF reverts to today's
rebuild-from-teams behavior. The toggle is **per-save**.

## Background / why it's needed

`captureCurrentScriptObject()` (saved-scripts.js) already snapshots the full per-level state:
`videoMode`, all Adjust Picture offsets (`silhouette*YOffset/ScaleX/ScaleY`, including
`*VideoOffset`, `*Normal*`, `*Shorts*`), `careerHistory` (the +/x team add/remove),
`careerClubsCount`, `careerSlotBadgeScales*` (the +/- size tweaks), `careerSlotYearNudges`
(up/down), photo-variant picks, custom names, formation, voiceFreeze, etc.

The gap is the **load path**: calendar blocks store only `teamsImportText` and
`resolveScriptForBlock()` (recording-queue.js) deliberately **rebuilds** the lineup from the
teams list + per-team Save Team files on every load — discarding the visual snapshot. This
feature adds a per-save freeze that makes the load apply the snapshot verbatim. It mirrors the
existing `voiceFreeze` pattern, extended to the whole visual state.

## Data model

A new field on each recording-status **block** (the calendar's source of truth, persisted in
`recording-status.json`):

```jsonc
"videoStatus": {
  "enabled": true,
  "savedAt": 1717300000000,
  "frozenScript": { /* exact output of captureCurrentScriptObject() */ }
}
```

- `enabled` — whether the freeze is active for this save.
- `frozenScript` — the point-in-time full snapshot (same shape a saved-script uses, so
  `applyScriptObject()` can consume it unchanged).
- Absent `videoStatus` (legacy blocks) ⇒ treated as disabled (rebuild as today). Backward compatible.

The block already may carry a `script`; `videoStatus.frozenScript` is stored separately so the
normal teams-rebuild path is untouched when disabled.

## Button

- `id="save-video-status-btn"`, placed directly under `#record-video-btn` in each runner's
  `index.html`; styled like the existing Save Team / FAB buttons (CSS reused).
- States:
  - **No active save loaded** → disabled, tooltip "Load a save first."
  - **Active save, frozen OFF** → label **"Save Video Status"** (neutral).
  - **Active save, frozen ON** → label **"Video Status: ON ✓"** (highlighted/green).
- Click behavior (2-state toggle):
  - OFF → ON: capture `captureCurrentScriptObject()` now, store as `frozenScript`, set
    `enabled = true`, persist to the block. Button flips to ON.
  - ON → OFF: set `enabled = false`, persist. Button flips to OFF. (`frozenScript` is kept but
    ignored; revert to rebuild on next load.)
  - To **update** a frozen snapshot after making new changes: toggle OFF then ON (re-captures).
- Hidden during Play/Record flows, like the other FABs.

## Persistence

New recording-status op, mirroring `setYoutube`, in the shared
`.Storage/Scripts/dev_server_recording_status.py`:

```
POST /__recording-status  { op: "setVideoStatus", key, videoStatus }   // videoStatus may be null to clear
```

Client helper `setVideoStatus(key, videoStatus)` added to each runner's
`recording-status-client.js` (or called inline). The button uses the active block key
(`appState.activeBlockKey`).

## Load path changes

Single branch added at both load entry points (recording-queue.js):

1. **Calendar block load** and **controls Saved-tab `onBlockClick`** → before
   `resolveScriptForBlock()` rebuild: if `block.videoStatus?.enabled && block.videoStatus.frozenScript`,
   call `applyScriptObject(block.videoStatus.frozenScript)` and skip the rebuild. Otherwise rebuild
   exactly as today.
2. `applyScriptObject()` already handles voiceFreeze backfill and asset wiring, so a frozen load
   behaves like a normal saved-script load.

The freeze does **not** change `teamsImportText` (still the source of truth for the teams list and
for the script name/episode metadata); it only overrides how the lineup/visuals are produced at
load time.

## Edge cases

- **Teams edited after freeze:** the frozen visual state stays (point-in-time) until re-capture
  (toggle OFF→ON) or disable. Confirmed desired.
- **EN/ES:** a block serves both languages. `frozenScript` is visual state; per-level voice is
  inside it via `voiceFreeze`, so both languages reproduce. Recording still walks EN then ES.
- **Regular vs Shorts:** the snapshot already carries both regular and shorts offset fields; each
  runner freezes/loads its own block. No cross-runner sharing.
- **Missing/foreign frozenScript** (e.g. snapshot from an incompatible older schema): if
  `applyScriptObject` throws, fall back to the rebuild path and surface a non-blocking warning.
- **PROD/preflight:** operate on the applied (frozen) state like any loaded save — no special case.

## Files touched (per runner unless noted)

- `index.html` — add the button under `#record-video-btn` (+ `?v=` bump if needed).
- `js/dom-bindings.js` — bind `els.saveVideoStatusBtn`.
- `js/recording-queue.js` — load branch (calendar + onBlockClick), button state refresh, click
  handler + persist call. (Logic may live in a small new `js/video-status.js` imported by
  recording-queue.js to keep files focused.)
- `js/recording-status-client.js` — `setVideoStatus` helper (where present).
- CSS — button styling (reuse FAB / Save Team styles; minimal additions).
- **Shared (once):** `.Storage/Scripts/dev_server_recording_status.py` — `setVideoStatus` op +
  validation; ensure the block-replace path preserves `videoStatus`.

## Testing / verification

1. Load a save, tweak Adjust Picture + add/remove a team + a +/- size nudge, click Save Video
   Status (ON). Reload via controls → state restored exactly. Reload via calendar → restored.
2. Toggle OFF → reload → reverts to rebuilt-from-teams default.
3. Re-capture: change something while ON is shown, toggle OFF→ON, reload → new state restored.
4. Legacy block with no `videoStatus` → loads via rebuild (unchanged).
5. Repeat smoke test on one Shorts runner and one non-"Main Runner" folder (e.g. 5, 6).
6. Confirm recording (EN→ES) uses the frozen visuals.

## Out of scope (YAGNI)

- Per-level (rather than per-save) freeze flags.
- A separate sidecar file (the block already stores script data).
- Sharing a frozen status across runners or across EN/ES as separate snapshots.
