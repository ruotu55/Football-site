// Template — "Shatter / Glass Shards".
// Sharp, icy, premium. Each clue plate ASSEMBLES from a handful of triangular
// glass shards that fly in from random directions and converge into the finished
// frosted plate (driven by clueSpring). On reveal a ring of triangular shards
// BURSTS outward over the figure as the silhouette shatters to expose the colour
// photo. Palette: icy white / steel blue #8fb7ff / cyan glints on dark.
import React from "react";
import { AbsoluteFill, interpolate, Img } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, rand, REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', " + fontFamily;
const ACCENT = "#8fb7ff";
const ICE = "#eaf2ff";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Frosted plate dims.
const PLATE_W = 320, PLATE_H = 230, GAP = 36;

// Triangular clip-paths for shard pieces of a plate (3 shards tile the plate).
const SHARD_CLIPS: string[] = [
  "polygon(0% 0%, 64% 0%, 0% 78%)",
  "polygon(64% 0%, 100% 0%, 100% 58%, 0% 78%)",
  "polygon(100% 58%, 100% 100%, 0% 100%, 0% 78%)",
];

// One frosted glass plate that assembles from `SHARD_CLIPS.length` shards.
const ShardPlate: React.FC<{ appear: number; seed: number; label: string; children: React.ReactNode }> = ({
  appear, seed, label, children,
}) => {
  const settle = Math.min(1, Math.max(0, appear));
  return (
    <div style={{ position: "relative", width: PLATE_W, height: PLATE_H }}>
      {SHARD_CLIPS.map((clip, i) => {
        const s = seed * 7 + i * 3.17;
        // deterministic fly-in vector + spin per shard
        const ang = rand(s) * Math.PI * 2;
        const dist = 240 + rand(s + 1.1) * 220;
        const dx = Math.cos(ang) * dist * (1 - settle);
        const dy = Math.sin(ang) * dist * (1 - settle);
        const spin = (rand(s + 2.2) - 0.5) * 90 * (1 - settle);
        const op = interpolate(appear, [0, 0.22, 1], [0, 1, 1], clamp);
        const edge = interpolate(settle, [0.6, 1], [0, 1], clamp);
        return (
          <div
            key={i}
            style={{
              position: "absolute", inset: 0, clipPath: clip, WebkitClipPath: clip,
              transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg)`,
              opacity: op,
              background:
                "linear-gradient(150deg, rgba(40,58,88,0.62), rgba(14,22,38,0.66))",
              border: `1px solid rgba(143,183,255,${0.25 + edge * 0.3})`,
              boxShadow: `inset 0 1px 0 rgba(234,242,255,${0.16 * edge}), 0 14px 36px rgba(0,0,0,0.45)`,
            }}
          />
        );
      })}
      {/* bright assembled edge + frost sheen, fades in as shards settle */}
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: 6,
          opacity: interpolate(settle, [0.55, 1], [0, 1], clamp),
          border: `1.5px solid ${ACCENT}`,
          boxShadow: `0 0 22px rgba(143,183,255,0.35), inset 0 0 24px rgba(143,183,255,0.10)`,
          background:
            "linear-gradient(135deg, rgba(234,242,255,0.10) 0%, rgba(234,242,255,0) 38%)",
          clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)",
        }}
      />
      {/* content sits above the glass, revealed as the plate finishes */}
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          opacity: interpolate(settle, [0.5, 0.92], [0, 1], clamp),
        }}
      >
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 28, letterSpacing: "0.2em", color: ACCENT, textAlign: "center", paddingTop: 16, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>{label}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 16px 16px" }}>{children}</div>
      </div>
    </div>
  );
};

// The burst of triangular shards that flies off the figure on reveal.
const ShatterBurst: React.FC<{ revealProgress: number }> = ({ revealProgress: rp }) => {
  const t = interpolate(rp, [0.06, 0.6], [0, 1], clamp);
  if (t <= 0 || t >= 1) return null;
  const COUNT = 18;
  const cx = 960, cy = 520;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 45, pointerEvents: "none" }}>
      {Array.from({ length: COUNT }).map((_, i) => {
        const s = i * 5.31 + 1.7;
        const ang = (i / COUNT) * Math.PI * 2 + (rand(s) - 0.5) * 0.5;
        const dist = (200 + rand(s + 1) * 420) * t;
        const x = cx + Math.cos(ang) * dist;
        const y = cy + Math.sin(ang) * dist - t * 80;
        const sz = 34 + rand(s + 2) * 70;
        const spin = (rand(s + 3) - 0.5) * 720 * t;
        const op = interpolate(t, [0, 0.18, 0.8, 1], [0, 1, 0.7, 0], clamp);
        const tri = i % 2
          ? "polygon(0% 0%, 100% 38%, 28% 100%)"
          : "polygon(50% 0%, 100% 86%, 0% 70%)";
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x, top: y, width: sz, height: sz,
              transform: `translate(-50%,-50%) rotate(${spin}deg)`,
              clipPath: tri, WebkitClipPath: tri, opacity: op,
              background:
                "linear-gradient(135deg, rgba(234,242,255,0.92), rgba(143,183,255,0.55) 55%, rgba(60,90,150,0.35))",
              boxShadow: "0 0 14px rgba(143,183,255,0.5)",
            }}
          />
        );
      })}
    </div>
  );
};

export const ShatterReveal: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;

  // faint pre-reveal cracks across the figure that brighten just before REVEAL_START
  const preCrack = interpolate(frame, [REVEAL_START - 26, REVEAL_START], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 64% 72% at 50% 62%, rgba(20,32,56,0.55), rgba(0,0,0,0) 72%)" }}>
      {/* cold floor vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 50% 40% at 50% 96%, rgba(143,183,255,0.10), rgba(0,0,0,0) 70%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(143,183,255,0.5)" />

      {/* thin icy crack glints over the silhouette just before it shatters */}
      {rp < 0.05 && preCrack > 0 ? (
        <div style={{ position: "absolute", inset: 0, zIndex: 35, pointerEvents: "none", opacity: preCrack * 0.55 }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const s = i * 9.13 + 2.4;
            const x = 760 + rand(s) * 400;
            const y = 280 + rand(s + 1) * 460;
            const w = 120 + rand(s + 2) * 200;
            const rot = (rand(s + 3) - 0.5) * 160;
            return (
              <div key={i} style={{
                position: "absolute", left: x, top: y, width: w, height: 2,
                transform: `rotate(${rot}deg)`,
                background: "linear-gradient(90deg, rgba(143,183,255,0) 0%, rgba(234,242,255,0.9) 50%, rgba(143,183,255,0) 100%)",
                boxShadow: "0 0 8px rgba(143,183,255,0.7)",
              }} />
            );
          })}
        </div>
      ) : null}

      <ShatterBurst revealProgress={rp} />

      {/* top row of shard-assembled clue plates */}
      <div style={{ position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", display: "flex", gap: GAP, zIndex: 40 }}>
        <ShardPlate appear={clueSpring(frame, 0)} seed={11} label={clueLabel("club", language)}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: "80%", maxHeight: 124, objectFit: "contain", filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.55))" }} />
            : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 70, color: ICE }}>?</span>}
        </ShardPlate>
        <ShardPlate appear={clueSpring(frame, 1)} seed={23} label={clueLabel("position", language)}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 104, color: ICE, textShadow: "0 4px 16px rgba(0,0,0,0.55)", letterSpacing: "0.01em" }}>{translatePosition(level.position, language)}</span>
        </ShardPlate>
        <ShardPlate appear={clueSpring(frame, 2)} seed={37} label={clueLabel("country", language)}>
          {p.flagSrc
            ? <Img src={p.flagSrc} style={{ width: 176, height: 118, objectFit: "cover", borderRadius: 4, boxShadow: "0 4px 14px rgba(0,0,0,0.55), 0 0 0 1px rgba(234,242,255,0.5)" }} />
            : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 38, color: ICE, textAlign: "center" }}>{level.country}</span>}
        </ShardPlate>
        <ShardPlate appear={clueSpring(frame, 3)} seed={53} label={ageUnit(level.age, language)}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 116, color: ICE, textShadow: "0 4px 16px rgba(0,0,0,0.55)" }}>{level.age ?? "?"}</span>
        </ShardPlate>
      </div>

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* level badge — a faceted glass shard medallion */}
      <div style={{
        position: "absolute", top: 40, left: 44, zIndex: 60, width: 120, height: 120,
        opacity: uiOpacity,
        clipPath: "polygon(50% 0%, 100% 26%, 100% 74%, 50% 100%, 0% 74%, 0% 26%)",
        background: "linear-gradient(150deg, #cfe0ff, #8fb7ff 55%, #4f74b4)",
        border: "4px solid rgba(234,242,255,0.92)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.5), 0 0 22px rgba(143,183,255,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: COND, fontWeight: 900, fontSize: 64, color: "#0c1830",
      }}>{p.levelNumber}</div>

      {/* timer ring */}
      <div style={{ position: "absolute", top: 40, right: 44, zIndex: 60, width: 122, height: 122, opacity: uiOpacity }}>
        <svg width={122} height={122}>
          <circle cx={61} cy={61} r={50} fill="rgba(10,16,28,0.72)" stroke="rgba(234,242,255,0.16)" strokeWidth={11} />
          <circle cx={61} cy={61} r={50} fill="none" stroke={timerRemain < 0.18 ? "#ff5a52" : ACCENT} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - timerRemain)} transform="rotate(-90 61 61)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 58, color: ICE, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
