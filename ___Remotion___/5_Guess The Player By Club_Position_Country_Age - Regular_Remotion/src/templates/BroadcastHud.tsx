// Template 3 — "Broadcast HUD".
// ESPN / Sky-Sports style motion graphics. Stat bars sweep in from the left one
// after another, the hidden silhouette sits in a broadcast frame on the right,
// and the reveal drops a full-width name lower-third with a screen flash.
import React from "react";
import { Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel, nameParts,
  SILHOUETTE_FILTER, silhouetteOpacity, colorOpacity, rand,
  REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const BLUE = "#19b6ff";
const RED = "#ff2d55";

const FRAME = { x: 1330, y: 520, w: 470, h: 620 };
const BAR = { x: 80, w: 600, h: 96 };
const BAR_YS = [284, 400, 516, 632];

const StatBar: React.FC<{ y: number; appear: number; label: string; children: React.ReactNode }> = ({ y, appear, label, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  return (
    <div style={{
      position: "absolute", left: BAR.x, top: y, width: BAR.w, height: BAR.h,
      transform: `translateX(${(1 - t) * -680}px)`, opacity: t,
      display: "flex", alignItems: "stretch",
      filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.45))",
    }}>
      {/* accent wedge */}
      <div style={{ width: 18, background: BLUE, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" }} />
      {/* label block */}
      <div style={{ width: 200, background: "linear-gradient(180deg,#0c1622,#070d15)", display: "flex", alignItems: "center", paddingLeft: 22, borderLeft: `2px solid ${BLUE}` }}>
        <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 30, letterSpacing: "0.14em", color: BLUE }}>{label}</span>
      </div>
      {/* value block */}
      <div style={{ flex: 1, background: "linear-gradient(180deg, rgba(20,32,46,0.92), rgba(10,18,28,0.92))", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {children}
      </div>
      {/* moving sheen */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(appear * 120) % 120}%`, width: 60, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)", transform: "skewX(-20deg)" }} />
    </div>
  );
};

export const BroadcastHud: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;
  const sOp = silhouetteOpacity(rp);
  const cOp = colorOpacity(rp);
  const { first, last } = nameParts(level.playerName, level.display);

  const revF = frame - REVEAL_START;
  const flash = rp > 0 ? interpolate(revF, [0, 4, 14], [0, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const lowerThird = interpolate(rp, [0.2, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily }}>
      {/* moving diagonal accent stripes */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: 0.10 }}>
        {Array.from({ length: 14 }, (_, i) => {
          const off = ((frame * 2.2) + i * 160) % 2400 - 400;
          return <rect key={i} x={off} y={-200} width={50} height={1500} fill={i % 2 ? BLUE : "#fff"} transform={`skewX(-24)`} />;
        })}
      </svg>
      {/* particle streaks */}
      {Array.from({ length: 22 }, (_, i) => {
        const x = (rand(i + 5) * 2200 - frame * (3 + rand(i) * 6)) % 2200;
        const y = rand(i + 17) * 1080;
        return <div key={`st${i}`} style={{ position: "absolute", left: x, top: y, width: 40 + rand(i) * 60, height: 2, background: `linear-gradient(90deg,transparent,${BLUE})`, opacity: 0.5 }} />;
      })}

      {/* TOP ribbon */}
      <div style={{ position: "absolute", top: 40, left: 80, right: 80, height: 6, background: `linear-gradient(90deg,${BLUE},transparent)`, opacity: uiOpacity }} />

      {/* hidden silhouette in broadcast frame */}
      <div style={{
        position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h,
        transform: "translate(-50%,-50%)",
        background: "linear-gradient(180deg, rgba(16,26,38,0.85), rgba(6,12,20,0.85))",
        border: `2px solid ${BLUE}`, borderRadius: 14,
        boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 30px rgba(25,182,255,0.25)`,
        overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}>
        {/* corner accents */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 70, height: 70, borderTop: `5px solid ${RED}`, borderLeft: `5px solid ${RED}` }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 70, height: 70, borderBottom: `5px solid ${RED}`, borderRight: `5px solid ${RED}` }} />
        {/* scanline */}
        <div style={{ position: "absolute", left: 0, right: 0, top: `${(frame * 1.4) % 100}%`, height: 2, background: "rgba(25,182,255,0.5)" }} />
        {p.photoSrc ? (
          <>
            <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "96%", maxWidth: "90%", objectFit: "contain", filter: SILHOUETTE_FILTER, opacity: sOp }} />
            <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "96%", maxWidth: "90%", objectFit: "contain", opacity: cOp }} />
          </>
        ) : (
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 320, color: "rgba(25,182,255,0.18)", opacity: sOp, alignSelf: "center" }}>?</span>
        )}
      </div>

      {/* stat bars */}
      <StatBar y={BAR_YS[0]} appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
        {p.clubSrc ? <Img src={p.clubSrc} style={{ maxHeight: 70, maxWidth: 90, objectFit: "contain" }} /> : <span style={{ fontSize: 40, color: "#fff" }}>?</span>}
      </StatBar>
      <StatBar y={BAR_YS[1]} appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 56, color: "#fff" }}>{translatePosition(level.position, language)}</span>
      </StatBar>
      <StatBar y={BAR_YS[2]} appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
        {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 4 }} /> : null}
        <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 40, color: "#fff" }}>{level.country}</span>
      </StatBar>
      <StatBar y={BAR_YS[3]} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 60, color: "#fff" }}>{level.age ?? "?"}</span>
      </StatBar>

      {/* name lower-third on reveal */}
      <div style={{
        position: "absolute", left: 0, bottom: 70, width: "100%",
        transform: `translateY(${(1 - lowerThird) * 160}px)`, opacity: lowerThird,
      }}>
        <div style={{ marginLeft: 80, marginRight: 80, display: "flex", alignItems: "stretch", height: 130, filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.5))" }}>
          <div style={{ width: 22, background: RED }} />
          <div style={{ flex: 1, background: "linear-gradient(90deg,#0c1622, rgba(12,22,34,0.6))", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 34 }}>
            {first ? <span style={{ fontFamily: COND, fontWeight: 600, fontSize: 34, letterSpacing: "0.1em", color: BLUE, lineHeight: 1 }}>{first}</span> : null}
            <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 78, lineHeight: 0.9, color: "#fff" }}>{last}</span>
          </div>
        </div>
      </div>

      {/* timer — broadcast clock (top-right) */}
      <div style={{ position: "absolute", top: 70, right: 70, opacity: uiOpacity, display: "flex", alignItems: "stretch", height: 110, filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))" }}>
        <div style={{ width: 16, background: timerRemain < 0.18 ? RED : BLUE }} />
        <div style={{ background: "#0c1622", display: "flex", alignItems: "center", justifyContent: "center", width: 120, fontFamily: COND, fontWeight: 800, fontSize: 76, color: "#fff" }}>{secs}</div>
      </div>

      {/* level badge (top-left) */}
      <div style={{ position: "absolute", top: 70, left: 70, opacity: uiOpacity, display: "flex", alignItems: "stretch", height: 110, filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))" }}>
        <div style={{ background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", width: 120, fontFamily: COND, fontWeight: 800, fontSize: 76, color: "#06121f" }}>{p.levelNumber}</div>
        <div style={{ width: 16, background: "#0c1622" }} />
      </div>

      {/* reveal flash */}
      {flash > 0 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} /> : null}
    </div>
  );
};
