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
 * - Every render calls tl.seek(frame / fps) so GSAP sets inline styles on the
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
const INNER_SCALE = 0.348;
const HANDOFF_SCALE = 1.6; // merge hands off at this scale
const MERGE_R = 116; // radius of the 4 merge balls

// Cardinal starts: N, E, S, W
const STARTS: [number, number][] = [
  [0, -MERGE_R],
  [MERGE_R, 0],
  [0, MERGE_R],
  [-MERGE_R, 0],
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

// ── Inline style objects ──────────────────────────────────────────────────────
const styles = {
  preloader: {
    position: "absolute" as const,
    inset: 0,
    zIndex: 9998,
    overflow: "hidden",
    contain: "layout paint style" as const,
    isolation: "isolate" as const,
  } as React.CSSProperties,
  layer2: {
    position: "absolute" as const,
    inset: 0,
    background: "#ffffff",
    zIndex: 1,
  } as React.CSSProperties,
  layer1: {
    position: "absolute" as const,
    inset: 0,
    background: "#3c6553",
    zIndex: 2,
  } as React.CSSProperties,
  ballOuter: {
    position: "absolute" as const,
    top: "calc(50% - 200px)",
    left: "calc(50% - 200px)",
    zIndex: 4,
    width: BALL_OUTER_PX,
    height: BALL_OUTER_PX,
    transformStyle: "preserve-3d" as const,
    backfaceVisibility: "hidden" as const,
    willChange: "transform, opacity",
  } as React.CSSProperties,
  ballScale: {
    width: "100%",
    height: "100%",
    transform: `scale(${INNER_SCALE})`,
    // center center so the outer div's center (200,200) aligns with the visible
    // ball's center — GSAP scales the outer from 50%/50% by default and the
    // visual ball must expand from the same pivot.
    transformOrigin: "center center",
    backfaceVisibility: "hidden" as const,
    willChange: "transform",
  } as React.CSSProperties,
  ballInner: {
    position: "relative" as const,
    width: "100%",
    height: "100%",
    margin: "0 auto",
    borderRadius: "50%",
    boxShadow:
      "0 16px 20px 0 rgba(0,0,0,0.14), 0 4px 40px 0 rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.2)",
    overflow: "hidden",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden" as const,
  } as React.CSSProperties,
  ballMerge: {
    position: "absolute" as const,
    inset: 0,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none" as const,
    willChange: "opacity",
  } as React.CSSProperties,
  ballMergeGoo: {
    position: "relative" as const,
    width: 340,
    height: 340,
    willChange: "transform",
    // filter is set by JS (gooey effect)
  } as React.CSSProperties,
  mergeLiquid: {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    width: 120,
    height: 120,
    marginTop: -60,
    marginLeft: -60,
    borderRadius: "50%",
    background: "transparent",
    overflow: "visible" as const,
    willChange: "transform",
  } as React.CSSProperties,
  mergeLiquidBall: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none" as const,
  } as React.CSSProperties,
  mergeLiquidBallScale: {
    width: 400,
    height: 400,
    transform: "scale(0.348)",
    transformOrigin: "center center",
  } as React.CSSProperties,
  mergeBallInner: {
    position: "relative" as const,
    width: 400,
    height: 400,
    margin: "0 auto",
    borderRadius: "50%",
    boxShadow:
      "0 16px 20px 0 rgba(0,0,0,0.14), 0 4px 40px 0 rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.2)",
    overflow: "hidden",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden" as const,
  } as React.CSSProperties,
};

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

  // ── Geometry derived from composition size ────────────────────────────────
  const diag = Math.hypot(width, height);
  // The ball element that GSAP scales is .ball-preloader-ball (400px square).
  // The actual visible ball radius after INNER_SCALE:
  const ballVisibleDiameter = BALL_OUTER_PX * INNER_SCALE; // 139.2 px
  // expandScale: ball scales until it fills screen — diag * 3 / visibleDiameter
  const expandScale = Math.ceil((diag * 3) / ballVisibleDiameter);
  // maxR for the reveal mask: diag * 1.5 (in px)
  const maxRpx = Math.ceil(diag * 1.5);

  // Total animation duration in seconds
  // Phase 1 ends at 1.05s, Phase 2/3/4 adds 1.8s bounce + 0.7 offset + 1.6s expand
  // Last tween: expand 1.6s starting at 0.7s → ends at 2.3s
  // Reveal: 1.3s starting at 0.7+0.3=1.0s → ends at 2.3s
  // Total: 1.05 (merge) + 2.3s = 3.35s
  const TOTAL_DURATION = 3.35;
  const totalFrames = Math.ceil(TOTAL_DURATION * fps);
  const currentTime = frame / fps;

  // After animation completes, hide if configured
  if (hideAfterReveal && frame > totalFrames) {
    return null;
  }

  // ── Refs for DOM elements GSAP writes to ─────────────────────────────────
  const preloaderRef = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layer2Ref = useRef<HTMLDivElement>(null);
  const ballOuterRef = useRef<HTMLDivElement>(null);
  const gooRef = useRef<HTMLDivElement>(null);
  const liquid0Ref = useRef<HTMLSpanElement>(null);
  const liquid1Ref = useRef<HTMLSpanElement>(null);
  const liquid2Ref = useRef<HTMLSpanElement>(null);
  const liquid3Ref = useRef<HTMLSpanElement>(null);

  // Stable timeline ref — built once, seeked every render
  const tlMergeRef = useRef<gsap.core.Timeline | null>(null);
  const tlBounceRef = useRef<gsap.core.Timeline | null>(null);

  // ── Build + seek GSAP timelines synchronously in useLayoutEffect ──────────
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

    // ── Build merge timeline once ──────────────────────────────────────────
    if (!tlMergeRef.current) {
      // Set initial positions (cardinal points)
      STARTS.forEach(([x, y], i) => {
        gsap.set(liquids[i], {
          x,
          y,
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
        // "<+=0.3" = same start as the last tween + 0.3s
        0.7 + 0.3, // = 1.0s absolute
      );

      tlBounceRef.current = tl;
    }

    // ── Seek to current frame time ─────────────────────────────────────────
    const MERGE_DURATION = 1.05;

    if (currentTime <= MERGE_DURATION) {
      // Phase 1: merge phase
      // Show merge balls, hide main ball
      goo.style.filter = "url(#bp-ball-gooey)";
      const mergeEl = goo.parentElement as HTMLElement;
      if (mergeEl) {
        mergeEl.style.display = "flex";
        mergeEl.style.opacity = "1";
      }
      ball.style.opacity = "0";

      tlMergeRef.current?.seek(currentTime);

      // Hide main ball during merge
      ball.style.opacity = "0";
    } else {
      // Phase 2+: bounce/expand/reveal
      // Hide merge, show main ball
      const mergeEl = goo.parentElement as HTMLElement;
      if (mergeEl) mergeEl.style.display = "none";

      ball.style.opacity = "1";

      // Set the reveal CSS class to enable the mask
      preloader.classList.add("bp-revealing");

      // The bounce timeline starts at 0; offset by the merge duration
      const bounceTime = currentTime - MERGE_DURATION;
      tlBounceRef.current?.seek(bounceTime);

      // At 0.7s into bounce (= 1.75s absolute), start the reveal
      // The reveal-r is animated by the tlBounce timeline itself
      // We also need to update the CSS variable for the mask
      if (bounceTime >= 0.3) {
        // Ensure the --reveal-r CSS var is applied from GSAP's tween
        // GSAP animates it directly on the preloader element's style
        // Nothing extra needed here; GSAP already set it via the timeline seek
      }
    }
  });

  // Layer1 background color (can be themed)
  const layer1Style: React.CSSProperties = {
    ...styles.layer1,
    background: bgColor,
  };

  // ── CSS for the revealing mask (applied to the preloader div) ────────────
  // We use a data attribute to toggle the mask via inline style rather than
  // a class that would require a stylesheet injection.
  // The actual --reveal-r value is set by GSAP on the element's style.

  return (
    <>
      {/* Inject CSS for the soccer ball patches + reveal mask */}
      <style>{ballCss}</style>
      <style>{revealingCss}</style>

      {/* Gooey SVG filter — same as index.html */}
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
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
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
          // The reveal mask CSS is applied dynamically via .bp-revealing class below
        }}
      >
        {/* 4-ball gooey merge */}
        <div
          style={{
            ...styles.ballMerge,
            // Initially shown; GSAP hides in phase 2
          }}
        >
          <div ref={gooRef} style={styles.ballMergeGoo}>
            {STARTS.map((_, i) => {
              const liquidRef = [
                liquid0Ref,
                liquid1Ref,
                liquid2Ref,
                liquid3Ref,
              ][i];
              return (
                <span key={i} ref={liquidRef} style={styles.mergeLiquid}>
                  <div style={styles.mergeLiquidBall}>
                    <div style={styles.mergeLiquidBallScale}>
                      <div style={styles.mergeBallInner}>
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
        <div ref={layer2Ref} style={styles.layer2} />

        {/* Layer 1 — bg color, top (z=2): background during bounce */}
        <div ref={layer1Ref} style={layer1Style} />

        {/* Main soccer ball — bounces then expands */}
        <div ref={ballOuterRef} style={styles.ballOuter}>
          <div style={styles.ballScale}>
            <div style={styles.ballInner}>
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
