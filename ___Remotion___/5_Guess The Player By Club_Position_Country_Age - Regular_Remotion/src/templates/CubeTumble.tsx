// Template 10 — "Cube Tumble".
// Each clue rides a real 3D box that tumbles in (rotateX+rotateY through several
// turns) and settles face-front, one after another, along the top. Big hero stands
// centre. The chunky 3D tumble is the spectacle; no ambient effects.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const ACCENT = "#a479ff";
const W = 300, H = 210, D = 66, GAP = 36;

const faceBase: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", overflow: "hidden" };
const sideBg = "linear-gradient(135deg, #2a2440, #15112a)";

const Box3D: React.FC<{ appear: number; label: string; children: React.ReactNode }> = ({ appear, label, children }) => {
  const t = Math.min(1.1, Math.max(0, appear));
  const rx = interpolate(t, [0, 1], [-392, 0]);
  const ry = interpolate(t, [0, 1], [308, 0]);
  const ty = interpolate(appear, [0, 0.7], [-70, 0], { extrapolateRight: "clamp" });
  const op = interpolate(appear, [0, 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: W, height: H, perspective: 1500, opacity: op }}>
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: `translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg)` }}>
        {/* front (clue) */}
        <div style={{ ...faceBase, width: W, height: H, transform: `translate(-50%,-50%) translateZ(${D / 2}px)`,
          borderRadius: 16, background: "linear-gradient(160deg, rgba(26,22,44,0.96), rgba(12,10,24,0.95))",
          border: `1px solid ${ACCENT}66`, borderTop: `4px solid ${ACCENT}`, display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 25, letterSpacing: "0.16em", color: ACCENT, textAlign: "center", paddingTop: 13 }}>{label}</div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 14px 12px" }}>{children}</div>
        </div>
        {/* back */}
        <div style={{ ...faceBase, width: W, height: H, transform: `translate(-50%,-50%) rotateY(180deg) translateZ(${D / 2}px)`, borderRadius: 16, background: sideBg, border: `2px solid ${ACCENT}33` }} />
        {/* right / left */}
        <div style={{ ...faceBase, width: D, height: H, transform: `translate(-50%,-50%) rotateY(90deg) translateZ(${W / 2}px)`, background: "linear-gradient(135deg, #221d38, #100d22)" }} />
        <div style={{ ...faceBase, width: D, height: H, transform: `translate(-50%,-50%) rotateY(-90deg) translateZ(${W / 2}px)`, background: "linear-gradient(135deg, #221d38, #100d22)" }} />
        {/* top / bottom */}
        <div style={{ ...faceBase, width: W, height: D, transform: `translate(-50%,-50%) rotateX(90deg) translateZ(${H / 2}px)`, background: "linear-gradient(135deg, #322a50, #1c1736)" }} />
        <div style={{ ...faceBase, width: W, height: D, transform: `translate(-50%,-50%) rotateX(-90deg) translateZ(${H / 2}px)`, background: "linear-gradient(135deg, #1a1530, #0c0a1c)" }} />
      </div>
    </div>
  );
};

export const CubeTumble: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 50% 66%, rgba(0,0,0,0.42), rgba(0,0,0,0) 72%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(164,121,255,0.45)" />

      <div style={{ position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", display: "flex", gap: GAP, zIndex: 40 }}>
        <Box3D appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
          {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "80%", maxHeight: 112, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} /> : <span style={{ fontSize: 58, color: "#fff" }}>?</span>}
        </Box3D>
        <Box3D appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 92, color: "#fff", textShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>{translatePosition(level.position, language)}</span>
        </Box3D>
        <Box3D appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
          {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 158, height: 106, objectFit: "cover", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }} /> : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 30, color: "#fff" }}>{level.country}</span>}
        </Box3D>
        <Box3D appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 100, color: "#fff", textShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>{level.age ?? "?"}</span>
        </Box3D>
      </div>

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* level badge */}
      <div style={{ position: "absolute", top: 42, left: 46, zIndex: 60, width: 116, height: 116, borderRadius: 18,
        background: "linear-gradient(160deg, #2a2440, #14112a)", border: `3px solid ${ACCENT}`,
        boxShadow: `0 12px 28px rgba(0,0,0,0.5), 0 0 20px ${ACCENT}44`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#fff" }}>{p.levelNumber}</div>

      {/* timer */}
      <div style={{ position: "absolute", top: 42, right: 46, zIndex: 60, width: 116, height: 116 }}>
        <svg width={116} height={116}>
          <circle cx={58} cy={58} r={47} fill="rgba(14,11,28,0.7)" stroke="rgba(255,255,255,0.16)" strokeWidth={11} />
          <circle cx={58} cy={58} r={47} fill="none" stroke={timerRemain < 0.18 ? "#ff4136" : ACCENT} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 47} strokeDashoffset={2 * Math.PI * 47 * (1 - timerRemain)} transform="rotate(-90 58 58)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 56, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
