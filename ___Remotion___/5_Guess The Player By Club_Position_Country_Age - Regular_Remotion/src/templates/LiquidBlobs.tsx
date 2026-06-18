// Template — "Liquid Blobs".
// Organic liquid-metal / lava-lamp look. Each clue lives inside a glossy iridescent
// BLOB bubble whose asymmetric border-radius wobbles and whose scale gently breathes
// (sin(frame)). Blobs GROW into existence from a droplet (clueSpring) while a couple
// of small satellite droplets drift in and merge. The hero rises out of a wobbling
// liquid "puddle" at the bottom. On reveal the blobs flow together into the name plate.
// Pure CSS — NO SVG blur/gooey filters (they rasterize coarsely in Remotion).
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, rand, REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', " + fontFamily;
const ACCENT = "#19e3c4";
// Iridescent palette: teal → purple → pink.
const TEAL = "#19e3c4", PURPLE = "#8a5cf6", PINK = "#ff5db1";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Oscillating asymmetric border-radius — the signature liquid wobble.
const blobRadius = (frame: number, seed: number): string => {
  const s = (off: number) => 50 + 12 * Math.sin(frame * 0.045 + seed * 1.7 + off);
  return (
    `${s(0).toFixed(1)}% ${s(2.1).toFixed(1)}% ${s(4.3).toFixed(1)}% ${s(1.2).toFixed(1)}% / ` +
    `${s(3.4).toFixed(1)}% ${s(5.6).toFixed(1)}% ${s(0.8).toFixed(1)}% ${s(2.9).toFixed(1)}%`
  );
};

const BLOB = 286;

// A single clue blob: morphs in from a droplet, wobbles, breathes; satellite
// droplets drift in and merge during the grow.
const ClueBlob: React.FC<{
  appear: number; frame: number; seed: number; label: string; children: React.ReactNode;
}> = ({ appear, frame, seed, label, children }) => {
  const grow = Math.min(1.12, Math.max(0, appear));
  const op = interpolate(appear, [0, 0.22], [0, 1], clamp);
  // gentle breathing scale on top of the grow
  const breathe = 1 + 0.022 * Math.sin(frame * 0.06 + seed * 2.3);
  const scale = grow * breathe;
  // organic drift
  const dx = 6 * Math.sin(frame * 0.04 + seed);
  const dy = 5 * Math.sin(frame * 0.05 + seed * 1.9 + 1.3);
  const radius = blobRadius(frame, seed);

  // two satellite droplets that fly in and merge as the blob forms
  const droplet = (k: number) => {
    const merge = interpolate(appear, [0, 0.7], [1, 0], clamp); // 1=far, 0=merged
    const ang = seed * 1.3 + k * 2.6;
    const dist = 130 * merge;
    const dpx = Math.cos(ang) * dist;
    const dpy = Math.sin(ang) * dist - 14;
    const sz = 46 - k * 10;
    const dop = interpolate(appear, [0, 0.1, 0.62, 0.72], [0, 1, 1, 0], clamp);
    if (dop <= 0) return null;
    return (
      <div key={k} style={{
        position: "absolute", left: "50%", top: "50%", width: sz, height: sz,
        transform: `translate(-50%,-50%) translate(${dpx}px, ${dpy}px)`,
        borderRadius: blobRadius(frame, seed + k + 11),
        background: `radial-gradient(circle at 34% 30%, ${PINK}, ${PURPLE} 70%)`,
        boxShadow: `0 6px 16px rgba(0,0,0,0.4)`, opacity: dop, zIndex: 1,
      }} />
    );
  };

  return (
    <div style={{
      position: "relative", width: BLOB, height: BLOB,
      transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
      transformOrigin: "center center", opacity: op,
    }}>
      {droplet(0)}
      {droplet(1)}
      {/* the blob body */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: radius, zIndex: 2,
        background:
          `radial-gradient(120% 120% at 30% 22%, ${TEAL} 0%, ${PURPLE} 52%, ${PINK} 100%)`,
        boxShadow:
          `0 26px 60px rgba(0,0,0,0.5), 0 0 46px ${ACCENT}44, ` +
          `inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -22px 44px rgba(0,0,0,0.32)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        {/* glossy highlight */}
        <div style={{
          position: "absolute", top: "9%", left: "16%", width: "52%", height: "32%",
          borderRadius: "50%", pointerEvents: "none",
          background: "radial-gradient(closest-side, rgba(255,255,255,0.62), rgba(255,255,255,0) 80%)",
          filter: "none",
        }} />
        <div style={{
          fontFamily: COND, fontWeight: 700, fontSize: 30, letterSpacing: "0.16em",
          color: "rgba(255,255,255,0.92)", textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          marginBottom: 4, position: "relative", zIndex: 1,
        }}>{label}</div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
      </div>
    </div>
  );
};

export const LiquidBlobs: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;

  // background ambient lava blobs (slow drifting radial gradients)
  const ambient = (i: number) => {
    const r = rand(i * 7 + 3);
    const x = 18 + r * 64 + 7 * Math.sin(frame * 0.012 + i * 1.7);
    const y = 22 + rand(i * 5 + 1) * 56 + 6 * Math.sin(frame * 0.01 + i * 2.3);
    const c = [TEAL, PURPLE, PINK][i % 3];
    const size = 360 + rand(i * 3 + 2) * 220;
    return (
      <div key={i} style={{
        position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size,
        transform: "translate(-50%,-50%)", borderRadius: "50%", pointerEvents: "none",
        background: `radial-gradient(circle, ${c}26 0%, ${c}00 66%)`, zIndex: 1,
      }} />
    );
  };

  // hero "puddle" — a wobbling liquid pool the figure rises out of
  const puddleWobble = blobRadius(frame, 99);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 80% at 50% 46%, #141826 0%, #080a12 78%)" }}>
      {/* ambient lava blobs */}
      {[0, 1, 2, 3, 4].map((i) => ambient(i))}

      {/* hero liquid pool at the bottom */}
      <div style={{
        position: "absolute", left: "50%", bottom: -76, transform: "translateX(-50%)",
        width: 760, height: 240, borderRadius: puddleWobble, zIndex: 20,
        background: `radial-gradient(ellipse 70% 100% at 50% 30%, ${TEAL}55, ${PURPLE}33 55%, rgba(0,0,0,0) 78%)`,
        boxShadow: `0 0 80px ${ACCENT}33`,
      }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(25,227,196,0.5)" />

      {/* glossy meniscus rim of the pool, in front of the feet */}
      <div style={{
        position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)",
        width: 560, height: 90, borderRadius: blobRadius(frame, 42), zIndex: 31,
        background: `radial-gradient(ellipse 80% 100% at 50% 20%, rgba(255,255,255,0.18), rgba(25,227,196,0.12) 50%, rgba(0,0,0,0) 76%)`,
      }} />

      {/* clue blobs — far sides + top, clear of the bottom-anchored hero */}
      <div style={{ position: "absolute", top: 70, left: 60, zIndex: 40 }}>
        <ClueBlob appear={clueSpring(frame, 0)} frame={frame} seed={1} label={clueLabel("club", language)}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: 150, maxHeight: 132, objectFit: "contain", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.55))" }} />
            : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 96, color: "#fff" }}>?</span>}
        </ClueBlob>
      </div>

      <div style={{ position: "absolute", top: 70, right: 60, zIndex: 40 }}>
        <ClueBlob appear={clueSpring(frame, 1)} frame={frame} seed={2} label={clueLabel("position", language)}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 128, color: "#fff", lineHeight: 0.9, textShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>{translatePosition(level.position, language)}</span>
        </ClueBlob>
      </div>

      <div style={{ position: "absolute", top: 384, left: 60, zIndex: 40 }}>
        <ClueBlob appear={clueSpring(frame, 2)} frame={frame} seed={3} label={clueLabel("country", language)}>
          {p.flagSrc
            ? <Img src={p.flagSrc} style={{ width: 176, height: 118, objectFit: "cover", borderRadius: 12, boxShadow: "0 5px 14px rgba(0,0,0,0.55)" }} />
            : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 38, color: "#fff", textAlign: "center" }}>{level.country}</span>}
        </ClueBlob>
      </div>

      <div style={{ position: "absolute", top: 384, right: 60, zIndex: 40 }}>
        <ClueBlob appear={clueSpring(frame, 3)} frame={frame} seed={4} label={ageUnit(level.age, language)}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 140, color: "#fff", lineHeight: 0.9, textShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>{level.age ?? "?"}</span>
        </ClueBlob>
      </div>

      {/* reveal: a morphing liquid plate flows up under the name */}
      {rp > 0 ? (() => {
        const slam = interpolate(rp, [0.24, 0.5], [0, 1], clamp);
        if (slam <= 0) return null;
        const ty = interpolate(slam, [0, 1], [60, 0]);
        return (
          <div style={{
            position: "absolute", left: "50%", bottom: 30, zIndex: 45,
            transform: `translate(-50%, ${ty}px)`, opacity: slam,
            width: 1180, height: 250, borderRadius: blobRadius(frame, 77),
            background: `radial-gradient(ellipse 80% 100% at 50% 40%, ${TEAL}3a, ${PURPLE}26 55%, rgba(0,0,0,0) 80%)`,
            boxShadow: `0 0 90px ${ACCENT}3a`,
          }} />
        );
      })() : null}

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* level badge — blob coin */}
      <div style={{
        position: "absolute", top: 40, left: "50%", transform: `translateX(-50%) scale(${1 + 0.02 * Math.sin(frame * 0.07)})`,
        zIndex: 60, width: 118, height: 118, borderRadius: blobRadius(frame, 5),
        background: `radial-gradient(circle at 38% 30%, #bafff2, ${TEAL} 58%, ${PURPLE})`,
        boxShadow: `0 12px 28px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.4), 0 0 28px ${ACCENT}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#06322b",
        opacity: p.uiOpacity,
      }}>{p.levelNumber}</div>

      {/* timer — wobbling blob with ring + seconds */}
      <div style={{
        position: "absolute", top: 36, right: 44, zIndex: 60, width: 126, height: 126,
        opacity: p.uiOpacity,
      }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: blobRadius(frame, 8),
          background: "radial-gradient(circle at 36% 30%, rgba(30,40,56,0.92), rgba(10,14,20,0.92))",
          boxShadow: `inset 0 2px 0 rgba(255,255,255,0.18), 0 10px 26px rgba(0,0,0,0.5)`,
        }} />
        <svg width={126} height={126} style={{ position: "absolute", inset: 0 }}>
          <circle cx={63} cy={63} r={50} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={10} />
          <circle cx={63} cy={63} r={50} fill="none" stroke={timerRemain < 0.18 ? "#ff4d6d" : ACCENT} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - timerRemain)} transform="rotate(-90 63 63)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 58, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};

// REVEAL_START kept for parity with other templates' reveal timing assumptions.
void REVEAL_START;
