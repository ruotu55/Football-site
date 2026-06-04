import React from "react";
import { Img } from "remotion";
import { loadFont } from "@remotion/google-fonts/BarlowCondensed";
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
 * TODO: the app slides the panel in from the left over 0.5s (transition: transform
 * 0.5s ease-out). We render it shown for now.
 */

const REM = 24;
const CANVAS_W = 2560;
const CANVAS_H = 1440;
const rem = (r: number) => r * REM;
const vw = (v: number) => (v / 100) * CANVAS_W;
const vh = (v: number) => (v / 100) * CANVAS_H;

// Panel geometry — css: inset:0 auto 0 5.3vw; width: min(16.35vw, 14.4rem); min 7.2rem; max 17rem
const PANEL_LEFT = vw(5.3); // ≈136px
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

export const TeamHeader: React.FC<TeamHeaderProps> = ({ level, assetBase, visibleFromFrame: _visibleFromFrame, bgStage }) => {
  // Rendered shown (no slide-in for now — see TODO above). visibleFromFrame is
  // accepted for API compatibility; QuestionLevel gates mounting on the reveal.

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
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 9px)," +
      "repeating-linear-gradient(-45deg, rgba(0,122,204,0.06) 0 1px, transparent 1px 11px)," +
      "repeating-linear-gradient(45deg, rgba(200,200,220,0.05) 0 1px, transparent 1px 13px)",
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
            <Img src={flagUrl} style={flagImgStyle} />
          </div>
        </div>
      ) : null}

      {/* Crest + name column */}
      <div style={columnStyle}>
        <div style={logoWrapStyle}>
          {logoUrl ? (
            <div style={logoShiftStyle}>
              <div style={logoInnerStyle}>
                <Img src={logoUrl} style={logoImgStyle} alt={teamName} />
              </div>
            </div>
          ) : (
            <div
              style={{
                width: LOGO_W,
                height: LOGO_H,
                maxWidth: Math.min(LOGO_W, PANEL_WIDTH - 2 * COL_PAD_X - rem(0.5)),
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
              }}
            />
          )}
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
