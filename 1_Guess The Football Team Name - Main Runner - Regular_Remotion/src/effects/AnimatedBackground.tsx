import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { DESIGN_HEIGHT, DESIGN_WIDTH, useDesignFrame } from "../timing";
import {
  chevronTileUri,
  rgba,
  spiralSvgUri,
  starsTileUri,
  type CompetitionRecipe,
  type EffectId,
} from "./effects-data";

const W = DESIGN_WIDTH;
const H = DESIGN_HEIGHT;
const FPS = 30;

export type ResolvedBackground = {
  competition: CompetitionRecipe | null;
  colorHex: string;
  effectId: EffectId;
  opacity: number; // 0..1 master intensity
};

// Deterministic pseudo-random in [0,1) (Math.random is forbidden in Remotion).
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Trapezoid fade: 0 at p=0/1, full in the middle (matches the sprite keyframes).
const trapezoid = (p: number) => {
  if (p < 0.07) return p / 0.07;
  if (p > 0.93) return (1 - p) / 0.07;
  return 1;
};

// ── Conic ray field (sun rays + youtube thumbnails) ─────────────────────────
const ConicRays: React.FC<{
  f: number;
  colorHex: string;
  opacity: number;
  originX: number;
  originY: number;
  periodSec: number;
  fine?: boolean; // many thin rays (youtube look)
  fadeFromCenter?: boolean; // true = visible center, fade out (sun); false = fade center in (youtube)
}> = ({ f, colorHex, opacity, originX, originY, periodSec, fine, fadeFromCenter = true }) => {
  const angle = (f / (periodSec * FPS)) * 360;
  const wA = Math.min(0.9, 0.12 + opacity * 0.55);
  const size = 4200;
  const rays = fine
    ? `repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,${wA}) 0deg 1deg, rgba(255,255,255,${wA * 0.3}) 1deg 3.4deg, rgba(255,255,255,0) 3.4deg 8.4deg)`
    : `repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,${wA}) 0deg 7deg, rgba(255,255,255,0) 7deg 14deg)`;

  const overlay = fadeFromCenter
    ? `radial-gradient(ellipse farthest-corner at ${(originX / W) * 100}% ${(originY / H) * 100}%, ${rgba(colorHex, 0)} 0%, ${rgba(colorHex, 1)} 100%)`
    : `radial-gradient(ellipse farthest-corner at 50% 50%, ${rgba(colorHex, 1)} 0%, ${rgba(colorHex, 0)} 55%, ${rgba(colorHex, 0)} 100%)`;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: size,
          height: size,
          left: originX - size / 2,
          top: originY - size / 2,
          background: rays,
          transform: `rotate(${angle}deg)`,
        }}
      />
      <AbsoluteFill style={{ background: overlay }} />
    </AbsoluteFill>
  );
};

// ── Sun spiral ──────────────────────────────────────────────────────────────
const SunSpiral: React.FC<{ f: number; colorHex: string; opacity: number }> = ({
  f,
  colorHex,
  opacity,
}) => {
  const angle = (f / (28 * FPS)) * 360;
  const wA = Math.min(0.9, 0.12 + opacity * 0.5);
  const size = 2600;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: size,
          height: size,
          left: W / 2 - size / 2,
          top: H / 2 - size / 2,
          backgroundImage: spiralSvgUri(wA),
          backgroundSize: "100% 100%",
          transform: `rotate(${angle}deg) scale(1.08)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse farthest-corner at 50% 50%, ${rgba(colorHex, 0)} 0%, ${rgba(colorHex, 1)} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ── Center rings (concentric circles expanding) ─────────────────────────────
const CenterRings: React.FC<{ f: number; colorHex: string; opacity: number }> = ({
  f,
  colorHex,
  opacity,
}) => {
  const off = (f / (8 * FPS)) * 116 % 116;
  const wA = Math.min(0.9, 0.12 + opacity * 0.5);
  const c05 = rgba(colorHex, 0.0);
  const mask =
    "radial-gradient(ellipse farthest-corner at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)";
  return (
    <AbsoluteFill
      style={{
        background: `repeating-radial-gradient(circle at 50% 50%, ${c05} 0 ${off}px, rgba(255,255,255,${wA}) ${off}px ${off + 4}px, ${c05} ${off + 4}px ${off + 116}px)`,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  );
};

// ── Diagonal flow (sliding stripes) ─────────────────────────────────────────
const DiagonalFlow: React.FC<{ f: number; colorHex: string; opacity: number }> = ({
  f,
  colorHex,
  opacity,
}) => {
  const wA = Math.min(0.85, 0.1 + opacity * 0.5);
  const period = 132 / Math.sin((28 * Math.PI) / 180);
  const shift = (f / (6 * FPS)) * period % period;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: -0.1 * H,
          left: -W,
          width: 3 * W,
          height: 1.2 * H,
          background: `repeating-linear-gradient(-28deg, rgba(255,255,255,${wA}) 0 66px, ${rgba(colorHex, 0.1)} 66px 132px)`,
          transform: `translateX(${-shift}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse farthest-corner at 50% 50%, ${rgba(colorHex, 1)} 0%, ${rgba(colorHex, 0)} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ── Floating emojis (drift right → left) ────────────────────────────────────
const FloatingEmojis: React.FC<{ f: number; opacity: number }> = ({ f, opacity }) => {
  const rows = 10;
  const perRow = 8;
  const travel = W + 300;
  const periodFrames = 24 * FPS;
  const speed = travel / periodFrames;
  const op = Math.min(0.9, 0.12 + opacity * 0.7);
  const sprites: React.ReactNode[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = 5 + row * (90 / (rows - 1));
    for (let i = 0; i < perRow; i += 1) {
      const idx = row * perRow + i;
      const base = (i / perRow) * travel + (row % 2 ? travel / (perRow * 2) : 0);
      const x = W + 150 - (((f * speed + base) % travel) + travel) % travel;
      sprites.push(
        <Img
          key={idx}
          src={staticFile(`emojis/e${idx % 7}.png`)}
          style={{
            position: "absolute",
            left: x,
            top: `${y}%`,
            width: 75,
            height: 75,
            objectFit: "contain",
            opacity: op,
            filter: "grayscale(100%)",
          }}
        />,
      );
    }
  }
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        WebkitMaskImage:
          "linear-gradient(to right, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.3) 100%)",
        maskImage:
          "linear-gradient(to right, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.3) 100%)",
      }}
    >
      {sprites}
    </AbsoluteFill>
  );
};

// ── Rising glyphs (question marks / soccer balls) ───────────────────────────
const RisingGlyphs: React.FC<{
  f: number;
  opacity: number;
  glyph: string;
  count: number;
  seedBase: number;
  minSize: number;
  sizeRange: number;
  minDur: number;
  durRange: number;
  driftVw: number;
  color?: string;
}> = ({ f, opacity, glyph, count, seedBase, minSize, sizeRange, minDur, durRange, driftVw, color }) => {
  const travel = H * 2.28;
  const op = Math.min(0.9, 0.12 + opacity * 0.7);
  const sprites: React.ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const s = seedBase + i;
    const left = rnd(s) * 100;
    const size = minSize + rnd(s + 1) * sizeRange;
    const durFrames = (minDur + rnd(s + 2) * durRange) * FPS;
    const drift = (rnd(s + 3) - 0.5) * driftVw * (W / 100);
    const rot = (rnd(s + 4) - 0.5) * 18;
    const phase = rnd(s + 5);
    const p = (((f / durFrames) + phase) % 1 + 1) % 1;
    const y = H + 60 - p * travel;
    const x = drift * p;
    sprites.push(
      <span
        key={i}
        style={{
          position: "absolute",
          left: `${left}%`,
          top: y,
          transform: `translateX(${x}px) rotate(${rot}deg)`,
          fontSize: size,
          fontWeight: 800,
          lineHeight: 1,
          color: color ?? "rgba(255,255,255,0.5)",
          opacity: op * trapezoid(p),
          userSelect: "none",
        }}
      >
        {glyph}
      </span>,
    );
  }
  return <AbsoluteFill style={{ overflow: "hidden" }}>{sprites}</AbsoluteFill>;
};

// ── The effect switch ───────────────────────────────────────────────────────
const Effect: React.FC<{
  effectId: EffectId;
  colorHex: string;
  opacity: number;
  f: number;
}> = ({ effectId, colorHex, opacity, f }) => {
  switch (effectId) {
    case "sun-rays-center":
      return <ConicRays f={f} colorHex={colorHex} opacity={opacity} originX={W / 2} originY={H / 2} periodSec={26} />;
    case "sun-rays-top-right":
      return <ConicRays f={f} colorHex={colorHex} opacity={opacity} originX={W} originY={0} periodSec={26} />;
    case "sun-rays-top-left":
      return <ConicRays f={f} colorHex={colorHex} opacity={opacity} originX={0} originY={0} periodSec={26} />;
    case "youtube-thumbnails":
      return <ConicRays f={f} colorHex={colorHex} opacity={opacity} originX={W / 2} originY={H / 2} periodSec={26} fine fadeFromCenter={false} />;
    case "sun-spiral-center":
      return <SunSpiral f={f} colorHex={colorHex} opacity={opacity} />;
    case "center-rings":
      return <CenterRings f={f} colorHex={colorHex} opacity={opacity} />;
    case "diagonal-flow":
      return <DiagonalFlow f={f} colorHex={colorHex} opacity={opacity} />;
    case "floating-emojis":
      return <FloatingEmojis f={f} opacity={opacity} />;
    case "rising-question-marks":
      return (
        <RisingGlyphs f={f} opacity={opacity} glyph="?" count={58} seedBase={10}
          minSize={16} sizeRange={40} minDur={16} durRange={24} driftVw={42} />
      );
    case "rising-soccer-balls":
      return (
        <RisingGlyphs f={f} opacity={opacity} glyph={"⚽"} count={36} seedBase={200}
          minSize={18} sizeRange={22} minDur={22} durRange={10} driftVw={5} color="rgba(255,255,255,0.7)" />
      );
    default:
      return null;
  }
};

// ── Competition background (gradient + moving pattern) ──────────────────────
const CompetitionBg: React.FC<{ recipe: CompetitionRecipe; f: number }> = ({ recipe, f }) => {
  const angle = recipe.angle ?? 135;
  const gradient = `linear-gradient(${angle}deg, ${recipe.c1} 0%, ${recipe.c2} 100%)`;

  if (recipe.pattern === "rays") {
    // rays drop → rotate instead
    const a = (f / (40 * FPS)) * 360;
    const size = 4200;
    const ray = rgba(recipe.patternHex, recipe.patternAlpha * 6);
    return (
      <AbsoluteFill style={{ background: gradient, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            width: size,
            height: size,
            left: W / 2 - size / 2,
            top: 0.42 * H - size / 2,
            background: `repeating-conic-gradient(from 0deg at 50% 50%, ${ray} 0deg 5deg, rgba(255,255,255,0) 5deg 13deg)`,
            transform: `rotate(${a}deg)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  let tile = "";
  let tileSize = 300;
  if (recipe.pattern === "stars") {
    tile = starsTileUri(recipe.patternHex, recipe.patternAlpha);
    tileSize = 300;
  } else if (recipe.pattern === "chevron") {
    tile = chevronTileUri(recipe.patternHex, recipe.patternAlpha);
    tileSize = 170;
  } else {
    // diagonal stripes — render as an inline repeating gradient tile
    const stripe = rgba(recipe.patternHex, recipe.patternAlpha);
    const drop = (f / (10 * FPS)) * 180 % 180;
    return (
      <AbsoluteFill style={{ background: gradient, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -180,
            width: W,
            height: H + 360,
            background: `repeating-linear-gradient(135deg, ${stripe} 0 64px, rgba(255,255,255,0) 64px 128px)`,
            transform: `translateY(${drop}px)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  const drop = (f / (16 * FPS)) * tileSize % tileSize;
  return (
    <AbsoluteFill style={{ background: gradient, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: -tileSize,
          width: W,
          height: H + tileSize * 2,
          backgroundImage: tile,
          backgroundRepeat: "repeat",
          backgroundSize: `${tileSize}px ${tileSize}px`,
          transform: `translateY(${drop}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ── Public component ────────────────────────────────────────────────────────
export const AnimatedBackground: React.FC<{ bg: ResolvedBackground }> = ({ bg }) => {
  const f = useDesignFrame();

  if (bg.competition) {
    return <CompetitionBg recipe={bg.competition} f={f} />;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: bg.colorHex }}>
      <Effect effectId={bg.effectId} colorHex={bg.colorHex} opacity={bg.opacity} f={f} />
    </AbsoluteFill>
  );
};
