// Ported from the runner's js/team-header-hatch.js: a tiled "random broken
// crosshatch" — short dashed segments along both diagonal directions, in the
// team/flag stripe colours. Uses a seeded RNG (Math.random is forbidden in
// Remotion) so the tile is deterministic.

const TILE = 132;

const makeRng = (seed: number) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

type Pt = [number, number];

const segmentFromCandidates = (cand: Pt[]): number[] | null => {
  const eps = 1e-4;
  const uniq: Pt[] = [];
  for (const p of cand) {
    if (!uniq.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < eps)) uniq.push(p);
  }
  if (uniq.length < 2) return null;
  let bi = 0, bj = 1, bd = 0;
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const d = Math.hypot(uniq[i][0] - uniq[j][0], uniq[i][1] - uniq[j][1]);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return [uniq[bi][0], uniq[bi][1], uniq[bj][0], uniq[bj][1]];
};

// x − y = c  ( \ )
const clipMinus = (W: number, H: number, c: number) => {
  const cand: Pt[] = [];
  if (c >= 0 && c <= W) cand.push([c, 0]);
  if (H + c >= 0 && H + c <= W) cand.push([H + c, H]);
  if (c >= -H && c <= 0) cand.push([0, -c]);
  if (W - c >= 0 && W - c <= H) cand.push([W, W - c]);
  return segmentFromCandidates(cand);
};

// x + y = c  ( / )
const clipPlus = (W: number, H: number, c: number) => {
  const cand: Pt[] = [];
  if (c >= 0 && c <= H) cand.push([0, c]);
  if (c >= W && c <= W + H) cand.push([W, c - W]);
  if (c >= 0 && c <= W) cand.push([c, 0]);
  if (c >= H && c <= W + H) cand.push([c - H, H]);
  return segmentFromCandidates(cand);
};

const dashes = (
  seg: number[],
  colors: string[],
  parts: string[],
  rand: () => number,
) => {
  let [x0, y0, x1, y1] = seg;
  let dx = x1 - x0;
  let dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  if (rand() < 0.5) { x0 = x1; y0 = y1; dx = -dx; dy = -dy; }
  const ux = dx / L;
  const uy = dy / L;
  let u = rand() * 4;
  while (u < L - 0.2) {
    const dashLen = 1.2 + rand() * 6.3;
    const gapLen = 1.5 + rand() * 14.5;
    const u1 = Math.min(u + dashLen, L);
    if (u1 - u > 0.25) {
      const col = colors[Math.floor(rand() * colors.length)];
      parts.push(
        `<line x1="${(x0 + ux * u).toFixed(2)}" y1="${(y0 + uy * u).toFixed(2)}" x2="${(x0 + ux * u1).toFixed(2)}" y2="${(y0 + uy * u1).toFixed(2)}" stroke="${col}" stroke-width="0.82" stroke-linecap="square"/>`,
      );
    }
    u = u1 + gapLen;
  }
};

export const buildHatchUri = (colors: string[], seed = 1337): string => {
  const rand = makeRng(seed);
  const W = TILE, H = TILE;
  const step = 10;
  const parts: string[] = [];
  const kMax = Math.ceil((W + H) / step) + 1;
  for (let k = -kMax; k <= kMax; k++) {
    const c = k * step;
    const s1 = clipMinus(W, H, c);
    if (s1) dashes(s1, colors, parts, rand);
    const s2 = clipPlus(W, H, c);
    if (s2) dashes(s2, colors, parts, rand);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join("")}</svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
};

export const HATCH_TILE = TILE;
