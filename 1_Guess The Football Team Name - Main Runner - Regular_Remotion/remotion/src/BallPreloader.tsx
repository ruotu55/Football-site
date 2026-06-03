/**
 * BallPreloader.tsx — Remotion component that reproduces the app's ball-drop
 * intro animation by running the REAL GSAP timeline seeked to the current frame.
 *
 * Step 1 deliverable: animation only, not wired into the main quiz timeline.
 *
 * Architecture:
 * - The exact DOM structure from index.html is reproduced via React refs.
 * - A paused GSAP timeline is built once (lazily on first useLayoutEffect call)
 *   with the byte-identical tweens from ball-preloader-animation.js.
 * - Every render calls tl.seek(currentTime) so GSAP sets inline styles on the
 *   real DOM nodes; Remotion captures the result deterministically.
 *
 * GSAP timeline phases (total ~3.35 s):
 *   Phase 1 – 4-ball gooey merge  0 – 1.05 s
 *   Phase 2 – elastic bounce       1.05 – 2.85 s
 *   Phase 3 – expand              1.75 – 3.35 s
 *   Phase 4 – reveal mask         2.05 – 3.35 s
 */

import React, { useRef, useLayoutEffect } from "react";
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";
import gsap from "gsap";

// ── Geometry constants ────────────────────────────────────────────────────────
// Soccer ball: the outer .ball-preloader-ball is 400×400; inner scale is 0.348.
const BALL_OUTER_PX = 400;
const INNER_SCALE_BASE = 0.348;
const HANDOFF_SCALE = 1.6; // merge hands off at this scale (relative, not px)
const MERGE_R_BASE = 116;  // orbit radius of the 4 merge balls at base size

// Cardinal starts: N, E, S, W (computed per render using scaled MERGE_R)
const CARDINAL_DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// ── Soccer ball CSS (reproduced exactly from landing.css) ─────────────────────
const ballCss = `
.bp-ball-sphera {
  position: relative;
  width: 400px;
  height: 400px;
  background: #FFFFFF;
  border: 6px solid #212121;
  border-radius: 50%;
  box-shadow: inset -50px -50px 100px rgba(0,0,0,0.14);
  backface-visibility: hidden;
  overflow: hidden;
}
.bp-patch-top,
.bp-patch-middle-l,
.bp-patch-middle-r,
.bp-patch-bottom-l,
.bp-patch-bottom-r {
  position: absolute;
  width: 0;
  height: 0;
  border-top: 140px solid transparent;
  border-bottom: 140px solid transparent;
}
.bp-patch-middle-l .bp-line,
.bp-patch-middle-r .bp-line,
.bp-patch-bottom-l .bp-line,
.bp-patch-bottom-r .bp-line {
  position: absolute;
  width: 60px;
  height: 2px;
}
.bp-patch-top {
  top: 0;
  left: 60px;
  border-left: 140px solid transparent;
  border-right: 140px solid transparent;
  border-top: 40px solid #212121;
}
.bp-patch-top .bp-line {
  position: absolute;
  width: 2px;
  height: 122px;
  top: 6px;
  left: -1px;
  background: #212121;
}
.bp-patch-middle-l {
  top: 18px;
  left: 0;
  border-left: 40px solid #212121;
  transform: rotate(14deg);
}
.bp-patch-middle-l .bp-line {
  top: -1px;
  left: 6px;
  background: #212121;
}
.bp-patch-middle-r {
  top: 18px;
  right: 0;
  border-right: 40px solid #212121;
  transform: rotate(-14deg);
}
.bp-patch-middle-r .bp-line {
  top: -1px;
  right: 6px;
  background: #212121;
}
.bp-patch-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 128px;
  height: 128px;
  margin-left: -64px;
  margin-top: -64px;
  background: #212121;
  clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
}
.bp-patch-bottom-l {
  bottom: -98px;
  left: 74px;
  border-left: 40px solid #212121;
  transform: rotate(-57deg);
}
.bp-patch-bottom-l .bp-line {
  top: -1px;
  left: 6px;
  background: #212121;
}
.bp-patch-bottom-r {
  bottom: -98px;
  right: 74px;
  border-right: 40px solid #212121;
  transform: rotate(57deg);
}
.bp-patch-bottom-r .bp-line {
  top: -1px;
  right: 6px;
  background: #212121;
}
`;

// ── Soccer ball JSX (reused for main and 4 merge clones) ─────────────────────
const SoccerBall: React.FC = () => (
  <div className="bp-ball-sphera">
    <div className="bp-patch-top">
      <div className="bp-line" />
    </div>
    <div className="bp-patch-middle-l">
      <div className="bp-line" />
    </div>
    <div className="bp-patch-middle-r">
      <div className="bp-line" />
    </div>
    <div className="bp-patch-center" />
    <div className="bp-patch-bottom-l">
      <div className="bp-line" />
    </div>
    <div className="bp-patch-bottom-r">
      <div className="bp-line" />
    </div>
  </div>
);

// ── Revealing mask CSS (injected by BallPreloader into the document) ─────────
// The bp-revealing class adds the radial mask that creates the "hole" reveal.
// This must be a real stylesheet because Remotion renders real DOM.
// Exported so wrappers/tests can reuse without duplication.
export const revealingCss = `
.bp-preloader.bp-revealing {
  -webkit-mask-image: radial-gradient(
    circle at 50% 50%,
    transparent calc(var(--reveal-r, 0px) - 1px),
    black var(--reveal-r, 0px)
  );
  mask-image: radial-gradient(
    circle at 50% 50%,
    transparent calc(var(--reveal-r, 0px) - 1px),
    black var(--reveal-r, 0px)
  );
  will-change: mask-image, -webkit-mask-image;
}
`;

// ── Main component ────────────────────────────────────────────────────────────

export interface BallPreloaderProps {
  /** Background colour shown during the bounce phase (CSS colour string).
   * Defaults to the default stage green used in the app. */
  bgColor?: string;
  /** When true the component is hidden after the reveal completes (frame > totalFrames). */
  hideAfterReveal?: boolean;
}

export const BallPreloader: React.FC<BallPreloaderProps> = ({
  bgColor = "#3c6553",
  hideAfterReveal = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ── Size factor: scales everything proportionally with composition width ──
  // At 2560px: SIZE = 2560/1707 ≈ 1.5 (matches app's ROOT 24 vs 16 scale-up)
  // This is the single knob — increase for even bigger balls.
  const SIZE = width / 1707;

  // ── Scaled geometry ───────────────────────────────────────────────────────
  // INNER_SCALE drives the visible ball size: effective visible diameter
  const INNER_SCALE = INNER_SCALE_BASE * SIZE;  // ≈0.522 at 2560
  const MERGE_R = MERGE_R_BASE * SIZE;           // ≈174px at 2560

  // Merge liquid box: each merge-ball container, centered at 0,0 in the goo div
  // Size must match BALL_OUTER_PX * INNER_SCALE so the merge clone looks the
  // same as the main ball.  We use BALL_OUTER_PX as fixed; INNER_SCALE handles
  // the visual size.
  const MERGE_LIQUID_BOX = Math.round(BALL_OUTER_PX * INNER_SCALE); // ≈209px at 2560
  const MERGE_LIQUID_HALF = Math.round(MERGE_LIQUID_BOX / 2);

  // The goo container must be large enough to hold the orbit + ball at full scale
  const GOO_BOX = Math.round((MERGE_R + MERGE_LIQUID_BOX) * 2 + 40);

  // The visible ball diameter at INNER_SCALE:
  const ballVisibleDiameter = BALL_OUTER_PX * INNER_SCALE; // ≈208.8px at 2560

  // expandScale: ball (BALL_OUTER_PX px outer) GSAP scales by expandScale;
  // effective size = BALL_OUTER_PX * INNER_SCALE * expandScale must cover diag
  const diag = Math.hypot(width, height);
  const expandScale = Math.ceil((diag * 3) / ballVisibleDiameter);
  // maxR for the reveal mask: diag * 1.5 (in px)
  const maxRpx = Math.ceil(diag * 1.5);

  // Gooey blur scales with ball size so the metaball threshold looks clean
  const gooStdDeviation = Math.round(10 * SIZE); // ≈15 at 2560

  // Total animation duration in seconds
  const TOTAL_DURATION = 3.35;
  const totalFrames = Math.ceil(TOTAL_DURATION * fps);
  // Exact fractional time — no rounding; ensures GSAP motion is continuous
  const currentTime = frame / fps;

  // ── ALL hooks MUST run unconditionally (Rules of Hooks) ───────────────────
  // DO NOT put any early return before this block.

  // Refs for DOM elements GSAP writes to
  const preloaderRef = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layer2Ref = useRef<HTMLDivElement>(null);
  const ballOuterRef = useRef<HTMLDivElement>(null);
  const gooRef = useRef<HTMLDivElement>(null);
  const liquid0Ref = useRef<HTMLSpanElement>(null);
  const liquid1Ref = useRef<HTMLSpanElement>(null);
  const liquid2Ref = useRef<HTMLSpanElement>(null);
  const liquid3Ref = useRef<HTMLSpanElement>(null);

  // Stable timeline refs — built once, seeked every render
  const tlMergeRef = useRef<gsap.core.Timeline | null>(null);
  const tlBounceRef = useRef<gsap.core.Timeline | null>(null);
  // Track the SIZE used to build timelines so we rebuild on resize
  const builtSizeRef = useRef<number>(-1);

  // ── Build + seek GSAP timelines synchronously in useLayoutEffect ──────────
  // useLayoutEffect runs after every render, keeping GSAP in sync each frame.
  useLayoutEffect(() => {
    const preloader = preloaderRef.current;
    const ball = ballOuterRef.current;
    const goo = gooRef.current;
    const layer1 = layer1Ref.current;
    const liquids = [
      liquid0Ref.current,
      liquid1Ref.current,
      liquid2Ref.current,
      liquid3Ref.current,
    ].filter(Boolean) as HTMLElement[];

    if (!preloader || !ball || !goo || !layer1 || liquids.length < 4) return;

    // Invalidate cached timelines if SIZE changed (e.g. composition resized)
    if (builtSizeRef.current !== SIZE) {
      tlMergeRef.current = null;
      tlBounceRef.current = null;
      builtSizeRef.current = SIZE;
    }

    // ── Build merge timeline once ──────────────────────────────────────────
    if (!tlMergeRef.current) {
      // Cardinal start positions scaled by SIZE
      CARDINAL_DIRS.forEach(([dx, dy], i) => {
        gsap.set(liquids[i], {
          x: dx * MERGE_R,
          y: dy * MERGE_R,
          scale: 0.2,
          opacity: 1,
          force3D: true,
          transformOrigin: "center center",
        });
      });
      gsap.set(ball, {
        scale: HANDOFF_SCALE,
        opacity: 0,
        force3D: true,
        transformOrigin: "center center",
      });

      const tl = gsap.timeline({ paused: true });
      // Scale up from 0.2 to 1.0 with back.out ease
      tl.to(
        liquids,
        { duration: 0.42, scale: 1.0, ease: "back.out(1.7)", stagger: 0.05, force3D: true },
        0,
      );
      // Rotate the goo container (drives the gooey blob together)
      tl.to(goo, { duration: 1.05, rotation: 360, ease: "power1.inOut" }, 0);
      // Converge to center
      tl.to(
        liquids,
        { duration: 0.52, x: 0, y: 0, ease: "power2.inOut", force3D: true },
        0.45,
      );
      // Scale up to HANDOFF_SCALE (1.6) — matches main ball's starting scale
      tl.to(
        liquids,
        { duration: 0.34, scale: HANDOFF_SCALE, ease: "power2.in", force3D: true },
        0.63,
      );
      tlMergeRef.current = tl;
    }

    // ── Build bounce/expand/reveal timeline once ───────────────────────────
    if (!tlBounceRef.current) {
      const tl = gsap.timeline({ paused: true });

      // Bounce: elastic scale from HANDOFF_SCALE down to 1.0
      tl.fromTo(
        ball,
        { scale: HANDOFF_SCALE },
        { duration: 1.8, scale: 1.0, ease: "elastic.out(1, 0.5)", force3D: true },
        0,
      );

      // Expand: scale up to fill screen (starts at 0.7s)
      tl.to(
        ball,
        {
          scale: expandScale,
          duration: 1.6,
          ease: "none",
          force3D: true,
        },
        0.7,
      );

      // Reveal mask: animate CSS custom property --reveal-r from 0 to maxR
      // This creates the growing hole that reveals the background below
      tl.to(
        preloader,
        {
          "--reveal-r": `${maxRpx}px`,
          duration: 1.3,
          ease: "none",
        },
        0.7 + 0.3, // = 1.0s absolute
      );

      tlBounceRef.current = tl;
    }

    // ── Seek to current frame time ─────────────────────────────────────────
    const MERGE_DURATION = 1.05;

    if (currentTime <= MERGE_DURATION) {
      // Phase 1: merge phase
      // Show merge balls, hide main ball.
      // NO gooey blur on the goo container — the heavy feGaussianBlur (stdDev≈15)
      // smears the soccer pentagon detail into fuzzy white blobs.  Crisp balls
      // overlap at center instead; that's the visual "merge into one".
      goo.style.filter = `none`;
      const mergeEl = goo.parentElement as HTMLElement;
      if (mergeEl) {
        mergeEl.style.display = "flex";
        mergeEl.style.opacity = "1";
      }
      ball.style.opacity = "0";

      tlMergeRef.current?.seek(currentTime);
    } else {
      // Phase 2+: bounce/expand/reveal
      // Hide merge, show main ball — main ball has NO gooey filter
      const mergeEl = goo.parentElement as HTMLElement;
      if (mergeEl) mergeEl.style.display = "none";

      ball.style.opacity = "1";

      // Set the reveal CSS class to enable the mask
      preloader.classList.add("bp-revealing");

      // The bounce timeline starts at 0; offset by the merge duration
      const bounceTime = currentTime - MERGE_DURATION;
      tlBounceRef.current?.seek(bounceTime);
    }
  }); // runs every frame (no deps) — that's intentional for GSAP seek

  // ── Early return AFTER all hooks ─────────────────────────────────────────
  // Rules of Hooks: all useRef/useLayoutEffect must run unconditionally.
  // Only return null (hide) after hooks have run for this frame.
  if (hideAfterReveal && frame > totalFrames) {
    return null;
  }

  // Layer1 background color (can be themed)
  const layer1Style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: bgColor,
    zIndex: 2,
  };

  return (
    <>
      {/* Inject CSS for the soccer ball patches + reveal mask */}
      <style>{ballCss}</style>
      <style>{revealingCss}</style>

      {/* Gooey SVG filter — same as index.html.
          stdDeviation scales with SIZE for clean metaball blobs at higher res. */}
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <defs>
          <filter id="bp-ball-gooey">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={gooStdDeviation}
              result="blur"
            />
            {/* feColorMatrix sharpens blurred alpha into solid blobs — KEEP */}
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
            />
          </filter>
        </defs>
      </svg>

      {/* Ball preloader container */}
      <div
        ref={preloaderRef}
        className="bp-preloader"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 9998,
          overflow: "hidden",
          contain: "layout paint style",
          isolation: "isolate",
        }}
      >
        {/* 4-ball gooey merge */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            willChange: "opacity",
          }}
        >
          {/* Goo container: sized to hold the orbit + balls.
              No gooey filter here — filter is set via JS on goo.style.filter. */}
          <div
            ref={gooRef}
            style={{
              position: "relative",
              width: GOO_BOX,
              height: GOO_BOX,
              willChange: "transform",
            }}
          >
            {CARDINAL_DIRS.map((_, i) => {
              const liquidRef = [
                liquid0Ref,
                liquid1Ref,
                liquid2Ref,
                liquid3Ref,
              ][i];
              return (
                // Each merge-ball: centered at 50%/50% of the goo container.
                // The box is MERGE_LIQUID_BOX × MERGE_LIQUID_BOX (≈209px at 2560).
                // GSAP translates it to [±MERGE_R, ±MERGE_R] then back to (0,0).
                <span
                  key={i}
                  ref={liquidRef}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: MERGE_LIQUID_BOX,
                    height: MERGE_LIQUID_BOX,
                    marginTop: -MERGE_LIQUID_HALF,
                    marginLeft: -MERGE_LIQUID_HALF,
                    borderRadius: "50%",
                    background: "transparent",
                    overflow: "visible",
                    willChange: "transform",
                  }}
                >
                  {/* The ball is a full 400×400 element scaled down by INNER_SCALE
                      so that the visible diameter = MERGE_LIQUID_BOX. */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        width: BALL_OUTER_PX,
                        height: BALL_OUTER_PX,
                        // Scale matches main ball's INNER_SCALE so merge clone
                        // and main ball are the same visual size
                        transform: `scale(${INNER_SCALE})`,
                        transformOrigin: "center center",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          width: BALL_OUTER_PX,
                          height: BALL_OUTER_PX,
                          margin: "0 auto",
                          borderRadius: "50%",
                          boxShadow:
                            "0 16px 20px 0 rgba(0,0,0,0.14), 0 4px 40px 0 rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.2)",
                          overflow: "hidden",
                          transform: "translateZ(0)",
                          backfaceVisibility: "hidden",
                        }}
                      >
                        <SoccerBall />
                      </div>
                    </div>
                  </div>
                </span>
              );
            })}
          </div>
        </div>

        {/* Layer 2 — white, bottom (z=1): looks like expanding ball */}
        <div
          ref={layer2Ref}
          style={{
            position: "absolute",
            inset: 0,
            background: "#ffffff",
            zIndex: 1,
          }}
        />

        {/* Layer 1 — bg color, top (z=2): background during bounce */}
        <div ref={layer1Ref} style={layer1Style} />

        {/* Main soccer ball — bounces then expands.
            NO gooey filter on this element. */}
        <div
          ref={ballOuterRef}
          style={{
            position: "absolute",
            // Center the 400×400 outer div; GSAP scales from center (default)
            top: `calc(50% - ${BALL_OUTER_PX / 2}px)`,
            left: `calc(50% - ${BALL_OUTER_PX / 2}px)`,
            zIndex: 4,
            width: BALL_OUTER_PX,
            height: BALL_OUTER_PX,
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            willChange: "transform, opacity",
          }}
        >
          {/* Inner scale wrapper — scales the 400px ball to the visible size */}
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${INNER_SCALE})`,
              transformOrigin: "center center",
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                margin: "0 auto",
                borderRadius: "50%",
                boxShadow:
                  "0 16px 20px 0 rgba(0,0,0,0.14), 0 4px 40px 0 rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.2)",
                overflow: "hidden",
                transform: "translateZ(0)",
                backfaceVisibility: "hidden",
              }}
            >
              <SoccerBall />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Export a helper to mount BallPreloader with background for visual testing
export const BallPreloaderWithBackground: React.FC<{
  testBgColor?: string;
}> = ({ testBgColor = "#ff6600" }) => (
  <AbsoluteFill style={{ background: testBgColor }}>
    <style>{revealingCss}</style>
    {/* Orange/bright background to make the reveal visible */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(135deg, ${testBgColor} 0%, #ffcc00 100%)`,
        zIndex: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 120,
        fontWeight: 900,
        color: "rgba(255,255,255,0.3)",
        fontFamily: "sans-serif",
      }}
    >
      BACKGROUND
    </div>
    <BallPreloader hideAfterReveal={false} />
  </AbsoluteFill>
);
