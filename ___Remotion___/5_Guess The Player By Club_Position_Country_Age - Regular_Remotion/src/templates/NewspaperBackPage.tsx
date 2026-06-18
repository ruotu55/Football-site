// Template — "Newspaper Back-Page".
// A cream sports newspaper back page. Bold masthead ("THE MATCHDAY") with a date
// line + rule lines, a giant serif headline ("MYSTERY MAN / WHO IS HE?"), and the
// four clues set as ruled newspaper clipping columns that STAMP in like print being
// set (rotate + ink "thunk"). The hero photo is PRINTED — silhouette + a halftone
// dot pattern (multiply) while hidden, fading on reveal — and the player's full name
// "ink-spreads" in as a huge black serif headline.
import React from "react";
import { AbsoluteFill, Img, interpolate, Easing } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, popSpring, translatePosition, ageUnit, clueLabel,
  nameParts, rand, SILHOUETTE_FILTER, silhouetteOpacity, colorOpacity,
  REVEAL_START, type TemplateProps,
} from "./common";

const SERIF = 'Georgia, "Times New Roman", serif';
const COND = "'Barlow Condensed', " + fontFamily;
const INK = "#111";
const RED = "#c0241f";
const PAPER = "#f2ece0";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// A faint halftone dot pattern (CSS radial-gradient). Multiplied over the
// silhouette so the hidden player reads as a printed photo.
const HALFTONE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 25% 25%, rgba(0,0,0,0.55) 1.4px, transparent 1.6px)",
  backgroundSize: "7px 7px",
  mixBlendMode: "multiply",
};

// A newspaper clipping column. Stamps in: rotates from a small tilt + ink thunk
// (scale overshoot) + opacity.
const Clip: React.FC<{
  appear: number; tilt: number; label: string; num: number; children: React.ReactNode;
}> = ({ appear, tilt, label, num, children }) => {
  const t = Math.max(0, Math.min(1.1, appear));
  const op = interpolate(appear, [0, 0.22], [0, 1], clamp);
  const rot = interpolate(t, [0, 1], [tilt, 0]);
  const scale = interpolate(t, [0, 0.7, 1], [0.86, 1.04, 1]);
  return (
    <div style={{
      position: "relative", width: 300, minHeight: 250,
      transform: `rotate(${rot}deg) scale(${scale})`, opacity: op,
      transformOrigin: "center top",
      background: "#faf6ee",
      border: `2px solid ${INK}`,
      boxShadow: "5px 7px 0 rgba(17,17,17,0.16), inset 0 0 0 1px rgba(17,17,17,0.35)",
      padding: "16px 16px 18px",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      {/* big column number, top-left, red */}
      <div style={{
        position: "absolute", top: -22, left: -16, width: 56, height: 56,
        borderRadius: "50%", background: RED, color: PAPER,
        border: `3px solid ${INK}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontFamily: SERIF, fontWeight: 700, fontSize: 38,
        boxShadow: "2px 3px 0 rgba(17,17,17,0.25)",
      }}>{num}</div>
      {/* small-caps ruled label */}
      <div style={{
        width: "100%", textAlign: "center", fontFamily: COND, fontWeight: 700,
        fontSize: 26, letterSpacing: "0.22em", color: INK,
        borderBottom: `3px double ${INK}`, paddingBottom: 8, marginBottom: 12,
      }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {children}
      </div>
    </div>
  );
};

export const NewspaperBackPage: React.FC<TemplateProps> = (p) => {
  const { level, levelNumber, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;
  const { full } = nameParts(level.playerName, level.display);

  const silOp = silhouetteOpacity(rp);
  const colOp = colorOpacity(rp);
  const haltoneFade = interpolate(rp, [0, 0.4], [1, 0], clamp); // dots clear on reveal

  // Headline (hidden state) fades OUT as the reveal name ink-spreads IN.
  const headlineOp = interpolate(rp, [0, 0.18], [1, 0], clamp);

  // Reveal NAME ink-spread: a clip-path wipe + opacity from REVEAL_START.
  const ink = interpolate(rp, [0.16, 0.62], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const inkClip = `inset(0 ${100 - ink * 100}% 0 0)`;
  const nameScale = interpolate(rp, [0.16, 0.5], [0.92, 1], clamp);

  const headlineEN = "WHO IS HE?";
  const headlineES = "¿QUIÉN ES?";
  const headline = language === "Spanish" ? headlineES : headlineEN;

  const dateLine = language === "Spanish" ? "EDICIÓN ESPECIAL · ENIGMA" : "SPECIAL EDITION · THE ENIGMA";
  const masthead = "THE MATCHDAY";

  return (
    <AbsoluteFill style={{ background: PAPER, overflow: "hidden" }}>
      {/* paper texture — faint noise dots + warm vignette */}
      <AbsoluteFill style={{
        backgroundImage:
          "radial-gradient(circle at 18% 22%, rgba(120,90,50,0.05) 1px, transparent 1.5px), " +
          "radial-gradient(circle at 70% 60%, rgba(120,90,50,0.04) 1px, transparent 1.5px)",
        backgroundSize: "11px 11px, 17px 17px",
      }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 80% at 50% 45%, transparent 55%, rgba(70,50,25,0.12) 100%)" }} />

      {/* ── MASTHEAD ─────────────────────────────────────────────────────── */}
      <div style={{ position: "absolute", top: 26, left: 64, right: 64, opacity: uiOpacity, zIndex: 20 }}>
        <div style={{ height: 4, background: INK, marginBottom: 8 }} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 24, letterSpacing: "0.18em", color: INK }}>
            {dateLine}
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 78, lineHeight: 1, letterSpacing: "0.02em", color: INK }}>
            {masthead}
          </div>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 24, letterSpacing: "0.14em", color: RED }}>
            BACK PAGE
          </div>
        </div>
        <div style={{ height: 3, background: INK, marginTop: 8 }} />
        <div style={{ height: 2, background: INK, marginTop: 3 }} />
      </div>

      {/* ── GIANT SERIF HEADLINE (hidden state) ──────────────────────────── */}
      <div style={{
        position: "absolute", top: 196, left: 184, right: 500, zIndex: 18,
        opacity: headlineOp * uiOpacity,
      }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 70, lineHeight: 0.96, color: RED, letterSpacing: "-0.01em" }}>
          MYSTERY MAN
        </div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 150, lineHeight: 0.9, color: INK, letterSpacing: "-0.02em" }}>
          {headline}
        </div>
        <div style={{ height: 3, background: INK, margin: "14px 0 0", width: 420 }} />
        <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 28, letterSpacing: "0.05em", color: INK, marginTop: 10, maxWidth: 560 }}>
          {language === "Spanish"
            ? "Cuatro pistas. Un futbolista. ¿Puedes nombrarlo antes de que suene el silbato?"
            : "Four clues. One footballer. Can you name him before the whistle blows?"}
        </div>
      </div>

      {/* ── PRINTED HERO PHOTO ───────────────────────────────────────────── */}
      <div style={{
        position: "absolute", right: 70, bottom: 26, width: 470, height: 760, zIndex: 16,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}>
        {/* photo frame / ruled box */}
        <div style={{ position: "absolute", inset: 0, border: `3px solid ${INK}`, background: "#ece3d2", boxShadow: "7px 9px 0 rgba(17,17,17,0.18)" }} />
        <div style={{ position: "absolute", top: 12, left: 12, right: 12, height: 3, background: INK }} />
        {p.photoSrc ? (
          <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "26px 18px 18px", overflow: "hidden" }}>
            {/* silhouette (hidden) */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "26px 18px 18px", opacity: silOp }}>
              <Img src={p.photoSrc} style={{ height: "100%", width: "auto", objectFit: "contain", objectPosition: "center bottom", filter: SILHOUETTE_FILTER }} />
            </div>
            {/* halftone dot overlay — multiplies over the figure while hidden */}
            <div style={{ position: "absolute", inset: 0, opacity: haltoneFade, ...HALFTONE }} />
            {/* colour photo (revealed) */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "26px 18px 18px", opacity: colOp }}>
              <Img src={p.photoSrc} style={{ height: "100%", width: "auto", objectFit: "contain", objectPosition: "center bottom", filter: "saturate(0.92) contrast(1.04)" }} />
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 320, color: "rgba(17,17,17,0.16)", lineHeight: 1 }}>?</div>
        )}
        {/* photo caption strip */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: INK, color: PAPER, fontFamily: COND, fontWeight: 700, fontSize: 20, letterSpacing: "0.16em", textAlign: "center", padding: "5px 0" }}>
          {language === "Spanish" ? "FOTO DE ARCHIVO" : "FILE PHOTO"}
        </div>
      </div>

      {/* ── FOUR NEWSPAPER CLIPPINGS ─────────────────────────────────────── */}
      <div style={{
        position: "absolute", left: 64, bottom: 56, display: "flex", gap: 30,
        zIndex: 24, opacity: uiOpacity,
      }}>
        <Clip appear={clueSpring(frame, 0)} tilt={-3.5} num={1} label={clueLabel("club", language)}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: "78%", maxHeight: 150, objectFit: "contain", filter: "saturate(0.9) contrast(1.05) drop-shadow(0 3px 0 rgba(17,17,17,0.18))" }} />
            : <span style={{ fontFamily: SERIF, fontSize: 90, color: INK }}>?</span>}
        </Clip>
        <Clip appear={clueSpring(frame, 1)} tilt={2.5} num={2} label={clueLabel("position", language)}>
          <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 110, color: INK, lineHeight: 1 }}>
            {translatePosition(level.position, language)}
          </span>
        </Clip>
        <Clip appear={clueSpring(frame, 2)} tilt={-2.2} num={3} label={clueLabel("country", language)}>
          {p.flagSrc
            ? <Img src={p.flagSrc} style={{ width: 184, height: 122, objectFit: "cover", border: `2px solid ${INK}`, filter: "saturate(0.88) contrast(1.04)" }} />
            : <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 34, color: INK, textAlign: "center" }}>{level.country}</span>}
        </Clip>
        <Clip appear={clueSpring(frame, 3)} tilt={3.2} num={4} label={ageUnit(level.age, language)}>
          <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 130, color: RED, lineHeight: 1 }}>
            {level.age ?? "?"}
          </span>
        </Clip>
      </div>

      {/* ── REVEAL: giant black serif name, ink-spreads in ───────────────── */}
      {ink > 0 ? (
        <div style={{
          position: "absolute", top: 210, left: 64, right: 540, zIndex: 40,
          transform: `scale(${nameScale})`, transformOrigin: "left top",
        }}>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 30, letterSpacing: "0.2em", color: RED, marginBottom: 6 }}>
            {language === "Spanish" ? "REVELADO ·" : "REVEALED ·"}
          </div>
          {/* the name printed with an ink-spread clip wipe */}
          <div style={{ position: "relative" }}>
            {/* faint pre-print ghost */}
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 132, lineHeight: 0.92, color: "rgba(17,17,17,0.10)", letterSpacing: "-0.02em" }}>
              {full}
            </div>
            {/* inked-in name on top */}
            <div style={{
              position: "absolute", inset: 0, fontFamily: SERIF, fontWeight: 900,
              fontSize: 132, lineHeight: 0.92, color: INK, letterSpacing: "-0.02em",
              clipPath: inkClip, WebkitClipPath: inkClip,
            }}>
              {full}
            </div>
          </div>
          <div style={{ height: 5, background: RED, marginTop: 16, width: `${Math.max(0, ink) * 460}px` }} />
        </div>
      ) : null}

      {/* ── LEVEL BADGE (newspaper "No." stamp) ──────────────────────────── */}
      <div style={{
        position: "absolute", top: 150, left: 64, zIndex: 60, opacity: uiOpacity,
        width: 96, height: 96, transform: "rotate(-6deg)",
        background: PAPER, border: `4px solid ${INK}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        boxShadow: "3px 4px 0 rgba(17,17,17,0.22)",
      }}>
        <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 18, letterSpacing: "0.12em", color: RED, lineHeight: 1 }}>No.</span>
        <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 50, color: INK, lineHeight: 1 }}>{levelNumber}</span>
      </div>

      {/* ── TIMER (printed "stopwatch" stamp) ────────────────────────────── */}
      <div style={{
        position: "absolute", top: 150, right: 64, zIndex: 60, opacity: uiOpacity,
        width: 130, height: 130,
      }}>
        <svg width={130} height={130}>
          <circle cx={65} cy={65} r={56} fill={PAPER} stroke={INK} strokeWidth={5} />
          <circle cx={65} cy={65} r={47} fill="none" stroke="rgba(17,17,17,0.16)" strokeWidth={9} />
          <circle cx={65} cy={65} r={47} fill="none" stroke={timerRemain < 0.2 ? RED : INK} strokeWidth={9} strokeLinecap="butt"
            strokeDasharray={2 * Math.PI * 47} strokeDashoffset={2 * Math.PI * 47 * (1 - timerRemain)} transform="rotate(-90 65 65)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 900, fontSize: 60, color: timerRemain < 0.2 ? RED : INK }}>
          {secs}
        </div>
      </div>
    </AbsoluteFill>
  );
};
