// Template 2 — "Scout Dossier".
// A detective evidence board. A pinned mugshot of the hidden player sits center;
// four clue cards are pinned around it, each joined to the photo by a string that
// draws in as the clue appears. On reveal the photo colours in and a red
// "IDENTIFIED" stamp rotates over it with the typed name.
import React from "react";
import { Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, popSpring, translatePosition, ageUnit, clueLabel, nameParts,
  SILHOUETTE_FILTER, silhouetteOpacity, colorOpacity, rand,
  type TemplateProps,
} from "./common";

const TYPE = "'Barlow Condensed', sans-serif";

const PHOTO = { x: 960, y: 460, w: 440, h: 560 };
const SLOTS = [
  { x: 432, y: 268, rot: -5 },  // club  (top-left)
  { x: 1488, y: 268, rot: 4 },  // position (top-right)
  { x: 432, y: 832, rot: 5 },   // country (bottom-left)
  { x: 1488, y: 832, rot: -4 }, // age (bottom-right)
] as const;

const ClueCard: React.FC<{ slot: typeof SLOTS[number]; appear: number; label: string; children: React.ReactNode }> = ({ slot, appear, label, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  return (
    <div style={{
      position: "absolute", left: slot.x, top: slot.y, width: 360,
      transform: `translate(-50%,-50%) rotate(${slot.rot}deg) scale(${0.8 + t * 0.2})`,
      opacity: t,
    }}>
      <div style={{
        background: "linear-gradient(170deg, #f7f1e1, #e6dcc4)",
        border: "1px solid rgba(120,100,60,0.4)", borderRadius: 9,
        boxShadow: "0 16px 36px rgba(0,0,0,0.45)", padding: "24px 27px 21px",
      }}>
        <div style={{ fontFamily: TYPE, fontWeight: 700, fontSize: 33, letterSpacing: "0.22em", color: "#9a6b2f", marginBottom: 12, borderBottom: "3px dashed rgba(150,110,50,0.4)", paddingBottom: 9 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 138 }}>{children}</div>
      </div>
    </div>
  );
};

export const ScoutDossier: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;
  const ringColor = timerRemain < 0.16 ? "#ff2a2a" : "#d23b3b";
  const sOp = silhouetteOpacity(rp);
  const cOp = colorOpacity(rp);
  const { first, last } = nameParts(level.playerName, level.display);

  // name-stamp reveal pop (replaces the old IDENTIFIED stamp)
  const stampScale = rp > 0.4 ? interpolate(rp, [0.4, 0.6], [1.9, 1], { extrapolateRight: "clamp" }) : 1.9;
  const stampOp = interpolate(rp, [0.4, 0.52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const photoIn = popSpring(frame, 6, { durationInFrames: 30 });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily }}>
      {/* corkboard wash so the competition bg still shows through */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(140% 120% at 50% 40%, rgba(58,40,18,0.30), rgba(24,16,6,0.55))" }} />
      {/* scattered paper scraps */}
      {Array.from({ length: 7 }, (_, i) => (
        <div key={`sc${i}`} style={{
          position: "absolute", left: rand(i + 3) * 1700 + 60, top: rand(i + 9) * 900 + 40,
          width: 70 + rand(i) * 60, height: 50 + rand(i + 1) * 40, background: "rgba(244,238,222,0.10)",
          transform: `rotate(${(rand(i) - 0.5) * 40}deg)`, borderRadius: 4,
        }} />
      ))}

      {/* string connectors */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: uiOpacity }}>
        {SLOTS.map((s, i) => {
          const draw = Math.min(1, Math.max(0, clueSpring(frame, i)));
          const x2 = s.x, y2 = s.y;
          const len = Math.hypot(x2 - PHOTO.x, y2 - PHOTO.y);
          return (
            <line key={i} x1={PHOTO.x} y1={PHOTO.y} x2={x2} y2={y2}
              stroke="#d23b3b" strokeWidth={3} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} opacity={0.7} />
          );
        })}
      </svg>

      {/* central pinned mugshot */}
      <div style={{
        position: "absolute", left: PHOTO.x, top: PHOTO.y, width: PHOTO.w, height: PHOTO.h,
        transform: `translate(-50%,-50%) scale(${interpolate(photoIn, [0, 1], [0.8, 1])})`,
        background: "#f7f1e1", padding: "16px 16px 22px", borderRadius: 4,
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ position: "relative", width: "100%", height: "100%", background: "radial-gradient(120% 105% at 50% 28%, #34495e 0%, #1f2e3d 48%, #0e1922 100%)", borderRadius: 2, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          {p.photoSrc ? (
            <>
              <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, height: "104%", width: "auto", maxWidth: "150%", objectFit: "contain", objectPosition: "center bottom", filter: SILHOUETTE_FILTER, opacity: sOp }} />
              <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, height: "104%", width: "auto", maxWidth: "150%", objectFit: "contain", objectPosition: "center bottom", opacity: cOp }} />
            </>
          ) : (
            <span style={{ fontFamily: TYPE, fontWeight: 800, fontSize: 280, color: "rgba(255,255,255,0.12)", opacity: sOp, alignSelf: "center" }}>?</span>
          )}

        </div>
      </div>

      {/* ── NAME STAMP (reveal) — red stamp on its OWN opaque cream backing (readable
          on ANY background), sitting BELOW the photo, between the two lower boxes. ── */}
      {rp > 0.4 ? (
        <div style={{
          position: "absolute", left: PHOTO.x, top: PHOTO.y + PHOTO.h / 2 + 64,
          transform: `translate(-50%, -50%) scale(${stampScale})`,
          opacity: stampOp, zIndex: 45,
          background: "#f7f1e1",
          border: "7px solid #d23b3b",
          borderRadius: 12,
          boxShadow: "0 14px 32px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(210,59,59,0.25)",
          padding: "8px 30px 10px", textAlign: "center", maxWidth: 660,
        }}>
          {first ? (
            <div style={{ fontFamily: TYPE, fontWeight: 700, fontSize: 30, letterSpacing: "0.16em", color: "#7c1414", lineHeight: 1, opacity: 0.9, whiteSpace: "nowrap" }}>{first}</div>
          ) : null}
          <div style={{ fontFamily: TYPE, fontWeight: 800, fontSize: 64, letterSpacing: "0.03em", color: "#d23b3b", lineHeight: 0.96, whiteSpace: "nowrap", textShadow: "0 1px 0 rgba(0,0,0,0.12)" }}>{last}</div>
        </div>
      ) : null}

      {/* clue cards */}
      <ClueCard slot={SLOTS[0]} appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
        {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: 165, maxHeight: 135, objectFit: "contain", filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.35))" }} /> : <span style={{ fontSize: 60 }}>?</span>}
      </ClueCard>
      <ClueCard slot={SLOTS[1]} appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
        <span style={{ fontFamily: TYPE, fontWeight: 800, fontSize: 96, color: "#1a1208" }}>{translatePosition(level.position, language)}</span>
      </ClueCard>
      <ClueCard slot={SLOTS[2]} appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
        {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 180, height: 120, objectFit: "cover", borderRadius: 6, boxShadow: "0 3px 8px rgba(0,0,0,0.35)" }} /> : <span style={{ fontFamily: TYPE, fontWeight: 700, fontSize: 42, color: "#1a1208" }}>{level.country}</span>}
      </ClueCard>
      <ClueCard slot={SLOTS[3]} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
        <span style={{ fontFamily: TYPE, fontWeight: 800, fontSize: 96, color: "#1a1208" }}>{level.age ?? "?"}</span>
      </ClueCard>

      {/* level counter — top-left "case file" stamp pinned to the board
          (cream disc + double red stamp ring + FILE No.) */}
      <div style={{ position: "absolute", top: 40, left: 48, opacity: uiOpacity, width: 150, height: 150 }}>
        <svg width={150} height={150} style={{ display: "block", filter: "drop-shadow(0 9px 20px rgba(0,0,0,0.5))" }}>
          <circle cx={75} cy={75} r={67} fill="#f7f1e1" stroke="rgba(120,100,60,0.5)" strokeWidth={2} />
          <circle cx={75} cy={75} r={59} fill="none" stroke="#d23b3b" strokeWidth={5} />
          <circle cx={75} cy={75} r={50} fill="none" stroke="rgba(210,59,59,0.55)" strokeWidth={2} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: TYPE }}>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.22em", color: "#d23b3b", marginTop: 10 }}>{language === "Spanish" ? "FICHA" : "FILE"}</span>
          <span style={{ fontWeight: 800, fontSize: 60, lineHeight: 0.82, color: "#1a1208" }}>{p.levelNumber}</span>
        </div>
      </div>

      {/* timer — detective stopwatch: a circular countdown ring pinned to the board
          (cream paper face + depleting red ring + big counting number) */}
      <div style={{ position: "absolute", top: 40, right: 48, opacity: uiOpacity, width: 150, height: 150 }}>
        <svg width={150} height={150} style={{ display: "block", filter: "drop-shadow(0 9px 20px rgba(0,0,0,0.5))" }}>
          {/* cream paper face */}
          <circle cx={75} cy={75} r={67} fill="#f7f1e1" stroke="rgba(120,100,60,0.5)" strokeWidth={2} />
          {/* track */}
          <circle cx={75} cy={75} r={56} fill="none" stroke="rgba(150,110,50,0.22)" strokeWidth={11} />
          {/* depleting progress arc */}
          <circle cx={75} cy={75} r={56} fill="none" stroke={ringColor} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 56} strokeDashoffset={2 * Math.PI * 56 * (1 - timerRemain)}
            transform="rotate(-90 75 75)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: TYPE }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.24em", color: "#9a6b2f", marginTop: 8 }}>{language === "Spanish" ? "TIEMPO" : "TIME"}</span>
          <span style={{ fontWeight: 800, fontSize: 62, lineHeight: 0.82, color: secs <= 1 ? "#d23b3b" : "#1a1208" }}>{secs}</span>
        </div>
      </div>
    </div>
  );
};
