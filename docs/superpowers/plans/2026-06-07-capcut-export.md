# Play video → CapCut draft exporter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the Runner-1 "Play video" flow (intro → 1 level → ending) for the Europa League save into an openable CapCut PC v8.7.0 draft where every visual element is its own editable layer and audio is placed on the timeline.

**Architecture:** Two stages. (1) A puppeteer **capture** stage drives the real page headlessly to named checkpoints and emits `scene.json` + a transparent PNG per element + the audio manifest. (2) A **build** stage converts `scene.json` into a CapCut draft, cloning material/segment shapes from the user's real `0606` draft for byte-compatibility, mapping pixel rects to CapCut transform/scale, and registering the draft in `root_meta_info.json`. Pure modules (coords, schema, registry) are built TDD-first and proven by opening a small calibration draft in CapCut before the capture stage is written.

**Tech Stack:** Node ESM (`.mjs`), built-in `node:test` + `node:assert` (no new deps), the existing `render/` puppeteer/CDP infra, CapCut PC v8.7.0 draft schema (`version 360000`, microsecond timings, canvas 1920×1080).

**Working dir:** `c:\Users\Rom\Documents\GitHub\Football Channel\1_Guess The Football Team Name - Main Runner - Regular` (the runner). New code lives under that runner's `render/capcut/`. CapCut drafts dir: `C:\Users\Rom\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft`.

**Reference spec:** `docs/superpowers/specs/2026-06-07-capcut-export-design.md`

---

## Coordinate model (used throughout — read once)

Capture forces viewport **1920×1080, deviceScaleFactor 1**, so an element's `getBoundingClientRect()` `{x,y,w,h}` is in canvas pixels. Each element is rasterized to a PNG of exactly `w×h` px.

CapCut auto-fits a photo material to the canvas by the **cover** factor `f = max(W/mw, H/mh)` (verified: `0606` bg 2560×1440 → `f=0.75`, renders 1920×1080 at `scale 1.0`). To render our `w×h` PNG at its native pixel size we set the segment `clip.scale = 1/f = min(w/W, h/H)`. To move its center to pixel `(cx,cy)` where `cx=x+w/2, cy=y+h/2`:
- `transform.x = (cx - W/2) / (W/2)`
- `transform.y = -(cy - H/2) / (H/2)`  (y-sign confirmed in the calibration task)

`W=1920, H=1080`. Time everywhere is **microseconds** (`ms*1000`).

---

## File structure

- `render/capcut/coords.mjs` — pure rect→CapCut transform/scale mapping. (TDD)
- `render/capcut/ids.mjs` — deterministic-but-unique uppercase UUID generator (seedable for tests). (TDD)
- `render/capcut/templates/photo-draft.template.json` — trimmed real `0606` draft used as the clone source for photo segments + helper materials.
- `render/capcut/templates/README.md` — how the templates were obtained + how to refresh them.
- `render/capcut/schema.mjs` — builders: `buildPhotoLayer`, `buildTextLayer`, `buildAudioLayer`, `assembleDraft`. Clones helper materials from the template. (TDD for shape)
- `render/capcut/registry.mjs` — `registerDraft()` (append to `root_meta_info.json`, bump `draft_ids`) + `writeDraftMeta()` (`draft_meta_info.json`). (TDD with temp dirs)
- `render/capcut/__tests__/*.test.mjs` — node:test unit tests.
- `render/capture-scene.mjs` — checkpoint driver + per-element transparent PNG capture → `scene.json` + PNGs. (integration)
- `render/build-capcut.mjs` — `scene.json` → draft folder, uses schema/coords/registry. (integration)
- `render/capcut-export.mjs` — CLI orchestrator (capture → build).

`scene.json` shape (the contract between the two stages):
```json
{
  "canvas": { "w": 1920, "h": 1080 },
  "fps": 30,
  "durationMs": 21000,
  "layers": [
    { "id": "intro-bg", "kind": "image", "png": "assets/intro-bg.png",
      "rect": { "x":0,"y":0,"w":1920,"h":1080 }, "z": 0,
      "appearMs": 0, "disappearMs": 6000, "fadeInMs": 0 },
    { "id": "intro-title", "kind": "text", "text": "GUESS THE FOOTBALL TEAM NAME",
      "rect": {"x":360,"y":300,"w":1200,"h":160}, "z": 10,
      "font": {"sizePx":88,"color":"#FFFFFF","align":"center","weight":700},
      "appearMs": 500, "disappearMs": 6000 }
  ],
  "audio": [
    { "kind":"voice", "src":"C:/.../quiz_title.mp3", "atMs":1000, "durMs":4200, "volume":1 },
    { "kind":"bgm", "src":"C:/.../song.mp3", "atMs":0, "durMs":21000, "volume":0.5 }
  ]
}
```

---

## Phase A — Pure modules + a draft that opens in CapCut (calibration)

Goal of Phase A: prove the draft pipeline and the coordinate math by hand-authoring a tiny `scene.json` (1 bg + 1 centered box) and opening the generated draft in CapCut. No capture code yet.

### Task A1: `coords.mjs` — rect → transform/scale

**Files:**
- Create: `render/capcut/coords.mjs`
- Test: `render/capcut/__tests__/coords.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// render/capcut/__tests__/coords.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRect } from "../coords.mjs";

test("full-canvas rect → scale 1, centered", () => {
  const r = mapRect({ x: 0, y: 0, w: 1920, h: 1080 });
  assert.ok(Math.abs(r.scale - 1) < 1e-9);
  assert.ok(Math.abs(r.transform.x - 0) < 1e-9);
  assert.ok(Math.abs(r.transform.y - 0) < 1e-9);
});

test("half-size centered box → scale 0.5, centered", () => {
  const r = mapRect({ x: 480, y: 270, w: 960, h: 540 });
  assert.ok(Math.abs(r.scale - 0.5) < 1e-9);
  assert.ok(Math.abs(r.transform.x) < 1e-9);
  assert.ok(Math.abs(r.transform.y) < 1e-9);
});

test("box in top-left quadrant → negative x, positive y", () => {
  const r = mapRect({ x: 0, y: 0, w: 960, h: 540 });
  // center at (480,270): tx = (480-960)/960 = -0.5 ; ty = -(270-540)/540 = +0.5
  assert.ok(Math.abs(r.transform.x + 0.5) < 1e-9);
  assert.ok(Math.abs(r.transform.y - 0.5) < 1e-9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test render/capcut/__tests__/coords.test.mjs`
Expected: FAIL — `Cannot find module '../coords.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// render/capcut/coords.mjs
export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** Map a pixel rect (in a CANVAS_W×CANVAS_H viewport) to CapCut clip transform+scale.
 *  Assumes the layer PNG is exactly w×h px. See plan "Coordinate model". */
export function mapRect({ x, y, w, h }, canvasW = CANVAS_W, canvasH = CANVAS_H) {
  const f = Math.max(canvasW / w, canvasH / h); // CapCut cover-fit factor
  const scale = 1 / f;                          // render PNG at native px
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    scale,
    transform: {
      x: (cx - canvasW / 2) / (canvasW / 2),
      y: -(cy - canvasH / 2) / (canvasH / 2),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test render/capcut/__tests__/coords.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "render/capcut/coords.mjs" "render/capcut/__tests__/coords.test.mjs"
git commit -m "feat(capcut): rect→transform/scale coordinate mapping"
```

### Task A2: `ids.mjs` — uppercase UUID generator

**Files:**
- Create: `render/capcut/ids.mjs`
- Test: `render/capcut/__tests__/ids.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// render/capcut/__tests__/ids.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { newId, makeIdFactory } from "../ids.mjs";

test("newId looks like an uppercase UUID", () => {
  const id = newId();
  assert.match(id, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
});

test("seeded factory is deterministic and unique per call", () => {
  const a = makeIdFactory(1);
  const b = makeIdFactory(1);
  const a1 = a(), a2 = a();
  assert.notEqual(a1, a2);
  assert.equal(a1, b()); // same seed → same first id
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test render/capcut/__tests__/ids.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// render/capcut/ids.mjs
import { randomUUID } from "node:crypto";

export function newId() {
  return randomUUID().toUpperCase();
}

// Seedable PRNG (mulberry32) for deterministic ids in tests.
export function makeIdFactory(seed = 0) {
  let s = seed >>> 0;
  const rnd = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hex = (n) => Math.floor(rnd() * 16 ** n).toString(16).padStart(n, "0").toUpperCase();
  return () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(8)}${hex(4)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test render/capcut/__tests__/ids.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "render/capcut/ids.mjs" "render/capcut/__tests__/ids.test.mjs"
git commit -m "feat(capcut): uppercase UUID generator (seedable)"
```

### Task A3: Extract the photo template from the real `0606` draft

**Files:**
- Create: `render/capcut/templates/photo-draft.template.json`
- Create: `render/capcut/templates/README.md`

- [ ] **Step 1: Copy the real draft content as the clone source**

Run (PowerShell):
```powershell
$src = "C:\Users\Rom\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft\0606\draft_content.json"
$dst = "render\capcut\templates\photo-draft.template.json"
New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
Copy-Item $src $dst -Force
(Get-Item $dst).Length
```
Expected: prints a size near `16800`.

- [ ] **Step 2: Sanity-check it parses and has a photo segment**

Run:
```powershell
$j = Get-Content "render\capcut\templates\photo-draft.template.json" -Raw | ConvertFrom-Json
"$($j.version) photos=$($j.materials.videos.Count) tracks=$($j.tracks.Count) refs=$($j.tracks[0].segments[0].extra_material_refs.Count)"
```
Expected: `360000 photos=... tracks=... refs=6` (the photo segment references 6 helper materials).

- [ ] **Step 3: Document provenance**

Write `render/capcut/templates/README.md`:
```markdown
# CapCut draft templates

`photo-draft.template.json` is a verbatim copy of a real, openable CapCut PC v8.7.0
draft (`…/com.lveditor.draft/0606/draft_content.json`). The build stage deep-clones
its photo segment + the 6 helper materials it references (speed / canvas /
sound_channel_mapping / vocal_separation / etc.) so generated drafts are byte-compatible
with this CapCut version.

To refresh after a CapCut update: create a draft in CapCut with one photo (+ later one
text caption, one audio clip), copy its draft_content.json here, and re-run the schema tests.
```

- [ ] **Step 4: Commit**

```bash
git add "render/capcut/templates/"
git commit -m "chore(capcut): vendor real 0606 draft as photo template"
```

### Task A4: `schema.mjs` — photo layer + draft assembly (clone-based)

**Files:**
- Create: `render/capcut/schema.mjs`
- Test: `render/capcut/__tests__/schema.test.mjs`

The builder loads the template, deep-clones its first photo segment and the helper materials in its `extra_material_refs`, regenerates all ids, and patches `material_name`, `path`, `width`, `height`, `clip` (from `coords.mapRect`), and `target_timerange`.

- [ ] **Step 1: Write the failing test**

```js
// render/capcut/__tests__/schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhotoLayer, assembleDraft } from "../schema.mjs";
import { makeIdFactory } from "../ids.mjs";

function fixtureLayer() {
  return {
    id: "box", kind: "image", png: "C:/tmp/box.png",
    rect: { x: 480, y: 270, w: 960, h: 540 }, z: 1,
    appearMs: 0, disappearMs: 5000, pngW: 960, pngH: 540,
  };
}

test("buildPhotoLayer produces a material + segment with 6 helper refs", () => {
  const ctx = { id: makeIdFactory(7) };
  const { material, segment, helpers } = buildPhotoLayer(fixtureLayer(), ctx);
  assert.equal(material.type, "photo");
  assert.equal(material.path, "C:/tmp/box.png");
  assert.equal(material.width, 960);
  assert.equal(material.height, 540);
  assert.equal(segment.material_id, material.id);
  assert.equal(segment.extra_material_refs.length, 6);
  assert.equal(helpers.length, 6);
  // timerange in microseconds
  assert.equal(segment.target_timerange.start, 0);
  assert.equal(segment.target_timerange.duration, 5_000_000);
  // centered half-size box → scale 0.5, transform 0,0
  assert.ok(Math.abs(segment.clip.scale.x - 0.5) < 1e-9);
  assert.ok(Math.abs(segment.clip.transform.x) < 1e-9);
});

test("assembleDraft yields required top-level keys + microsecond duration", () => {
  const draft = assembleDraft({
    name: "TEST", canvas: { w: 1920, h: 1080 }, fps: 30,
    layers: [fixtureLayer()], audio: [], texts: [],
  }, { idSeed: 3 });
  for (const k of ["canvas_config", "materials", "tracks", "duration", "fps", "version"]) {
    assert.ok(k in draft, `missing ${k}`);
  }
  assert.equal(draft.canvas_config.width, 1920);
  assert.equal(draft.canvas_config.height, 1080);
  assert.equal(draft.duration, 5_000_000);
  assert.ok(draft.materials.videos.length >= 1);
  assert.ok(draft.tracks.some((t) => t.type === "video"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test render/capcut/__tests__/schema.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// render/capcut/schema.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapRect } from "./coords.mjs";
import { makeIdFactory } from "./ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = JSON.parse(
  readFileSync(join(HERE, "templates", "photo-draft.template.json"), "utf8"),
);

const clone = (o) => JSON.parse(JSON.stringify(o));
const us = (ms) => Math.round(ms * 1000); // ms → microseconds

// Find the template's first photo segment + the helper materials it references.
function templatePhotoParts() {
  const seg = TEMPLATE.tracks.find((t) => t.type === "video").segments[0];
  const refIds = new Set(seg.extra_material_refs);
  const helperArrays = Object.entries(TEMPLATE.materials);
  const helpers = [];
  for (const [arrName, arr] of helperArrays) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) if (m && refIds.has(m.id)) helpers.push({ arrName, m });
  }
  const photoMat = TEMPLATE.materials.videos.find((v) => v.id === seg.material_id);
  return { seg, helpers, photoMat };
}

/** Build one photo layer: returns {material, segment, helpers:[{arrName,m}]} */
export function buildPhotoLayer(layer, ctx) {
  const id = ctx.id || makeIdFactory(0);
  const tpl = templatePhotoParts();

  const material = clone(tpl.photoMat);
  material.id = id();
  material.material_name = layer.png.split(/[\\/]/).pop();
  material.path = layer.png.replace(/\\/g, "/");
  material.width = layer.pngW;
  material.height = layer.pngH;

  // Regenerate helper ids; keep their arrName so assembleDraft can place them.
  const helpers = tpl.helpers.map(({ arrName, m }) => {
    const nm = clone(m);
    nm.id = id();
    return { arrName, m: nm, oldId: m.id };
  });
  const oldToNew = new Map(helpers.map((h) => [h.oldId, h.m.id]));

  const segment = clone(tpl.seg);
  segment.id = id();
  segment.material_id = material.id;
  segment.extra_material_refs = tpl.seg.extra_material_refs.map((r) => oldToNew.get(r) || r);
  segment.render_index = (layer.z ?? 0);
  segment.track_render_index = (layer.z ?? 0);

  const { scale, transform } = mapRect(layer.rect);
  segment.clip = {
    alpha: layer.alpha ?? 1,
    flip: { horizontal: false, vertical: false },
    rotation: 0,
    scale: { x: scale, y: scale },
    transform: { x: transform.x, y: transform.y },
  };
  segment.uniform_scale = { on: true, value: 1 };

  const dur = us((layer.disappearMs ?? 0) - (layer.appearMs ?? 0));
  segment.source_timerange = { start: 0, duration: dur };
  segment.target_timerange = { start: us(layer.appearMs ?? 0), duration: dur };

  return { material, segment, helpers };
}

/** Assemble a full draft object from layers (+ audio/texts handled in later tasks). */
export function assembleDraft(scene, opts = {}) {
  const id = makeIdFactory(opts.idSeed ?? 0);
  const ctx = { id };

  const draft = clone(TEMPLATE);
  draft.name = scene.name || "Football Quiz";
  draft.id = id();
  draft.fps = scene.fps || 30;
  draft.canvas_config = { background: null, height: scene.canvas.h, ratio: "original", width: scene.canvas.w };

  // Reset all material arrays + tracks; we rebuild from scene.
  for (const k of Object.keys(draft.materials)) {
    if (Array.isArray(draft.materials[k])) draft.materials[k] = [];
  }
  draft.tracks = [];

  const videoTrack = { type: "video", id: id(), attribute: 0, flag: 0, segments: [],
    is_default_name: true, name: "", render_index: 0 };
  draft.tracks.push(videoTrack);

  let endMs = 0;
  const imageLayers = (scene.layers || []).filter((l) => l.kind === "image");
  for (const layer of imageLayers) {
    const { material, segment, helpers } = buildPhotoLayer(layer, ctx);
    draft.materials.videos.push(material);
    for (const { arrName, m } of helpers) {
      if (!Array.isArray(draft.materials[arrName])) draft.materials[arrName] = [];
      draft.materials[arrName].push(m);
    }
    videoTrack.segments.push(segment);
    endMs = Math.max(endMs, layer.disappearMs ?? 0);
  }

  // (texts + audio appended by buildTextLayer/buildAudioLayer in later tasks)
  draft.duration = us(scene.durationMs || endMs);
  return draft;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test render/capcut/__tests__/schema.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "render/capcut/schema.mjs" "render/capcut/__tests__/schema.test.mjs"
git commit -m "feat(capcut): clone-based photo layer + draft assembly"
```

### Task A5: `registry.mjs` — write `draft_meta_info.json` + register in `root_meta_info.json`

**Files:**
- Create: `render/capcut/registry.mjs`
- Test: `render/capcut/__tests__/registry.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// render/capcut/__tests__/registry.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDraft } from "../registry.mjs";

test("registerDraft appends an entry and bumps draft_ids; idempotent by draft_id", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-"));
  writeFileSync(join(root, "root_meta_info.json"),
    JSON.stringify({ all_draft_store: [], draft_ids: 0, root_path: root }));
  const foldPath = join(root, "MYDRAFT");
  mkdirSync(foldPath);

  const entry = { draftId: "ABC-123", name: "MYDRAFT", foldPath, durationUs: 5_000_000,
    createUs: 1780000000000000, modifyUs: 1780000000000000 };
  registerDraft(join(root, "root_meta_info.json"), entry);
  registerDraft(join(root, "root_meta_info.json"), entry); // again → no dup

  const meta = JSON.parse(readFileSync(join(root, "root_meta_info.json"), "utf8"));
  assert.equal(meta.all_draft_store.length, 1);
  assert.equal(meta.draft_ids, 1);
  assert.equal(meta.all_draft_store[0].draft_id, "ABC-123");
  assert.equal(meta.all_draft_store[0].draft_name, "MYDRAFT");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test render/capcut/__tests__/registry.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// render/capcut/registry.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fwd = (p) => p.replace(/\\/g, "/");

/** Append/replace a draft entry in root_meta_info.json (idempotent by draft_id). */
export function registerDraft(rootMetaPath, e) {
  const meta = JSON.parse(readFileSync(rootMetaPath, "utf8"));
  if (!Array.isArray(meta.all_draft_store)) meta.all_draft_store = [];
  const rootPath = meta.root_path || meta.all_draft_store[0]?.draft_root_path || "";
  const entry = {
    cloud_draft_cover: false, cloud_draft_sync: false,
    draft_cloud_last_action_download: false, draft_cloud_purchase_info: "",
    draft_cloud_template_id: "", draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: fwd(join(e.foldPath, "draft_cover.jpg")),
    draft_fold_path: fwd(e.foldPath),
    draft_id: e.draftId, draft_is_ai_shorts: false, draft_is_cloud_temp_draft: false,
    draft_is_invisible: false, draft_is_web_article_video: false,
    draft_json_file: fwd(join(e.foldPath, "draft_content.json")),
    draft_name: e.name, draft_new_version: "",
    draft_root_path: rootPath, draft_timeline_materials_size: 0, draft_type: "",
    draft_web_article_video_enter_from: "", streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: "", tm_draft_cloud_entry_id: -1, tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1, tm_draft_cloud_space_id: -1, tm_draft_cloud_user_id: -1,
    tm_draft_create: e.createUs, tm_draft_modified: e.modifyUs, tm_draft_removed: 0,
    tm_duration: e.durationUs,
  };
  const i = meta.all_draft_store.findIndex((d) => d.draft_id === e.draftId);
  if (i >= 0) meta.all_draft_store[i] = entry;
  else { meta.all_draft_store.push(entry); meta.draft_ids = (meta.draft_ids || 0) + 1; }
  writeFileSync(rootMetaPath, JSON.stringify(meta));
}

/** Write a minimal draft_meta_info.json next to draft_content.json. */
export function writeDraftMeta(foldPath, e, mediaMaterials = []) {
  const meta = {
    draft_cover: "draft_cover.jpg", draft_fold_path: fwd(foldPath),
    draft_id: e.draftId, draft_name: e.name,
    draft_materials: [{ type: 0, value: mediaMaterials }, { type: 1, value: [] },
      { type: 2, value: [] }, { type: 3, value: [] }, { type: 6, value: [] }, { type: 7, value: [] }],
    draft_materials_copied_info: [], draft_removable_storage_device: "",
    draft_root_path: fwd(e.rootPath || ""), draft_segment_extra_info: [],
    tm_draft_cloud_entry_id: -1, tm_draft_create: e.createUs, tm_draft_modified: e.modifyUs,
    tm_draft_removed: 0, tm_duration: e.durationUs,
  };
  writeFileSync(join(foldPath, "draft_meta_info.json"), JSON.stringify(meta));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test render/capcut/__tests__/registry.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add "render/capcut/registry.mjs" "render/capcut/__tests__/registry.test.mjs"
git commit -m "feat(capcut): root_meta_info registration + draft_meta_info writer"
```

### Task A6: `build-capcut.mjs` (image-only) + CALIBRATION draft

**Files:**
- Create: `render/build-capcut.mjs`
- Create: `render/capcut/__tests__/calib.scene.json` (hand-authored fixture)
- Create two tiny PNGs for the fixture (generated in Step 1).

- [ ] **Step 1: Make calibration assets (a full-canvas bg + a centered red box)**

Run (PowerShell, uses .NET — no new deps):
```powershell
Add-Type -AssemblyName System.Drawing
$dir = "render\capcut\__tests__\calib-assets"
New-Item -ItemType Directory -Force $dir | Out-Null
# 1920x1080 dark green background
$bg = New-Object System.Drawing.Bitmap 1920,1080
$g = [System.Drawing.Graphics]::FromImage($bg)
$g.Clear([System.Drawing.Color]::FromArgb(255,30,80,60)); $g.Dispose()
$bg.Save((Resolve-Path $dir).Path + "\bg.png"); $bg.Dispose()
# 960x540 red box (PNG sized to the rect)
$box = New-Object System.Drawing.Bitmap 960,540
$g2 = [System.Drawing.Graphics]::FromImage($box)
$g2.Clear([System.Drawing.Color]::FromArgb(255,220,40,40)); $g2.Dispose()
$box.Save((Resolve-Path $dir).Path + "\box.png"); $box.Dispose()
"made bg.png + box.png"
```
Expected: `made bg.png + box.png`.

- [ ] **Step 2: Author the calibration scene**

Write `render/capcut/__tests__/calib.scene.json` (use the ABSOLUTE path printed by `(Resolve-Path "render\capcut\__tests__\calib-assets").Path` with forward slashes):
```json
{
  "name": "CAPCUT_CALIB",
  "canvas": { "w": 1920, "h": 1080 },
  "fps": 30,
  "durationMs": 5000,
  "layers": [
    { "id": "bg", "kind": "image", "png": "C:/.../calib-assets/bg.png",
      "pngW": 1920, "pngH": 1080, "rect": {"x":0,"y":0,"w":1920,"h":1080},
      "z": 0, "appearMs": 0, "disappearMs": 5000 },
    { "id": "box", "kind": "image", "png": "C:/.../calib-assets/box.png",
      "pngW": 960, "pngH": 540, "rect": {"x":480,"y":270,"w":960,"h":540},
      "z": 1, "appearMs": 0, "disappearMs": 5000 }
  ],
  "audio": []
}
```

- [ ] **Step 3: Write `build-capcut.mjs`**

```js
// render/build-capcut.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { assembleDraft } from "./capcut/schema.mjs";
import { registerDraft, writeDraftMeta } from "./capcut/registry.mjs";
import { newId } from "./capcut/ids.mjs";

const CAPCUT_ROOT =
  "C:/Users/Rom/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft";

// Microsecond wall-clock must be passed in (Date.now is fine here; not a render path).
export function buildDraftFromScene(scenePath, { capcutRoot = CAPCUT_ROOT, nowMs = Date.now() } = {}) {
  const scene = JSON.parse(readFileSync(scenePath, "utf8"));
  const draft = assembleDraft(scene, { idSeed: (nowMs % 1e9) | 0 });
  const draftId = newId();
  const name = scene.name || "Football Quiz";
  const foldPath = join(capcutRoot, name);
  mkdirSync(foldPath, { recursive: true });

  draft.id = draftId;
  draft.name = name;
  draft.path = foldPath.replace(/\\/g, "/");
  writeFileSync(join(foldPath, "draft_content.json"), JSON.stringify(draft));

  const e = { draftId, name, foldPath, rootPath: capcutRoot,
    durationUs: draft.duration, createUs: nowMs * 1000, modifyUs: nowMs * 1000 };
  // media list for draft_meta_info (photos)
  const media = draft.materials.videos.map((v) => ({
    create_time: Math.floor(nowMs / 1000), duration: draft.duration, id: v.id.toLowerCase(),
    file_Path: v.path, height: v.height, width: v.width, metetype: "photo",
    import_time: Math.floor(nowMs / 1000), import_time_ms: nowMs * 1000, type: 0,
    roughcut_time_range: { duration: -1, start: -1 }, sub_time_range: { duration: -1, start: -1 },
  }));
  writeDraftMeta(foldPath, e, media);
  registerDraft(join(capcutRoot, "root_meta_info.json"), e);
  return { foldPath, draftId };
}

// CLI: node render/build-capcut.mjs <scene.json> [draftName]
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const scenePath = process.argv[2];
  const r = buildDraftFromScene(scenePath);
  console.log("WROTE", r.foldPath, r.draftId);
}
```

- [ ] **Step 4: Generate the calibration draft**

Run: `node render/build-capcut.mjs render/capcut/__tests__/calib.scene.json`
Expected: prints `WROTE C:/Users/Rom/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft/CAPCUT_CALIB <id>`.

- [ ] **Step 5: MANUAL — open CapCut and verify (calibration gate)**

Open CapCut. Confirm:
1. A project named `CAPCUT_CALIB` appears and opens without error.
2. The dark-green bg fills the whole 1920×1080 canvas.
3. The red box is exactly half-size and centered.

If the box is off-center vertically, flip the `transform.y` sign in `coords.mjs` (remove the leading `-`), re-run Step 4, re-open. If the box is the wrong size, the cover-fit model is off — adjust `mapRect` `f` and re-run the coords tests. **Do not proceed past this gate until the calibration draft is correct.** Record the final confirmed `coords.mjs` in the commit.

- [ ] **Step 6: Commit**

```bash
git add "render/build-capcut.mjs" "render/capcut/__tests__/calib.scene.json" "render/capcut/__tests__/calib-assets/" "render/capcut/coords.mjs"
git commit -m "feat(capcut): image-only draft builder + verified calibration draft"
```

---

## Phase B — Text + audio layers

### Task B1: Obtain text + audio + transition templates from CapCut

**Files:**
- Modify: `render/capcut/templates/photo-draft.template.json` (replace with a richer template) OR add `render/capcut/templates/rich-draft.template.json`.

- [ ] **Step 1: MANUAL — build a sample draft in CapCut**

In CapCut, create one project that contains, on the timeline: **(a)** one photo, **(b)** one text/caption with some words, **(c)** one audio clip, **(d)** a transition between two photos. Save it. Note its folder under `…/com.lveditor.draft/<name>`.

- [ ] **Step 2: Vendor it**

Run (PowerShell, replace `<name>`):
```powershell
Copy-Item "C:\Users\Rom\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft\<name>\draft_content.json" `
  "render\capcut\templates\rich-draft.template.json" -Force
$j = Get-Content "render\capcut\templates\rich-draft.template.json" -Raw | ConvertFrom-Json
"texts=$($j.materials.texts.Count) audios=$($j.materials.audios.Count) transitions=$($j.materials.transitions.Count)"
```
Expected: `texts=1 audios=1 transitions=1` (or more).

- [ ] **Step 3: Update README + commit**

Append the new template's provenance to `templates/README.md`.
```bash
git add "render/capcut/templates/"
git commit -m "chore(capcut): vendor text/audio/transition template from CapCut"
```

### Task B2: `buildTextLayer` — editable CapCut text

**Files:**
- Modify: `render/capcut/schema.mjs`
- Test: `render/capcut/__tests__/schema-text.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// render/capcut/__tests__/schema-text.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTextLayer } from "../schema.mjs";
import { makeIdFactory } from "../ids.mjs";

test("buildTextLayer carries the string + microsecond timerange + transform", () => {
  const ctx = { id: makeIdFactory(2) };
  const { material, segment } = buildTextLayer({
    id: "t", kind: "text", text: "OGC NICE",
    rect: { x: 760, y: 460, w: 400, h: 120 }, z: 5,
    font: { sizePx: 64, color: "#FFFFFF", align: "center", weight: 700 },
    appearMs: 3000, disappearMs: 8000,
  }, ctx);
  // The visible string must appear somewhere in the serialized text material.
  assert.ok(JSON.stringify(material).includes("OGC NICE"));
  assert.equal(segment.material_id, material.id);
  assert.equal(segment.target_timerange.start, 3_000_000);
  assert.equal(segment.target_timerange.duration, 5_000_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test render/capcut/__tests__/schema-text.test.mjs`
Expected: FAIL — `buildTextLayer` not exported.

- [ ] **Step 3: Implement `buildTextLayer` (clone the rich template's text)**

Add to `render/capcut/schema.mjs`:
```js
import { readFileSync as _rf } from "node:fs";
const RICH = JSON.parse(_rf(join(HERE, "templates", "rich-draft.template.json"), "utf8"));

function hexToCapColor(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** Build one editable text layer by cloning the rich template's text material+segment. */
export function buildTextLayer(layer, ctx) {
  const id = ctx.id || makeIdFactory(0);
  const tplText = RICH.materials.texts[0];
  const tplSeg = RICH.tracks.find((t) => t.type === "text").segments[0];

  const material = clone(tplText);
  material.id = id();
  // CapCut stores rich text as a serialized JSON string in `content`.
  const [r, g, b] = hexToCapColor(layer.font?.color || "#FFFFFF");
  const content = {
    text: layer.text,
    styles: [{
      fill: { content: { solid: { color: [r, g, b] } } },
      range: [0, layer.text.length],
      size: (layer.font?.sizePx || 48),
      bold: (layer.font?.weight || 400) >= 600,
    }],
  };
  material.content = JSON.stringify(content);
  if ("words" in material) material.words = {};

  const segment = clone(tplSeg);
  segment.id = id();
  segment.material_id = material.id;
  segment.extra_material_refs = []; // text segments in template often have none/their own
  segment.render_index = layer.z ?? 100;
  const { transform } = mapRect(layer.rect);
  // text sizing is driven by font size; keep scale 1 and let user fine-tune
  segment.clip = { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0,
    scale: { x: 1, y: 1 }, transform: { x: transform.x, y: transform.y } };
  const dur = us((layer.disappearMs ?? 0) - (layer.appearMs ?? 0));
  segment.source_timerange = { start: 0, duration: dur };
  segment.target_timerange = { start: us(layer.appearMs ?? 0), duration: dur };
  return { material, segment };
}
```

Then extend `assembleDraft` to add a text track + append text layers (after the video loop):
```js
  const textLayers = (scene.layers || []).filter((l) => l.kind === "text");
  if (textLayers.length) {
    const textTrack = { type: "text", id: id(), attribute: 0, flag: 0, segments: [],
      is_default_name: true, name: "", render_index: 1 };
    for (const layer of textLayers) {
      const { material, segment } = buildTextLayer(layer, ctx);
      draft.materials.texts.push(material);
      textTrack.segments.push(segment);
      endMs = Math.max(endMs, layer.disappearMs ?? 0);
    }
    draft.tracks.push(textTrack);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test render/capcut/__tests__/schema-text.test.mjs`
Expected: PASS. Also re-run `node --test render/capcut/__tests__/` (all green).

- [ ] **Step 5: MANUAL gate** — add a text layer to `calib.scene.json`, rebuild, open in CapCut, confirm the text shows the right words near the right place. Adjust the `content` shape against `rich-draft.template.json` if CapCut shows empty text (the real template's `content` is the source of truth for the exact keys).

- [ ] **Step 6: Commit**

```bash
git add "render/capcut/schema.mjs" "render/capcut/__tests__/schema-text.test.mjs"
git commit -m "feat(capcut): editable text layers"
```

### Task B3: `buildAudioLayer` + audio tracks

**Files:**
- Modify: `render/capcut/schema.mjs`
- Test: `render/capcut/__tests__/schema-audio.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// render/capcut/__tests__/schema-audio.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAudioLayer } from "../schema.mjs";
import { makeIdFactory } from "../ids.mjs";

test("buildAudioLayer places audio at atMs for durMs with volume", () => {
  const ctx = { id: makeIdFactory(4) };
  const { material, segment } = buildAudioLayer(
    { kind: "voice", src: "C:/v/x.mp3", atMs: 1500, durMs: 4000, volume: 1 }, ctx);
  assert.equal(material.path, "C:/v/x.mp3");
  assert.equal(material.type, "extract_music"); // or template's audio type
  assert.equal(segment.target_timerange.start, 1_500_000);
  assert.equal(segment.target_timerange.duration, 4_000_000);
  assert.equal(segment.volume, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test render/capcut/__tests__/schema-audio.test.mjs`
Expected: FAIL — `buildAudioLayer` not exported.

- [ ] **Step 3: Implement `buildAudioLayer`** (clone rich template's audio material+segment)

Add to `render/capcut/schema.mjs`:
```js
export function buildAudioLayer(a, ctx) {
  const id = ctx.id || makeIdFactory(0);
  const tplAud = RICH.materials.audios[0];
  const tplSeg = RICH.tracks.find((t) => t.type === "audio").segments[0];

  const material = clone(tplAud);
  material.id = id();
  material.path = a.src.replace(/\\/g, "/");
  material.name = a.src.split(/[\\/]/).pop();
  if ("duration" in material) material.duration = us(a.durMs || 0);

  const segment = clone(tplSeg);
  segment.id = id();
  segment.material_id = material.id;
  segment.volume = a.volume ?? 1;
  segment.last_nonzero_volume = a.volume ?? 1;
  const dur = us(a.durMs || 0);
  segment.source_timerange = { start: 0, duration: dur };
  segment.target_timerange = { start: us(a.atMs || 0), duration: dur };
  return { material, segment };
}
```

Extend `assembleDraft` (after text): one audio track per `kind` group (bgm on its own track, voices on another) to avoid overlaps:
```js
  const audios = scene.audio || [];
  if (audios.length) {
    const byTrack = { bgm: [], voice: [] };
    for (const a of audios) (byTrack[a.kind === "bgm" ? "bgm" : "voice"]).push(a);
    for (const key of ["voice", "bgm"]) {
      if (!byTrack[key].length) continue;
      const track = { type: "audio", id: id(), attribute: 0, flag: 0, segments: [],
        is_default_name: true, name: "", render_index: 0 };
      for (const a of byTrack[key]) {
        const { material, segment } = buildAudioLayer(a, ctx);
        draft.materials.audios.push(material);
        track.segments.push(segment);
        endMs = Math.max(endMs, (a.atMs || 0) + (a.durMs || 0));
      }
      draft.tracks.push(track);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes** (adjust the expected `material.type` to whatever the real template uses — read `RICH.materials.audios[0].type`)

Run: `node --test render/capcut/__tests__/schema-audio.test.mjs`
Expected: PASS. Re-run the whole suite: `node --test render/capcut/__tests__/`.

- [ ] **Step 5: MANUAL gate** — add one real voice mp3 + one bgm to `calib.scene.json`, rebuild, open in CapCut, confirm both are on the timeline at the right time and play.

- [ ] **Step 6: Commit**

```bash
git add "render/capcut/schema.mjs" "render/capcut/__tests__/schema-audio.test.mjs"
git commit -m "feat(capcut): audio layers (voice + bgm tracks)"
```

---

## Phase C — Capture stage (real scene from the live page)

### Task C1: Checkpoint driver skeleton + audio manifest passthrough

**Files:**
- Create: `render/capture-scene.mjs`
- Reference (read, do not edit): `render/lib.mjs`, `js/render-mode.js`, `js/render-segments.js`.

- [ ] **Step 1: Implement the driver that loads the page in render mode and reaches the natural end, dumping the audio manifest**

```js
// render/capture-scene.mjs
import { launchRenderPage } from "./lib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Reuse the render harness but capture DOM layers at checkpoints instead of frames.
export async function captureScene({ script, lang = "english", port = 8888, outDir }) {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "assets"), { recursive: true });
  const r = await launchRenderPage({ script, lang, port, fps: 30, height: 1080 });
  try {
    await r.startFlow();
    // advance to natural end (single level → short)
    let n = 0;
    for (; n < 60 * 60 * 2; n++) {
      await r.advanceOneFrame();
      if (n % 30 === 0 && (await r.isDone())) break;
    }
    const manifest = await r.getManifest();
    const durations = await r.getDurations();
    writeFileSync(join(outDir, "manifest.json"),
      JSON.stringify({ manifest, durations }, null, 2));
    return { manifest, durations };
  } finally {
    await r.browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const out = process.argv[3] || "render/capcut/out/europa";
  await captureScene({ script: process.argv[2] || "Europa League", outDir: out });
  console.log("MANIFEST WRITTEN", out);
}
```

- [ ] **Step 2: Run against a live dev server** (start the runner's server first per the repo's run process; confirm port). 

Run: `node render/capture-scene.mjs "Europa League" render/capcut/out/europa`
Expected: `render/capcut/out/europa/manifest.json` exists and contains a non-empty `manifest` array with `voice`/`bgm` events. (If empty, confirm the dev server is up and the script name matches the save.)

- [ ] **Step 3: Commit**

```bash
git add "render/capture-scene.mjs"
git commit -m "feat(capcut): capture driver — audio manifest passthrough"
```

### Task C2: Per-element transparent PNG capture at checkpoints

**Files:**
- Modify: `render/capture-scene.mjs`
- Modify: `js/render-mode.js` (add a small `window.__captureLayers()` helper that returns the whitelist of visible elements with rects/opacity/text/font, and toggles sibling visibility for isolation). Reference selectors from the spec.

- [ ] **Step 1: Add `window.__captureLayers(checkpoint)` in `js/render-mode.js`**

It returns, for the given checkpoint, an array of `{ id, kind, rect, opacity, z, text?, font? }` from the whitelist. Whitelist per phase (selectors confirmed during exploration):
- intro: `#landing-title`(text), `#landing-subtitle`(text), `.landing-questions-line`(image), the stage background (image, captured from `body`/`#stage-main` bg).
- question: pitch bg (`#pitch-svg` container, image), each `.player-slot .slot-front`(image, 11), `#countdown-timer`(image).
- reveal: each `.player-slot .slot-back`(image, 11), each `.slot-name`(text, 11), `#team-header-logo`(image), `#team-header-name`(text), `#team-header-flag`(image).
- outro: stage background(image), `.logo-img-anim`(image), `.outro-action`/`.outro-action-bottom`(image ×4), `#outro-title`(text), `#outro-subtitle`(text).

```js
// in js/render-mode.js (render-only)
window.__captureLayers = (checkpoint) => {
  const W = { /* checkpoint -> [{sel, kind, all?:true}] per the lists above */ };
  const out = [];
  const px = (n) => Math.round(n);
  const list = W[checkpoint] || [];
  let z = 0;
  for (const spec of list) {
    const nodes = spec.all ? document.querySelectorAll(spec.sel)
                           : [document.querySelector(spec.sel)].filter(Boolean);
    nodes.forEach((el, i) => {
      const rb = el.getBoundingClientRect();
      if (rb.width < 1 || rb.height < 1) return;
      const cs = getComputedStyle(el);
      const layer = { id: `${checkpoint}-${spec.id || spec.sel.replace(/\W+/g,"")}-${i}`,
        kind: spec.kind, z: z++,
        rect: { x: px(rb.x), y: px(rb.y), w: px(rb.width), h: px(rb.height) },
        opacity: Number(cs.opacity) };
      if (spec.kind === "text") {
        layer.text = el.textContent.trim();
        layer.font = { sizePx: parseFloat(cs.fontSize), color: rgbToHex(cs.color),
          align: cs.textAlign, weight: parseInt(cs.fontWeight) || 400 };
      }
      out.push(layer);
    });
  }
  return out;
};
function rgbToHex(rgb){const m=rgb.match(/\d+/g)||[255,255,255];
  return "#"+m.slice(0,3).map(n=>(+n).toString(16).padStart(2,"0")).join("").toUpperCase();}
```
Bump the `?v=` token on `render-mode.js`'s importer per the repo cache-busting rule.

- [ ] **Step 2: Add isolation + screenshot helpers in `js/render-mode.js`**

```js
window.__isolateForShot = (id) => {
  // hide every other capture node via visibility:hidden, keep target visible
  const all = window.__lastLayerNodes || [];
  // (store node refs in __captureLayers; map id->node)
};
```
Simpler robust approach: in `captureScene`, drive isolation from Node via `page.evaluate` that takes a CSS selector + index, sets all whitelisted nodes `visibility:hidden`, then the one target `visible`, returns its rect; then CDP screenshot that rect with transparent bg; then restore. Implement that in C2-Step3.

- [ ] **Step 3: In `render/capture-scene.mjs`, capture each layer's PNG**

For each checkpoint reached (gate by advancing the virtual clock to the checkpoint's frame — reuse `window.__renderSegment`-style markers, or detect DOM state), call `window.__captureLayers(cp)`, then for each image layer:
```js
await r.client.send("Emulation.setDefaultBackgroundColorOverride", { color: { r:0,g:0,b:0,a:0 } });
await r.page.evaluate((sel, idx) => window.__isolate(sel, idx), spec.sel, i);
const shot = await r.client.send("Page.captureScreenshot",
  { format: "png", clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
writeFileSync(join(outDir, "assets", `${layer.id}.png`), Buffer.from(shot.data, "base64"));
await r.page.evaluate(() => window.__restore());
```
Record `png`, `pngW=rect.w`, `pngH=rect.h` on the layer.

- [ ] **Step 4: Verify the PNGs + scene fragment**

Run: `node render/capture-scene.mjs "Europa League" render/capcut/out/europa`
Expected: `render/capcut/out/europa/assets/` contains PNGs for bg, 11 slot-fronts, 11 slot-backs, header logo, countdown, outro logo/emojis; and they are transparent where expected (spot-check a slot PNG is a round photo on transparency).

- [ ] **Step 5: Commit**

```bash
git add "render/capture-scene.mjs" "js/render-mode.js"
git commit -m "feat(capcut): per-element transparent PNG capture at checkpoints"
```

### Task C3: Emit `scene.json` (layers + timings + audio)

**Files:**
- Modify: `render/capture-scene.mjs`

- [ ] **Step 1: Assign per-layer `appearMs`/`disappearMs` from checkpoint times**

Map checkpoint → time window (intro [0,introEnd], question [introEnd, revealStart], reveal [revealStart, outroStart], outro [outroStart, end]) using the virtual frame index at each checkpoint × `1000/fps`. Build the final `scene.json` matching the contract at the top of this plan: merge image + text layers with their windows, and map the audio manifest (`{kind,src,atMs}` + `durations[src]` → `durMs`; bgm volume 0.5, voice 1; resolve relative srcs to absolute repo paths the way `render/audio-mux.mjs resolveSrc()` does).

- [ ] **Step 2: Write `scene.json`**

```js
writeFileSync(join(outDir, "scene.json"), JSON.stringify(scene, null, 2));
```

- [ ] **Step 3: Verify**

Run: `node render/capture-scene.mjs "Europa League" render/capcut/out/europa`
Expected: `scene.json` has ~50–60 layers and an `audio` array with voice + bgm entries; every image layer's `png` points to an existing file in `assets/`.

- [ ] **Step 4: Commit**

```bash
git add "render/capture-scene.mjs"
git commit -m "feat(capcut): emit scene.json (layers + windows + audio)"
```

---

## Phase D — End-to-end + transitions + docs

### Task D1: Orchestrator CLI (capture → build)

**Files:**
- Create: `render/capcut-export.mjs`

- [ ] **Step 1: Implement orchestrator**

```js
// render/capcut-export.mjs
import { captureScene } from "./capture-scene.mjs";
import { buildDraftFromScene } from "./build-capcut.mjs";
import { join } from "node:path";

// node render/capcut-export.mjs "Europa League" "EUROPA_CAPCUT"
const script = process.argv[2] || "Europa League";
const draftName = process.argv[3] || "EUROPA_CAPCUT";
const outDir = join("render", "capcut", "out", draftName);
await captureScene({ script, outDir });
const r = buildDraftFromScene(join(outDir, "scene.json"));
console.log("CAPCUT DRAFT:", r.foldPath);
```
Note: ensure `buildDraftFromScene` reads `scene.name` (set it to `draftName` in capture, or override here).

- [ ] **Step 2: Run end-to-end**

Run (dev server up): `node render/capcut-export.mjs "Europa League" "EUROPA_CAPCUT"`
Expected: prints the draft folder under `…/com.lveditor.draft/EUROPA_CAPCUT`.

- [ ] **Step 3: MANUAL gate — open `EUROPA_CAPCUT` in CapCut**

Confirm: opens without error; intro bg + title + subtitle visible; pitch + 11 circles placed correctly; reveal shows player photos + team name + logo; outro shows logo + like/subscribe + text; voices + BGM on the timeline. Note any layer that's mis-placed → fix in the relevant builder, re-run.

- [ ] **Step 4: Commit**

```bash
git add "render/capcut-export.mjs"
git commit -m "feat(capcut): end-to-end capture→build orchestrator"
```

### Task D2: Transitions (circle flip + phase fades)

**Files:**
- Modify: `render/capcut/schema.mjs`
- Modify: `render/capture-scene.mjs` (mark front/back pairs + phase boundaries)

- [ ] **Step 1: Cross-fade front→back per circle**

For each slot, the front PNG window is [questionStart, revealStart+overlap] and the back PNG window is [revealStart, end]; add a `transitions[]` material (cloned from `rich-draft.template.json`) referenced at the boundary of the two stacked segments so it cross-dissolves. Keep it editable (user can swap to a flip).

- [ ] **Step 2: Phase fades**

Add a short fade-in (`material_animations` "fade in" cloned from the rich template) on the first layer of each phase (intro bg, pitch, reveal cluster, outro bg).

- [ ] **Step 3: MANUAL gate** — rebuild + open; confirm circles dissolve to player photos at the reveal and phases fade. Adjust overlap durations.

- [ ] **Step 4: Commit**

```bash
git add "render/capcut/schema.mjs" "render/capture-scene.mjs"
git commit -m "feat(capcut): circle cross-fade + phase fades (editable)"
```

### Task D3: Document the subsystem (repo documentation rule)

**Files:**
- Create: `.Storage/docs/capcut-export.md`
- Modify: `.Storage/docs/INDEX.md` (add a row)

- [ ] **Step 1: Write `.Storage/docs/capcut-export.md`**

Cover: what it does (Runner-1 play flow → CapCut PC draft, 1 save / 1 level), the two stages (`render/capture-scene.mjs`, `render/build-capcut.mjs`) + pure modules (`render/capcut/`), the coordinate model + calibration, where templates come from (`render/capcut/templates/`, vendored from real drafts — refresh on CapCut update), the `scene.json` contract, where drafts are written + registered (`root_meta_info.json`), and the known limitations (text font approximate, motion approximate, webp accepted). Note the CLI: `node render/capcut-export.mjs "<save>" "<DraftName>"`.

- [ ] **Step 2: Add INDEX row**

Add to the topic map table in `.Storage/docs/INDEX.md`:
```
| CapCut export | [capcut-export.md](capcut-export.md) | Runner-1 play flow → openable CapCut PC draft (scene-capture → builder, coords, templates) |
```

- [ ] **Step 3: Commit**

```bash
git add ".Storage/docs/capcut-export.md" ".Storage/docs/INDEX.md"
git commit -m "docs: CapCut export subsystem"
```

---

## Self-review notes (gaps to watch during execution)

- **Text `content` schema** (B2) and **audio material `type`** (B3) are templated from the *real* `rich-draft.template.json` — if a manual gate shows empty text / silent audio, the fix is always "match the real template's keys," not invent fields. The tests assert the visible string is present + timings, which is the contract; exact inner keys come from the template.
- **`coords.transform.y` sign** is confirmed at the A6 calibration gate, not assumed.
- **Checkpoint timing** (C3): if the capture can't cleanly detect phase boundaries from DOM state, fall back to advancing to fixed virtual times derived from the audio manifest (voice atMs marks intro/reveal/outro starts). Log what was used (no silent guessing).
- **`is_drop_frame_timecode` / other top-level keys**: `assembleDraft` clones the full template and only overrides what it must, so all required top-level keys are preserved automatically.
- **webp** player photos: referenced via rasterized PNG (capture re-encodes to PNG), so CapCut never sees webp here — no format risk.
