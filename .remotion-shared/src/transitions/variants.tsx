import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

// Kept iris-reveal variants (clean complementary-mask reveal + smooth content motion,
// soft light edge optional). Entering gets the reveal mask + content transform;
// exiting gets the inverse mask so the old foreground can't bleed through.

type P = Record<string, unknown>;
const E = Easing.inOut(Easing.cubic);
const ci = (e: number, from: number, to: number) => interpolate(e, [0, 1], [from, to]);

type Cfg = {
  masks: (e: number) => { enter: string; exit: string };
  light?: (e: number) => string;
  enterT?: (e: number) => string;
  exitT?: (e: number) => string;
};

const make = (cfg: Cfg): TransitionPresentation<P> => {
  const Comp: React.FC<TransitionPresentationComponentProps<P>> = ({
    children,
    presentationProgress,
    presentationDirection,
  }) => {
    const p = Math.max(0, Math.min(1, presentationProgress));
    const e = E(p);
    const { enter, exit } = cfg.masks(e);
    if (presentationDirection === "exiting") {
      return (
        <AbsoluteFill style={{ isolation: "isolate", WebkitMaskImage: exit, maskImage: exit }}>
          <AbsoluteFill style={{ transform: cfg.exitT?.(e) }}>{children}</AbsoluteFill>
        </AbsoluteFill>
      );
    }
    const light = cfg.light?.(e);
    return (
      <AbsoluteFill style={{ isolation: "isolate" }}>
        <AbsoluteFill style={{ WebkitMaskImage: enter, maskImage: enter }}>
          <AbsoluteFill style={{ transform: cfg.enterT?.(e) }}>{children}</AbsoluteFill>
        </AbsoluteFill>
        {light ? (
          <AbsoluteFill style={{ background: light, mixBlendMode: "screen", opacity: Math.sin(p * Math.PI), pointerEvents: "none" }} />
        ) : null}
      </AbsoluteFill>
    );
  };
  return { component: Comp, props: {} };
};

const F = 14;
const radial = (shape: string) => (e: number) => {
  const r = ci(e, 0, 124);
  return {
    enter: `radial-gradient(${shape}, #000 ${r - F}%, transparent ${r}%)`,
    exit: `radial-gradient(${shape}, transparent ${r - F}%, #000 ${r}%)`,
  };
};
const ringLight = (e: number) => {
  const r = ci(e, 0, 124);
  return `radial-gradient(circle at 50% 50%, transparent ${r - F - 2}%, rgba(255,255,255,0.9) ${r - F / 2}%, rgba(190,225,255,0.5) ${r - 1}%, transparent ${r + 2}%)`;
};

const scaleIn = (e: number) => `scale(${ci(e, 1.12, 1)})`;
const scaleInStrong = (e: number) => `scale(${ci(e, 1.26, 1)})`;
const scaleUpExit = (e: number) => `scale(${ci(e, 1, 1.2)})`;
const scaleOutExit = (e: number) => `scale(${ci(e, 1, 1.07)})`;
const squashIn = (e: number) => `scale(${ci(e, 1.18, 1)}, ${ci(e, 0.86, 1)})`;

export const glowIris = () => make({ masks: radial("circle at 50% 50%"), light: ringLight, enterT: scaleIn, exitT: scaleOutExit });
export const zoomIris = () => make({ masks: radial("circle at 50% 50%"), enterT: scaleInStrong, exitT: scaleUpExit });
export const tallIris = () => make({ masks: radial("82% 138% at 50% 50%"), enterT: scaleIn, exitT: scaleOutExit });
export const cornerIris = () => make({ masks: radial("circle at 0% 0%"), enterT: scaleIn });
export const squashIris = () => make({ masks: radial("circle at 50% 50%"), enterT: squashIn });
