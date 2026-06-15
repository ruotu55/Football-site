import React from "react";
import { AbsoluteFill, Img, interpolate, spring } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { endingLabelForKey, type EndingKey } from "../ending";
import { likeSrc, logoSrc, subscribeSrc, type Language } from "../paths";
import { DESIGN_FPS, useDesignFrame } from "../timing";

const popIn = (frame: number, delay: number, fps: number) =>
  spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7, stiffness: 130 }, durationInFrames: 28 });

const TEXT = {
  English: {
    "Think you know the answer?": ["Think You Know", "The Answer?"],
    "How many did you get?": ["How Many Did", "You Get?"],
    sub: "Let Us Know In The Comments!",
    breakSub: "Comment Below!",
    subscribe: "SUBSCRIBE",
    subscribed: "SUBSCRIBED",
  },
  Spanish: {
    "Think you know the answer?": ["¿Crees Que Sabes", "La Respuesta?"],
    "How many did you get?": ["¿Cuántas", "Acertaste?"],
    sub: "¡Dínoslo En Los Comentarios!",
    breakSub: "¡Comenta Abajo!",
    subscribe: "SUSCRIBIRSE",
    subscribed: "SUSCRITO",
  },
} as const;

const SUB_BTN_W = 320;
const SUB_BTN_H = 76;
const BELL_SIZE = 76;
const CTA_GAP = 18;
const TITLE_SIZE = 172;
const SUBTITLE_SIZE = 92;
const LOGO_SIZE = 318;
const SIDE_EMOJI_SIZE = 158;
const TOP_ROW_SIDE_W = 200;
const OUTRO_LAYOUT_SCALE = 0.972; // 10% smaller than the previous 1.08 layout scale

/** Classic white arrow cursor + click press. */
const MouseCursor: React.FC<{ x: number; y: number; pressing: boolean; visible: number }> = ({
  x,
  y,
  pressing,
  visible,
}) => (
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
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ transform: `rotate(${wiggle}deg)` }}
    >
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
};

// isBreak = the MID-QUIZ "Think you know the answer?" pause (voice asks to comment +
// like & subscribe + "let's continue" — that last part has no on-screen text).
export const Outro: React.FC<{ language: Language; endingKey: EndingKey; isBreak?: boolean }> = ({
  language,
  endingKey,
  isBreak,
}) => {
  const frame = useDesignFrame();
  const label = endingLabelForKey(endingKey);
  const lines = TEXT[language][label];
  const copy = TEXT[language];
  const subText = isBreak ? copy.breakSub : copy.sub;

  const logoPop = popIn(frame, 0, DESIGN_FPS);
  const likePop = popIn(frame, 6, DESIGN_FPS);
  const subEmojiPop = popIn(frame, 9, DESIGN_FPS);
  const titlePop = popIn(frame, 12, DESIGN_FPS);
  const subtitlePop = popIn(frame, 20, DESIGN_FPS);
  const ctaPop = popIn(frame, 28, DESIGN_FPS);

  const logoScale = interpolate(logoPop, [0, 1], [0.72, 1]);
  const likeScale = interpolate(likePop, [0, 1], [0.5, 1]);
  const likeOpacity = interpolate(likePop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
  const subEmojiScale = interpolate(subEmojiPop, [0, 1], [0.5, 1]);
  const subEmojiOpacity = interpolate(subEmojiPop, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titlePop, [0, 0.7], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(titlePop, [0, 1], [24, 0]);
  const subtitleOpacity = interpolate(subtitlePop, [0, 0.7], [0, 1], { extrapolateRight: "clamp" });
  const ctaOpacity = interpolate(ctaPop, [0, 0.75], [0, 1], { extrapolateRight: "clamp" });

  const float = Math.sin((frame / DESIGN_FPS) * 1.8) * 16;

  // Cursor timeline (design frames)
  const CURSOR_START = 42;
  const SUB_CLICK = 62;
  const BELL_CLICK = 86;
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
  const cursorPressing = subPressing || bellPressing;
  const subscribed = frame >= SUB_CLICK + 2;
  const bellRung = Math.max(0, frame - BELL_CLICK);

  const subRipple = interpolate(frame, [SUB_CLICK, SUB_CLICK + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bellRipple = interpolate(frame, [BELL_CLICK, BELL_CLICK + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subActivate = interpolate(frame, [SUB_CLICK + 1, SUB_CLICK + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subPop = subscribed
    ? interpolate(frame, [SUB_CLICK + 1, SUB_CLICK + 5, SUB_CLICK + 12], [1, 1.08, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const subBtnScale = subPressing ? 0.94 : subPop;
  const bellScale = bellPressing ? 0.9 : bellRung > 0 ? 1 + Math.sin(bellRung * 0.85) * 0.06 : 1;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 52,
          transform: `translateY(${float}px) scale(${OUTRO_LAYOUT_SCALE})`,
          maxWidth: 1820,
          padding: "0 32px",
        }}
      >
        {/* Top row: like · logo (centred) · subscribe */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${TOP_ROW_SIDE_W}px auto ${TOP_ROW_SIDE_W}px`,
            alignItems: "center",
            columnGap: 48,
            width: "100%",
            justifyContent: "center",
            marginTop: 52,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Img
              src={likeSrc()}
              style={{
                width: SIDE_EMOJI_SIZE,
                height: SIDE_EMOJI_SIZE,
                objectFit: "contain",
                opacity: likeOpacity,
                transform: `scale(${likeScale}) rotate(-8deg)`,
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.45))",
              }}
            />
          </div>
          <Img
            src={logoSrc(language)}
            style={{
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              objectFit: "contain",
              transform: `scale(${logoScale})`,
              filter: "drop-shadow(0 14px 32px rgba(0,0,0,0.5))",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <Img
              src={subscribeSrc()}
              style={{
                width: SIDE_EMOJI_SIZE,
                height: SIDE_EMOJI_SIZE,
                objectFit: "contain",
                opacity: subEmojiOpacity,
                transform: `scale(${subEmojiScale}) rotate(8deg)`,
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.45))",
              }}
            />
          </div>
        </div>

        {/* Question — nudged up to sit closer under the logo row */}
        <div
          style={{
            textAlign: "center",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            marginTop: -32,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily,
              fontWeight: 800,
              lineHeight: 0.92,
              letterSpacing: 1,
              color: COLORS.white,
              textTransform: "uppercase",
              textShadow: "0 8px 26px rgba(0,0,0,0.82)",
            }}
          >
            <span style={{ display: "block", fontSize: TITLE_SIZE }}>{lines[0]}</span>
            <span style={{ display: "block", fontSize: TITLE_SIZE }}>{lines[1]}</span>
          </h1>
          <h2
            style={{
              margin: "38px 0 0",
              fontFamily,
              fontWeight: 800,
              fontSize: SUBTITLE_SIZE,
              letterSpacing: 4,
              color: COLORS.red,
              textTransform: "uppercase",
              textShadow: "0 5px 16px rgba(0,0,0,0.65)",
              opacity: subtitleOpacity,
            }}
          >
            {subText}
          </h2>
        </div>

        {/* YouTube subscribe + bell — cursor clicks both */}
        <div
          style={{
            position: "relative",
            opacity: ctaOpacity,
            marginTop: 12,
            height: BELL_SIZE + 48,
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
          <MouseCursor x={cursorX} y={cursorY} pressing={cursorPressing} visible={cursorVisible} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
