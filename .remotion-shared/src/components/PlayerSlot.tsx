import { Easing, Img, interpolate, spring, staticFile } from "remotion";
import { fontFamily } from "../theme";
import { DESIGN_FPS } from "../timing";

const FLAG_CIRCLE_SCALE = 1.38; // front-face disc size (bigger than the player card)
// Exported so the reveal panel slides in over the EXACT same time/easing as the flip.
export const FLIP_DURATION = 26; // 0.88s @30fps
export const EASE_FLIP = Easing.bezier(0.33, 1, 0.68, 1);
// Soft-edged circular clip (anti-aliased even on GPU-rasterized 3D elements).
const CIRCLE_MASK = "radial-gradient(circle at 50% 50%, #000 calc(50% - 1px), rgba(0,0,0,0) 50%)";

/** Generic slot data — runner-agnostic. The FRONT is the clue (a flag, a club crest,
 *  …), the BACK is the player photo revealed on the flip. */
export type SlotPlayer = {
  display: string;
  /** Front clue image (relative path under public), or null → blank disc. */
  frontSrc: string | null;
  /** How the front image fills the disc: "cover" for flags, "contain" for crests/logos. */
  frontFit: "cover" | "contain";
  /** Back photo (relative path under public), or null → initial letter. */
  backSrc: string | null;
  x: number;
  y: number;
};

export const PlayerSlot: React.FC<{
  player: SlotPlayer;
  frame: number;
  delay: number;
  revealStart: number;
  tilt: number;
  sizeComp: number;
  widthPct: number;
  floatPhase: number;
  /** Crest-front logo size, % of the disc (only the logo — the back card is unaffected). */
  crestImgPct?: number;
}> = ({ player, frame, delay, revealStart, tilt, sizeComp, widthPct, floatPhase, crestImgPct = 80 }) => {
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
  // perfect sync (a true 3D rotateY crosses edge-on at different moments for off-centre
  // cards → looks staggered).
  const flipX = Math.abs(Math.cos(flip * Math.PI)); // 1 → 0 (edge-on) → 1
  const showBack = flip >= 0.5;
  const innerScale = interpolate(flip, [0, 1], [FLAG_CIRCLE_SCALE, 1]);
  const bob = -6 * (1 - Math.cos(2 * Math.PI * (frame / (4 * DESIGN_FPS) + floatPhase)));

  // Crests (contain) sit on a slightly padded white disc; flags (cover) fill it edge-to-edge.
  const isCrest = player.frontFit === "contain";
  // Flag front fills the disc edge-to-edge (cover, soft-masked). Crest front sits big
  // inside a TRANSPARENT frosted-glass ring (styled inline in the FRONT branch below).
  const flagImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: "3.2%",
    width: "93.6%",
    height: "93.6%",
    objectFit: "cover",
    WebkitMaskImage: CIRCLE_MASK,
    maskImage: CIRCLE_MASK,
  };

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
          {/* FRONT: the clue.
              • CREST (contain): a big logo sitting inside a TRANSPARENT frosted-glass ring
                (no solid white plate) — translucent fill + bright thin rim + soft shadow.
              • FLAG (cover): fills a white disc edge-to-edge, soft-masked for clean edges. */}
          {isCrest ? (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "100%",
                aspectRatio: "1 / 1",
                transform: "translate(-50%, -50%)",
                opacity: showBack ? 0 : 1,
                // No circle/plate at all — just the logo floating (its own drop-shadow
                // gives separation from the background).
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {player.frontSrc ? (
                <Img
                  src={staticFile(player.frontSrc)}
                  style={{
                    // Default 80 (= 15% smaller than the original 94%); overridable per runner.
                    width: `${crestImgPct}%`,
                    height: `${crestImgPct}%`,
                    objectFit: "contain",
                    filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.6))",
                  }}
                />
              ) : null}
            </div>
          ) : (
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
              {player.frontSrc ? <Img src={staticFile(player.frontSrc)} style={flagImgStyle} /> : null}
            </div>
          )}

          {/* BACK: player photo card + red name band */}
          <div
            style={{
              position: "absolute",
              inset: 0,
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
              {player.backSrc ? (
                <Img
                  src={staticFile(player.backSrc)}
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
