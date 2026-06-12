// Ported 1:1 from .Storage/shared/backgrounds/background-theme.js so the
// Studio controls offer the SAME colors, effects and competitions as the runner.

// ── Colors (16) ────────────────────────────────────────────────────────────
export const COLORS = [
  { id: "quiz-career-path", label: "#0069EC - Career Path", hex: "#0069EC" },
  { id: "quiz-career-stats", label: "#AB47BC - Career Stats", hex: "#AB47BC" },
  { id: "quiz-four-params", label: "#5C6BC0 - Club + Position + Country + Age", hex: "#5C6BC0" },
  { id: "quiz-fake-info", label: "#E57373 - Fake Information", hex: "#E57373" },
  { id: "quiz-nat-by-club", label: "#1B5E20 - National Team by Club", hex: "#1B5E20" },
  { id: "quiz-club-by-nat", label: "#2E7D32 - Club by Nationality", hex: "#2E7D32" },
  { id: "quiz-football-mcq", label: "#C2185B - Football Quiz (Multiple Choice)", hex: "#C2185B" },
  { id: "extra-orange", label: "#FFB74D - Extra 1", hex: "#FFB74D" },
  { id: "extra-slate", label: "#78909C - Extra 2", hex: "#78909C" },
  { id: "extra-ocean-green", label: "#4DB6AC - Extra 3", hex: "#4DB6AC" },
  { id: "extra-deep-lavender", label: "#9575CD - Football Player Name", hex: "#9575CD" },
  { id: "extra-sky-indigo", label: "#7986CB - Extra 5", hex: "#7986CB" },
  { id: "extra-warm-slate", label: "#90A4AE - Extra 6", hex: "#90A4AE" },
  { id: "extra-burnt-orange", label: "#FF8A65 - Extra 7", hex: "#FF8A65" },
  { id: "extra-soft-green", label: "#81C784 - Football Team Name", hex: "#81C784" },
  { id: "extra-cornflower-blue", label: "#64B5F6 - Extra 9", hex: "#64B5F6" },
] as const;

// ── Effects (10) ───────────────────────────────────────────────────────────
export const EFFECTS = [
  { id: "sun-rays-center", label: "Sun effect middle" },
  { id: "sun-spiral-center", label: "Sun spiral middle" },
  { id: "sun-rays-top-right", label: "Sun effect top right" },
  { id: "sun-rays-top-left", label: "Sun effect top left" },
  { id: "center-rings", label: "Center circles" },
  { id: "floating-emojis", label: "Floating emojis" },
  { id: "rising-question-marks", label: "Rising question marks" },
  { id: "diagonal-flow", label: "Diagonal flow" },
  { id: "youtube-thumbnails", label: "YouTube thumbnails" },
  { id: "rising-soccer-balls", label: "Rising soccer balls" },
] as const;

export type EffectId = (typeof EFFECTS)[number]["id"];

// ── Competitions (11) ──────────────────────────────────────────────────────
export type CompetitionRecipe = {
  angle?: number;
  c1: string;
  c2: string;
  pattern: "stars" | "chevron" | "diagonal" | "rays" | "circles" | "hex" | "sparkles" | "diamonds" | "shields" | "crowns" | "none";
  patternHex: string;
  patternAlpha: number;
  /** Generic themes: an animated EFFECT layered over the gradient instead of a pattern. */
  effectId?: EffectId;
  /** Direct white-alpha for ray/spiral effects (bypasses the 0.12 floor of the opacity formula). */
  effectAlpha?: number;
  /** Chevron stroke width in tile units (default 26 — the original bold look). */
  patternStroke?: number;
  /** Pattern tile size in px (default 170 for chevron). */
  patternTile?: number;
  motion?: "drop";
};

export const COMPETITIONS: {
  id: string;
  label: string;
  recipe: CompetitionRecipe;
}[] = [
  { id: "champions-league", label: "Champions League", recipe: { c1: "#06122e", c2: "#1e3fb0", pattern: "stars", patternHex: "#ffffff", patternAlpha: 0.045, motion: "drop" } },
  { id: "europa-league", label: "Europa League", recipe: { c1: "#141414", c2: "#ff7a00", pattern: "diagonal", patternHex: "#000000", patternAlpha: 0.18, motion: "drop" } },
  { id: "conference-league", label: "Conference League", recipe: { c1: "#07331f", c2: "#22c36a", pattern: "diagonal", patternHex: "#ffffff", patternAlpha: 0.12, motion: "drop" } },
  // Sparse small crown outlines (the PL lion's crown) on a deep, muted purple gradient —
  // CL-stars subtlety (the original bold pink + chevron look was too loud).
  { id: "premier-league", label: "Premier League", recipe: { c1: "#1f0128", c2: "#6d1450", pattern: "crowns", patternHex: "#04f5ff", patternAlpha: 0.09, motion: "drop" } },
  // Sparse small rings + dots (nods to LaLiga's circular swirl mark) — CL-stars subtlety.
  { id: "la-liga", label: "La Liga", recipe: { c1: "#001433", c2: "#e84e4e", pattern: "circles", patternHex: "#ffffff", patternAlpha: 0.05, motion: "drop" } },
  // Sparse small diamond outlines (the German "Raute") — CL-stars subtlety.
  { id: "bundesliga", label: "Bundesliga", recipe: { c1: "#141414", c2: "#d50a17", pattern: "diamonds", patternHex: "#ffffff", patternAlpha: 0.05, motion: "drop" } },
  // Sparse small scudetto shield outlines (Italian champions' badge) — CL-stars subtlety.
  { id: "serie-a", label: "Serie A", recipe: { c1: "#021a3a", c2: "#1e63b8", pattern: "shields", patternHex: "#ffffff", patternAlpha: 0.05, motion: "drop" } },
  // Sparse small hexagon outlines ("l'Hexagone" — Ligue 1's hex branding) — CL-stars subtlety.
  { id: "ligue-1", label: "Ligue 1", recipe: { c1: "#07173a", c2: "#93bd06", pattern: "hex", patternHex: "#ffffff", patternAlpha: 0.05, motion: "drop" } },
  // patternAlpha is ×6 in the rays renderer — 0.1 meant 0.6 effective (way too strong).
  { id: "world-cup", label: "World Cup", recipe: { c1: "#4a0a16", c2: "#c79a3a", pattern: "rays", patternHex: "#ffe9a8", patternAlpha: 0.005, motion: "drop" } },
  // Sparse tiny 4-point sparkles (distinct from CL's 5-point stars) — CL-stars subtlety.
  { id: "euro", label: "Euro", recipe: { angle: 135, c1: "#07303a", c2: "#0d2a66", pattern: "sparkles", patternHex: "#ffffff", patternAlpha: 0.05, motion: "drop" } },
  // ── Generic themes ──────────────────────────────────────────────────────
  // Replace the removed Color + Effect props: each is a FRESH gradient (none of the old
  // 16 quiz colors) + ONE of the animated effects layered on top (pattern "none").
  // Curated down to 4 (user kept crimson/spiral, bronze/top-right rays, charcoal/?s, steel/balls).
  // effectAlpha 0.03 = the World Cup rays' effective faintness (0.005 × the rays ×6 multiplier).
  { id: "generic-1", label: "Generic 1", recipe: { c1: "#2c0a14", c2: "#97203d", pattern: "none", patternHex: "#ffffff", patternAlpha: 0, effectId: "sun-spiral-center", effectAlpha: 0.03 } },
  { id: "generic-2", label: "Generic 2", recipe: { c1: "#261603", c2: "#8a5a0e", pattern: "none", patternHex: "#ffffff", patternAlpha: 0, effectId: "sun-rays-top-right", effectAlpha: 0.03 } },
  { id: "generic-3", label: "Generic 3", recipe: { c1: "#10141c", c2: "#3a4a63", pattern: "none", patternHex: "#ffffff", patternAlpha: 0, effectId: "rising-question-marks" } },
  { id: "generic-4", label: "Generic 4", recipe: { c1: "#0a1f33", c2: "#2c5d8f", pattern: "none", patternHex: "#ffffff", patternAlpha: 0, effectId: "rising-soccer-balls" } },
];

// ── Color / SVG helpers (ported) ────────────────────────────────────────────
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 10, g: 61, b: 184 };
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const svgDataUri = (svg: string) =>
  `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;

// 16-arm twisting spiral (sun-spiral-center).
export function spiralSvgUri(whiteAlpha: number): string {
  const cx = 500, cy = 500, numArms = 16, maxR = 780;
  const twist = Math.PI * 1.55;
  const halfWidth = (Math.PI / numArms) * 0.5;
  const steps = 120;
  let paths = "";
  for (let arm = 0; arm < numArms; arm += 1) {
    const baseAngle = (arm / numArms) * 2 * Math.PI - Math.PI / 2;
    const outer: { x: number; y: number }[] = [];
    const inner: { x: number; y: number }[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const r = (s / steps) * maxR;
      const a = baseAngle + twist * (r / maxR);
      outer.push({ x: cx + r * Math.cos(a - halfWidth), y: cy + r * Math.sin(a - halfWidth) });
      inner.push({ x: cx + r * Math.cos(a + halfWidth), y: cy + r * Math.sin(a + halfWidth) });
    }
    let d = `M ${cx} ${cy}`;
    for (const pt of outer) d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    for (const pt of inner.reverse()) d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    d += " Z";
    paths += `<path d="${d}" fill="#ffffff" fill-opacity="${whiteAlpha}"/>`;
  }
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">${paths}</svg>`,
  );
}

// Scattered 5-point stars tile (Champions League look).
export function starsTileUri(starHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(starHex);
  const fill = `rgb(${r}, ${g}, ${b})`;
  const star = (cx: number, cy: number, rad: number, rot: number, a: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const ang = (Math.PI / 5) * i - Math.PI / 2 + rot;
      const rr = i % 2 === 0 ? rad : rad * 0.42;
      pts.push(`${(cx + rr * Math.cos(ang)).toFixed(1)},${(cy + rr * Math.sin(ang)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(" ")}" fill="${fill}" fill-opacity="${a.toFixed(3)}"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">${star(62, 70, 36, 0.1, alpha)}${star(212, 52, 22, 0.5, alpha * 0.8)}${star(150, 168, 48, 0.2, alpha)}${star(252, 212, 26, 0.0, alpha * 0.75)}${star(72, 244, 20, 0.4, alpha * 0.7)}</svg>`;
  return svgDataUri(svg);
}

// Bold chevrons tile (Premier League look). strokeWidth defaults to the original 26.
export function chevronTileUri(lineHex: string, alpha: number, strokeWidth = 26): string {
  const { r, g, b } = hexToRgb(lineHex);
  const stroke = `rgb(${r}, ${g}, ${b})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="170" viewBox="0 0 170 170"><g fill="none" stroke="${stroke}" stroke-opacity="${alpha.toFixed(3)}" stroke-width="${strokeWidth}"><path d="M-30,46 L85,-26 L200,46"/><path d="M-30,128 L85,56 L200,128"/><path d="M-30,210 L85,138 L200,210"/></g></svg>`;
  return svgDataUri(svg);
}

// Sparse small rings + dots tile (La Liga look) — same scatter density as the CL stars.
export function circlesTileUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const c = `rgb(${r}, ${g}, ${b})`;
  const ring = (cx: number, cy: number, rad: number, a: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${c}" stroke-opacity="${a.toFixed(3)}" stroke-width="2.5"/>`;
  const dot = (cx: number, cy: number, rad: number, a: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${c}" fill-opacity="${a.toFixed(3)}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    ring(64, 70, 16, alpha) +
    dot(210, 50, 6, alpha * 0.8) +
    ring(152, 170, 22, alpha * 0.9) +
    dot(254, 214, 7, alpha * 0.75) +
    ring(70, 246, 10, alpha * 0.7) +
    `</svg>`;
  return svgDataUri(svg);
}

// Sparse small hexagon outlines tile (Ligue 1 look) — same scatter density as the CL stars.
export function hexTileUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const c = `rgb(${r}, ${g}, ${b})`;
  const hex = (cx: number, cy: number, rad: number, rot: number, a: number) => {
    const pts: string[] = [];
    for (let k = 0; k < 6; k += 1) {
      const ang = (Math.PI / 3) * k + rot;
      pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-opacity="${a.toFixed(3)}" stroke-width="2.5"/>`;
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    hex(70, 64, 24, 0.1, alpha) +
    hex(214, 52, 14, 0.4, alpha * 0.8) +
    hex(150, 172, 30, 0.2, alpha * 0.9) +
    hex(252, 216, 16, 0.0, alpha * 0.75) +
    hex(66, 248, 12, 0.5, alpha * 0.7) +
    `</svg>`;
  return svgDataUri(svg);
}

// Sparse tiny 4-point sparkles tile (Euro look) — same scatter density as the CL stars.
export function sparklesTileUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const fill = `rgb(${r}, ${g}, ${b})`;
  const spark = (cx: number, cy: number, rad: number, a: number) => {
    const w = rad * 0.24; // waist — concave 4-point sparkle
    const pts = [
      `${cx},${(cy - rad).toFixed(1)}`,
      `${(cx + w).toFixed(1)},${(cy - w).toFixed(1)}`,
      `${(cx + rad).toFixed(1)},${cy}`,
      `${(cx + w).toFixed(1)},${(cy + w).toFixed(1)}`,
      `${cx},${(cy + rad).toFixed(1)}`,
      `${(cx - w).toFixed(1)},${(cy + w).toFixed(1)}`,
      `${(cx - rad).toFixed(1)},${cy}`,
      `${(cx - w).toFixed(1)},${(cy - w).toFixed(1)}`,
    ];
    return `<polygon points="${pts.join(" ")}" fill="${fill}" fill-opacity="${a.toFixed(3)}"/>`;
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    spark(66, 68, 22, alpha) +
    spark(212, 48, 13, alpha * 0.8) +
    spark(150, 170, 28, alpha) +
    spark(254, 212, 15, alpha * 0.75) +
    spark(70, 246, 12, alpha * 0.7) +
    `</svg>`;
  return svgDataUri(svg);
}

// Sparse small diamond outlines tile (Bundesliga look) — same scatter density as the CL stars.
export function diamondsTileUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const c = `rgb(${r}, ${g}, ${b})`;
  const diamond = (cx: number, cy: number, rad: number, rot: number, a: number) => {
    const w = rad * 0.7;
    const pts = `${cx},${(cy - rad).toFixed(1)} ${(cx + w).toFixed(1)},${cy} ${cx},${(cy + rad).toFixed(1)} ${(cx - w).toFixed(1)},${cy}`;
    return `<polygon points="${pts}" fill="none" stroke="${c}" stroke-opacity="${a.toFixed(3)}" stroke-width="2.5" transform="rotate(${rot} ${cx} ${cy})"/>`;
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    diamond(66, 68, 24, -8, alpha) +
    diamond(212, 48, 14, 12, alpha * 0.8) +
    diamond(150, 172, 30, 5, alpha * 0.9) +
    diamond(252, 214, 16, -14, alpha * 0.75) +
    diamond(68, 248, 12, 9, alpha * 0.7) +
    `</svg>`;
  return svgDataUri(svg);
}

// Sparse small scudetto-shield outlines tile (Serie A look) — same scatter density as the CL stars.
export function shieldsTileUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const c = `rgb(${r}, ${g}, ${b})`;
  const shield = (cx: number, cy: number, rad: number, rot: number, a: number) => {
    const w = rad * 0.78;
    const d =
      `M ${(cx - w).toFixed(1)} ${(cy - rad).toFixed(1)} ` +
      `L ${(cx + w).toFixed(1)} ${(cy - rad).toFixed(1)} ` +
      `L ${(cx + w).toFixed(1)} ${(cy + rad * 0.1).toFixed(1)} ` +
      `Q ${(cx + w).toFixed(1)} ${(cy + rad * 0.72).toFixed(1)} ${cx} ${(cy + rad).toFixed(1)} ` +
      `Q ${(cx - w).toFixed(1)} ${(cy + rad * 0.72).toFixed(1)} ${(cx - w).toFixed(1)} ${(cy + rad * 0.1).toFixed(1)} Z`;
    return `<path d="${d}" fill="none" stroke="${c}" stroke-opacity="${a.toFixed(3)}" stroke-width="2.5" transform="rotate(${rot} ${cx} ${cy})"/>`;
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    shield(66, 68, 22, -6, alpha) +
    shield(212, 48, 13, 8, alpha * 0.8) +
    shield(150, 172, 28, 4, alpha * 0.9) +
    shield(252, 214, 15, -10, alpha * 0.75) +
    shield(68, 248, 11, 7, alpha * 0.7) +
    `</svg>`;
  return svgDataUri(svg);
}

// Sparse small crown outlines tile (Premier League look) — same scatter density as the CL stars.
export function crownsTileUri(lineHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(lineHex);
  const c = `rgb(${r}, ${g}, ${b})`;
  const crown = (cx: number, cy: number, rad: number, rot: number, a: number) => {
    // 3-point crown silhouette around (cx, cy), height ≈ 1.1r, width ≈ 2r.
    const d =
      `M ${(cx - rad).toFixed(1)} ${(cy + rad * 0.5).toFixed(1)} ` +
      `L ${(cx - rad).toFixed(1)} ${(cy - rad * 0.2).toFixed(1)} ` +
      `L ${(cx - rad * 0.5).toFixed(1)} ${(cy + rad * 0.15).toFixed(1)} ` +
      `L ${cx} ${(cy - rad * 0.6).toFixed(1)} ` +
      `L ${(cx + rad * 0.5).toFixed(1)} ${(cy + rad * 0.15).toFixed(1)} ` +
      `L ${(cx + rad).toFixed(1)} ${(cy - rad * 0.2).toFixed(1)} ` +
      `L ${(cx + rad).toFixed(1)} ${(cy + rad * 0.5).toFixed(1)} Z`;
    return `<path d="${d}" fill="none" stroke="${c}" stroke-opacity="${a.toFixed(3)}" stroke-width="2.5" stroke-linejoin="round" transform="rotate(${rot} ${cx} ${cy})"/>`;
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    crown(66, 68, 22, -7, alpha) +
    crown(212, 48, 13, 9, alpha * 0.8) +
    crown(150, 172, 28, 4, alpha * 0.9) +
    crown(252, 214, 15, -11, alpha * 0.75) +
    crown(68, 248, 11, 6, alpha * 0.7) +
    `</svg>`;
  return svgDataUri(svg);
}

// ── Label → data lookups (controls store the label string) ──────────────────
export const colorHexByLabel = (label: string): string =>
  COLORS.find((c) => c.label === label)?.hex ?? COLORS[5].hex;

export const effectIdByLabel = (label: string): EffectId =>
  EFFECTS.find((e) => e.label === label)?.id ?? "youtube-thumbnails";

export const competitionByLabel = (label: string) =>
  COMPETITIONS.find((c) => c.label === label) ?? null;

export const COLOR_LABELS = COLORS.map((c) => c.label);
export const EFFECT_LABELS = EFFECTS.map((e) => e.label);
export const COMPETITION_LABELS = COMPETITIONS.map((c) => c.label);
