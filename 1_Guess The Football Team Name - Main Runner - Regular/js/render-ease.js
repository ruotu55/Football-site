// js/render-ease.js — exact CSS cubic-bezier easing as GSAP ease functions.
//
// In Render Video the virtual clock makes CSS transitions snap and CSS keyframes run
// at the wrong speed, so reveal motions are re-driven with GSAP (RAF/virtual-time
// synced). To match Play 100% the GSAP eases must equal the CSS timing functions
// exactly — GSAP's stock eases only approximate, and the CustomEase plugin isn't
// loaded — so we solve the cubic-bezier ourselves (same maths the browser uses).

/** Build a GSAP ease `(p)->eased` that matches CSS `cubic-bezier(x1,y1,x2,y2)`. */
export function cssCubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const fy = (t) => ((ay * t + by) * t + cy) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x) => {
    // Newton-Raphson first (fast), bisection fallback (robust).
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-6) return t;
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 24; i++) {
      const e = fx(t);
      if (Math.abs(e - x) < 1e-6) break;
      if (e < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : fy(solveT(p)));
}

/** Slot flip + reveal motions — matches pitch.css `.slot-inner` cubic-bezier. */
export const EASE_FLIP = cssCubicBezier(0.33, 1, 0.68, 1);
/** CSS `ease-out` — matches `cubic-bezier(0, 0, 0.58, 1)` (team-header slide). */
export const EASE_OUT = cssCubicBezier(0, 0, 0.58, 1);
