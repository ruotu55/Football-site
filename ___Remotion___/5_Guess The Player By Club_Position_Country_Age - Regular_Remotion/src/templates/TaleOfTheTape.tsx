// Template — "Tale of the Tape".
// A boxing/MMA fight-poster ledger. Dark gritty arena, a top "TALE OF THE TAPE"
// banner, the four clues as HUGE stat ROWS that SLAM in from alternating sides
// with an overshoot, a 1–2 frame screen shudder and a small dust/impact flash on
// landing. The spotlit hero stands centre (gold rim). Reveal = fighter intro name
// in a gold championship-belt banner.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, rand, REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', " + fontFamily;
const GOLD = "#ffcb45";
const CRIMSON = "#c41e2a";
const INK = "#0a0807";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// A single ledger stat row. Slams in from `side` (-1 left, +1 right) with an
// overshoot settle. On the landing frame a short dust burst + impact flash fire.
const StatRow: React.FC<{
  appear: number;       // clueSpring value (overshoots past 1)
  side: -1 | 1;         // which edge it flies in from
  label: string;
  seed: number;
  children: React.ReactNode;
}> = ({ appear, side, label, seed, children }) => {
  const a = Math.max(0, appear);
  const op = interpolate(a, [0, 0.18], [0, 1], clamp);
  // slide in from off-screen edge, overshoot is inherent in clueSpring
  const tx = interpolate(a, [0, 1], [side * 1100, 0]);
  // impact lands as the spring first crosses ~1 → flash/dust fade fast after
  const impact = interpolate(a, [0.78, 0.96, 1.18], [0, 1, 0], clamp);
  const dust = impact;

  return (
    <div style={{ position: "relative", transform: `translateX(${tx}px)`, opacity: op }}>
      {/* ruled divider above */}
      <div style={{ height: 3, background: `linear-gradient(90deg, rgba(255,203,69,0) 0%, ${GOLD}aa 14%, ${GOLD}aa 86%, rgba(255,203,69,0) 100%)`, opacity: 0.7 }} />
      <div style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 138, padding: "0 46px",
        background: "linear-gradient(90deg, rgba(196,30,42,0.10), rgba(10,8,7,0.0) 40%, rgba(10,8,7,0.0) 60%, rgba(196,30,42,0.10))",
      }}>
        {/* impact flash sweeping the row on landing */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(120% 90% at ${side < 0 ? "6%" : "94%"} 50%, rgba(255,236,180,${0.55 * impact}), rgba(255,203,69,0) 60%)`,
          mixBlendMode: "screen",
        }} />
        {/* dust specks kicked up at the landing edge */}
        {dust > 0.02 ? (
          <div style={{ position: "absolute", top: 0, bottom: 0, [side < 0 ? "left" : "right"]: 8, width: 160, pointerEvents: "none" } as React.CSSProperties}>
            {Array.from({ length: 7 }).map((_, k) => {
              const r1 = rand(seed * 9.1 + k * 3.7);
              const r2 = rand(seed * 4.3 + k * 7.1);
              const rise = interpolate(impact, [0, 1], [0, -34 - r1 * 40]);
              return (
                <div key={k} style={{
                  position: "absolute", left: r1 * 150, top: 70 + r2 * 50,
                  width: 5 + r2 * 6, height: 5 + r2 * 6, borderRadius: "50%",
                  background: "rgba(214,196,160,0.9)",
                  transform: `translateY(${rise}px)`, opacity: dust * (0.5 + r1 * 0.5),
                  filter: "blur(1px)",
                }} />
              );
            })}
          </div>
        ) : null}

        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 40, letterSpacing: "0.22em", color: GOLD, textTransform: "uppercase", textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 240 }}>{children}</div>
      </div>
    </div>
  );
};

export const TaleOfTheTape: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;

  // 1–2 frame screen shudder each time a clue lands (drives the whole stage).
  let shake = 0;
  for (let i = 0; i < 4; i++) {
    const a = clueSpring(frame, i);
    const hit = interpolate(a, [0.8, 0.92, 1.05], [0, 1, 0], clamp);
    shake = Math.max(shake, hit);
  }
  const shx = (rand(frame * 1.7) - 0.5) * 14 * shake;
  const shy = (rand(frame * 2.3 + 5) - 0.5) * 10 * shake;

  const HUGE: React.CSSProperties = { fontFamily: COND, fontWeight: 900, fontSize: 116, lineHeight: 0.9, color: "#fff", textShadow: `0 5px 0 rgba(0,0,0,0.55), 0 10px 26px rgba(0,0,0,0.7)` };

  const TITLE = language === "Spanish" ? "FICHA TÉCNICA" : "TALE OF THE TAPE";

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% 30%, #1a0f0d 0%, ${INK} 60%, #050403 100%)` }}>
      {/* gritty arena vignette + crimson floor glow */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(196,30,42,0.22), rgba(0,0,0,0) 60%)" }} />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 320px rgba(0,0,0,0.9)", pointerEvents: "none" }} />

      <AbsoluteFill style={{ transform: `translate(${shx}px, ${shy}px)` }}>
        {/* ── top title banner ───────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 38, left: "50%", transform: "translateX(-50%)", zIndex: 45, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            position: "relative", padding: "10px 64px",
            background: `linear-gradient(180deg, #15100d, ${INK})`,
            border: `3px solid ${GOLD}`, borderRadius: 8,
            boxShadow: `0 0 0 2px ${INK}, 0 14px 40px rgba(0,0,0,0.7), inset 0 0 24px rgba(196,30,42,0.25)`,
          }}>
            <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 70, letterSpacing: "0.16em", color: GOLD, lineHeight: 1, textShadow: `0 3px 0 ${CRIMSON}, 0 6px 18px rgba(0,0,0,0.8)`, whiteSpace: "nowrap" }}>{TITLE}</div>
          </div>
        </div>

        {/* spotlit hero, gold rim, centred & bottom-anchored */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 20 }}>
          <div style={{ position: "absolute", left: "50%", bottom: 0, width: 640, height: 760, transform: "translateX(-50%)", background: "radial-gradient(ellipse 50% 60% at 50% 30%, rgba(255,236,180,0.16), rgba(255,203,69,0) 62%)", pointerEvents: "none" }} />
        </div>
        <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,203,69,0.55)" />

        {/* ── the four stat rows: ledger pinned to the LEFT third ──────── */}
        <div style={{ position: "absolute", top: 168, left: 70, width: 780, zIndex: 40, display: "flex", flexDirection: "column", gap: 16 }}>
          <StatRow appear={clueSpring(frame, 0)} side={-1} seed={11} label={clueLabel("club", language)}>
            {p.clubSrc
              ? <Img src={p.clubSrc} style={{ maxWidth: 200, maxHeight: 122, objectFit: "contain", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.7))" }} />
              : <span style={{ ...HUGE, fontSize: 96 }}>?</span>}
          </StatRow>

          <StatRow appear={clueSpring(frame, 1)} side={1} seed={23} label={clueLabel("position", language)}>
            <span style={{ ...HUGE, color: GOLD }}>{translatePosition(level.position, language) || "?"}</span>
          </StatRow>

          <StatRow appear={clueSpring(frame, 2)} side={-1} seed={37} label={clueLabel("country", language)}>
            {p.flagSrc
              ? <Img src={p.flagSrc} style={{ width: 188, height: 124, objectFit: "cover", borderRadius: 6, border: `2px solid ${GOLD}`, boxShadow: "0 4px 14px rgba(0,0,0,0.7)" }} />
              : <span style={{ ...HUGE, fontSize: 56 }}>{level.country || "?"}</span>}
          </StatRow>

          <StatRow appear={clueSpring(frame, 3)} side={1} seed={53} label={ageUnit(level.age, language)}>
            <span style={{ ...HUGE, fontSize: 134, color: GOLD }}>{level.age ?? "?"}</span>
          </StatRow>

          {/* closing rule under the ledger */}
          <div style={{ height: 3, background: `linear-gradient(90deg, rgba(255,203,69,0) 0%, ${GOLD}aa 14%, ${GOLD}aa 86%, rgba(255,203,69,0) 100%)`, opacity: 0.7 }} />
        </div>

        {/* ── reveal: name on a gold championship belt ─────────────────── */}
        {frame >= REVEAL_START - 30 ? (
          <div style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 48, opacity: interpolate(rp, [0.28, 0.5], [0, 1], clamp) }}>
            <div style={{
              width: 1180, height: 26, borderRadius: 13, margin: "0 auto",
              background: `linear-gradient(180deg, #fff0bd, ${GOLD} 45%, #9c7416)`,
              border: `2px solid ${INK}`, boxShadow: `0 0 26px rgba(255,203,69,0.5), inset 0 1px 0 rgba(255,255,255,0.7)`,
            }} />
          </div>
        ) : null}
        <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={GOLD} bottom={54} />

        {/* ── level badge (corner fight-card number) ───────────────────── */}
        <div style={{ position: "absolute", top: 40, left: 44, zIndex: 60, width: 118, height: 118, borderRadius: 12,
          background: `linear-gradient(160deg, ${CRIMSON}, #6e0f16)`,
          border: `4px solid ${GOLD}`, boxShadow: "0 12px 28px rgba(0,0,0,0.7), inset 0 0 18px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 900, fontSize: 70, color: "#fff", textShadow: `0 3px 0 rgba(0,0,0,0.5)` }}>{p.levelNumber}</div>

        {/* ── timer (round clock) ──────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 40, right: 44, zIndex: 60, width: 122, height: 122 }}>
          <svg width={122} height={122}>
            <circle cx={61} cy={61} r={50} fill="rgba(10,8,7,0.78)" stroke="rgba(255,203,69,0.22)" strokeWidth={11} />
            <circle cx={61} cy={61} r={50} fill="none" stroke={timerRemain < 0.18 ? CRIMSON : GOLD} strokeWidth={11} strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - timerRemain)} transform="rotate(-90 61 61)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 900, fontSize: 60, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>{secs}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
