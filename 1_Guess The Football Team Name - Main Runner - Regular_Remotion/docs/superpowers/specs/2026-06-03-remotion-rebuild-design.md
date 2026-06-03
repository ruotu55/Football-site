# Remotion Rebuild — `1_..._Regular_Remotion` Design

**Date:** 2026-06-03
**Scope:** The folder `1_Guess The Football Team Name - Main Runner - Regular_Remotion` ONLY.
No sibling runners and **not** the original `..._Regular` folder are touched. This is a clone
of `..._Regular` (minus the old Puppeteer `render/`, caches) in which we build a **Remotion
(React) frame-deterministic renderer** that replaces the old headless-Chrome renderer the user
has rejected.

## Goal

Produce an MP4 that reproduces the **Play Video** flow of this quiz — same layout, animations,
countdown, card flips, transitions, background, photos, and **exact timing** — rendered
frame-by-frame by **Remotion** instead of by running the live app. The user explicitly wants
timing to match the live app exactly ("see that the timing of each thing is correct and the
same"), so the timing contract below is the source of truth and must be QA-verified.

- **Engine:** Remotion 4.x (`@remotion/cli`, `@remotion/media-utils`), React + TypeScript.
- **Trigger:** clicking `#record-video-btn` opens a Quality/FPS config modal, then POSTs to the
  Python server, which spawns `npx remotion render`.
- **Output:** `Ready videos/<language>/<savedScriptName>.mp4` (mirrors the existing Record path).
- **Languages:** current selected language only per click (EN+ES double-render is out of scope).
- **Honesty note:** Remotion renders React, not the live vanilla-JS app, so the output will be a
  faithful *re-creation*, not a byte-for-byte capture. Timing is made identical by construction
  (the contract below); pixels are tuned to match in the QA phase.

---

## The Timing Contract (verified against source — the heart of this build)

All values verified by reading the cloned source. Regular (non-shorts) flow only.

### Level structure
`levelsData` indices: **0 = Logo**, **1 = Landing**, **2 … (totalLevelsCount-1) = Questions**,
**totalLevelsCount = Outro**. (A "bonus" last question may be skipped depending on ending type.)

### Phase timings (ms unless noted)

| Phase / event | Value | Source |
| --- | --- | --- |
| Logo: voice (`playRules(type, 0)`) | starts @ **500** | video.js:47,177 |
| Logo: `.reveal` class added | @ **2000** (`LOGO_PAGE_PLAY_VIDEO_DELAY_MS`) | video.js:18,194 |
| Logo: `runVideoStep()` | @ 2000 + **1200** = 3200 | video.js:196 |
| Logo: reveal→switch delay | **1000** (`delay` for index 0) then `flipDelay` **1000** → `switchLevel(1)` | video.js:258,360,388 |
| Inter-level stage transition | **820** (`LEVEL_SWITCH_STAGE_TRANSITION_MS` / `STAGE_VIDEO_TRANSITION_MS`) **OR** custom-transition promise + **200** | video.js:51,227-238; levels.js:23 |
| Landing (reached from logo): `runVideoStep` delay | **500** (index 1, not 0) | video.js:258 |
| Landing: reveal→switch | `flipDelay` **1000** → `switchLevel(2)` | video.js:360,388 |
| Landing (started *directly* at idx 1): voice delay | **1000** (`LANDING_QUIZ_VOICE_DELAY_MS`), then voice-gated → `switchLevel(2)` | video.js:49,207-217 |
| Question countdown | **10 × 1000** = 10000 (setInterval 1000ms ×10) | video.js:266,303 |
| Countdown ring | `stroke-dashoffset` 0 → **283**, `1s linear` per tick, drains uniformly over 10s | video.js:289-313 |
| Countdown color: green >6, yellow >3, pulse ≤3 | thresholds | video.js:273-283,314 |
| Ticking sound | starts @ **(10-3)·1000 = 7000**, stops @ **10000** | video.js:299-302 |
| Reveal: stinger | @ reveal + **150** (`playTheAnswerIs(...,150,...)`) | video.js:378 |
| Reveal: hold before next level (`flipDelay`) | **3000** | video.js:382 |
| Card flip (`.slot-inner` → `.flipped`) | `rotateY 0→180°`, **0.78s** `cubic-bezier(0.25,1,0.5,1)`, no per-slot stagger | pitch.css:415-426 |
| Pitch-wrap height/transform sync | **0.78s** `cubic-bezier(0.25,1,0.5,1)` (matches flip) | pitch.css:15-16 |
| Bonus skip (last Q before outro, ending ≠ `how-many`) | `flipDelay = 0`, skip reveal | video.js:362-386 |
| Outro | `runVideoStep` returns immediately; outro voice (`playCommentBelow`) plays, then **1000** before stop | video.js:255-256; levels.js (outro path) |

### Audio mixing contract

| Constant | Value | Source |
| --- | --- | --- |
| `NORMAL_VOL` / `STARTING_VOL` | 1.0 | audio.js:201-202 |
| `DUCKED_VOL` (during any voice) | **0.2** | audio.js:203 |
| `BGM_CROSSFADE_MS` | **3000** | audio.js:204 |
| `BGM_CROSSFADE_BUFFER_S` | 0.15 | audio.js:205 |
| `RESTORE_WAIT_STANDALONE_MS` | 2500 | audio.js:211 |
| `RESTORE_WAIT_AFTER_CHAIN_MS` | 0 | audio.js:215 |
| `VOICE_CHAIN_GAP_MS` | 3000 | audio.js:218 |
| `RESTORE_FADE_MS` | 1500 | audio.js:219 |
| Duck-down fade | over the voice's `delayMs` (e.g. reveal 600, others 1000); `fadeBgm` = 20 steps | audio.js:226-255 |
| BGM session | per-save 5 songs (`appState.bgmSongs`), resolved → shuffled → looped with crossfade | audio.js:153-182 |
| Reveal stinger | `paths.revealStinger`, vol ~0.5, @ +150ms | audio.js (playTheAnswerIs) |
| Ticking | `paths.ticking`, last 3s of countdown | video.js:299-302 |

### Open items the implementation plan MUST extract precisely (not yet fully read)
1. **Transition effect catalog + durations** in `transitions.js` (Pixel Pop, Diamond Burst,
   Checker Flash, slide, etc.) — which one a saved script uses and its exact ms duration, since
   `scheduleAfterTransition` waits on `appState._transitionDone` (custom promise) + 200ms rather
   than the 820ms fallback when a custom transition runs. **Decision:** pick ONE deterministic
   transition to reproduce first (the default/most common), reproduce its real duration, and
   render the others in a later pass.
2. **Outro voice** exact path/trigger and the 1s tail (levels.js outro branch).
3. **Progress / bundled milestone voices** (`playProgressVoice`, warm-up etc.) — when they fire
   relative to the reveal, and their `delayMs`.
4. **Header / hatch / background theme** exact CSS durations (`team-header-hatch.js`,
   `background-theme.js`) for enter/exit.

---

## Architecture

Five units, all inside the `_Remotion` folder:

### Unit 1 — Config modal (`js/remotion-config-modal.js`, vanilla JS)
- Binds to `#record-video-btn` click (intercepts the existing handler in this clone only).
- Dark modal: **Resolution** (1080p → 1920×1080, 1440p → 2560×1440, 4K → 3840×2160) +
  **FPS** (30 / 60). Defaults: **1440p / 60** (matches the rejected renderer's target).
- On confirm: read `getActiveScriptName()`; require a loaded saved script (same guard as Record);
  serialize the **current on-screen state** (`appState.levelsData` + the per-save freeze fields:
  `bgmSongs`, reveal phrases, bundled voice variants, ending type) to a compact JSON; `POST`
  `/__remotion-render` with `{ width, height, fps, script, language, stateJson }`.
- Open a progress modal; subscribe to SSE; on done show output path; on error show message.
  (Reuse the existing `render-progress-ui.js` look.)

### Unit 2 — Server endpoint (`run_site.py`)
- `POST /__remotion-render`: validate saved script + resolve output path; write `stateJson` and
  probed audio durations to a temp props file; spawn
  `npx remotion render src/Root.tsx Quiz "<out>.mp4" --props=<file> --log=verbose` with
  `--width`/`--height`/`--fps` overrides; stream Remotion's progress to SSE.
- `GET /__remotion-render/progress?job=<id>` (SSE): forward `{pct, frame, stage}`; final
  `{stage:"done", path}` / `{stage:"error", message}`.
- Assets are served by this same server; the composition references them as
  `http://127.0.0.1:<port>/...` URLs (Remotion natively waits on remote `<Img>`/`<Audio>`),
  so we do NOT copy `Images/` or `.Storage/` into a Remotion `public/` folder.

### Unit 3 — Remotion entry (`remotion/src/Root.tsx`)
- One `<Composition id="Quiz">`, `component={QuizComposition}`, with **`calculateMetadata`**:
  - Read props (`width, height, fps, stateJson`).
  - Probe each voice/rules/outro/stinger duration via
    `@remotion/media-utils getAudioDurationInSeconds` against the served URLs.
  - Compute `durationInFrames` by summing the Timing Contract:
    `round( (logoBlock + transition + landingBlock + Σ questionBlocks(13s + transition) +
    outroBlock + tails) · fps )`, where voice-gated blocks use the probed durations.
- `width/height/fps` come straight from props (the modal's choice).

### Unit 4 — Composition (`remotion/src/QuizComposition.tsx` + components)
React, driven exclusively by `useCurrentFrame()` / `useVideoConfig()` / `interpolate()` /
`spring()` — NO `setTimeout`/`setInterval`/CSS transitions/animations. One `<Sequence>` per phase
at its absolute frame offset:

- `LogoLevel` — 2s + reveal.
- `TransitionOverlay` — reproduces the chosen transition effect across its exact frames.
- `LandingLevel` — voice-gated duration.
- `QuestionLevel` ×N — 10s countdown (`CountdownRing` strokeDashoffset 0→283 via interpolate;
  color/pulse thresholds) + 0.78s `CardFlip` (rotateY interpolate 0→180° with the matching
  cubic-bezier via `Easing.bezier(0.25,1,0.5,1)`) at the 10s mark + 3s reveal.
- `Pitch` / `PlayerSlot` ×11 — positions from `FORMATIONS[formationId]` (`{x,y}` %), placed with
  `transform: translate3d()` only (no top/margin); front face = flag/club logo
  (`slotFlagScales`/`slotTeamLogoScales` via `scale`), back face = player photo
  (`playerPhotoPaths()`); `backface-visibility:hidden`, `transform-style:preserve-3d`.
- `TeamHeader`, `BackgroundTheme`, `ProgressSteps` — re-created from existing CSS as frame
  functions.
- `OutroLevel` — voice-gated.
- **Audio timeline:** `<Audio>` layers — BGM session (5 songs, crossfaded, ducked to 0.2 during
  any voice via interpolated `volume`), `ticking` in the last 3s, `revealStinger` + answer voice
  at the reveal frame, progress/ending voices at their offsets. Volume envelopes reproduce the
  duck/crossfade constants above.
- **Data as props:** `currentSquad`, player photo paths, club logos, `Player_Name`, formation,
  scales, override paths — all passed down so any saved script renders deterministically.

### Unit 5 — Reused assets
Existing CSS is the visual reference. Where practical we import the existing stylesheets into the
Remotion composition (via `<style>`/`@remotion/...`), so colors/sizes/fonts match without manual
re-derivation; only time-based rules are replaced with frame math.

---

## Phasing (de-risk first; QA timing at every phase)

- **Phase 0 — Remotion harness + one static frame.** Scaffold `remotion/` (package.json, Root,
  trivial Quiz), confirm `npx remotion render` runs on this machine and the server can spawn it.
  Confirm served-URL `<Img>`/`<Audio>` load. **Gate:** a 1-frame PNG render of the logo.
- **Phase 1 — Logo + Landing + transition, silent.** Implement the two intro levels and the
  inter-level transition with exact frame offsets. **QA:** assert frame offsets vs the Timing
  Contract (logo voice@500, reveal@2000, step@3200, switch math, 820ms transition).
- **Phase 2 — One QuestionLevel, silent.** Countdown ring, color/pulse thresholds, the 0.78s
  flip at the 10s mark, 3s reveal, pitch with 11 slots + front/back faces. **QA:** ring offset at
  frames 0/300/600 (60fps), flip start frame = 10s·fps, flip span = 0.78s·fps.
- **Phase 3 — Full level chain + Outro, silent.** Loop N questions with transitions; bonus-skip
  branch; outro. **QA:** total `durationInFrames` equals the summed contract.
- **Phase 4 — Audio timeline.** BGM session + crossfade + duck envelopes, ticking, stinger,
  voices. **QA:** duck-down begins at each voice's start frame; ticking spans last 3s; stinger at
  reveal+150ms.
- **Phase 5 — Config modal + server endpoint + SSE progress.** Wire the button, the
  `/__remotion-render` spawn, and the progress modal. Output naming/path.
- **Phase 6 — Visual QA pass.** Render a real saved script; compare key frames against the live
  app; tune pixels (fonts, scales, background) to match; iterate.

## QA / Verification strategy (the user's explicit priority)

1. **Timing assertions in code** — a `remotion/src/timeline.ts` module computes every phase's
   absolute start/end frame from the contract constants; unit tests assert these against the
   verified ms values × fps (30 and 60). This is the single source of truth shared by
   `calculateMetadata` and every `<Sequence>`.
2. **Frame-offset table** dumped per render (`--log=verbose` + a debug overlay flag) so each
   phase boundary is checkable.
3. **Side-by-side frame compare** in Phase 6 against the live app at matching timestamps.
4. Every constant in the Timing Contract table is mirrored as a named constant in
   `timeline.ts` with a `// source: file:line` comment — no magic numbers.

## Risks & mitigations
- **Custom transition durations vary by effect** → reproduce one deterministic transition first;
  expand later (Open Item 1).
- **Voice-gated phases** → durations come from probed audio (`calculateMetadata`), not constants.
- **Pixel fidelity** (font rendering, Remotion vs Chrome) → import existing CSS; tune in Phase 6;
  accept "faithful re-creation, not capture."
- **Asset URLs in headless render** → served by the existing Python server; Remotion waits on
  remote media.
- **Scope discipline** → all new files live in the `_Remotion` folder; original runner untouched.

## Out of scope
- EN+ES double render per click.
- Shorts variant (this is the Regular runner).
- Applying to sibling runners.
- YouTube upload of the rendered file (existing flow untouched).
