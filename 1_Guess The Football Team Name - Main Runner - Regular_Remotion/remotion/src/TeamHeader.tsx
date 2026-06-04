import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";
import { SafeImg } from "./SafeImg";
import type { RemotionLevel } from "./props";
import { assetUrl } from "./assets";

// Load Barlow Condensed — same font the app loads via Google Fonts. The team name
// is weight 900 italic; weight 800 is loaded by LandingLevel, so we add 900 here.
const { fontFamily } = loadFont("normal", { weights: ["800", "900"], subsets: ["latin"] });
const { fontFamily: italicFamily } = loadFont("italic", { weights: ["900"], subsets: ["latin"] });

interface TeamHeaderProps {
  level: RemotionLevel;
  assetBase: string;
  /** Global frame (relative to the Sequence) at which the header becomes visible */
  visibleFromFrame: number;
  /** Resolved theme stage color (effectiveBg.bgStage). The panel bg is a dark tint of
   *  this. Threaded in because BackgroundTheme's documentElement --bg-stage var is not
   *  reliably inherited by sibling components during single-frame still renders. */
  bgStage?: string;
}

/**
 * TeamHeader — reproduces the app's #team-header side panel for Regular mode at 100%.
 * CSS source: css/components/team-header.css (verified spec).
 *
 * Root convention matches LandingLevel: rem(r) = r * 24 (REM=24). Composition
 * viewport = 2560×1440, so vw→2560 basis, vh→1440 basis.
 *
 * Slide-in: the app keeps the panel off-screen (translateX(-100%)) during the
 * countdown and slides it to translateX(0) only when the answer is revealed
 * (css: transition: transform 0.5s ease-out; .team-header--show adds translateX(0)).
 * We reproduce that frame-deterministically: hidden before `visibleFromFrame`
 * (the question-local reveal frame), then translateX(-100%)→0 over 0.5s with a
 * CSS ease-out bezier. QuestionLevel only mounts this for questions that have a
 * reveal (never the bonus skip-reveal level), so the panel never shows there.
 */

const REM = 24;
const CANVAS_W = 2560;
const CANVAS_H = 1440;
const rem = (r: number) => r * REM;
const vw = (v: number) => (v / 100) * CANVAS_W;
const vh = (v: number) => (v / 100) * CANVAS_H;

// Panel geometry — css: inset:0 auto 0 var(--screen-size-inset-left, 5.3vw).
// In the fullscreen play video --screen-size-inset-left is 0, so the panel is flush to the
// LEFT edge (the 5.3vw is only the letterbox fallback). The composition is full-bleed, so we
// use 0 — no gap between the screen edge and the panel.
const PANEL_LEFT = 0;
const PANEL_WIDTH = Math.max(
  rem(7.2),
  Math.min(rem(17), Math.min(vw(16.35), rem(14.4)))
); // min(419, 345) = 345px

// Logo top margin — css: calc(min(14.44vh, 5.9rem) - 1.3rem) → min(208,141.6)-31.2 = 110.4px
const LOGO_MARGIN_TOP = Math.min(vh(14.44), rem(5.9)) - rem(1.3);

// Crest slot — css (club): width 19rem (456), height 10.4rem (250); max-width min(19rem, 100%-0.5rem)
const LOGO_W = rem(19); // 456
const LOGO_H = rem(10.4); // 250

// Column horizontal padding (css .team-header-logo-block: padding 0.65rem each side)
const COL_PAD_X = rem(0.65);
// Name padding-inline 0.35rem
const NAME_PAD_X = rem(0.35);

// Name base font — css: clamp(2.025rem, 3.75vw, 3.225rem) → clamp(48.6, 96, 77.4) = 77.4 (capped)
const NAME_FONT_MAX = Math.min(vw(3.75), rem(3.225)); // 77.4

// Inner usable width for the name (panel - 2×col pad - 2×name pad ≈ 320px)
const NAME_INNER_W = PANEL_WIDTH - 2 * COL_PAD_X - 2 * NAME_PAD_X;

/**
 * Uniform-shrink fitter (mirrors the app's per-word fitter): each word sits on its
 * own line; all lines share ONE font-size, shrunk so the LONGEST word fits the inner
 * width. We can't measure glyphs at render time, so approximate Barlow Condensed 900
 * italic advance width as ~0.52em per char. Hard floor 14px.
 */
function fitFontPx(teamName: string): number {
  const words = teamName.split(/\s+/).filter(Boolean);
  const longest = words.reduce((m, w) => Math.max(m, w.length), 0);
  if (longest <= 0) return NAME_FONT_MAX;
  // width(px) ≈ fontPx * longest * 0.52  ⇒  fontPx = innerW / (longest * 0.52)
  const fit = NAME_INNER_W / (longest * 0.52);
  return Math.max(14, Math.min(NAME_FONT_MAX, fit));
}

// ── Team-coloured broken crosshatch (port of js/team-header-hatch.js) ─────────
// A 132×132 tile of dashed diagonal segments (both \ and /) in the team's flag stripe
// colours, with irregular dashes/gaps. The app uses Math.random per page load; here we use a
// SEEDED PRNG so the pattern is identical on every frame (no flicker) yet still looks broken.
const HATCH_TILE = 132;
const DEFAULT_STRIPES = [
  "rgba(255, 255, 255, 0.5)",
  "rgba(0, 122, 204, 0.5)",
  "rgba(200, 200, 220, 0.5)",
];

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Seg = [number, number, number, number];
function segmentFromCandidates(cand: number[][]): Seg | null {
  const eps = 1e-4;
  const uniq: number[][] = [];
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
}
function clipXYminus(W: number, H: number, c: number): Seg | null {
  const cand: number[][] = [];
  if (c >= 0 && c <= W) cand.push([c, 0]);
  if (H + c >= 0 && H + c <= W) cand.push([H + c, H]);
  if (c >= -H && c <= 0) cand.push([0, -c]);
  if (W - c >= 0 && W - c <= H) cand.push([W, W - c]);
  return segmentFromCandidates(cand);
}
function clipXYplus(W: number, H: number, c: number): Seg | null {
  const cand: number[][] = [];
  if (c >= 0 && c <= H) cand.push([0, c]);
  if (c >= W && c <= W + H) cand.push([W, c - W]);
  if (c >= 0 && c <= W) cand.push([c, 0]);
  if (c >= H && c <= W + H) cand.push([c - H, H]);
  return segmentFromCandidates(cand);
}
function dashedLinesAlongSegment(
  seg: Seg, colors: string[], parts: string[], rng: () => number,
): void {
  let [x0, y0, x1, y1] = seg;
  let dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  if (rng() < 0.5) { x0 = x1; y0 = y1; dx = -dx; dy = -dy; }
  const ux = dx / L, uy = dy / L;
  let u = rng() * 4;
  while (u < L - 0.2) {
    const dashLen = 1.2 + rng() * 6.3;
    const gapLen = 1.5 + rng() * 14.5;
    const u1 = Math.min(u + dashLen, L);
    if (u1 - u > 0.25) {
      const col = colors[Math.floor(rng() * colors.length)] ?? colors[0];
      const ax = x0 + ux * u, ay = y0 + uy * u;
      const bx = x0 + ux * u1, by = y0 + uy * u1;
      parts.push(
        `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="${col}" stroke-width="0.82" stroke-linecap="square"/>`,
      );
    }
    u = u1 + gapLen;
  }
}
function buildTeamHatchDataUri(colors: string[], seed: number): string {
  const rng = mulberry32(seed);
  const W = HATCH_TILE, H = HATCH_TILE;
  const step = 9 + Math.floor(rng() * 5);
  const parts: string[] = [];
  const kMax = Math.ceil((W + H) / step) + 1;
  for (let k = -kMax; k <= kMax; k++) {
    const c = k * step;
    const s1 = clipXYminus(W, H, c);
    if (s1) dashedLinesAlongSegment(s1, colors, parts, rng);
    const s2 = clipXYplus(W, H, c);
    if (s2) dashedLinesAlongSegment(s2, colors, parts, rng);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join("")}</svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

export const TeamHeader: React.FC<TeamHeaderProps> = ({ level, assetBase, visibleFromFrame, bgStage }) => {
  // Slide-in driven by the question-local frame. Before `visibleFromFrame` the
  // panel sits fully off-screen (translateX(-100%), i.e. hidden during the
  // countdown); at the reveal frame it slides to translateX(0) over 0.5s using
  // the CSS "ease-out" bezier (0,0,0.58,1) — matching css/components/team-header.css.
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slideFrames = Math.max(1, Math.round((500 / 1000) * fps)); // 0.5s
  // Hidden offset: translate the panel fully off the left edge. The app uses
  // translateX(-100%), which clears it because in the fullscreen play-video the
  // panel sits at left:0 (--screen-size-inset-left = 0). Our panel rests at
  // left:PANEL_LEFT (the approved letterbox-matched offset), so -100% (= -PANEL_WIDTH)
  // would leave a PANEL_LEFT-wide sliver on screen. Push past the left offset AND the
  // 15px/30px-blur box-shadow so nothing of the panel is visible during the countdown.
  const SHADOW_REACH = 48; // box-shadow 15px x + 30px blur, with margin
  const hiddenX = -(PANEL_LEFT + PANEL_WIDTH + SHADOW_REACH);
  const slidePx = interpolate(
    frame,
    [visibleFromFrame, visibleFromFrame + slideFrames],
    [hiddenX, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0, 0, 0.58, 1),
    },
  );

  const teamName = level.teamName ?? "";
  const logoRel = level.headerLogoOverrideRelPath || level.headerLogoRel || "";
  const logoUrl = logoRel ? assetUrl(logoRel, assetBase) : "";

  const flagRel = level.headerFlagRel || "";
  const flagUrl = flagRel ? assetUrl(flagRel, assetBase) : "";

  const logoScale = level.headerLogoScale ?? 1;
  const logoNudgeX = level.headerLogoNudgeX ?? 0;

  const words = teamName.split(/\s+/).filter(Boolean);
  const nameFontPx = fitFontPx(teamName);
  const multiWord = words.length > 1;

  // Team-coloured diagonal crosshatch. Colours come from the flag stripes (level.stripeColors,
  // exported from the browser); seed by team so it is stable per team and per frame.
  const stripeColors =
    level.stripeColors && level.stripeColors.length ? level.stripeColors : DEFAULT_STRIPES;
  const hatchBg = React.useMemo(
    () => buildTeamHatchDataUri(stripeColors, hashStr(`${teamName}|${stripeColors.join(",")}`)),
    [teamName, stripeColors],
  );

  // .team-header — fixed left vertical band, theme-tinted dark bg.
  // #1 fix: panel reads as a dark tint of the CURRENT theme. We set --bg-stage as a
  // LOCAL inline custom property (from the threaded bgStage) so the color-mix resolves
  // even when BackgroundTheme's documentElement var isn't inherited (still renders).
  // The app's literal: color-mix(in srgb, var(--bg-stage) 82%, black 18%).
  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: PANEL_LEFT,
    width: PANEL_WIDTH,
    height: CANVAS_H,
    transform: `translateX(${slidePx}px)`,
    willChange: "transform",
    ["--bg-stage" as string]: bgStage || "var(--bg-stage, #3c6553)",
    backgroundColor: "color-mix(in srgb, var(--bg-stage) 82%, black 18%)",
    boxShadow: "15px 0 30px rgba(0,0,0,0.7)",
    borderRight: "2px solid #000",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    color: "#fff",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 160,
    boxSizing: "border-box",
  };

  // .team-header::before — subtle diagonal crosshatch, radial-masked to fade around
  // crest/name. Rendered as a child div (Remotion has no ::before).
  const hatchStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    backgroundImage: hatchBg,
    backgroundRepeat: "repeat",
    backgroundSize: `${HATCH_TILE}px ${HATCH_TILE}px`,
    WebkitMaskImage:
      "radial-gradient(ellipse 118% 68% at 50% 29%, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.58) 14%, rgba(0,0,0,0.74) 30%, rgba(0,0,0,0.88) 50%, rgba(0,0,0,1) 76%)",
    maskImage:
      "radial-gradient(ellipse 118% 68% at 50% 29%, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.58) 14%, rgba(0,0,0,0.74) 30%, rgba(0,0,0,0.88) 50%, rgba(0,0,0,1) 76%)",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
  };

  // Crest + name column (above the flag).
  const columnStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    padding: `0 ${COL_PAD_X}px`,
    boxSizing: "border-box",
  };

  // .team-side-panel-logo-wrap
  const logoWrapStyle: React.CSSProperties = {
    marginTop: LOGO_MARGIN_TOP,
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  };

  // nudgeX wrap (.team-header-logo-shift), scale wrap (.team-header-logo-inner),
  // img itself has transform: scale(1.3). Combine scale on inner: 1.3 * logoScale.
  const logoShiftStyle: React.CSSProperties = {
    transform: `translateX(${logoNudgeX}px)`,
  };
  const logoInnerStyle: React.CSSProperties = {
    transform: `scale(${1.3 * logoScale})`,
    transformOrigin: "center center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const logoImgStyle: React.CSSProperties = {
    width: LOGO_W,
    height: LOGO_H,
    maxWidth: Math.min(LOGO_W, PANEL_WIDTH - 2 * COL_PAD_X - rem(0.5)),
    objectFit: "contain",
    objectPosition: "center center",
    display: "block",
    filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.6))",
  };

  // .team-header-name.team-side-panel-country-name — words stacked, uniform size.
  const nameStyle: React.CSSProperties = {
    margin: `${rem(0.886)}px 0 0`,
    paddingInline: NAME_PAD_X,
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    fontFamily: `${italicFamily}, ${fontFamily}, "Barlow Condensed", "Arial Narrow", sans-serif`,
    fontSize: nameFontPx,
    fontWeight: 900,
    fontStyle: "italic",
    textTransform: "uppercase",
    lineHeight: multiWord ? 1 : 1.05,
    color: "#ffffff",
    letterSpacing: "0.08em",
    textShadow: "0 4px 10px rgba(0,0,0,0.85)",
  };

  // .team-side-panel-flag-section — bottom band, 35% of panel, min 5.5rem.
  const flagSectionStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "100%",
    height: "35%",
    minHeight: rem(5.5),
    zIndex: 2,
    pointerEvents: "none",
    boxSizing: "border-box",
  };
  // .team-side-panel-flag-image-wrap — rotated -8°, oversized to cover after rotation.
  const flagWrapStyle: React.CSSProperties = {
    position: "absolute",
    bottom: "-10%",
    left: "-10%",
    width: "120%",
    height: "100%",
    transform: "rotate(-8deg)",
    transformOrigin: "center center",
    pointerEvents: "none",
  };
  const flagImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    position: "absolute",
    inset: 0,
    display: "block",
    filter: "none",
  };

  return (
    <div style={panelStyle}>
      {/* Diagonal crosshatch overlay (::before stand-in) */}
      <div style={hatchStyle} />

      {/* Country flag band — bottom 35%, rotated; sits above hatch, below crest/name */}
      {flagUrl ? (
        <div style={flagSectionStyle}>
          <div style={flagWrapStyle}>
            <SafeImg src={flagUrl} style={flagImgStyle} fallback={null} />
          </div>
        </div>
      ) : null}

      {/* Crest + name column */}
      <div style={columnStyle}>
        <div style={logoWrapStyle}>
          <div style={logoShiftStyle}>
            <div style={logoInnerStyle}>
              <SafeImg
                src={logoUrl}
                style={logoImgStyle}
                fallback={
                  <div
                    style={{
                      width: LOGO_W,
                      height: LOGO_H,
                      maxWidth: Math.min(LOGO_W, PANEL_WIDTH - 2 * COL_PAD_X - rem(0.5)),
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.1)",
                    }}
                  />
                }
              />
            </div>
          </div>
        </div>

        {teamName ? (
          <div style={nameStyle}>
            {words.map((w, i) => (
              <span key={i} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                {w}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
