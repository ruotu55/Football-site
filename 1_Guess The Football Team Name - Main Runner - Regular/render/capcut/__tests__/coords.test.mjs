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
