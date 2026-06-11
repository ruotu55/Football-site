import { Easing, Img, interpolate, spring, staticFile } from "remotion";
import type { ResolvedPlayer } from "../level-data";
import { fontFamily } from "../theme";
import { DESIGN_FPS } from "../timing";

const FLAG_CIRCLE_SCALE = 1.38; // flag circle size (front face only; bigger than the player card)
// Exported so the reveal panel slides in over the EXACT same time/easing as the flip.
export const FLIP_DURATION = 26; // 0.88s @30fps
export const EASE_FLIP = Easing.bezier(0.33, 1, 0.68, 1);
// Soft-edged circular clip (anti-aliased even on GPU-rasterized 3D elements).
const CIRCLE_MASK = "radial-gradient(circle at 50% 50%, #000 calc(50% - 1px), rgba(0,0,0,0) 50%)";

export const PlayerSlot: React.FC<{
  player: ResolvedPlayer;
  frame: number;
  delay: number;
  revealStart: number;
  tilt: number;
  sizeComp: number;
  widthPct: number;
  floatPhase: number;
}> = ({ player, frame, delay, revealStart, tilt, sizeComp, widthPct, floatPhase }) => {
  const pop = spring({
    frame: frame - delay,
    fps: DESIGN_FPS,
    config: { damping: 12, mass: 0.6, stiffness: 140 },
    durationInFrames: 28,
  });
  const popScale = interpolate(pop, [0, 1], [0.3, 1]);
  const opacity = interpolate(pop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });

  const flip = interpolate(frame, [revealStart, revealStart + FLIP_DURATION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_FLIP,
  });
  // 2D "card flip" (horizontal squash) driven ONLY by `flip`, so every card flips in
  // perfect sync. A true 3D rotateY crosses the edge-on point at different moments for
  // off-centre cards (perspective), which makes them look staggered.
  const flipX = Math.abs(Math.cos(flip * Math.PI)); // 1 → 0 (edge-on) → 1
  const showBack = flip >= 0.5;
  const innerScale = interpolate(flip, [0, 1], [FLAG_CIRCLE_SCALE, 1]);
  const bob = -6 * (1 - Math.cos(2 * Math.PI * (frame / (4 * DESIGN_FPS) + floatPhase)));

  return (
    <div
      style={{
        position: "absolute",
        left: `${player.x}%`,
        top: `${player.y}%`,
        width: `${widthPct}%`,
        aspectRatio: "10 / 12",
        transform: `translate(-50%, -50%) translateZ(60px) rotateX(${-tilt}deg) scale(${popScale * sizeComp})`,
        transformStyle: "preserve-3d",
        opacity,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: `translateY(${bob}px)` }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            transform: `scaleX(${flipX}) scale(${innerScale})`,
          }}
        >
          {/* FRONT: nationality flag in a circle.
              Clipped with a SOFT-EDGE radial mask (not border-radius+overflow) so the
              edge stays anti-aliased even under the GPU rasterizer in the 3D plane.
              The white ring = this white-backed disc showing through the flag's inset. */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "100%",
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
              opacity: showBack ? 0 : 1,
              background: "rgba(255,255,255,0.92)",
              WebkitMaskImage: CIRCLE_MASK,
              maskImage: CIRCLE_MASK,
              filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.45))",
            }}
          >
            {player.flagPath ? (
              <Img
                src={staticFile(player.flagPath)}
                style={{
                  position: "absolute",
                  inset: "3.2%",
                  width: "93.6%",
                  height: "93.6%",
                  // cover = every flag fills the circle the same way (no white bands).
                  // Flags have different aspect ratios, so "contain" left uneven gaps.
                  objectFit: "cover",
                  WebkitMaskImage: CIRCLE_MASK,
                  maskImage: CIRCLE_MASK,
                }}
              />
            ) : null}
          </div>

          {/* BACK: player photo card + red name band */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              // scaled down → smaller card than the flag circle; shown only past the
              // edge-on midpoint (faces swap while the card is a vertical sliver).
              transform: "scale(0.8)",
              opacity: showBack ? 1 : 0,
              display: "flex",
              flexDirection: "column",
              border: "3px solid #ffffff",
              borderRadius: "14%",
              overflow: "hidden",
              background: "#ffffff",
              boxShadow: "0 10px 22px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ flex: 1, minHeight: 0, position: "relative", background: "linear-gradient(180deg, #eef1f5 0%, #d9dee6 100%)" }}>
              {player.photoPath ? (
                <Img
                  src={staticFile(player.photoPath)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 12%" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily,
                    fontWeight: 800,
                    fontSize: 40,
                    color: "rgba(20,28,40,0.45)",
                  }}
                >
                  {player.display.charAt(0)}
                </div>
              )}
            </div>
            <div
              style={{
                flex: "0 0 28%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(180deg, #ef5350 0%, #c62828 100%)",
                borderTop: "2px solid #14121f",
                boxShadow: "0 -1px 0 rgba(255,255,255,0.12) inset",
                fontFamily,
                fontWeight: 800,
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: 0,
                fontSize: 30,
                lineHeight: 1,
                padding: "0 2%",
                textAlign: "center",
                whiteSpace: "nowrap",
                // Solid black OUTLINE built from 8 offset shadows (this renders reliably
                // even inside the card's 3D/GPU layer, unlike -webkit-text-stroke) + a
                // soft drop shadow underneath for separation from the red band.
                textShadow:
                  "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 -2px 0 #000, 0 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 3px 6px rgba(0,0,0,0.55)",
              }}
            >
              {player.display}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
