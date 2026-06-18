// Template 7 — "Split-Flap Board".
// Airport/railway departure-board aesthetic: amber on near-black. Each clue panel
// flaps down into place (rotateX hinge at the centre seam) with a mechanical
// double-settle, one after another. Big hero stands centre. Minimal ambient.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, type TemplateProps,
} from "./common";

const MONO = "'Barlow Condensed', 'Courier New', monospace";
const AMBER = "#ffc233";
const PANEL_W = 320, PANEL_H = 210, GAP = 30;

const FlapPanel: React.FC<{ appear: number; label: string; children: React.ReactNode }> = ({ appear, label, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  // mechanical: top leaf falls from edge-on (rotateX 88 → 0) with a tiny bounce
  const rotX = interpolate(appear, [0, 0.75, 0.9, 1], [88, -6, 3, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const op = interpolate(appear, [0, 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: PANEL_W, height: PANEL_H, perspective: 1100 }}>
      <div style={{
        position: "relative", width: "100%", height: "100%", transformOrigin: "center center",
        transform: `rotateX(${rotX}deg)`, opacity: op,
        borderRadius: 12, overflow: "hidden",
        background: "linear-gradient(180deg, #1a1814 0%, #0c0b09 50%, #1a1814 50%, #0a0908 100%)",
        border: "2px solid #2c2820", boxShadow: "0 20px 44px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,194,51,0.12)",
        display: "flex", flexDirection: "column",
      }}>
        {/* label tab */}
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: AMBER, textAlign: "center", paddingTop: 12, opacity: 0.8 }}>{label}</div>
        {/* value */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 14px 12px" }}>{children}</div>
        {/* centre seam + side pegs */}
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "rgba(0,0,0,0.65)", boxShadow: "0 1px 0 rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", top: "calc(50% - 7px)", left: -4, width: 8, height: 14, background: "#3a352a", borderRadius: 2 }} />
        <div style={{ position: "absolute", top: "calc(50% - 7px)", right: -4, width: 8, height: 14, background: "#3a352a", borderRadius: 2 }} />
      </div>
    </div>
  );
};

export const SplitFlapBoard: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;
  const flapText = { fontFamily: MONO, fontWeight: 800, color: AMBER, textShadow: `0 0 14px rgba(255,194,51,0.45)` } as React.CSSProperties;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 50% 66%, rgba(0,0,0,0.45), rgba(0,0,0,0) 72%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,194,51,0.40)" />

      <div style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", display: "flex", gap: GAP, zIndex: 40 }}>
        <FlapPanel appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
          {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "78%", maxHeight: 116, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(255,194,51,0.25))" }} /> : <span style={{ ...flapText, fontSize: 60 }}>?</span>}
        </FlapPanel>
        <FlapPanel appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
          <span style={{ ...flapText, fontSize: 96 }}>{translatePosition(level.position, language)}</span>
        </FlapPanel>
        <FlapPanel appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
          {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 170, height: 110, objectFit: "cover", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.55)" }} /> : <span style={{ ...flapText, fontSize: 30 }}>{level.country}</span>}
        </FlapPanel>
        <FlapPanel appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
          <span style={{ ...flapText, fontSize: 104 }}>{level.age ?? "?"}</span>
        </FlapPanel>
      </div>

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={AMBER} />

      {/* level badge — flap chip */}
      <div style={{ position: "absolute", top: 42, left: 46, zIndex: 60, width: 116, height: 116, borderRadius: 12,
        background: "linear-gradient(180deg, #1a1814, #0a0908)", border: "2px solid #2c2820",
        boxShadow: "0 12px 28px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,194,51,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 800, fontSize: 66, color: AMBER, textShadow: "0 0 14px rgba(255,194,51,0.5)" }}>{p.levelNumber}</div>

      {/* timer */}
      <div style={{ position: "absolute", top: 42, right: 46, zIndex: 60, width: 116, height: 116 }}>
        <svg width={116} height={116}>
          <circle cx={58} cy={58} r={47} fill="rgba(10,9,8,0.8)" stroke="rgba(255,194,51,0.18)" strokeWidth={11} />
          <circle cx={58} cy={58} r={47} fill="none" stroke={timerRemain < 0.18 ? "#ff4136" : AMBER} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 47} strokeDashoffset={2 * Math.PI * 47 * (1 - timerRemain)} transform="rotate(-90 58 58)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 800, fontSize: 56, color: AMBER, textShadow: "0 0 14px rgba(255,194,51,0.5)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
