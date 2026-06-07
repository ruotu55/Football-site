import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapRect } from "./coords.mjs";
import { makeIdFactory } from "./ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = JSON.parse(
  readFileSync(join(HERE, "templates", "photo-draft.template.json"), "utf8"),
);
const RICH = JSON.parse(
  readFileSync(join(HERE, "templates", "rich-draft.template.json"), "utf8"),
);

const clone = (o) => JSON.parse(JSON.stringify(o));
const us = (ms) => Math.round(ms * 1000); // ms → microseconds

function hexToRgb01(hex) {
  const h = String(hex || "#FFFFFF").replace("#", "");
  const n = h.length >= 6 ? h : "FFFFFF";
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}
function templateFontPath() {
  try { return JSON.parse(RICH.materials.texts[0].content).styles[0].font.path || ""; }
  catch { return ""; }
}
// helpers referenced by a template segment, grouped by their material array name
function collectHelpers(rich, seg) {
  const refIds = new Set(seg.extra_material_refs || []);
  const out = [];
  for (const [arrName, arr] of Object.entries(rich.materials)) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) if (m && refIds.has(m.id)) out.push({ arrName, m });
  }
  return out;
}

// Find the template's first photo segment + the helper materials it references.
function templatePhotoParts() {
  const seg = TEMPLATE.tracks.find((t) => t.type === "video").segments[0];
  const refIds = new Set(seg.extra_material_refs);
  const helpers = [];
  for (const [arrName, arr] of Object.entries(TEMPLATE.materials)) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) if (m && refIds.has(m.id)) helpers.push({ arrName, m });
  }
  const photoMat = TEMPLATE.materials.videos.find((v) => v.id === seg.material_id);
  return { seg, helpers, photoMat };
}

/** Build an editable text layer by cloning the rich template's text material + segment. */
export function buildTextLayer(layer, ctx) {
  const id = ctx.id || makeIdFactory(0);
  const tplMat = RICH.materials.texts[0];
  const tplSeg = RICH.tracks.find((t) => t.type === "text").segments[0];

  const material = clone(tplMat);
  material.id = id();
  const [r, g, b] = hexToRgb01(layer.font?.color);
  // CapCut text "size" unit: default added text was 15. Map captured px with a heuristic
  // (~/6); the user fine-tunes fonts afterwards.
  const size = Math.max(5, Math.round((layer.font?.sizePx || 60) / 6));
  const text = String(layer.text ?? "");
  material.content = JSON.stringify({
    text,
    styles: [{
      fill: { content: { render_type: "solid", solid: { color: [r, g, b] } } },
      font: { path: templateFontPath(), id: "" },
      size,
      range: [0, text.length],
    }],
  });
  if ("text_color" in material) material.text_color = layer.font?.color || "#FFFFFF";
  if ("font_size" in material) material.font_size = size;
  if ("text_size" in material) material.text_size = size;

  const helpers = collectHelpers(RICH, tplSeg).map(({ arrName, m }) => {
    const nm = clone(m); nm.id = id(); return { arrName, m: nm, oldId: m.id };
  });
  const oldToNew = new Map(helpers.map((h) => [h.oldId, h.m.id]));

  const segment = clone(tplSeg);
  segment.id = id();
  segment.material_id = material.id;
  segment.extra_material_refs = (tplSeg.extra_material_refs || []).map((rf) => oldToNew.get(rf) || rf);
  segment.render_index = layer.z ?? 100;
  segment.track_render_index = layer.z ?? 100;
  const { transform } = mapRect(layer.rect);
  segment.clip = {
    alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0,
    scale: { x: 1, y: 1 }, transform: { x: transform.x, y: transform.y },
  };
  const dur = us((layer.disappearMs ?? 0) - (layer.appearMs ?? 0));
  segment.source_timerange = { start: 0, duration: dur };
  segment.target_timerange = { start: us(layer.appearMs ?? 0), duration: dur };

  return { material, segment, helpers };
}

/** Build one photo layer: returns {material, segment, helpers:[{arrName, m, oldId}]} */
export function buildPhotoLayer(layer, ctx) {
  const id = ctx.id || makeIdFactory(0);
  const tpl = templatePhotoParts();

  const material = clone(tpl.photoMat);
  material.id = id();
  material.material_name = layer.png.split(/[\\/]/).pop();
  material.path = layer.png.replace(/\\/g, "/");
  material.width = layer.pngW;
  material.height = layer.pngH;

  // Regenerate helper ids; keep arrName so assembleDraft can place them.
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
  segment.render_index = layer.z ?? 0;
  segment.track_render_index = layer.z ?? 0;

  const { scale, transform } = mapRect(layer.rect);
  segment.clip = {
    alpha: layer.alpha ?? 1,
    flip: { horizontal: false, vertical: false },
    rotation: 0,
    scale: { x: scale, y: scale },
    transform: { x: transform.x, y: transform.y },
  };
  // CapCut couples uniform_scale.value with clip.scale; if left at 1 while
  // clip.scale<1 the image renders full-canvas (scale ignored). Keep them equal.
  segment.uniform_scale = { on: true, value: scale };

  const dur = us((layer.disappearMs ?? 0) - (layer.appearMs ?? 0));
  segment.source_timerange = { start: 0, duration: dur };
  segment.target_timerange = { start: us(layer.appearMs ?? 0), duration: dur };

  return { material, segment, helpers };
}

/** Assemble a full draft object from image layers. (texts/audio added in later tasks.) */
export function assembleDraft(scene, opts = {}) {
  const id = makeIdFactory(opts.idSeed ?? 0);
  const ctx = { id };

  const draft = clone(TEMPLATE);
  draft.name = scene.name || "Football Quiz";
  draft.id = id();
  draft.fps = scene.fps || 30;
  draft.canvas_config = { background: null, height: scene.canvas.h, ratio: "original", width: scene.canvas.w };

  for (const k of Object.keys(draft.materials)) {
    if (Array.isArray(draft.materials[k])) draft.materials[k] = [];
  }
  draft.tracks = [];

  let endMs = 0;
  // Each image layer gets its OWN video track so simultaneous layers stack:
  // CapCut composites later tracks on top. Sort by z ascending = bottom→top.
  const imageLayers = (scene.layers || [])
    .filter((l) => l.kind === "image")
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  imageLayers.forEach((layer, ti) => {
    const { material, segment, helpers } = buildPhotoLayer(layer, ctx);
    draft.materials.videos.push(material);
    for (const { arrName, m } of helpers) {
      if (!Array.isArray(draft.materials[arrName])) draft.materials[arrName] = [];
      draft.materials[arrName].push(m);
    }
    const track = { type: "video", id: id(), attribute: 0, flag: 0, segments: [segment],
      is_default_name: true, name: "", render_index: ti };
    draft.tracks.push(track);
    endMs = Math.max(endMs, layer.disappearMs ?? 0);
  });

  const textLayers = (scene.layers || []).filter((l) => l.kind === "text")
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  textLayers.forEach((layer, ti) => {
    const { material, segment, helpers } = buildTextLayer(layer, ctx);
    draft.materials.texts.push(material);
    for (const { arrName, m } of helpers) {
      if (!Array.isArray(draft.materials[arrName])) draft.materials[arrName] = [];
      draft.materials[arrName].push(m);
    }
    draft.tracks.push({ type: "text", id: id(), attribute: 0, flag: 0, segments: [segment],
      is_default_name: true, name: "", render_index: 1000 + ti });
    endMs = Math.max(endMs, layer.disappearMs ?? 0);
  });

  draft.duration = us(scene.durationMs || endMs);
  return draft;
}
