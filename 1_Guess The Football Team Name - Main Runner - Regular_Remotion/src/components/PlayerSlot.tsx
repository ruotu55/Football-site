import { Easing, Img, interpolate, spring, staticFile } from "remotion";
import type { Player } from "../data";
import { fontFamily } from "../theme";
import { DESIGN_FPS } from "../timing";

const FLAG_CIRCLE_SCALE = 1.175;
const FLIP_DURATION = 26; // 0.88s @30fps
const EASE_FLIP = Easing.bezier(0.33, 1, 0.68, 1);

// A child of the tilted 3D pitch plane: positioned at the exact formation %
// (so it lands on the field like the runner), counter-rotated to stand upright,
// and scaled by `sizeComp` to cancel the perspective shrink → uniform size.
export const PlayerSlot: React.FC<{
  player: Player;
  frame: number;
  delay: number;
  revealStart: number;
  tilt: number; // pitch rotateX in deg
  sizeComp: number; // per-slot scale that cancels perspective foreshortening
  widthPct: number; // card width as % of the pitch plane
  floatPhase: number; // 0..1 phase offset so slots don't bob in unison
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
  const rotateY = flip * 180;
  const innerScale = interpolate(flip, [0, 1], [FLAG_CIRCLE_SCALE, 1]);

  // Gentle up/down bob (runner: float-up-down 4s, translate3d(0,-12px,0) at 50%).
  const bob = -6 * (1 - Math.cos(2 * Math.PI * (frame / (4 * DESIGN_FPS) + floatPhase)));

  return (
    <div
      style={{
        position: "absolute",
        left: `${player.x}%`,
        top: `${player.y}%`,
        width: `${widthPct}%`,
        aspectRatio: "10 / 13.5",
        transform: `translate(-50%, -50%) translateZ(60px) rotateX(${-tilt}deg) scale(${popScale * sizeComp})`,
        transformStyle: "preserve-3d",
        opacity,
      }}
    >
      {/* float mount — bobs in screen-vertical (runner .slot-mount) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: `translateY(${bob}px)`,
        }}
      >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: `rotateY(${rotateY}deg) scale(${innerScale})`,
        }}
      >
        {/* FRONT: nationality flag in a true circle (the clue) */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "100%",
            aspectRatio: "1 / 1",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: "50%",
            overflow: "hidden",
            border: "3px solid rgba(255,255,255,0.9)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
            transform: "translate(-50%, -50%) translateZ(1px)",
          }}
        >
          <Img
            src={staticFile(`natflags/${player.flag}.png`)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* BACK: player trading card (photo + red name band) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg) translateZ(1px)",
            display: "flex",
            flexDirection: "column",
            border: "2px solid #14121f",
            borderRadius: "14%",
            overflow: "hidden",
            background: "#0e1a14",
            boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
          }}
        >
          <Img
            src={staticFile(`players/${player.slug}.webp`)}
            style={{
              flex: 1,
              width: "100%",
              objectFit: "cover",
              objectPosition: "center 12%",
              minHeight: 0,
            }}
          />
          <div
            style={{
              flex: "0 0 24%",
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
              letterSpacing: 0.2,
              fontSize: 18,
              lineHeight: 1,
              padding: "0 4%",
              textAlign: "center",
              whiteSpace: "nowrap",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
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
