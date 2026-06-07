# Play video → CapCut draft exporter — Design

**Date:** 2026-06-07
**Runner:** `1_Guess The Football Team Name - Main Runner - Regular`
**Proof-of-concept target:** Europa League save (`recording-status.json` block `1|long|2`), first level = **OGC Nice - France**, formation `3421`, displayMode `country`.
**CapCut target:** PC v8.7.0 — draft schema `version 360000` / `new_version 171.0.0`, time in **microseconds**, canvas 1920×1080, fps 30.

## Goal & success criteria

Produce a CapCut draft folder that:
1. **Opens in CapCut PC v8.7.0** and appears in the project list without error.
2. Plays **intro → 1 level (question + reveal) → ending**, as visually close to the Play video as CapCut allows.
3. Exposes **every element as its own editable layer** (background, pitch, each player circle, countdown, team-header logo/name/flag, outro logo/emojis, all text), individually selectable/movable.
4. Has voice + BGM + stinger + ticking audio on the timeline at the correct times.

Non-goals (first deliverable): multi-level loop, Shorts, generalization to other runners, pixel-accurate GSAP motion.

## Key facts established during exploration

- **Europa League background is a procedural CSS gradient**, not an image file → must be rasterized to a PNG.
- **Flags** come from remote `flagcdn.com`; **player photos** are `.webp`. CapCut *does* accept `.webp` + absolute repo paths (proven: the existing `0606` draft imports `…/Arsenal FC/Bukayo Saka/…webp`, `metetype: photo`). But on-screen circles are composited (round crop, white ring, perspective scale), so **rasterizing each element as displayed** gives the closest match.
- CapCut discovers drafts via `root_meta_info.json` → `all_draft_store[]` + a `draft_ids` counter. A draft folder needs `draft_content.json` + `draft_meta_info.json`; assets referenced by absolute `C:/…` path (forward slashes).
- A photo segment in `draft_content.json` references **6 helper materials** via `extra_material_refs` (speed, canvas, sound-channel-mapping, vocal stuff, etc.). These must be emitted per segment or the draft may not open cleanly. Clone the pattern from `0606`.
- Render/puppeteer infra already exists: `render/lib.mjs` `launchRenderPage()` (CDP virtual clock, `advanceOneFrame`, `captureJpeg`, `getManifest`, `getDurations`), `js/render-mode.js` exposes `window.__render`, `window.__audioManifest` (flow-relative `atMs`), `window.__renderSegment` gates.
- Audio manifest record shape: `{ atMs, type:"play"|"stop", kind:"voice"|"bgm"|"ticking"|"stinger", id, src?, volume?, index?, playlist?[] }`; durations via `window.__render.getDurations()` (`{src: durMs}`); paired `stop` events give `stopMs`. `render/audio-mux.mjs resolveSrc()` resolves relative srcs → absolute repo paths.

## Architecture — two stages

### Stage 1: Capture (`render/capture-scene.mjs`)
Built on `render/lib.mjs`. Drives the real page headlessly through the play flow, stopping at named **checkpoints**:
`intro-balls`, `intro-landing`, `question`, `reveal`, `outro`.

At each checkpoint, a `page.evaluate` walks a **whitelist of selectors** and returns, per element: `{ kind: "image"|"text", selector/id, rect (px in viewport), opacity, zIndex, text?, font {size,color,family,weight,align}? }`.

For **visual** elements, grab a **transparent per-element PNG**:
1. `Emulation.setDefaultBackgroundColorOverride` → alpha 0.
2. Set all other whitelisted elements `visibility:hidden` (preserves layout; absolute/fixed/flex-safe), keep target visible.
3. `Page.captureScreenshot({ format:"png", clip: targetRect, captureBeyondViewport:true })`.
4. Restore.

For **text**, record string + computed font props + rect (emitted later as editable CapCut text, not a PNG).

Audio: read `window.__audioManifest` + `getDurations()` directly (already flow-relative).

**Output:** `scene.json` (ordered layers with `{appearMs, disappearMs, rect, z, kind, png?|text+font}`) + a folder of per-element PNGs. Checkpoint virtual-times define each layer's `[appear, disappear]` window.

### Stage 2: Build (`render/build-capcut.mjs`)
Converts `scene.json` → a CapCut draft, anchored byte-compatibly to `0606`:
- Same `version`/`new_version`/`platform`/canvas; **microsecond** timings; fps 30.
- Visual PNG → `materials.videos[]` entry `type:"photo"` (path, width, height) + a track segment with `clip.transform`/`clip.scale` + the 6 cloned helper materials in `extra_material_refs`.
- Text → `materials.texts[]` (serialized rich-text `content`, font, color) + segment.
- Audio → `materials.audios[]` + segment on audio track(s); BGM trimmed/looped to its window; voices placed at `atMs` for their `durMs`/`stopMs`.
- **Coordinate mapping:** pixel rect → CapCut `clip.transform {x,y}` (center-origin, 1.0 = half-canvas) + `clip.scale` (PNG native px vs canvas). Calibrated against the known `0606` example (full-canvas bg, scale 1, transform 0) **before** generating all layers.
- **Transitions (approximated, editable):** circle front→back = two stacked segments with a flip/cross-dissolve at the reveal timestamp; phase boundaries = CapCut fade/transition materials.
- Stack order by captured `zIndex` → CapCut `render_index` / track order.

**Output & registration:** writes to `…\CapCut\User Data\Projects\com.lveditor.draft\<NAME>\` (`draft_content.json`, `draft_meta_info.json`, PNGs in a sibling assets folder by absolute path) + appends an `all_draft_store[]` entry and increments `draft_ids` in `root_meta_info.json`. Keeps a repo copy under `.Storage/capcut-export/`.

## Layers produced (one level)

- **Intro:** gradient-bg PNG · title (text) · subtitle (text) · questions-badge PNG — audio: quiz-title voice + BGM
- **Question:** gradient-bg PNG · pitch PNG · 11 circle-front PNGs · countdown PNG — audio: ticking
- **Reveal:** 11 circle-back PNGs · 11 name labels (text) · team-header logo PNG · team-header name (text) · header flag PNG — audio: reveal voice + stinger
- **Outro:** gradient-bg PNG · quiz-logo PNG · like×2 + subscribe×2 PNGs · title (text) · subtitle (text) — audio: ending voice + BGM

~60 layers total for one level.

## Decisions (confirmed with user)

- **Text → editable CapCut text layers** (string + approximate font), not flat PNG.
- **Circles → rasterized round PNGs** as displayed (most faithful), not raw rectangular photos.
- Build method = **scene-capture** (Approach 1), not static computed layout.

## Honest limitations

- Text carries the right string + approximate font; user adjusts typeface (CapCut uses its own fonts).
- Animations are approximations; **geometry & timing are faithful, motion is not** (no GSAP flip/ring-drain/bob).
- Coordinate mapping requires a one-time calibration verification before mass generation.

## Module plan

- `render/capture-scene.mjs` — checkpoint driver + per-element transparent PNG capture + scene.json emit (reuses `lib.mjs`).
- `render/capcut-schema.mjs` — helper-material templates + segment/material/text/audio builders cloned from `0606`.
- `render/build-capcut.mjs` — scene.json → draft folder + `root_meta_info.json` registration; coordinate calibration.
- Optional `render/capcut-export.mjs` — orchestrator (capture → build) + CLI; later a server endpoint / UI button if validated.
- Update `.Storage/docs/` (new topic doc) per the documentation rule once implemented.
