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
