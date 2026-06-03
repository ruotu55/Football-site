import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { RemotionLevel } from "./props";
import { msToFrames } from "./timeline";
import { assetUrl } from "./assets";

interface TeamHeaderProps {
  level: RemotionLevel;
  assetBase: string;
  /** Global frame (relative to the Sequence) at which the header becomes visible */
  visibleFromFrame: number;
}

/**
 * TeamHeader — mirrors the app's #team-header side panel for Regular mode.
 *
 * CSS source matched from css/components/team-header.css:
 *   position: fixed; inset: 0 auto 0 5.3vw; width: min(16.35vw, 14.4rem)
 *   → at 2560×1440 with 1rem=16px:
 *       left = 0.053 × 2560 = 136px
 *       width = min(418px, 230px) = 230px
 *
 *   Logo slot: height: 10.4rem × width: 19rem → 166×304px at 1rem=16px
 *   Logo img: transform: scale(1.3) (30% larger visual crest)
 *   Logo margin-top: calc(min(14.44vh, 5.9rem) - 1.3rem)
 *     = min(208px, 94px) - 21px = 73px
 *
 *   Name: font-size: clamp(2.025rem, 3.75vw, 3.225rem) italic bold uppercase
 *         letter-spacing: 0.08em; text-shadow 4px blur
 *   Name inner: white-space: nowrap (no mid-word wrap!)
 *   Name margin: 0.886rem top = 14px
 *
 * Slides in from left over 500ms (transition: transform 0.5s ease-out).
 */

const REM = 16; // 1rem in px (browser default)
const CANVAS_W = 2560;
const CANVAS_H = 1440;

// Panel geometry — css: inset: 0 auto 0 5.3vw; width: min(16.35vw, 14.4rem)
const PANEL_LEFT = Math.round(0.053 * CANVAS_W);                             // 136px
const PANEL_WIDTH = Math.min(Math.round(0.1635 * CANVAS_W), Math.round(14.4 * REM)); // min(418,230)=230px

const REVEAL_DURATION_MS = 500; // matches CSS transition: 0.5s ease-out

// Logo slot sizes — css: height: 10.4rem; width: 19rem; transform: scale(1.3)
// At 1rem=16px: slot 166px × 304px; visual with scale(1.3) = 216 × 395px (but overflow hidden)
const LOGO_SLOT_H = Math.round(10.4 * REM); // 166px
const LOGO_SLOT_W = Math.round(19 * REM);   // 304px  (capped to panel width)

// Logo top margin — css: calc(min(14.44vh, 5.9rem) - 1.3rem)
const LOGO_MARGIN_TOP = Math.round(Math.min(0.1444 * CANVAS_H, 5.9 * REM) - 1.3 * REM); // min(208,94)-21=73px

// Name margin top — css: 0.886rem
const NAME_MARGIN_TOP = Math.round(0.886 * REM); // 14px

// Name font: the app uses clamp(2.025rem, 3.75vw, 3.225rem) = 52px at 2560px, but
// applies a JS text-fitter that shrinks per-word until each word fits one line.
// We can't measure text at render time, so we use a conservative size that guarantees
// even the longest single word ("MANCHESTER", 10 chars) fits within the panel.
// Panel usable width = PANEL_WIDTH - 2×padding = 230 - 11 = 219px.
// At 38px italic Barlow Condensed: "MANCHESTER" ≈ 38 × 10 × 0.52 + 0.08×38×9 gaps ≈ 198+27 = 225px
// → fits at 38px; two-word names like "Arsenal FC" each word fits on its own line.
const NAME_FONT_SIZE = 38; // px — safe for all team names without mid-word breaks

export const TeamHeader: React.FC<TeamHeaderProps> = ({ level, assetBase, visibleFromFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Not yet visible
  if (frame < visibleFromFrame) return null;

  const revealDurationFrames = msToFrames(REVEAL_DURATION_MS, fps);
  const localRevealFrame = frame - visibleFromFrame;

  const opacity = interpolate(localRevealFrame, [0, revealDurationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Slide in from left (translateX from -PANEL_WIDTH to 0)
  const translateX = interpolate(localRevealFrame, [0, revealDurationFrames], [-PANEL_WIDTH, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const teamName = level.teamName ?? "";
  const logoRel = level.headerLogoOverrideRelPath || level.headerLogoRel || "";
  const logoUrl = logoRel ? assetUrl(logoRel, assetBase) : "";

  const logoScale = level.headerLogoScale ?? 1;
  const logoNudgeX = level.headerLogoNudgeX ?? 0;

  // Panel: left vertical band, dark bg, shadow — matches .team-header
  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: PANEL_LEFT,
    width: PANEL_WIDTH,
    height: CANVAS_H,
    backgroundColor: "rgba(15, 20, 35, 0.92)", // approx --team-panel-bg
    boxShadow: "15px 0 30px rgba(0,0,0,0.7)",
    borderRight: "2px solid #000",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    color: "#fff",
    transform: `translateX(${translateX}px)`,
    opacity,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 160,
    fontFamily: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    padding: `${Math.round(Math.max(1.2 * REM, 0.0075 * CANVAS_H))}px ${Math.round(0.65 * REM)}px 0`,
    boxSizing: "border-box",
  };

  // Logo wrap — css: .team-side-panel-logo-wrap { margin-top: calc(min(14.44vh,5.9rem)-1.3rem) }
  const logoWrapStyle: React.CSSProperties = {
    marginTop: LOGO_MARGIN_TOP,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    flexShrink: 0,
  };

  // Logo slot bounding box — css: height: 10.4rem; width: 19rem (capped to panel width)
  const logoSlotStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: Math.min(LOGO_SLOT_W, PANEL_WIDTH - Math.round(2 * 0.65 * REM)),
    height: LOGO_SLOT_H,
    overflow: "visible",
  };

  // Logo inner — css: transform: translateX(nudge) on .team-header-logo-shift
  //              then scale(logoScale) on .team-header-logo-inner
  //              then the img itself has transform: scale(1.3)
  const logoInnerStyle: React.CSSProperties = {
    transform: `translateX(${logoNudgeX}px) scale(${logoScale * 1.3})`,
    transformOrigin: "center center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  };

  const logoImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.6))",
  };

  // Team name — css: .team-header-name.team-side-panel-country-name
  //   font-size: clamp(2.025rem, 3.75vw, 3.225rem); italic; weight 900; uppercase
  //   letter-spacing: 0.08em; text-shadow: 0 4px 10px rgba(0,0,0,0.85)
  //   margin: 0.886rem 0 0; padding-inline: 0.35rem
  //
  // .team-header-name-inner: white-space: nowrap — each word sits on its own line row.
  // The app JS fitter shrinks font until each word fits the panel width.
  // We use a fixed 38px that guarantees the longest single word ("MANCHESTER")
  // fits within the 219px usable width, so line breaks only happen at spaces.
  const nameStyle: React.CSSProperties = {
    marginTop: NAME_MARGIN_TOP,
    width: "100%",
    textAlign: "center",
    fontFamily: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    fontSize: NAME_FONT_SIZE,
    fontWeight: 900,
    fontStyle: "italic",
    letterSpacing: "0.08em",
    color: "#ffffff",
    textShadow: "0 4px 10px rgba(0,0,0,0.85)",
    textTransform: "uppercase",
    lineHeight: 1.1,
    // Allow breaks ONLY at word boundaries (spaces), never mid-word:
    whiteSpace: "normal",
    wordBreak: "normal",
    overflowWrap: "normal",
    hyphens: "none",
    padding: `0 ${Math.round(0.35 * REM)}px`,
    boxSizing: "border-box" as const,
  };

  return (
    <div style={panelStyle}>
      <div style={logoWrapStyle}>
        {logoUrl ? (
          <div style={logoSlotStyle}>
            <div style={logoInnerStyle}>
              <img src={logoUrl} style={logoImgStyle} alt={teamName} />
            </div>
          </div>
        ) : (
          <div
            style={{
              width: Math.min(LOGO_SLOT_W, PANEL_WIDTH - Math.round(2 * 0.65 * REM)),
              height: LOGO_SLOT_H,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
            }}
          />
        )}
      </div>
      {teamName ? <div style={nameStyle}>{teamName}</div> : null}
    </div>
  );
};
