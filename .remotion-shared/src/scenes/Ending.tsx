import React from "react";
import { AbsoluteFill, Img, interpolate, spring } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { likeSrc, logoSrc, subscribeSrc, type Language } from "../paths";
import { DESIGN_FPS, useDesignFrame } from "../timing";

// FINAL ending scene ("How many did you get?") — intentionally DIFFERENT from the
// mid-quiz break (Outro/think-you-know): celebratory confetti, a gold scoreboard
// that spins digits and lands on "?/N", then the big question + subscribe CTA.

const TEXT = {
  English: {
    line1: "HOW MANY",
    line2: "DID YOU GET?",
    sub: "Drop Your Score In The Comments!",
    subscribe: "SUBSCRIBE",
    subscribed: "SUBSCRIBED",
  },
  Spanish: {
    line1: "¿CUÁNTAS",
    line2: "ACERTASTE?",
    sub: "¡Deja Tu Puntuación En Los Comentarios!",
    subscribe: "SUSCRIBIRSE",
    subscribed: "SUSCRITO",
  },
} as const;

const popIn = (frame: number, delay: number) =>
  spring({ frame: frame - delay, fps: DESIGN_FPS, config: { damping: 11, mass: 0.7, stiffness: 140 }, durationInFrames: 26 });

// ── deterministic confetti (no Math.random — pure function of index + frame) ──
const CONFETTI_COLORS = ["#ff4d4d", "#f9a8d4", "#ffffff", "#6ee7b7", "#7dd3fc", "#c4b5fd"];
const confettiHash = (i: number, salt: number) => {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const ConfettiPiece: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const x = confettiHash(i, 1) * 1920;
  const drift = (confettiHash(i, 2) - 0.5) * 140;
  const fallSec = 2.6 + confettiHash(i, 3) * 2.2; // full-screen fall time
  const startOffset = confettiHash(i, 4) * 1280;
  const w = 12 + confettiHash(i, 5) * 14;
  const h = 18 + confettiHash(i, 6) * 22;
  const color = CONFETTI_COLORS[Math.floor(confettiHash(i, 7) * CONFETTI_COLORS.length)];
  const spinSpeed = 4 + confettiHash(i, 8) * 9;
  const sway = Math.sin((frame / DESIGN_FPS) * (1.4 + confettiHash(i, 9)) * 2 + i) * 36;

  const y = ((frame * (1080 + 240)) / (fallSec * DESIGN_FPS) + startOffset) % (1080 + 240) - 120;
  const appear = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x + sway + (drift * frame) / (fallSec * DESIGN_FPS),
        top: y,
        width: w,
        height: h,
        background: color,
        borderRadius: 3,
        opacity: 0.85 * appear,
        transform: `rotate(${frame * spinSpeed + i * 37}deg) skewX(${Math.sin(frame / 7 + i) * 24}deg)`,
      }}
    />
  );
};

// ── scoreboard: digits spin fast, then land on a glowing "?" ──
const SCORE_LOCK = 34; // frame where the spin stops and "?" pops
const ScoreBoard: React.FC<{ frame: number; total: number }> = ({ frame, total }) => {
  const pop = popIn(frame, 6);
  const scale = interpolate(pop, [0, 1], [0.4, 1]);
  const locked = frame >= SCORE_LOCK;
  // Count UP through the possible scores (0 → total, never past it — a 5-question
  // quiz must never flash a 7), reaching the actual number right before the "?" pops.
  const spinningDigit = String(
    Math.round(
      interpolate(frame, [8, SCORE_LOCK - 2], [0, Math.max(1, total)], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    ),
  );
  const lockPop = spring({
    frame: frame - SCORE_LOCK,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.7, stiffness: 200 },
    durationInFrames: 24,
  });
  const qScale = locked ? interpolate(lockPop, [0, 1], [1.7, 1]) : 1;
  const glow = locked ? 0.45 + 0.3 * Math.sin((frame - SCORE_LOCK) / 5) : 0.15;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "18px 64px",
        borderRadius: 28,
        background: "linear-gradient(180deg, rgba(10,14,22,0.92) 0%, rgba(16,22,34,0.88) 100%)",
        border: "4px solid rgba(255,255,255,0.92)",
        boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 ${30 + glow * 50}px rgba(255,80,80,${glow})`,
        transform: `scale(${scale})`,
        opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        fontFamily,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      <span
        style={{
          display: "inline-block",
          minWidth: 120,
          textAlign: "center",
          fontSize: 150,
          color: locked ? COLORS.red : "#ffffff",
          textShadow: locked ? "0 0 26px rgba(255,80,80,0.8)" : "0 4px 12px rgba(0,0,0,0.6)",
          transform: `scale(${qScale})`,
          filter: locked ? "none" : "blur(1px)",
        }}
      >
        {locked ? "?" : spinningDigit}
      </span>
      <span style={{ fontSize: 110, color: "rgba(255,255,255,0.55)", margin: "0 6px" }}>/</span>
      <span style={{ fontSize: 150, color: "#ffffff", textShadow: "0 4px 12px rgba(0,0,0,0.6)" }}>{total}</span>
    </div>
  );
};

/** Classic white arrow cursor + click press (same interaction language as the break). */
const MouseCursor: React.FC<{ x: number; y: number; pressing: boolean; visible: number }> = ({ x, y, pressing, visible }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity: visible,
      transform: `scale(${pressing ? 0.88 : 1})`,
      transformOrigin: "2px 2px",
      pointerEvents: "none",
      zIndex: 30,
      filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.55))",
    }}
  >
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 3l14 9.5-6.2 1.4 3.4 7.2-2.4 1.1-3.4-7.2L4 19V3z"
        fill="#fff"
        stroke="#111"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

const ClickRipple: React.FC<{ active: number; x: number; y: number }> = ({ active, x, y }) => {
  if (active <= 0) return null;
  const scale = interpolate(active, [0, 1], [0.3, 2.2]);
  const opacity = interpolate(active, [0, 0.35, 1], [0.7, 0.45, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 44,
        height: 44,
        marginLeft: -22,
        marginTop: -22,
        borderRadius: "50%",
        border: "3px solid rgba(255,255,255,0.85)",
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

const BellIcon: React.FC<{ ring: number }> = ({ ring }) => {
  const wiggle = ring > 0 ? Math.sin(ring * 0.9) * 14 : 0;
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ transform: `rotate(${wiggle}deg)` }}>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
};

const SUB_BTN_W = 320;
const SUB_BTN_H = 76;
const BELL_SIZE = 76;
const CTA_GAP = 18;

export const Ending: React.FC<{ language: Language; questionsCount: number }> = ({ language, questionsCount }) => {
  const frame = useDesignFrame();
  const copy = TEXT[language];

  const logoPop = popIn(frame, 0);
  const titlePop = popIn(frame, 16);
  const title2Pop = popIn(frame, 22);
  const subPop = popIn(frame, 30);
  const ctaPop = popIn(frame, 36);
  const likePop = popIn(frame, 10);
  const subEmojiPop = popIn(frame, 13);

  const float = Math.sin((frame / DESIGN_FPS) * 1.6) * 10;

  // Cursor timeline (design frames)
  const CURSOR_START = 52;
  const SUB_CLICK = 70;
  const BELL_CLICK = 94;
  const subCenterX = SUB_BTN_W / 2;
  const subCenterY = SUB_BTN_H / 2;
  const bellCenterX = SUB_BTN_W + CTA_GAP + BELL_SIZE / 2;
  const bellCenterY = BELL_SIZE / 2;
  const cursorVisible = interpolate(frame, [CURSOR_START - 4, CURSOR_START], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorX = interpolate(
    frame,
    [CURSOR_START, SUB_CLICK - 2, SUB_CLICK + 14, BELL_CLICK - 2],
    [subCenterX + 130, subCenterX + 8, subCenterX + 8, bellCenterX + 6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const cursorY = interpolate(
    frame,
    [CURSOR_START, SUB_CLICK - 2, SUB_CLICK + 14, BELL_CLICK - 2],
    [subCenterY + 90, subCenterY + 4, subCenterY + 4, bellCenterY + 4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const subPressing = frame >= SUB_CLICK - 1 && frame <= SUB_CLICK + 3;
  const bellPressing = frame >= BELL_CLICK - 1 && frame <= BELL_CLICK + 3;
  const subscribed = frame >= SUB_CLICK + 2;
  const bellRung = Math.max(0, frame - BELL_CLICK);
  const subRipple = interpolate(frame, [SUB_CLICK, SUB_CLICK + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bellRipple = interpolate(frame, [BELL_CLICK, BELL_CLICK + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subActivate = interpolate(frame, [SUB_CLICK + 1, SUB_CLICK + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subPop2 = subscribed
    ? interpolate(frame, [SUB_CLICK + 1, SUB_CLICK + 5, SUB_CLICK + 12], [1, 1.08, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const subBtnScale = subPressing ? 0.94 : subPop2;
  const bellScale = bellPressing ? 0.9 : bellRung > 0 ? 1 + Math.sin(bellRung * 0.85) * 0.06 : 1;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* confetti behind the content */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {Array.from({ length: 30 }, (_, i) => (
          <ConfettiPiece key={i} i={i} frame={frame} />
        ))}
      </AbsoluteFill>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
          transform: `translateY(${float - 20}px)`,
          maxWidth: 1820,
          padding: "0 32px",
        }}
      >
        {/* logo above the scoreboard */}
        <Img
          src={logoSrc(language)}
          style={{
            width: 210,
            height: 210,
            objectFit: "contain",
            transform: `scale(${interpolate(logoPop, [0, 1], [0.6, 1])})`,
            opacity: interpolate(logoPop, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }),
            filter: "drop-shadow(0 14px 32px rgba(0,0,0,0.5))",
            marginTop: 8,
          }}
        />

        {/* scoreboard with the like / subscribe emojis flanking it */}
        <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
          <Img
            src={likeSrc()}
            style={{
              width: 132,
              height: 132,
              objectFit: "contain",
              opacity: interpolate(likePop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
              transform: `scale(${interpolate(likePop, [0, 1], [0.5, 1])}) rotate(-10deg)`,
              filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.45))",
            }}
          />
          <ScoreBoard frame={frame} total={questionsCount} />
          <Img
            src={subscribeSrc()}
            style={{
              width: 132,
              height: 132,
              objectFit: "contain",
              opacity: interpolate(subEmojiPop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }),
              transform: `scale(${interpolate(subEmojiPop, [0, 1], [0.5, 1])}) rotate(10deg)`,
              filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.45))",
            }}
          />
        </div>

        {/* the big question */}
        <h1
          style={{
            margin: 0,
            fontFamily,
            fontWeight: 800,
            lineHeight: 0.94,
            letterSpacing: 2,
            textAlign: "center",
            textTransform: "uppercase",
            color: COLORS.white,
            textShadow: "0 8px 26px rgba(0,0,0,0.82)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 150,
              opacity: interpolate(titlePop, [0, 0.7], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(titlePop, [0, 1], [26, 0])}px)`,
            }}
          >
            {copy.line1}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 150,
              opacity: interpolate(title2Pop, [0, 0.7], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(title2Pop, [0, 1], [26, 0])}px)`,
            }}
          >
            {copy.line2}
          </span>
        </h1>

        <h2
          style={{
            margin: 0,
            fontFamily,
            fontWeight: 800,
            fontSize: 64,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: COLORS.red,
            textShadow: "0 5px 16px rgba(0,0,0,0.65)",
            opacity: interpolate(subPop, [0, 0.7], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          {copy.sub}
        </h2>

        {/* subscribe + bell — cursor clicks both */}
        <div
          style={{
            position: "relative",
            opacity: interpolate(ctaPop, [0, 0.75], [0, 1], { extrapolateRight: "clamp" }),
            height: BELL_SIZE + 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: CTA_GAP }}>
            <div
              style={{
                width: SUB_BTN_W,
                height: SUB_BTN_H,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily,
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: 0.5,
                color: subscribed ? "#fff" : "#606060",
                background: subscribed
                  ? `rgb(${Math.round(interpolate(subActivate, [0, 1], [210, 204]))}, ${Math.round(interpolate(subActivate, [0, 1], [210, 0]))}, ${Math.round(interpolate(subActivate, [0, 1], [210, 0]))})`
                  : "#f2f2f2",
                border: subscribed ? "none" : "2px solid #d0d0d0",
                boxShadow: subscribed
                  ? `0 10px 32px rgba(204,0,0,${0.35 + subActivate * 0.25}), 0 0 ${18 + subActivate * 14}px rgba(255,50,50,${subActivate * 0.45})`
                  : "0 6px 16px rgba(0,0,0,0.18)",
                transform: `scale(${subBtnScale})`,
              }}
            >
              {subscribed ? copy.subscribed : copy.subscribe}
            </div>
            <div
              style={{
                width: BELL_SIZE,
                height: BELL_SIZE,
                borderRadius: 8,
                background: bellRung > 8 ? "#606060" : "#f2f2f2",
                border: "2px solid #d0d0d0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: bellRung > 8 ? "#fff" : "#606060",
                boxShadow:
                  bellRung > 8
                    ? "0 8px 22px rgba(0,0,0,0.35), 0 0 16px rgba(255,202,40,0.35)"
                    : "0 6px 16px rgba(0,0,0,0.18)",
                transform: `scale(${bellScale})`,
              }}
            >
              <BellIcon ring={bellRung} />
            </div>
          </div>

          <ClickRipple active={subRipple} x={subCenterX} y={subCenterY} />
          <ClickRipple active={bellRipple} x={bellCenterX} y={bellCenterY} />
          <MouseCursor x={cursorX} y={cursorY} pressing={subPressing || bellPressing} visible={cursorVisible} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
