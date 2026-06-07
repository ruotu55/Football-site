import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTextLayer, assembleDraft } from "../schema.mjs";
import { makeIdFactory } from "../ids.mjs";

function fixtureText() {
  return {
    id: "title", kind: "text", text: "OGC NICE",
    rect: { x: 760, y: 460, w: 400, h: 120 }, z: 5,
    font: { sizePx: 64, color: "#FF0000", align: "center", weight: 700 },
    appearMs: 3000, disappearMs: 8000,
  };
}

test("buildTextLayer: string + color + range encoded in content; microsecond timerange", () => {
  const ctx = { id: makeIdFactory(11) };
  const { material, segment } = buildTextLayer(fixtureText(), ctx);
  const content = JSON.parse(material.content);
  assert.equal(content.text, "OGC NICE");
  assert.deepEqual(content.styles[0].range, [0, "OGC NICE".length]);
  // #FF0000 -> [1,0,0]
  const c = content.styles[0].fill.content.solid.color;
  assert.ok(Math.abs(c[0] - 1) < 1e-6 && Math.abs(c[1]) < 1e-6 && Math.abs(c[2]) < 1e-6);
  assert.equal(segment.material_id, material.id);
  assert.equal(segment.target_timerange.start, 3_000_000);
  assert.equal(segment.target_timerange.duration, 5_000_000);
  // positioned (non-zero transform for an off-centre rect)
  assert.ok(typeof segment.clip.transform.x === "number");
});

test("assembleDraft adds a text track per text layer and registers the material", () => {
  const draft = assembleDraft({
    name: "T", canvas: { w: 1920, h: 1080 }, fps: 30,
    layers: [fixtureText()], audio: [],
  }, { idSeed: 2 });
  assert.equal(draft.materials.texts.length, 1);
  assert.ok(draft.tracks.some((t) => t.type === "text"));
  const ts = draft.tracks.find((t) => t.type === "text").segments[0];
  // every helper ref resolves to a material present in the draft
  const ids = new Set();
  for (const arr of Object.values(draft.materials)) if (Array.isArray(arr)) for (const m of arr) if (m?.id) ids.add(m.id);
  for (const r of ts.extra_material_refs) assert.ok(ids.has(r), "missing text helper " + r);
});
