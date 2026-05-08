/**
 * Sample the team flag image and set --team-stripe-1..3 on #team-header for diagonal lines.
 * Requires a CORS-safe image (crossOrigin="anonymous" on the img when remote).
 */

import { refreshTeamHeaderHatchGrid } from "./team-header-hatch.js";

const STRIPE_ALPHA = 0.52;

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Matches resolved --team-panel-bg (e.g. color-mix from --bg-stage). */
function getPanelBgRgb(teamHeaderEl) {
  if (!teamHeaderEl) return [49, 80, 67];
  const bg = getComputedStyle(teamHeaderEl).backgroundColor;
  const m = bg.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return [49, 80, 67];
  return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
}

function tooCloseToPanelBg(rgb, panelRgb) {
  return colorDistance(rgb, panelRgb) < 26;
}

/** 0..1 — low = gray / near-white; high = vivid primaries */
function roughSaturation(rgb) {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
  const mn = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
  if (mx <= 0) return 0;
  return (mx - mn) / mx;
}

/** Drop a third “dominant” that is usually JPEG edge / anti-alias mud between two real flag colors */
function withoutMuddyThirdStripe(picked) {
  if (picked.length !== 3) return picked;
  const [a, b, c] = picked;
  const sa = roughSaturation(a);
  const sb = roughSaturation(b);
  const sc = roughSaturation(c);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  if (sc < 0.24 && sa >= 0.32 && sb >= 0.32) {
    return [a, b];
  }
  if (sc < 0.3 && colorDistance(c, mid) < 42 && sa >= 0.28 && sb >= 0.28) {
    return [a, b];
  }
  return picked;
}

/**
 * @param {HTMLImageElement} img
 * @param {HTMLElement | null} teamHeaderEl
 */
export function applyTeamHeaderStripesFromFlagImage(img, teamHeaderEl) {
  if (!teamHeaderEl || !img?.src || img.naturalWidth < 2 || img.naturalHeight < 2) {
    resetTeamHeaderStripeVars(teamHeaderEl);
    return;
  }
  const w = 56;
  const h = Math.max(
    28,
    Math.round(w * (img.naturalHeight / Math.max(1, img.naturalWidth)))
  );
  try {
    const panelRgb = getPanelBgRgb(teamHeaderEl);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      resetTeamHeaderStripeVars(teamHeaderEl);
      return;
    }
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 85) continue;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      r = (r >> 3) << 3;
      g = (g >> 3) << 3;
      b = (b >> 3) << 3;
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sortedRgb = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k.split(",").map(Number));

    const picked = [];
    const minSep = 38;

    const tryPick = (list, relaxSep) => {
      const sep = relaxSep ?? minSep;
      for (const rgb of list) {
        if (picked.length >= 3) return;
        const lum = luminance(rgb[0], rgb[1], rgb[2]);
        if (lum < 12 || lum > 252) continue;
        if (tooCloseToPanelBg(rgb, panelRgb)) continue;
        if (picked.every((p) => colorDistance(p, rgb) >= sep)) {
          picked.push(rgb);
        }
      }
    };

    tryPick(sortedRgb, minSep);
    if (picked.length < 3) tryPick(sortedRgb, 22);
    if (picked.length < 3) tryPick(sortedRgb, 12);
    if (picked.length < 2) tryPick(sortedRgb, 8);

    const stripeColors = withoutMuddyThirdStripe(picked);

    const a = STRIPE_ALPHA;

    if (stripeColors.length === 0) {
      resetTeamHeaderStripeVars(teamHeaderEl);
      return;
    }

    teamHeaderEl.removeAttribute("data-team-stripe-colors");

    if (stripeColors.length === 1) {
      const [r, g, b] = stripeColors[0];
      teamHeaderEl.dataset.teamStripeColors = "2";
      teamHeaderEl.style.setProperty("--team-stripe-1", `rgba(${r},${g},${b},${a})`);
      teamHeaderEl.style.setProperty(
        "--team-stripe-2",
        `rgba(${r},${g},${b},${Math.min(1, a * 0.72)})`
      );
      teamHeaderEl.style.removeProperty("--team-stripe-3");
      refreshTeamHeaderHatchGrid(teamHeaderEl);
      return;
    }

    if (stripeColors.length === 2) {
      teamHeaderEl.dataset.teamStripeColors = "2";
      teamHeaderEl.style.setProperty(
        "--team-stripe-1",
        `rgba(${stripeColors[0][0]},${stripeColors[0][1]},${stripeColors[0][2]},${a})`
      );
      teamHeaderEl.style.setProperty(
        "--team-stripe-2",
        `rgba(${stripeColors[1][0]},${stripeColors[1][1]},${stripeColors[1][2]},${a})`
      );
      teamHeaderEl.style.removeProperty("--team-stripe-3");
      refreshTeamHeaderHatchGrid(teamHeaderEl);
      return;
    }

    teamHeaderEl.style.setProperty(
      "--team-stripe-1",
      `rgba(${stripeColors[0][0]},${stripeColors[0][1]},${stripeColors[0][2]},${a})`
    );
    teamHeaderEl.style.setProperty(
      "--team-stripe-2",
      `rgba(${stripeColors[1][0]},${stripeColors[1][1]},${stripeColors[1][2]},${a})`
    );
    teamHeaderEl.style.setProperty(
      "--team-stripe-3",
      `rgba(${stripeColors[2][0]},${stripeColors[2][1]},${stripeColors[2][2]},${a})`
    );
  } catch {
    resetTeamHeaderStripeVars(teamHeaderEl);
  }
  refreshTeamHeaderHatchGrid(teamHeaderEl);
}

/** Remove inline stripe colors (CSS fallbacks: white / blue / soft gray). */
export function resetTeamHeaderStripeVars(teamHeaderEl) {
  if (!teamHeaderEl) return;
  teamHeaderEl.removeAttribute("data-team-stripe-colors");
  teamHeaderEl.style.removeProperty("--team-stripe-1");
  teamHeaderEl.style.removeProperty("--team-stripe-2");
  teamHeaderEl.style.removeProperty("--team-stripe-3");
  refreshTeamHeaderHatchGrid(teamHeaderEl);
}
