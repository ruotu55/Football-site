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
