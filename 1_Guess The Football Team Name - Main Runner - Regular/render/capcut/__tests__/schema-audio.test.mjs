import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAudioLayer, assembleDraft } from "../schema.mjs";
import { makeIdFactory } from "../ids.mjs";

test("buildAudioLayer: path, type, microsecond timeranges, volume", () => {
  const ctx = { id: makeIdFactory(21) };
  const { material, segment } = buildAudioLayer(
    { kind: "voice", src: "C:/v/x.mp3", atMs: 1500, durMs: 4000, volume: 1 }, ctx);
  assert.equal(material.path, "C:/v/x.mp3");
  assert.equal(material.type, "extract_music");
  assert.equal(segment.material_id, material.id);
  assert.equal(segment.target_timerange.start, 1_500_000);
  assert.equal(segment.target_timerange.duration, 4_000_000);
  assert.equal(segment.source_timerange.start, 0);
  assert.equal(segment.source_timerange.duration, 4_000_000);
  assert.equal(segment.volume, 1);
});

test("assembleDraft adds one audio track per scene.audio item; helper refs resolve", () => {
  const draft = assembleDraft({
    name: "A", canvas: { w: 1920, h: 1080 }, fps: 30, layers: [],
    audio: [
      { kind: "bgm", src: "C:/a/song.mp3", atMs: 0, durMs: 21000, volume: 0.5 },
      { kind: "voice", src: "C:/a/v1.mp3", atMs: 1000, durMs: 4200, volume: 1 },
    ],
  }, { idSeed: 9 });
  assert.equal(draft.materials.audios.length, 2);
  const aTracks = draft.tracks.filter((t) => t.type === "audio");
  assert.equal(aTracks.length, 2);
  const ids = new Set();
  for (const arr of Object.values(draft.materials)) if (Array.isArray(arr)) for (const m of arr) if (m?.id) ids.add(m.id);
  for (const t of aTracks) for (const r of t.segments[0].extra_material_refs) assert.ok(ids.has(r), "missing audio helper " + r);
  // bgm volume preserved
  const bgmSeg = aTracks.map((t) => t.segments[0]).find((s) => Math.abs(s.volume - 0.5) < 1e-9);
  assert.ok(bgmSeg, "bgm volume 0.5 not found");
});
