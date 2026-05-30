# Universal Recording Preflight — Design

**Date:** 2026-05-30
**Goal:** Pressing **Record** in *any* of the 16 runners must first download + cache every image and voice the recording will use (the visible `Preparing recording… X / Y` overlay), so playback never lags on a not-yet-loaded asset. Today this exists in **runner 1 Regular only**.

## Problem

`1_…Regular/js/recording-preflight.js` warms all assets and freezes random reveal picks before OBS connects. The other 15 runners have **no preflight** — Record goes straight to OBS, so the first appearance of each logo/photo/voice pays load/decode cost on the hot path.

A straight copy of runner-1's file fails: it imports `buildRevealVoiceCandidates`, `getHeaderLogoUrlChain`, `resolveHeaderTeamDisplayName`, which **do not exist in most runners** (verified). The runners diverge by quiz type.

## Record entry point (uniform — verified)

All 16 `js/recording-flow.js` export `startRecordingAndFullscreen` with identical structure: `loadObsConfig` (Step 1, fail-fast) → `obsRecorder.connect()`. Runner 1 inserts `runPreflight(language)` between them. Wiring the other 15 = the same insert.

## Approach (chosen: A — shared core + per-runner adapter)

### 1. Shared core — `.Storage/shared/recording-preflight-core.js` (new)
Holds everything identical across runners, lifted from runner-1's file:
- progress overlay (`Preparing recording…`, bar, `X / Y — label` status)
- chunked warming: images in batches of 24 (via shared `image-cache.js` `preloadImage`, which decodes), voices in batches of 8 (`canplaythrough`/`loadeddata` probe, 8s cap)
- the `N missing assets — Cancel / Record anyway` modal
- `shortPath` helper

Exports:
```
runPreflightCore({ preRoll, collectImageUnits, collectVoiceGroups }) -> Promise<{ proceed }>
```
- `preRoll()` — runner freezes its random reveal picks.
- `collectImageUnits()` -> `[{ label, urls: [primary, ...fallbacks] }]`. A unit is "missing" only if **all** its urls fail.
- `collectVoiceGroups()` -> `[{ label, urls: [candidate, ...] }]`. Group satisfied if **any** url loads (matches runtime fallback).

Warm-cache behavior: **let it flash** (no minimum visible time) — per user.

### 2. Per-runner `js/recording-preflight.js` (16 files, incl. rewriting runner 1)
Tiny adapter importing that runner's OWN modules. Exports `runPreflight(language)` that builds the three callbacks and calls the shared core. **Defensive:** each builder is wrapped so a missing/throwing export logs a warning and contributes `[]` instead of breaking Record.

### 3. Wiring — `js/recording-flow.js` (15 runners)
Add `import { runPreflight } from "./recording-preflight.js";` and the Step-2 block between `loadObsConfig` and `obsRecorder.connect`, mirroring runner 1. Preflight error = non-fatal (log + continue).

## Per-runner asset map (families)

Images everywhere: walk `levelsData` → `currentSquad` players → `playerPhotoPaths(player, lvl.displayMode)` (exists in ALL runners) + per-slot crest overrides + global `EMOJI_IMAGES`. Header logo per family.

| Family | Runners | Header logo source | Voice builder | Phrase | Name resolver |
|---|---|---|---|---|---|
| T | 1, 2 (Reg+Shorts) | `getHeaderLogoUrlChain` | team: `buildRevealVoiceCandidates` (1-Reg) else `buildTeamNameVoiceSrc`+`buildTeamPhraseVoiceSrc` | `getOrAssignRevealPhrase` | `resolveHeaderTeamDisplayName` |
| P | 3, 4 (Reg+Shorts) | `getClubLogoUrl`/`getClubSquadHeaderLogoLoadUrls` | `buildPlayerNameVoiceSrc`+`buildPlayerPhraseVoiceSrc` | `getOrAssignRevealPhrase` | `resolveClubAlias` |
| PC | 5, 6 (Reg+Shorts) | `getClubLogoUrl` | `buildPlayerNameVoiceSrc`+`buildTeamPhraseVoiceSrc` | `getOrAssignRevealPhrase`/`pickRevealPhraseForQuestion` | `resolveClubAlias` |
| LN | 7, 8 (Reg+Shorts) | `getClubLogoUrl` | `buildPlayerNameVoiceSrc`+`buildPlayerPhraseVoiceSrc` | `getOrAssignRevealPhrase` | `resolveClubAlias` |

Exact per-family voice URL chain is read from each family's reveal **playback** path in `audio.js` before writing the adapter, so preflight warms exactly what the recording plays (no false "missing"). Where a family's chain can't be confidently mapped, that adapter's `collectVoiceGroups` returns `[]` (images still warm) rather than risk wrong files.

## Shipped scope (v1 — 2026-05-31)

Built **safe-by-construction** because the 16-runner rollout can't be browser-verified by the author:

- **Images, all 15 new runners, WARM-ONLY.** New shared `collectTeamAssetUrls(opts)` in `prod-asset-validation.js` enumerates (probe-free) each runner's logos + starting-XI player photos (+ flags/crests when the runner supplies those fns) + per-slot crest overrides; the adapter adds emoji sprites. It reuses each runner's render-path `playerPhotoPaths` (pre-decodes the exact rendered URL). `imagesBlocking:false` → a missing image is skipped, **never** a blocking modal, so preflight can never abort a record (worst case = an asset isn't pre-warmed, identical to today).
- **One identical adapter** (`js/recording-preflight.js`) copied to all 15, using only exports present in every runner (`appState`, `projectAssetUrl(Fresh)`, `FORMATIONS`, `pickStartingXI`, `playerPhotoPaths`, `EMOJI_IMAGES`) + the shared default logo chain — no per-runner import tailoring (a missing named import would break the whole module → break Record).
- **Runner 1 Regular left untouched** — its proven bespoke preflight (with blocking voices) keeps working; not refactored onto the shared core to avoid risking it.
- Shared `recording-preflight-core.js` already supports best-effort/blocking **voices**; voice warming for the 15 is the documented **follow-up** (needs per-family display-name/`kind` derivation — T=team, P=`careerPlayer.name`, PC=`voiceKindForQuiz`, LN=`isFakeInfoQuiz`).

## Out of scope / unchanged
- `loading-overlay.js` stays the no-op (different feature; user disabled it deliberately).
- OBS flow, quiz logic, failure-modal UX unchanged.
- `999_Calander` has no `js/` runner app — not applicable.

## Verification
- Static: every adapter's imports resolve against that runner's real exports (grep export presence).
- Manual (user, no browser automation): hard-refresh one Regular + one Shorts + one career/stats runner, click Record, confirm `X / Y` overlay + no console errors. Editing `recording-flow.js` requires a **hard refresh**.
