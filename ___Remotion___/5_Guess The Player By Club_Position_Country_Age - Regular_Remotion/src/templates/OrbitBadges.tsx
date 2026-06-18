// Template 9 — "Orbit Badges".
// Four medallion badges swing in on tethers (pendulum from a pivot above) and
// settle with a natural bounce around the big hero — two per side, clear of the
// figure. The swing IS the animation; background stays clean.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const GOLD = "#ffd24a";
const BADGE = 214;
const ARM = 168;

// resting badge centres (clear of the centred hero) + which side it swings from
const BADGES = [
  { x: 332, y: 352, start: 78 },   // club   (upper-left)
  { x: 1588, y: 352, start: -78 }, // country(upper-right)
  { x: 300, y: 688, start: 70 },   // position(lower-left)
  { x: 1620, y: 688, start: -70 }, // age    (lower-right)
] as const;

const Badge: React.FC<{ i: number; appear: number; label: string; children: React.ReactNode }> = ({ i, appear, label, children }) => {
  const b = BADGES[i];
  const angle = interpolate(Math.min(1.12, Math.max(0, appear)), [0, 1], [b.start, 0]); // clueSpring overshoot = swing settle
  const op = interpolate(appear, [0, 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pivotX = b.x, pivotY = b.y - ARM;
  return (
    <div style={{ position: "absolute", left: pivotX, top: pivotY, transform: `rotate(${angle}deg)`, transformOrigin: "top center", opacity: op, zIndex: 40 }}>
      {/* tether */}
      <div style={{ position: "absolute", left: -2, top: 0, width: 4, height: ARM, background: "linear-gradient(180deg, rgba(255,210,120,0.25), rgba(255,210,120,0.7))", borderRadius: 2 }} />
      {/* pivot cap */}
      <div style={{ position: "absolute", left: -9, top: -9, width: 18, height: 18, borderRadius: "50%", background: "radial-gradient(circle at 38% 32%, #fff, #d9a93f 60%, #8a5f1e)", boxShadow: "0 3px 8px rgba(0,0,0,0.5)" }} />
      {/* medallion */}
      <div style={{
        position: "absolute", left: -BADGE / 2, top: ARM, width: BADGE, height: BADGE, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 34%, rgba(26,30,40,0.95), rgba(10,13,20,0.95))",
        border: `5px solid ${GOLD}`, boxShadow: `0 18px 40px rgba(0,0,0,0.55), 0 0 22px ${GOLD}44, inset 0 0 22px rgba(255,210,120,0.12)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 22, letterSpacing: "0.18em", color: GOLD, marginTop: 8 }}>{label}</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 8 }}>{children}</div>
      </div>
    </div>
  );
};

export const OrbitBadges: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain } = p;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 58% 70% at 50% 64%, rgba(0,0,0,0.42), rgba(0,0,0,0) 70%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,210,120,0.42)" />

      <Badge i={0} appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
        {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: 120, maxHeight: 110, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} /> : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 64, color: "#fff" }}>?</span>}
      </Badge>
      <Badge i={1} appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
        {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 138, height: 92, objectFit: "cover", borderRadius: 6, boxShadow: "0 3px 10px rgba(0,0,0,0.5)" }} /> : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 24, color: "#fff" }}>{level.country}</span>}
      </Badge>
      <Badge i={2} appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 78, color: "#fff", textShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>{translatePosition(level.position, language)}</span>
      </Badge>
      <Badge i={3} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 86, color: "#fff", textShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>{level.age ?? "?"}</span>
      </Badge>

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={GOLD} />

      {/* level badge */}
      <div style={{ position: "absolute", top: 42, left: 46, zIndex: 60, width: 116, height: 116, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 32%, #ffe9a8, #ffd24a 60%, #b8841f)", border: "5px solid rgba(255,255,255,0.92)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#241500" }}>{p.levelNumber}</div>

      {/* timer */}
      <div style={{ position: "absolute", top: 42, right: 46, zIndex: 60, width: 116, height: 116 }}>
        <svg width={116} height={116}>
          <circle cx={58} cy={58} r={47} fill="rgba(10,13,20,0.7)" stroke="rgba(255,255,255,0.16)" strokeWidth={11} />
          <circle cx={58} cy={58} r={47} fill="none" stroke={timerRemain < 0.18 ? "#ff4136" : GOLD} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 47} strokeDashoffset={2 * Math.PI * 47 * (1 - timerRemain)} transform="rotate(-90 58 58)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 56, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
