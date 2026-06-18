// Template — "Pack Rip".
// A glossy foil PACK wrapper sits centre. Over the question phase two wrapper
// halves peel/tear away to the sides (jagged clip-path tear edge whose split
// widens with `frame`), exposing a HOLOGRAPHIC trading card that slides up and
// settles. The card holds a contained portrait (silhouette → colour) under a
// moving diagonal holo-shimmer sweep, and the 4 clues are its BIG stat block.
// Reveal: the card flares + the name slams in (accent teal).
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, popSpring, translatePosition, ageUnit, clueLabel, nameParts,
  SILHOUETTE_FILTER, silhouetteOpacity, colorOpacity, rand,
  REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', " + fontFamily;
const ACCENT = "#2ee6c8";
const PURPLE = "#a06bff";
const PINK = "#ff5fa2";

const CARD_W = 620;
const CARD_H = 904;

// A holographic gradient that shifts hue over time (built from CSS gradients only).
const holoBorder = (frame: number): string => {
  const a = (frame * 1.1) % 360;
  return `conic-gradient(from ${a}deg, ${ACCENT}, ${PURPLE}, ${PINK}, ${ACCENT}, ${PURPLE}, ${PINK}, ${ACCENT})`;
};

// One BIG stat row inside the card (label on the left, large value on the right).
const StatRow: React.FC<{ appear: number; label: string; children: React.ReactNode }> = ({
  appear, label, children,
}) => {
  const t = Math.min(1, Math.max(0, appear));
  return (
    <div
      style={{
        opacity: t,
        transform: `translateX(${(1 - t) * -40}px) scale(${0.9 + t * 0.1})`,
        transformOrigin: "left center",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        height: 84, padding: "0 22px",
        borderRadius: 16,
        background:
          "linear-gradient(120deg, rgba(46,230,200,0.10), rgba(160,107,255,0.10) 55%, rgba(255,95,162,0.10))",
        border: "1px solid rgba(46,230,200,0.45)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(0,0,0,0.35)",
      }}
    >
      <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 30, letterSpacing: "0.14em", color: ACCENT, opacity: 0.92, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 110, height: 84 }}>{children}</div>
    </div>
  );
};

export const PackRip: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;
  const sOp = silhouetteOpacity(rp);
  const cOp = colorOpacity(rp);
  const { first, last } = nameParts(level.playerName, level.display);

  // ── Pack-rip schedule ──────────────────────────────────────────────────────
  // tear: 0 (sealed pack) → 1 (wrapper fully peeled). Widens over ~30 frames.
  const tear = interpolate(frame, [10, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // card slides up + settles once the pack starts tearing.
  const cardIn = popSpring(frame, 18, { durationInFrames: 40, damping: 15, stiffness: 130 });
  const cardY = interpolate(cardIn, [0, 1], [120, 0]);
  const cardScale = interpolate(cardIn, [0, 1], [0.82, 1]);

  // ── Holo shimmer sweep (diagonal highlight crossing the card) ───────────────
  const shimmer = ((frame * 7) % (CARD_W + 760)) - 380;

  // ── Reveal flare ────────────────────────────────────────────────────────────
  const flare = interpolate(rp, [0, 0.55], [0, 1], { extrapolateRight: "clamp" });
  const cardGlow = 28 + flare * 90;
  const nameOp = interpolate(rp, [0.3, 0.74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Jagged tear edge — a polygon whose inner notches deepen as `tear` grows.
  // Left half occupies the left portion; its right edge zig-zags.
  const split = tear * 56; // how far (in %) each half retreats from centre
  const notch = (i: number) => 50 - split + Math.sin(i * 1.7) * 3 + (rand(i + 3) - 0.5) * 4 * tear;
  const leftTear = Array.from({ length: 9 }, (_, i) => `${notch(i)}% ${(i / 8) * 100}%`).join(", ");
  const leftClip = `polygon(0% 0%, ${leftTear}, 0% 100%)`;
  const rightClip = `polygon(100% 0%, ${Array.from({ length: 9 }, (_, i) => `${100 - notch(i)}% ${(i / 8) * 100}%`).join(", ")}, 100% 100%)`;

  // Confetti foil flecks bursting on reveal (no SVG, plain divs).
  const revF = frame - REVEAL_START;
  const flecks = rp > 0
    ? Array.from({ length: 40 }, (_, i) => {
        const sx = 960 + (rand(i + 1) - 0.5) * 1400;
        const fall = revF * (5 + rand(i + 7) * 6);
        const startY = 540 - rand(i + 3) * 260;
        const sway = Math.sin((revF + i * 11) * 0.13) * 50;
        const colors = [ACCENT, PURPLE, PINK, "#fff", "#bff7ec"];
        return { x: sx + sway, y: startY - 260 + fall, c: colors[i % colors.length], r: (revF * (5 + i)) % 360, s: 9 + rand(i) * 12 };
      })
    : [];

  return (
    <AbsoluteFill style={{ fontFamily, overflow: "hidden" }}>
      {/* ambient holo glow backdrop */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 56% 64% at 50% 52%, rgba(46,230,200,0.12), rgba(160,107,255,0.06) 50%, rgba(0,0,0,0) 78%)" }} />

      {/* drifting holo dust */}
      {Array.from({ length: 24 }, (_, i) => {
        const x = rand(i + 11) * 1920;
        const y = (rand(i + 31) * 1080 + frame * (0.5 + rand(i) * 0.9)) % 1080;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin((frame + i * 30) * 0.05));
        const c = [ACCENT, PURPLE, PINK][i % 3];
        return (
          <div key={`du${i}`} style={{
            position: "absolute", left: x, top: y, width: 4 + rand(i + 2) * 5, height: 4 + rand(i + 2) * 5,
            borderRadius: "50%", background: c, opacity: tw * 0.6, boxShadow: `0 0 9px 2px ${c}`,
          }} />
        );
      })}

      {/* foil flecks burst */}
      {flecks.map((c, i) => (
        <div key={`fl${i}`} style={{
          position: "absolute", left: c.x, top: c.y, width: c.s, height: c.s * 1.5,
          background: c.c, transform: `rotate(${c.r}deg)`, borderRadius: 2, opacity: 0.95, zIndex: 70,
        }} />
      ))}

      {/* ───────────────── the HOLOGRAPHIC CARD (beneath the wrapper) ───────────────── */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        width: CARD_W, height: CARD_H,
        transform: `translate(-50%, calc(-50% + ${cardY}px)) scale(${cardScale})`,
        borderRadius: 34, padding: 5,
        background: holoBorder(frame),
        boxShadow: `0 32px 84px rgba(0,0,0,0.6), 0 0 ${cardGlow}px rgba(46,230,200,${0.35 + flare * 0.5})`,
        zIndex: 30,
      }}>
        <div style={{
          position: "relative", width: "100%", height: "100%", borderRadius: 29, overflow: "hidden",
          background: "linear-gradient(168deg, #0c1f28 0%, #0a1018 46%, #160e26 100%)",
        }}>
          {/* holo tint wash */}
          <AbsoluteFill style={{ background: "linear-gradient(135deg, rgba(46,230,200,0.10), rgba(160,107,255,0.10) 50%, rgba(255,95,162,0.10))", mixBlendMode: "screen" }} />

          {/* moving diagonal shimmer sweep */}
          <div style={{
            position: "absolute", top: -60, bottom: -60, left: shimmer, width: 200,
            transform: "skewX(-20deg)",
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 45%, rgba(191,247,236,0.30) 50%, rgba(255,255,255,0) 100%)",
            mixBlendMode: "screen",
          }} />

          {/* HIDDEN PLAYER eyebrow + crest top-right */}
          <div style={{ position: "absolute", top: 22, left: 28, fontFamily: COND, fontWeight: 800, fontSize: 26, letterSpacing: "0.16em", color: "rgba(46,230,200,0.6)", opacity: sOp }}>HIDDEN PLAYER</div>
          <div style={{ position: "absolute", top: 18, right: 26, width: 86, height: 86, display: "flex", alignItems: "center", justifyContent: "center", opacity: clueSpring(frame, 0) }}>
            {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.6))" }} /> : null}
          </div>

          {/* contained portrait */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 56, height: 362, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {p.photoSrc ? (
              <>
                <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "100%", maxWidth: "84%", objectFit: "contain", filter: SILHOUETTE_FILTER, opacity: sOp }} />
                <Img src={p.photoSrc} style={{ position: "absolute", bottom: 0, maxHeight: "100%", maxWidth: "84%", objectFit: "contain", opacity: cOp, filter: "brightness(1.02) saturate(1.06) drop-shadow(0 12px 26px rgba(0,0,0,0.55))" }} />
              </>
            ) : (
              <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 280, color: "rgba(46,230,200,0.14)", opacity: sOp }}>?</span>
            )}
          </div>

          {/* name strip */}
          <div style={{ position: "absolute", left: 28, right: 28, top: 430, textAlign: "center", borderBottom: `2px solid ${ACCENT}66`, paddingBottom: 6, height: 64 }}>
            <div style={{ opacity: nameOp }}>
              {first ? <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 28, letterSpacing: "0.1em", color: "#bff7ec" }}>{first}</div> : null}
              <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 54, lineHeight: 0.95, color: ACCENT, textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>{last}</div>
            </div>
          </div>

          {/* BIG stat block — the 4 clues */}
          <div style={{ position: "absolute", left: 26, right: 26, bottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <StatRow appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
              {p.clubSrc ? <Img src={p.clubSrc} style={{ maxWidth: 80, maxHeight: 62, objectFit: "contain" }} /> : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 50, color: "#fff" }}>?</span>}
            </StatRow>
            <StatRow appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
              <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 56, color: "#fff", textShadow: "0 3px 10px rgba(0,0,0,0.5)" }}>{translatePosition(level.position, language)}</span>
            </StatRow>
            <StatRow appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
              {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 92, height: 60, objectFit: "cover", borderRadius: 6, boxShadow: "0 3px 10px rgba(0,0,0,0.5)" }} /> : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 34, color: "#fff" }}>{level.country}</span>}
            </StatRow>
            <StatRow appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
              <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 58, color: "#fff", textShadow: "0 3px 10px rgba(0,0,0,0.5)" }}>{level.age ?? "?"}</span>
            </StatRow>
          </div>
        </div>
      </div>

      {/* ───────────────── FOIL WRAPPER (two peeling halves on top) ───────────────── */}
      {tear < 1 ? (
        <>
          {/* left half */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            width: CARD_W + 70, height: CARD_H + 70,
            transform: `translate(-50%, -50%) translateX(${-tear * 240}px) rotate(${-tear * 10}deg)`,
            clipPath: leftClip, WebkitClipPath: leftClip,
            opacity: interpolate(tear, [0.7, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            zIndex: 50, borderRadius: 30,
          }}>
            <FoilFace frame={frame} />
          </div>
          {/* right half */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            width: CARD_W + 70, height: CARD_H + 70,
            transform: `translate(-50%, -50%) translateX(${tear * 240}px) rotate(${tear * 10}deg)`,
            clipPath: rightClip, WebkitClipPath: rightClip,
            opacity: interpolate(tear, [0.7, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            zIndex: 50, borderRadius: 30,
          }}>
            <FoilFace frame={frame} />
          </div>
        </>
      ) : null}

      {/* level badge */}
      <div style={{
        position: "absolute", top: 40, left: 44, zIndex: 80, width: 118, height: 118, borderRadius: "50%",
        background: "radial-gradient(circle at 50% 32%, #bff7ec, #2ee6c8 58%, #128a78)",
        border: "5px solid rgba(255,255,255,0.92)", boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: COND, fontWeight: 800, fontSize: 66, color: "#03241e", opacity: uiOpacity,
      }}>{p.levelNumber}</div>

      {/* timer ring */}
      <div style={{ position: "absolute", top: 40, right: 44, zIndex: 80, width: 122, height: 122, opacity: uiOpacity }}>
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

// Glossy holographic foil wrapper face (CSS gradients only, animated shimmer).
const FoilFace: React.FC<{ frame: number }> = ({ frame }) => {
  const sweep = (frame * 6) % 260 - 80;
  return (
    <div style={{
      position: "relative", width: "100%", height: "100%", borderRadius: 30, overflow: "hidden",
      background: `linear-gradient(150deg, ${ACCENT} 0%, ${PURPLE} 40%, ${PINK} 70%, ${ACCENT} 100%)`,
      boxShadow: "inset 0 2px 0 rgba(255,255,255,0.4), 0 24px 60px rgba(0,0,0,0.55)",
    }}>
      {/* foil striations */}
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0) 7px, rgba(0,0,0,0.10) 14px, rgba(255,255,255,0) 21px)" }} />
      {/* moving gloss sweep */}
      <div style={{
        position: "absolute", top: -60, bottom: -60, left: `${sweep}%`, width: "30%",
        transform: "skewX(-18deg)",
        background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 100%)",
        mixBlendMode: "screen",
      }} />
      {/* brand mark */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
        <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 120, letterSpacing: "0.04em", color: "rgba(255,255,255,0.95)", textShadow: "0 4px 18px rgba(0,0,0,0.4)", lineHeight: 0.9 }}>HOLO</div>
        <div style={{ fontFamily: COND, fontWeight: 800, fontSize: 46, letterSpacing: "0.4em", color: "rgba(255,255,255,0.85)" }}>PACK</div>
      </div>
    </div>
  );
};
