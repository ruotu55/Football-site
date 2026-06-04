# Remotion renderer — runner 1 Regular

Frame-deterministic Remotion (React) renderer that reproduces the live app's **Play Video**
flow as an MP4 — same layout, animations, countdown, 0.78s card flip, transitions, audio, and
**timing** — instead of OBS screen-capture. Lives entirely in this `_Remotion` clone; the
original runner is untouched.

See the design + plan: `../docs/superpowers/specs/2026-06-03-remotion-rebuild-design.md`,
`../docs/superpowers/plans/2026-06-03-remotion-rebuild.md`.

## How a render is triggered (production path)
1. In the app, load a saved script and click **Record Video**.
2. The quality/fps modal (`js/remotion-config-modal.js`) → `js/remotion-render-client.js` POSTs
   `/__remotion-render` with `{ width, height, fps, script, language, stateJson }`.
   `stateJson` comes from `js/remotion-state-export.js` `buildRemotionState()`.
3. `run_site.py` writes a props file and spawns `npx remotion render src/index.ts Quiz <out>.mp4`,
   streaming progress over SSE. Output: `Ready videos/<language>/<script>.mp4`.
4. Assets (Images/, .Storage/) are served by `run_site.py` and loaded as
   `http://127.0.0.1:<port>/...` URLs (no asset copying).

## Render manually (dev)
Start the asset server in the runner folder:
`python run_site.py --no-browser --port 8975 --strict-port`
Then:
- Still:  `npx remotion still src/index.ts Quiz out/x.png --frame=N --props=sample-props.json`
- Video:  `npx remotion render src/index.ts Quiz out/v.mp4 --props=sample-props.json`
- Studio: `npx remotion studio src/index.ts`
- Tests:  `npx vitest run`  (timeline + envelope + transition-duration + asset-url)

`sample-props.json` is a real-asset dev fixture (Arsenal 4-3-3, 3 questions, how-many ending).

## Architecture
- `src/timeline.ts` — SOURCE OF TRUTH for timing. Pure, unit-tested; every constant cites the
  live-app source line. `buildTimeline()` returns phase offsets + per-question cues;
  `calculateMetadata` (src/Root.tsx) builds it + probes real voice durations.
- `src/QuizComposition.tsx` — maps timeline phases → `<Sequence>`s.
- `src/levels/` — LogoLevel, LandingLevel, QuestionLevel, OutroLevel.
- `src/pitch/` — Pitch + PlayerSlot (formation geometry, front flag / back photo, 0.78s flip),
  formations.ts.
- `src/CountdownRing.tsx`, `src/TeamHeader.tsx`, `src/BackgroundTheme.tsx`, `src/ProgressSteps.tsx`.
- `src/transitions/` — grid-overlay (default) + per-effect duration table.
- `src/audio/` — envelopes.ts (BGM duck math, tested), AudioTimeline.tsx (BGM/ticking/stinger/
  voices), bgmPlaylist.ts, voicePaths.ts.

## Studio mirrors Record Video

`remotion/studio-props.json` is what Remotion Studio (`npx remotion studio`) uses as its
default props for the `Quiz` composition (imported in `src/Root.tsx` as `defaultProps`).

- **Before any capture:** the file is the seeded OGC Nice sample (green `quiz-club-by-nat`
  theme, 3 questions). Studio shows that fixture on startup.
- **After Record Video:** `run_site.py` overwrites `studio-props.json` with the exact sanitized
  props it just passed to `npx remotion render` (same teams, photos, language, theme, voices).
  Studio hot-reloads the file automatically, so the preview instantly shows what you just recorded.

`studio-props.json` is tracked in git (the import must resolve at build/type-check time).
Runtime overwrites are local-only diffs — not pushed. Re-running Record Video always refreshes it.

## Status / validation TODO (Phase 6 follow-ups)
- **Timing** is verified against the app source (every `timeline.ts` constant cross-checked).
  The empirical double-check — diffing against a real `window.__audioTap` manifest captured from
  one live Play-through — is the one remaining confirmation; do it once and assert ±1 frame.
- `buildRemotionState()`'s resolved fields (slots/teamName/headerLogoRel/reveal+progress voice
  paths) are **browser-untested** — validate on the first real modal capture (each is try/caught
  to fail safe). Notably: club-XI slot flags resolve as `flagcdn.com` URLs (need internet at
  render time) — switch to local `Images/Nationality/...` if offline determinism is wanted.
- Spanish progress-voice filenames not yet mapped (EN done) in `voicePaths.ts`.
- Visual polish approximations: header panel tint (theme `color-mix`), the hatch `::before`
  pattern, national-team logo aliases.
