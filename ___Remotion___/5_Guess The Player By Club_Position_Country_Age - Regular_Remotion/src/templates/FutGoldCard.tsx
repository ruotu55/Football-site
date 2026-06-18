// Template 1 — "FUT Gold Card".
// A premium FIFA-Ultimate-Team style card. The 4 clues slot into the card's
// stat panel one after another; on reveal the card ignites gold, the silhouette
// resolves to a colour photo and the name banner slams in with a confetti burst.
import React from "react";
import { Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, popSpring, translatePosition, ageUnit, nameParts,
  SILHOUETTE_FILTER, silhouetteOpacity, colorOpacity, rand,
  REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";

const CARD_W = 600;
const CARD_H = 820;

// One stat tile inside the 2×2 grid.
const StatTile: React.FC<{
  appear: number; label: string; children: React.ReactNode;
}> = ({ appear, label, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${(1 - t) * 26}px) scale(${0.86 + t * 0.14})`,
        background: "linear-gradient(150deg, rgba(60,42,8,0.62), rgba(24,16,2,0.5))",
        border: "1px solid rgba(255,214,120,0.55)",
        borderRadius: 18,
        boxShadow: "inset 0 1px 0 rgba(255,236,180,0.35), 0 6px 16px rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", gap: 14,
        padding: "0 16px", height: 96,
      }}
    >
      <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {children}
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontFamily: COND, fontWeight: 600, fontSize: 22, letterSpacing: "0.12em", color: "#ffe6a8", opacity: 0.85 }}>{label}</span>
      </div>
    </div>
  );
};

export const FutGoldCard: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, uiOpacity } = p;
  const sOp = silhouetteOpacity(rp);
  const cOp = colorOpacity(rp);
  const { first, last } = nameParts(level.playerName, level.display);

  // card entrance
  const cardIn = popSpring(frame, 6, { durationInFrames: 34, damping: 14 });
  const cardScale = interpolate(cardIn, [0, 1], [0.7, 1]);
  const cardRot = interpolate(cardIn, [0, 1], [-8, 0]);

  // gold ignition on reveal
  const ignite = interpolate(rp, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
  const glow = 24 + ignite * 70;

  // moving shine sweep across the card
  const shineX = ((frame * 5) % (CARD_W + 600)) - 300;

  // confetti after reveal
  const revF = frame - REVEAL_START;
  const confetti = rp > 0
    ? Array.from({ length: 46 }, (_, i) => {
        const sx = rand(i + 1) * 1920;
        const fall = revF * (4 + rand(i + 7) * 5);
        const startY = -60 - rand(i + 3) * 300;
        const sway = Math.sin((revF + i * 9) * 0.12) * 40;
        const colors = ["#ffd24a", "#ffe9a8", "#ff7a59", "#7ad7ff", "#fff"];
        return { x: sx + sway, y: startY + fall, c: colors[i % colors.length], r: (revF * (6 + i)) % 360, s: 8 + rand(i) * 12 };
      })
    : [];

  const nameOp = interpolate(rp, [0.32, 0.78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily }}>
      {/* ambient floating sparkles */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = rand(i + 11) * 1920;
        const y = (rand(i + 31) * 1080 + frame * (0.4 + rand(i) * 0.8)) % 1080;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin((frame + i * 30) * 0.05));
        return (
          <div key={`sp${i}`} style={{
            position: "absolute", left: x, top: y, width: 4 + rand(i + 2) * 5, height: 4 + rand(i + 2) * 5,
            borderRadius: "50%", background: "#ffe6a8", opacity: tw * 0.7,
            boxShadow: "0 0 8px 2px rgba(255,210,90,0.6)",
          }} />
        );
      })}

      {/* confetti burst */}
      {confetti.map((c, i) => (
        <div key={`cf${i}`} style={{
          position: "absolute", left: c.x, top: c.y, width: c.s, height: c.s * 1.5,
          background: c.c, transform: `rotate(${c.r}deg)`, borderRadius: 2, opacity: 0.95,
        }} />
      ))}

      {/* ── the card ── */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        width: CARD_W, height: CARD_H,
        transform: `translate(-50%,-50%) scale(${cardScale}) rotate(${cardRot}deg)`,
        borderRadius: 30,
        padding: 4,
        background: "linear-gradient(160deg, #fff1c4 0%, #f3c24a 22%, #b8841f 55%, #f6d873 80%, #c9962a 100%)",
        boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 ${glow}px rgba(255,200,80,${0.4 + ignite * 0.5})`,
      }}>
        {/* inner panel */}
        <div style={{
          position: "relative", width: "100%", height: "100%", borderRadius: 26, overflow: "hidden",
          background: "linear-gradient(170deg, #2b2207 0%, #161204 45%, #221a06 100%)",
        }}>
          {/* shine sweep */}
          <div style={{
            position: "absolute", top: -40, bottom: -40, left: shineX, width: 140,
            transform: "skewX(-18deg)",
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,245,210,0.18) 50%, rgba(255,255,255,0) 100%)",
          }} />

          {/* rating + position block (top-left) */}
          <div style={{ position: "absolute", top: 26, left: 30, display: "flex", flexDirection: "column", alignItems: "center", opacity: uiOpacity }}>
            <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 84, lineHeight: 0.8, color: "#ffe6a8", textShadow: "0 3px 0 rgba(0,0,0,0.4)" }}>?</span>
            <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 34, color: "#ffd24a", letterSpacing: "0.05em",
              opacity: clueSpring(frame, 1) }}>
              {translatePosition(level.position, language)}
            </span>
            <div style={{ width: 46, height: 2, background: "rgba(255,210,120,0.5)", margin: "8px 0" }} />
            {/* nation flag mini */}
            {p.flagSrc ? (
              <Img src={p.flagSrc} style={{ width: 56, height: 38, objectFit: "cover", borderRadius: 4, opacity: clueSpring(frame, 2), boxShadow: "0 2px 6px rgba(0,0,0,0.5)" }} />
            ) : null}
          </div>

          {/* club crest (top-right) */}
          <div style={{ position: "absolute", top: 26, right: 30, width: 90, height: 90, display: "flex", alignItems: "center", justifyContent: "center", opacity: clueSpring(frame, 0) }}>
            {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.6))" }} /> : null}
          </div>

          {/* player portrait */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 70, height: 430, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {p.photoSrc ? (
              <>
                <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "100%", maxWidth: "86%", objectFit: "contain", filter: SILHOUETTE_FILTER, opacity: sOp }} />
                <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "100%", maxWidth: "86%", objectFit: "contain", opacity: cOp, filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.5))" }} />
              </>
            ) : (
              <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 260, color: "rgba(255,230,170,0.14)", opacity: sOp }}>?</span>
            )}
          </div>

          {/* name strip */}
          <div style={{ position: "absolute", left: 30, right: 30, top: 500, textAlign: "center", borderBottom: "2px solid rgba(255,210,120,0.45)", paddingBottom: 8 }}>
            <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 30, letterSpacing: "0.12em", color: "rgba(255,230,170,0.45)", opacity: sOp, position: "absolute", left: 0, right: 0 }}>HIDDEN PLAYER</span>
            <div style={{ opacity: nameOp }}>
              {first ? <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 26, letterSpacing: "0.1em", color: "#ffe6a8" }}>{first}</div> : null}
              <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 52, lineHeight: 0.95, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{last}</div>
            </div>
          </div>

          {/* stat tiles 2×2 */}
          <div style={{ position: "absolute", left: 28, right: 28, bottom: 30, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <StatTile appear={clueSpring(frame, 0)} label={language === "Spanish" ? "CLUB" : "CLUB"}>
              {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null}
            </StatTile>
            <StatTile appear={clueSpring(frame, 1)} label={language === "Spanish" ? "POSICIÓN" : "POSITION"}>
              <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 40, color: "#fff" }}>{translatePosition(level.position, language)}</span>
            </StatTile>
            <StatTile appear={clueSpring(frame, 2)} label={language === "Spanish" ? "PAÍS" : "NATION"}>
              {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 60, height: 40, objectFit: "cover", borderRadius: 4 }} /> : null}
            </StatTile>
            <StatTile appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
              <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 44, color: "#fff" }}>{level.age ?? "?"}</span>
            </StatTile>
          </div>
        </div>
      </div>

      {/* timer — gold scoreboard pill (top-right of frame) */}
      <div style={{
        position: "absolute", top: 40, right: 48, opacity: uiOpacity,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 132, height: 132, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 35%, #2a2107, #100c02)",
        border: `5px solid ${secs <= 1 ? "#ff4136" : "#ffd24a"}`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 24px rgba(255,200,80,0.4)`,
        fontFamily: COND, fontWeight: 800, fontSize: 72, color: "#fff",
      }}>{secs}</div>

      {/* level badge — gold roundel (top-left of frame) */}
      <div style={{
        position: "absolute", top: 40, left: 48, opacity: uiOpacity,
        width: 120, height: 120, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 32%, #ffe9a8, #f3c24a 60%, #b8841f)",
        border: "5px solid rgba(255,255,255,0.9)", boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: COND, fontWeight: 800, fontSize: 70, color: "#241500",
      }}>{p.levelNumber}</div>
    </div>
  );
};
