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
 * In the live app: a fixed left-side band (inset: 0 auto 0 ~5.3vw, width ~16.35vw) that
 * slides in via CSS transform. Here we replicate it as an absolute-positioned band since
 * Remotion uses an absolute canvas (no viewport/vw; we approximate with px).
 *
 * At 2560×1440:
 *   left inset ≈ 5.3vw = 0.053 × 2560 ≈ 136px
 *   width ≈ min(16.35vw, 14.4rem) = min(418px, 230px) = 230px at 1rem=16px
 *
 * Appears at visibleFromFrame, fades+scales in over 300ms.
 * Returns null before that frame so there's no invisible box occupying the area.
 */

const REM = 16;
const CANVAS_W = 2560;
const CANVAS_H = 1440;

// Panel geometry matching team-header.css
const PANEL_LEFT = Math.round(0.053 * CANVAS_W); // ~136px
const PANEL_WIDTH = Math.min(Math.round(0.1635 * CANVAS_W), Math.round(14.4 * REM)); // min(418,230)=230
const REVEAL_DURATION_MS = 300;

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
  const translateX = interpolate(localRevealFrame, [0, revealDurationFrames], [-PANEL_WIDTH, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const teamName = level.teamName ?? "";
  // Resolve logo: prefer override, fall back to headerLogoRel
  const logoRel = level.headerLogoOverrideRelPath || level.headerLogoRel || "";
  const logoUrl = logoRel ? assetUrl(logoRel, assetBase) : "";

  const logoScale = level.headerLogoScale ?? 1;
  const logoNudgeX = level.headerLogoNudgeX ?? 0;

  // Logo display size: the live app uses ~min(10.5vw,8rem) for the logo slot.
  // At 2560px: min(268px, 128px) = 128px
  const LOGO_SIZE = Math.min(Math.round(0.105 * CANVAS_W), 8 * REM); // 128px

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: PANEL_LEFT,
    width: PANEL_WIDTH,
    height: CANVAS_H,
    backgroundColor: "rgba(15, 20, 35, 0.92)", // mirrors --team-panel-bg dark
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
  };

  const logoWrapStyle: React.CSSProperties = {
    marginTop: Math.round(0.144 * CANVAS_H * 0.7), // ~14.44vh * 0.7 ≈ 145px
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    flexShrink: 0,
  };

  const logoInnerStyle: React.CSSProperties = {
    transform: `translateX(${logoNudgeX}px) scale(${logoScale})`,
    transformOrigin: "center center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const logoImgStyle: React.CSSProperties = {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    objectFit: "contain",
    display: "block",
  };

  // Team name block — matches .team-header-name-line structure
  const nameStyle: React.CSSProperties = {
    marginTop: Math.round(0.04 * CANVAS_H), // ~57px
    width: "100%",
    textAlign: "center",
    fontFamily: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    fontWeight: 900,
    // Approximate auto-shrink: cap at PANEL_WIDTH - 2*padding
    fontSize: Math.round(PANEL_WIDTH * 0.22), // ~50px
    letterSpacing: 1,
    color: "#fff",
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
    padding: `0 ${Math.round(0.65 * REM)}px`,
    lineHeight: 1.1,
    wordBreak: "break-word",
    textTransform: "uppercase",
    overflowWrap: "break-word",
  };

  return (
    <div style={panelStyle}>
      {logoWrapStyle && (
        <div style={logoWrapStyle}>
          {logoUrl ? (
            <div style={logoInnerStyle}>
              <img src={logoUrl} style={logoImgStyle} alt={teamName} />
            </div>
          ) : (
            // Empty crest placeholder
            <div
              style={{
                width: LOGO_SIZE,
                height: LOGO_SIZE,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
              }}
            />
          )}
        </div>
      )}
      {teamName ? <div style={nameStyle}>{teamName}</div> : null}
    </div>
  );
};
