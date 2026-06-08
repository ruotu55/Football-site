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
// Barlow Condensed (the website's font) vendored in render/capcut/fonts and installed for
// the user so CapCut can render editable text in the right typeface.
const FONT_DIR = join(HERE, "fonts");
function barlowPath(weight) {
  const w = weight || 700;
  const f = w >= 850 ? "BarlowCondensed-Black.ttf"
    : w >= 700 ? "BarlowCondensed-Bold.ttf"
    : w >= 600 ? "BarlowCondensed-SemiBold.ttf"
    : "BarlowCondensed-Medium.ttf";
  return join(FONT_DIR, f).replace(/\\/g, "/");
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
  const weight = layer.font?.weight || 700;
  const fontPath = barlowPath(weight);
  // CapCut text size unit. Prefer explicit capSize; else map CSS px (calibrated ~/2.2).
  const size = Math.max(5, Math.round(layer.font?.capSize || (layer.font?.sizePx || 60) / 2.2));
  const text = String(layer.text ?? "");
  material.content = JSON.stringify({
    text,
    styles: [{
      fill: { content: { render_type: "solid", solid: { color: [r, g, b] } } },
      font: { path: fontPath, id: "" },
      size,
      range: [0, text.length],
      bold: weight >= 700,
    }],
  });
  // point the material's font fields at Barlow Condensed too (CapCut shows the family name)
  material.font_path = fontPath;
  if ("font_name" in material) material.font_name = "Barlow Condensed";
  if ("font_title" in material) material.font_title = "Barlow Condensed";
  if ("text_color" in material) material.text_color = layer.font?.color || "#FFFFFF";
  if ("font_size" in material) material.font_size = size;
  if ("text_size" in material) material.text_size = size;
  // drop shadow (match the site's title glow) + tighter line spacing for multi-line titles
  if ("has_shadow" in material) {
    material.has_shadow = true;
    material.shadow_color = "#000000";
    material.shadow_alpha = layer.font?.shadowAlpha ?? 0.55;
    material.shadow_smoothing = 0.45;
    material.shadow_distance = layer.font?.shadowDistance ?? 10;
    material.shadow_angle = -45;
  }
  if ("line_spacing" in material) material.line_spacing = layer.font?.lineSpacing ?? -0.3;

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

/** Build an audio layer by cloning the rich template's audio material + segment. */
export function buildAudioLayer(a, ctx) {
  const id = ctx.id || makeIdFactory(0);
  const tplMat = RICH.materials.audios[0];
  const tplSeg = RICH.tracks.find((t) => t.type === "audio").segments[0];

  const material = clone(tplMat);
  material.id = id();
  material.path = String(a.src || "").replace(/\\/g, "/");
  material.name = material.path.split("/").pop();
  const dur = us(a.durMs || 0);
  if ("duration" in material) material.duration = dur;
  // these tie a material to a specific imported instance; blank so CapCut treats it fresh
  if ("local_material_id" in material) material.local_material_id = "";
  if ("music_id" in material) material.music_id = "";

  const helpers = collectHelpers(RICH, tplSeg).map(({ arrName, m }) => {
    const nm = clone(m); nm.id = id(); return { arrName, m: nm, oldId: m.id };
  });
  const oldToNew = new Map(helpers.map((h) => [h.oldId, h.m.id]));

  const segment = clone(tplSeg);
  segment.id = id();
  segment.material_id = material.id;
  segment.extra_material_refs = (tplSeg.extra_material_refs || []).map((rf) => oldToNew.get(rf) || rf);
  segment.volume = a.volume ?? 1;
  segment.last_nonzero_volume = a.volume ?? 1;
  segment.source_timerange = { start: 0, duration: dur };
  segment.target_timerange = { start: us(a.atMs || 0), duration: dur };

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
  // scaleMul (>1) enlarges a layer around its own centre (e.g. blow the intro title group
  // up to match the recorded video); transform stays at the rect centre so it grows in place.
  const eff = scale * (layer.scaleMul || 1);
  segment.clip = {
    alpha: layer.alpha ?? 1,
    flip: { horizontal: false, vertical: false },
    rotation: 0,
    scale: { x: eff, y: eff },
    transform: { x: transform.x, y: transform.y },
  };
  // CapCut couples uniform_scale.value with clip.scale; if left at 1 while
  // clip.scale<1 the image renders full-canvas (scale ignored). Keep them equal.
  segment.uniform_scale = { on: true, value: eff };

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

  const audios = scene.audio || [];
  audios.forEach((a, ti) => {
    const { material, segment, helpers } = buildAudioLayer(a, ctx);
    draft.materials.audios.push(material);
    for (const { arrName, m } of helpers) {
      if (!Array.isArray(draft.materials[arrName])) draft.materials[arrName] = [];
      draft.materials[arrName].push(m);
    }
    draft.tracks.push({ type: "audio", id: id(), attribute: 0, flag: 0, segments: [segment],
      is_default_name: true, name: "", render_index: 2000 + ti });
    endMs = Math.max(endMs, (a.atMs || 0) + (a.durMs || 0));
  });

  draft.duration = us(scene.durationMs || endMs);
  return draft;
}
