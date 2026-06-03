/**
 * Random broken crosshatch for #team-header::before (two diagonal directions + irregular gaps).
 * Uses flag stripe colors from computed --team-stripe-* when set.
 */

const DEFAULT_STRIPES = [
  "rgba(255, 255, 255, 0.5)",
  "rgba(0, 122, 204, 0.5)",
  "rgba(200, 200, 220, 0.5)",
];

const TILE = 132;

function parseRgbaToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  const a = m[4] !== undefined ? m[4] : "1";
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
}

function stripeColorsFromEl(teamHeaderEl) {
  if (!teamHeaderEl) return [...DEFAULT_STRIPES];
  const cs = getComputedStyle(teamHeaderEl);
  const picked = ["--team-stripe-1", "--team-stripe-2", "--team-stripe-3"]
    .map((v) => parseRgbaToken(cs.getPropertyValue(v)))
    .filter(Boolean);
  return picked.length ? picked : [...DEFAULT_STRIPES];
}

function segmentFromCandidates(cand) {
  const eps = 1e-4;
  const uniq = [];
  for (const p of cand) {
    if (!uniq.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < eps)) {
      uniq.push(p);
    }
  }
  if (uniq.length < 2) return null;
  let bestI = 0;
  let bestJ = 1;
  let bestD = 0;
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const d = Math.hypot(uniq[i][0] - uniq[j][0], uniq[i][1] - uniq[j][1]);
      if (d > bestD) {
        bestD = d;
        bestI = i;
        bestJ = j;
      }
    }
  }
  const a = uniq[bestI];
  const b = uniq[bestJ];
  return [a[0], a[1], b[0], b[1]];
}

/** Family x − y = c (slope +1, \ ) */
function clipXYminus(W, H, c) {
  const cand = [];
  if (c >= 0 && c <= W) cand.push([c, 0]);
  if (H + c >= 0 && H + c <= W) cand.push([H + c, H]);
  if (c >= -H && c <= 0) cand.push([0, -c]);
  if (W - c >= 0 && W - c <= H) cand.push([W, W - c]);
  return segmentFromCandidates(cand);
}

/** Family x + y = c (slope −1, / ) */
function clipXYplus(W, H, c) {
  const cand = [];
  if (c >= 0 && c <= H) cand.push([0, c]);
  if (c >= W && c <= W + H) cand.push([W, c - W]);
  if (c >= 0 && c <= W) cand.push([c, 0]);
  if (c >= H && c <= W + H) cand.push([c - H, H]);
  return segmentFromCandidates(cand);
}

function rnd(min, max) {
  return min + Math.random() * (max - min);
}

function dashedLinesAlongSegment(x0, y0, x1, y1, colors, parts) {
  let dx = x1 - x0;
  let dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  if (Math.random() < 0.5) {
    x0 = x1;
    y0 = y1;
    dx = -dx;
    dy = -dy;
  }
  const ux = dx / L;
  const uy = dy / L;
  let u = rnd(0, 4);
  while (u < L - 0.2) {
    const dashLen = rnd(1.2, 7.5);
    const gapLen = rnd(1.5, 16);
    const u1 = Math.min(u + dashLen, L);
    if (u1 - u > 0.25) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const ax = x0 + ux * u;
      const ay = y0 + uy * u;
      const bx = x0 + ux * u1;
      const by = y0 + uy * u1;
      parts.push(
        `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(
          2,
        )}" stroke="${col}" stroke-width="0.82" stroke-linecap="square"/>`,
      );
    }
    u = u1 + gapLen;
  }
}

function buildHatchSvg(colors) {
  const W = TILE;
  const H = TILE;
  const step = 9 + Math.floor(Math.random() * 5);
  const parts = [];
  const kMax = Math.ceil((W + H) / step) + 1;
  for (let k = -kMax; k <= kMax; k++) {
    const c = k * step;
    const s1 = clipXYminus(W, H, c);
    if (s1) dashedLinesAlongSegment(s1[0], s1[1], s1[2], s1[3], colors, parts);
    const s2 = clipXYplus(W, H, c);
    if (s2) dashedLinesAlongSegment(s2[0], s2[1], s2[2], s2[3], colors, parts);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join(
    "",
  )}</svg>`;
}

/**
 * Regenerate tiled hatch background (new random gaps each call; full reload ⇒ new look).
 * @param {HTMLElement | null} teamHeaderEl
 */
export function refreshTeamHeaderHatchGrid(teamHeaderEl) {
  if (!teamHeaderEl) return;
  try {
    const colors = stripeColorsFromEl(teamHeaderEl);
    const svg = buildHatchSvg(colors);
    const url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
    teamHeaderEl.style.setProperty("--team-header-hatch-bg", url);
    teamHeaderEl.style.setProperty("--team-header-hatch-tile", `${TILE}px`);
  } catch {
    teamHeaderEl.style.removeProperty("--team-header-hatch-bg");
    teamHeaderEl.style.removeProperty("--team-header-hatch-tile");
  }
}
