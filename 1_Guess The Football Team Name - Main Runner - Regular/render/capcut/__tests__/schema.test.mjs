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

test("buildPhotoLayer produces a photo material + segment; refs remap to returned helpers", () => {
  const ctx = { id: makeIdFactory(7) };
  const { material, segment, helpers } = buildPhotoLayer(fixtureLayer(), ctx);
  assert.equal(material.type, "photo");
  assert.equal(material.path, "C:/tmp/box.png");
  assert.equal(material.width, 960);
  assert.equal(material.height, 540);
  assert.equal(segment.material_id, material.id);
  // every helper ref on the segment must resolve to one of the returned helpers' NEW ids
  const helperIds = new Set(helpers.map((h) => h.m.id));
  assert.ok(segment.extra_material_refs.length >= 1);
  assert.equal(segment.extra_material_refs.length, helpers.length);
  for (const r of segment.extra_material_refs) assert.ok(helperIds.has(r), `ref ${r} not remapped`);
  // timerange in microseconds
  assert.equal(segment.target_timerange.start, 0);
  assert.equal(segment.target_timerange.duration, 5_000_000);
  // centered half-size box → scale 0.5, transform 0,0
  assert.ok(Math.abs(segment.clip.scale.x - 0.5) < 1e-9);
  assert.ok(Math.abs(segment.clip.transform.x) < 1e-9);
});

test("assembleDraft yields required top-level keys + microsecond duration + helpers in arrays", () => {
  const draft = assembleDraft({
    name: "TEST", canvas: { w: 1920, h: 1080 }, fps: 30,
    layers: [fixtureLayer()], audio: [],
  }, { idSeed: 3 });
  for (const k of ["canvas_config", "materials", "tracks", "duration", "fps", "version"]) {
    assert.ok(k in draft, `missing ${k}`);
  }
  assert.equal(draft.canvas_config.width, 1920);
  assert.equal(draft.canvas_config.height, 1080);
  assert.equal(draft.duration, 5_000_000);
  assert.ok(draft.materials.videos.length >= 1);
  assert.ok(draft.tracks.some((t) => t.type === "video"));
  // the photo segment's refs must all be present in the assembled draft's material arrays
  const allIds = new Set();
  for (const arr of Object.values(draft.materials)) if (Array.isArray(arr)) for (const m of arr) if (m?.id) allIds.add(m.id);
  const seg = draft.tracks.find((t) => t.type === "video").segments[0];
  for (const r of seg.extra_material_refs) assert.ok(allIds.has(r), `assembled draft missing helper ${r}`);
});

test("assembleDraft puts each image layer on its own video track, ordered by z", () => {
  const scene = {
    name: "STACK", canvas: { w: 1920, h: 1080 }, fps: 30,
    layers: [
      { id: "box", kind: "image", png: "C:/tmp/box.png", pngW: 960, pngH: 540,
        rect: { x: 480, y: 270, w: 960, h: 540 }, z: 1, appearMs: 0, disappearMs: 5000 },
      { id: "bg", kind: "image", png: "C:/tmp/bg.png", pngW: 1920, pngH: 1080,
        rect: { x: 0, y: 0, w: 1920, h: 1080 }, z: 0, appearMs: 0, disappearMs: 5000 },
    ], audio: [],
  };
  const draft = assembleDraft(scene, { idSeed: 5 });
  const vtracks = draft.tracks.filter((t) => t.type === "video");
  assert.equal(vtracks.length, 2);
  // sorted by z asc: first track = bg (full canvas), second = box
  const firstMat = draft.materials.videos.find((v) => v.id === vtracks[0].segments[0].material_id);
  const secondMat = draft.materials.videos.find((v) => v.id === vtracks[1].segments[0].material_id);
  assert.equal(firstMat.material_name, "bg.png");
  assert.equal(secondMat.material_name, "box.png");
  assert.equal(vtracks[0].render_index, 0);
  assert.equal(vtracks[1].render_index, 1);
});
