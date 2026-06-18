// Template 5 — "Stadium Spotlight".
// Cinematic dark stadium at night. A volumetric spotlight picks out the hidden
// player on a lit plinth; four illuminated podium plates rise one by one with the
// clues. On reveal the floodlights snap on, the photo colours, and the name lights
// up on a stadium LED board.
import React from "react";
import { Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel, nameParts,
  SILHOUETTE_FILTER, silhouetteOpacity, colorOpacity, rand,
  REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const GOLD = "#ffd36b";

const FIG = { x: 960, y: 560 };
const PLATES = [
  { x: 466, y: 430 }, // club
  { x: 466, y: 742 }, // position
  { x: 1454, y: 430 }, // country
  { x: 1454, y: 742 }, // age
] as const;

const Podium: React.FC<{ at: typeof PLATES[number]; appear: number; label: string; children: React.ReactNode }> = ({ at, appear, label, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  return (
    <div style={{
      position: "absolute", left: at.x, top: at.y, width: 300,
      transform: `translate(-50%,-50%) translateY(${(1 - t) * 50}px)`, opacity: t,
    }}>
      {/* ground glow */}
      <div style={{ position: "absolute", left: "50%", bottom: -28, transform: "translateX(-50%)", width: 260, height: 40, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,211,107,0.4), transparent 70%)" }} />
      <div style={{
        background: "linear-gradient(180deg, rgba(34,30,22,0.92), rgba(14,12,8,0.92))",
        border: `1px solid ${GOLD}55`, borderTop: `3px solid ${GOLD}`, borderRadius: 12,
        boxShadow: `0 18px 40px rgba(0,0,0,0.6), inset 0 1px 0 ${GOLD}33`,
        padding: "16px 20px 18px",
      }}>
        <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 24, letterSpacing: "0.2em", color: GOLD, textAlign: "center", marginBottom: 8 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 96 }}>{children}</div>
      </div>
    </div>
  );
};

export const StadiumSpotlight: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, uiOpacity } = p;
  const sOp = silhouetteOpacity(rp);
  const cOp = colorOpacity(rp);
  const { first, last } = nameParts(level.playerName, level.display);

  const revF = frame - REVEAL_START;
  const flood = rp > 0 ? interpolate(revF, [0, 5, 22], [0, 0.5, 0.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const board = interpolate(rp, [0.25, 0.65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flicker = 0.9 + 0.1 * Math.sin(frame * 0.7);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily }}>
      {/* night vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 100% at 50% 30%, rgba(8,12,18,0.30), rgba(2,4,8,0.75))" }} />

      {/* crowd bokeh (upper area) */}
      {Array.from({ length: 40 }, (_, i) => {
        const x = rand(i + 2) * 1920;
        const y = rand(i + 21) * 320 + 20;
        const tw = 0.3 + 0.5 * Math.abs(Math.sin((frame + i * 24) * 0.06));
        return <div key={`bk${i}`} style={{ position: "absolute", left: x, top: y, width: 6 + rand(i) * 8, height: 6 + rand(i) * 8, borderRadius: "50%", background: i % 5 === 0 ? GOLD : "rgba(200,220,255,0.8)", opacity: tw * 0.4, filter: "blur(1px)" }} />;
      })}

      {/* drifting haze */}
      {Array.from({ length: 5 }, (_, i) => {
        const x = ((frame * (0.3 + rand(i) * 0.4)) + i * 420) % 2300 - 200;
        return <div key={`hz${i}`} style={{ position: "absolute", left: x, top: 300 + rand(i) * 400, width: 600, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,235,190,0.05), transparent 70%)", filter: "blur(20px)" }} />;
      })}

      {/* volumetric spotlight cone */}
      <div style={{
        position: "absolute", left: "50%", top: -60, transform: "translateX(-50%)",
        width: 760, height: 960, opacity: flicker,
        clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0% 100%)",
        background: "linear-gradient(180deg, rgba(255,240,200,0.42) 0%, rgba(255,235,190,0.16) 45%, rgba(255,235,190,0.02) 100%)",
        filter: "blur(6px)", mixBlendMode: "screen",
      }} />
      {/* lamp + lens flare */}
      <div style={{ position: "absolute", left: "50%", top: -24, transform: "translateX(-50%)", width: 90, height: 90, borderRadius: "50%", background: "radial-gradient(circle, #fff, rgba(255,235,190,0.6) 40%, transparent 70%)", boxShadow: "0 0 60px 20px rgba(255,235,190,0.5)" }} />

      {/* figure on plinth */}
      <div style={{ position: "absolute", left: FIG.x, top: FIG.y, transform: "translate(-50%,-50%)", width: 440, height: 660, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {/* plinth */}
        <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", width: 320, height: 30, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,235,190,0.45), transparent 70%)" }} />
        {p.photoSrc ? (
          <>
            <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "100%", maxWidth: "88%", objectFit: "contain", filter: SILHOUETTE_FILTER, opacity: sOp }} />
            <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "100%", maxWidth: "88%", objectFit: "contain", opacity: cOp, filter: "brightness(1.05) drop-shadow(0 10px 28px rgba(0,0,0,0.6))" }} />
          </>
        ) : (
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 320, color: "rgba(255,235,190,0.16)", opacity: sOp, alignSelf: "center" }}>?</span>
        )}
      </div>

      {/* podium plates */}
      <Podium at={PLATES[0]} appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
        {p.clubSrc ? <Img src={p.clubSrc} style={{ maxHeight: 88, maxWidth: 104, objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }} /> : <span style={{ fontSize: 44, color: GOLD }}>?</span>}
      </Podium>
      <Podium at={PLATES[1]} appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 62, color: "#fff" }}>{translatePosition(level.position, language)}</span>
      </Podium>
      <Podium at={PLATES[2]} appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
        {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 100, height: 66, objectFit: "cover", borderRadius: 4, boxShadow: "0 3px 10px rgba(0,0,0,0.5)" }} /> : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 28, color: "#fff" }}>{level.country}</span>}
      </Podium>
      <Podium at={PLATES[3]} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#fff" }}>{level.age ?? "?"}</span>
      </Podium>

      {/* stadium LED name board (top) on reveal */}
      <div style={{
        position: "absolute", left: "50%", top: 70, transform: `translateX(-50%) translateY(${(1 - board) * -120}px)`,
        opacity: board, width: 900, maxWidth: "80%",
        background: "linear-gradient(180deg, #141008, #0a0805)", border: `3px solid ${GOLD}`, borderRadius: 14,
        boxShadow: `0 14px 40px rgba(0,0,0,0.6), 0 0 36px ${GOLD}44, inset 0 0 30px rgba(255,211,107,0.12)`,
        padding: "14px 40px", textAlign: "center",
        backgroundImage: "radial-gradient(rgba(255,211,107,0.08) 1px, transparent 1.6px)", backgroundSize: "10px 10px",
      }}>
        {first ? <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 34, letterSpacing: "0.18em", color: GOLD, lineHeight: 1 }}>{first}</div> : null}
        <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 80, lineHeight: 0.95, color: "#fff", textShadow: `0 0 18px ${GOLD}, 0 0 40px rgba(255,211,107,0.4)` }}>{last}</div>
      </div>

      {/* timer — floodlight gauge (top-right) */}
      <div style={{ position: "absolute", top: 46, right: 54, opacity: uiOpacity, width: 128, height: 128, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%", background: "radial-gradient(circle at 50% 35%, #221c10, #0a0805)",
        border: `5px solid ${secs <= 1 ? "#ff4136" : GOLD}`, boxShadow: `0 10px 30px rgba(0,0,0,0.6), 0 0 26px ${GOLD}55`,
        fontFamily: COND, fontWeight: 800, fontSize: 70, color: "#fff" }}>{secs}</div>

      {/* level badge (top-left) */}
      <div style={{ position: "absolute", top: 46, left: 54, opacity: uiOpacity, width: 116, height: 116, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 16, background: "linear-gradient(180deg, rgba(34,30,22,0.95), rgba(12,10,6,0.95))",
        border: `3px solid ${GOLD}`, boxShadow: `0 10px 28px rgba(0,0,0,0.6), 0 0 22px ${GOLD}44`,
        fontFamily: COND, fontWeight: 800, fontSize: 64, color: GOLD }}>{p.levelNumber}</div>

      {/* floodlight flash on reveal */}
      {flood > 0 ? <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 70% at 50% 30%, rgba(255,245,220,0.9), transparent 70%)", opacity: flood, mixBlendMode: "screen" }} /> : null}
    </div>
  );
};
