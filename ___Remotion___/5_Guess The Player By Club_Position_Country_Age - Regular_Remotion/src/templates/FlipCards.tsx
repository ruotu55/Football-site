// Template 6 — "Flip Cards".
// The big full-body hero stands centre. Four clue cards 3D-flip in along the top,
// one after another (rotateY from edge-on to face-on with a springy settle). No
// ambient clutter — the motion IS the show. Reveal materialises the photo + name.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const ACCENT = "#36d1ff";
const CARD_W = 312, CARD_H = 216, GAP = 34;

const FlipCard: React.FC<{ appear: number; label: string; children: React.ReactNode }> = ({ appear, label, children }) => {
  const t = Math.min(1.15, Math.max(0, appear));
  const rotY = interpolate(t, [0, 1], [92, 0]); // swings open from edge-on
  const op = interpolate(appear, [0, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: CARD_W, height: CARD_H, perspective: 1400 }}>
      <div style={{
        width: "100%", height: "100%", transformStyle: "preserve-3d",
        transform: `rotateY(${rotY}deg)`, opacity: op,
        borderRadius: 22, overflow: "hidden",
        background: "linear-gradient(160deg, rgba(20,26,36,0.92), rgba(10,14,20,0.9))",
        border: `1px solid ${ACCENT}55`, borderTop: `4px solid ${ACCENT}`,
        boxShadow: `0 22px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)`,
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.18em", color: ACCENT, textAlign: "center", paddingTop: 14 }}>{label}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 14px 14px" }}>{children}</div>
      </div>
    </div>
  );
};

export const FlipCards: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 50% 66%, rgba(0,0,0,0.40), rgba(0,0,0,0) 72%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(54,209,255,0.45)" />

      {/* top row of flip cards */}
      <div style={{ position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)", display: "flex", gap: GAP, zIndex: 40 }}>
        <FlipCard appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
          {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "82%", maxHeight: 120, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} /> : <span style={{ fontSize: 60, color: "#fff" }}>?</span>}
        </FlipCard>
        <FlipCard appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 96, color: "#fff", textShadow: `0 4px 14px rgba(0,0,0,0.5)` }}>{translatePosition(level.position, language)}</span>
        </FlipCard>
        <FlipCard appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
          {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 168, height: 112, objectFit: "cover", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }} /> : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 34, color: "#fff" }}>{level.country}</span>}
        </FlipCard>
        <FlipCard appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 104, color: "#fff", textShadow: `0 4px 14px rgba(0,0,0,0.5)` }}>{level.age ?? "?"}</span>
        </FlipCard>
      </div>

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* level badge */}
      <div style={{ position: "absolute", top: 40, left: 44, zIndex: 60, width: 118, height: 118, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 32%, #bdefff, #36d1ff 60%, #1577a8)",
        border: "5px solid rgba(255,255,255,0.92)", boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#06222f" }}>{p.levelNumber}</div>

      {/* timer ring */}
      <div style={{ position: "absolute", top: 40, right: 44, zIndex: 60, width: 122, height: 122 }}>
        <svg width={122} height={122}>
          <circle cx={61} cy={61} r={50} fill="rgba(10,14,20,0.7)" stroke="rgba(255,255,255,0.16)" strokeWidth={11} />
          <circle cx={61} cy={61} r={50} fill="none" stroke={timerRemain < 0.18 ? "#ff4136" : ACCENT} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - timerRemain)} transform="rotate(-90 61 61)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 58, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
