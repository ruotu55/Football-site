import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import { type Language } from "@shared/paths";
import { COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import type { ResolvedLevel, McqAnswer } from "../level-data";
import audioManifest from "../generated/audio.json";

// Reveal starts at design frame 185 (same as runner-2 for timing consistency).
export const REVEAL_START = 185;

// ── LevelBadge (top-left gold circle with level number) ──────────────────────
const LevelBadge: React.FC<{ frame: number; n: number; opacity: number }> = ({ frame, n, opacity }) => {
  const pop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.8, stiffness: 170 },
    durationInFrames: 32,
  });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div style={{ position: "absolute", top: 34, left: 40, opacity, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div
        style={{
          width: 156,
          height: 156,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
          border: "7px solid rgba(255,255,255,0.94)",
          boxShadow: "0 18px 38px rgba(0,0,0,0.55), inset 0 -8px 18px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 93,
          lineHeight: 1,
          color: "#241500",
          textShadow: "0 2px 0 rgba(255,255,255,0.25)",
        }}
      >
        {n}
      </div>
    </div>
  );
};

// ── Timer ring (top-right) ────────────────────────────────────────────────────
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS.accent;
  return (
    <div style={{ position: "absolute", top: 34, right: 40, width: 162, height: 162, opacity, transform: `scale(${scale})`, transformOrigin: "top right" }}>
      <svg width={162} height={162} style={{ display: "block", filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.5))" }}>
        <circle cx={81} cy={81} r={R} fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" strokeWidth={14} />
        <circle
          cx={81}
          cy={81}
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - remain)}
          transform="rotate(-90 81 81)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 72,
          color: COLORS.white,
          textShadow: "0 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        {secs}
      </div>
    </div>
  );
};

// ── Answer letter badge (gold circle A/B/C for trivia rows) ─────────────────
const LetterBadge: React.FC<{ id: string }> = ({ id }) => (
  <div
    style={{
      flexShrink: 0,
      width: 66,
      height: 66,
      borderRadius: "50%",
      background: "radial-gradient(circle at 30% 30%, #ffd66b, #e8a13a)",
      color: "#7a0e37",
      fontFamily,
      fontWeight: 900,
      fontSize: 38,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.75), 0 4px 10px rgba(0,0,0,0.3)",
    }}
  >
    {id}
  </div>
);

// ── Trivia answer pill ────────────────────────────────────────────────────────
const TriviaPill: React.FC<{
  ans: McqAnswer;
  text: string;
  isCorrect: boolean;
  revealed: number; // 0→1 reveal progress
}> = ({ ans, text, isCorrect, revealed }) => {
  const scale = isCorrect ? interpolate(revealed, [0, 1], [1, 1.05]) : 1;
  const opacity = !isCorrect ? interpolate(revealed, [0, 1], [1, 0.32]) : 1;
  const boxShadow = isCorrect
    ? `0 0 0 ${interpolate(revealed, [0, 1], [0, 6])}px #28c76f, 0 18px 44px rgba(40,199,111,${interpolate(revealed, [0, 1], [0, 0.5])})`
    : "0 10px 26px rgba(0,0,0,0.28)";
  const textColor = isCorrect ? interpolate(revealed, [0, 1], [0, 1]) : 0; // 0 = dark, 1 = green
  // Interpolate text color: #15151c → #0a7a3f
  const r = Math.round(interpolate(textColor, [0, 1], [0x15, 0x0a]));
  const g = Math.round(interpolate(textColor, [0, 1], [0x15, 0x7a]));
  const b = Math.round(interpolate(textColor, [0, 1], [0x1c, 0x3f]));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        background: "#fff",
        borderRadius: 999,
        padding: "14px 28px",
        boxShadow,
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: "center center",
      }}
    >
      <LetterBadge id={ans.id} />
      <span
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 42,
          color: `rgb(${r},${g},${b})`,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 520,
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ── Which-player photo card ───────────────────────────────────────────────────
const PlayerCard: React.FC<{
  ans: McqAnswer;
  text: string;
  isCorrect: boolean;
  revealed: number;
}> = ({ ans, text, isCorrect, revealed }) => {
  const scale = isCorrect ? interpolate(revealed, [0, 1], [1, 1.05]) : 1;
  const opacity = !isCorrect ? interpolate(revealed, [0, 1], [1, 0.32]) : 1;
  const glowSpread = isCorrect ? interpolate(revealed, [0, 1], [0, 6]) : 0;
  const glowAlpha = isCorrect ? interpolate(revealed, [0, 1], [0, 0.5]) : 0;
  const boxShadow = isCorrect
    ? `0 0 0 ${glowSpread}px #28c76f, 0 18px 44px rgba(40,199,111,${glowAlpha}), 0 16px 40px rgba(0,0,0,0.4)`
    : "0 16px 40px rgba(0,0,0,0.4)";
  const nameColorGreen = isCorrect ? interpolate(revealed, [0, 1], [0, 1]) : 0;
  const nr = Math.round(interpolate(nameColorGreen, [0, 1], [0x15, 0x0a]));
  const ng = Math.round(interpolate(nameColorGreen, [0, 1], [0x15, 0x7a]));
  const nb = Math.round(interpolate(nameColorGreen, [0, 1], [0x1c, 0x3f]));

  return (
    <div
      style={{
        flex: "0 1 28%",
        maxWidth: "30%",
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRadius: 24,
        overflow: "visible",
        boxShadow,
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: "bottom center",
        position: "relative",
      }}
    >
      {/* Corner badge A/B/C */}
      <div
        style={{
          position: "absolute",
          top: -12,
          left: -12,
          zIndex: 3,
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, #ff6b6b, #c2185b)",
          color: "#fff",
          fontFamily,
          fontWeight: 900,
          fontSize: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
        }}
      >
        {ans.id}
      </div>

      {/* Photo area */}
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 180,
          background: "linear-gradient(180deg, #e9edf2, #c9d2dc)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          overflow: "hidden",
          borderRadius: "24px 24px 0 0",
        }}
      >
        {ans.photoPath ? (
          <Img
            src={staticFile(ans.photoPath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
            }}
          />
        ) : null}
      </div>

      {/* Name bar */}
      <div
        style={{
          flexShrink: 0,
          background: "#fff",
          color: `rgb(${nr},${ng},${nb})`,
          textAlign: "center",
          fontFamily,
          fontWeight: 900,
          fontSize: 32,
          padding: "16px 8px",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ── MCQ content area ──────────────────────────────────────────────────────────
const McqContent: React.FC<{
  level: ResolvedLevel;
  language: Language;
  revealed: number;
}> = ({ level, language, revealed }) => {
  const { mcq } = level;
  const lang = language === "Spanish" ? "spanish" : "english";

  const questionText = (mcq.questionText[lang] || mcq.questionText.english || "").toUpperCase();
  const isPlayers = mcq.questionType === "which-player";

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "1.5vh",
        padding: "20px 60px 20px",
        boxSizing: "border-box",
        height: "100%",
      }}
    >
      {/* Question text */}
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          textTransform: "uppercase",
          color: "#fff",
          textAlign: "center",
          fontSize: "clamp(26px, 3.8vw, 62px)",
          lineHeight: 1.06,
          letterSpacing: 0.5,
          textShadow: "0 4px 18px rgba(0,0,0,0.45)",
          maxWidth: "90%",
          flexShrink: 0,
        }}
      >
        {questionText}
      </div>

      {/* Answer area */}
      {isPlayers ? (
        // Which-player: 3 photo cards in a row
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "visible",
            width: "100%",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            gap: "2.4vw",
            paddingTop: 12,
          }}
        >
          {mcq.answers.map((ans) => {
            const text = (ans.text[lang] || ans.text.english || "").toUpperCase();
            const isCorrect = ans.id === mcq.correctAnswerId;
            return (
              <PlayerCard
                key={ans.id}
                ans={ans}
                text={text}
                isCorrect={isCorrect}
                revealed={revealed}
              />
            );
          })}
        </div>
      ) : (
        // Trivia: topic image (left) + answer pills (right)
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4vw",
          }}
        >
          {/* Topic image card */}
          {mcq.topicImage ? (
            <div
              style={{
                flexShrink: 0,
                width: "44%",
                maxWidth: "46%",
                aspectRatio: "16 / 11",
                borderRadius: 26,
                overflow: "hidden",
                background: "rgba(255,255,255,0.1)",
                border: "6px solid rgba(255,255,255,0.92)",
                boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Img
                src={staticFile(mcq.topicImage)}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ) : (
            // No image: fill with subtle placeholder
            <div
              style={{
                flexShrink: 0,
                width: "44%",
                maxWidth: "46%",
                aspectRatio: "16 / 11",
                borderRadius: 26,
                background: "rgba(0,0,0,0.2)",
                border: "6px solid rgba(255,255,255,0.3)",
              }}
            />
          )}

          {/* Answer pills column */}
          <div
            style={{
              flex: "1 1 0",
              maxWidth: "50%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "2.2vh",
            }}
          >
            {mcq.answers.map((ans) => {
              const text = (ans.text[lang] || ans.text.english || "").toUpperCase();
              const isCorrect = ans.id === mcq.correctAnswerId;
              return (
                <TriviaPill
                  key={ans.id}
                  ans={ans}
                  text={text}
                  isCorrect={isCorrect}
                  revealed={revealed}
                />
              );
            })}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── Main Level component ──────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
}> = ({ bg: _bg, level, levelNumber, language }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  // Reveal progress: 0 (before reveal) → 1 (fully revealed)
  const revealed = interpolate(frame, [REVEAL_START, REVEAL_START + 15], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Timer + badge fade out as reveal starts
  const uiOpacity = interpolate(frame, [REVEAL_START, REVEAL_START + 10], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* MCQ question + answers */}
      <McqContent level={level} language={language} revealed={revealed} />

      {/* Level badge (top-left) — fades at reveal */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />

      {/* Timer ring (top-right) — fades at reveal */}
      <Timer frame={frame} opacity={uiOpacity} />

      {/* Audio: ticking just before reveal, stinger at reveal, optional answer voice */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
      <Sequence from={f(REVEAL_START)}>
        <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
      </Sequence>
      {revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
