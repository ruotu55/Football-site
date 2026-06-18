// Template 8 — "Dealt Deck".
// The clues are dealt like playing cards: each flies in from a deck above centre,
// spinning, lands at a slight hand-dealt tilt, then flips face-up to show the clue.
// Big hero stands centre. The motion is the focus; no ambient particles.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const ACCENT = "#ff5a5f";
const CARD_W = 296, CARD_H = 214;
const TOP = 56;
const ORIGIN = { x: 960, y: -240 };
const SLOTS_X = [960 - 1.5 * (CARD_W + 30), 960 - 0.5 * (CARD_W + 30), 960 + 0.5 * (CARD_W + 30), 960 + 1.5 * (CARD_W + 30)];
const TILT = [-6, 4, -4, 6];

const faceBase: React.CSSProperties = {
  position: "absolute", inset: 0, borderRadius: 18, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  display: "flex", flexDirection: "column", overflow: "hidden",
  boxShadow: "0 20px 46px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
};

const DealtCard: React.FC<{ i: number; appear: number; label: string; children: React.ReactNode }> = ({ i, appear, label, children }) => {
  const prog = Math.min(1, Math.max(0, appear));
  const travel = interpolate(prog, [0, 0.7], [0, 1], { extrapolateRight: "clamp" }); // fly to slot
  const tx = (ORIGIN.x - SLOTS_X[i]) * (1 - travel);
  const ty = (ORIGIN.y - TOP) * (1 - travel);
  const spin = interpolate(prog, [0, 0.7], [430, TILT[i]], { extrapolateRight: "clamp" });
  const flip = interpolate(prog, [0.62, 1], [180, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); // face up
  const op = interpolate(appear, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: SLOTS_X[i] - CARD_W / 2, top: TOP, width: CARD_W, height: CARD_H, opacity: op, transform: `translate(${tx}px, ${ty}px) rotate(${spin}deg)`, perspective: 1300, zIndex: 40 }}>
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: `rotateY(${flip}deg)` }}>
        {/* front (clue) */}
        <div style={{ ...faceBase, background: "linear-gradient(160deg, rgba(22,26,34,0.94), rgba(10,13,18,0.92))", border: `1px solid ${ACCENT}66`, borderTop: `4px solid ${ACCENT}` }}>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 25, letterSpacing: "0.16em", color: ACCENT, textAlign: "center", paddingTop: 13 }}>{label}</div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 14px 12px" }}>{children}</div>
        </div>
        {/* back (?) */}
        <div style={{ ...faceBase, transform: "rotateY(180deg)", background: "repeating-linear-gradient(45deg, #b1373b 0 14px, #93292d 14px 28px)", border: "4px solid #fff2", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 110, color: "rgba(255,255,255,0.85)", textShadow: "0 3px 10px rgba(0,0,0,0.5)" }}>?</span>
        </div>
      </div>
    </div>
  );
};

export const DealtDeck: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 50% 66%, rgba(0,0,0,0.40), rgba(0,0,0,0) 72%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,90,95,0.42)" />

      {/* deck stub at origin */}
      <div style={{ position: "absolute", left: ORIGIN.x - 26, top: 18, width: 52, height: 74, borderRadius: 8, background: "repeating-linear-gradient(45deg, #b1373b 0 8px, #93292d 8px 16px)", border: "2px solid #fff3", boxShadow: "0 8px 20px rgba(0,0,0,0.5)", zIndex: 30, opacity: 0.85 }} />

      <DealtCard i={0} appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
        {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "80%", maxHeight: 116, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} /> : <span style={{ fontSize: 60, color: "#fff" }}>?</span>}
      </DealtCard>
      <DealtCard i={1} appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 92, color: "#fff", textShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>{translatePosition(level.position, language)}</span>
      </DealtCard>
      <DealtCard i={2} appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
        {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 162, height: 108, objectFit: "cover", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }} /> : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 32, color: "#fff" }}>{level.country}</span>}
      </DealtCard>
      <DealtCard i={3} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 100, color: "#fff", textShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>{level.age ?? "?"}</span>
      </DealtCard>

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* level badge */}
      <div style={{ position: "absolute", top: 42, left: 46, zIndex: 60, width: 116, height: 116, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 32%, #ffd0d2, #ff5a5f 60%, #b22e33)", border: "5px solid rgba(255,255,255,0.92)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#fff" }}>{p.levelNumber}</div>

      {/* timer */}
      <div style={{ position: "absolute", top: 42, right: 46, zIndex: 60, width: 116, height: 116 }}>
        <svg width={116} height={116}>
          <circle cx={58} cy={58} r={47} fill="rgba(10,13,18,0.7)" stroke="rgba(255,255,255,0.16)" strokeWidth={11} />
          <circle cx={58} cy={58} r={47} fill="none" stroke={timerRemain < 0.18 ? "#ff4136" : ACCENT} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 47} strokeDashoffset={2 * Math.PI * 47 * (1 - timerRemain)} transform="rotate(-90 58 58)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 56, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
