import React from "react";
import { useCurrentFrame, interpolate, Easing, Img, useVideoConfig } from "remotion";
import { assetUrl } from "../assets";

export interface SlotData {
  name: string;
  frontRel: string;
  photoRel: string;
}

interface PlayerSlotProps {
  slot: SlotData;
  /** Pitch-area percent coordinate for left position (0–100) */
  x: number;
  /** Pitch-area percent coordinate for top position (0–100) */
  y: number;
  /** Scale multiplier for the front badge (flag/crest) */
  frontScale: number;
  /** Global frame at which the flip begins */
  flipStartFrame: number;
  /** Number of frames the flip animation takes */
  flipDurationFrames: number;
  assetBase: string;
  displayMode?: string;
}

/**
 * A single player slot rendered as an absolutely-positioned flip card.
 * The wrapper is centred at (x%, y%) via translate(-50%,-50%).
 * The .slot-inner div rotates Y from 0→180° at reveal.
 * Front face: nationality flag (circular badge).
 * Back face: player photo + name label.
 */
export const PlayerSlot: React.FC<PlayerSlotProps> = ({
  slot,
  x,
  y,
  frontScale,
  flipStartFrame,
  flipDurationFrames,
  assetBase,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  // Scale slot size relative to 2560-wide canvas; base size 90px → becomes ~90px at 2560.
  const BASE_BADGE_PX = 90;
  const slotSize = Math.round((width / 2560) * BASE_BADGE_PX);

  // Frame-driven rotateY: 0→180 over the flip window, clamped outside.
  const rot = interpolate(
    frame,
    [flipStartFrame, flipStartFrame + flipDurationFrames],
    [0, 180],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    }
  );

  const frontUrl = assetUrl(slot.frontRel, assetBase);
  const backUrl = assetUrl(slot.photoRel, assetBase);

  // Outer wrapper: centred at (x%, y%) inside the pitch area.
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    width: slotSize,
    height: slotSize,
    transform: "translate(-50%, -50%)",
    // Ensure 3D context propagates
    perspective: 600,
  };

  // Inner rotating container — mirrors .slot-inner
  const innerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transform: `rotateY(${rot}deg)`,
    willChange: "transform",
  };

  // Shared face style — mirrors .slot-face
  const faceBase: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  // Front face: circular badge with white ring
  const frontFaceStyle: React.CSSProperties = {
    ...faceBase,
    transform: "translateZ(0)",
  };

  // Back face: pre-rotated 180° — mirrors .slot-back
  const backFaceStyle: React.CSSProperties = {
    ...faceBase,
    transform: "rotateY(180deg) translateZ(0)",
  };

  // Badge circle (white disc + flag image inside)
  const avatarStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    padding: "clamp(2px, 1.7%, 2.35px)",
    boxSizing: "border-box",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.28)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const flagImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    transform: `scale(${frontScale})`,
    transformOrigin: "center center",
  };

  // Photo frame: fill the slot, object-fit cover, slight border-radius
  const photoImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    objectPosition: "top center",
    backgroundColor: "#1a1a2e",
  };

  // Name label below the slot (only visible on the back / revealed side)
  // Because it's outside the flip card, we fade it in when rot > 90 (back is showing)
  const nameOpacity = interpolate(rot, [80, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const nameLabelStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    fontSize: Math.round(slotSize * 0.22),
    fontWeight: 700,
    color: "#ffffff",
    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
    opacity: nameOpacity,
    pointerEvents: "none",
    fontFamily: "sans-serif",
  };

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        {/* Front face: flag badge */}
        <div style={frontFaceStyle}>
          <div style={avatarStyle}>
            <Img src={frontUrl} style={flagImgStyle} />
          </div>
        </div>

        {/* Back face: player photo */}
        <div style={backFaceStyle}>
          <div style={avatarStyle}>
            <Img src={backUrl} style={photoImgStyle} />
          </div>
        </div>
      </div>

      {/* Name label (outside flip card, fades in after reveal) */}
      <span style={nameLabelStyle}>{slot.name}</span>
    </div>
  );
};
