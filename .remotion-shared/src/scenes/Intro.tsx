import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { type Language } from "../paths";
import type { IntroStringsByLanguage } from "../scene-props";
import { DESIGN_FPS, useDesignFrame } from "../timing";
import { type Accent, brandAccent } from "../brand-accent";

const COND = "'Barlow Condensed', " + fontFamily;
const DEFAULT_ACCENT = brandAccent(null); // gold

// Shared Intro (quiz-title screen) — identical design for every runner. The text
// (title lines / season / questions / bonus) is injected via `strings` so each
// runner shows its own quiz title (matching its quiz-title voice + landing title).
// Layout: an accent SEASON kicker flanked by rules, the hero title, then a chips row
// ("N QUESTIONS" dark-glass pill + accent "+ BONUS" pill). Content is revealed
// instantly (no entrance animation) but the whole block gently bobs up/down.
export const Intro: React.FC<{
  language: Language;
  questionsCount: number;
  strings: IntroStringsByLanguage;
  /** Hero title font size (px). Runners with longer titles pass a smaller size. */
  titleFontSize?: number;
  /** Season kicker font size (px). */
  seasonFontSize?: number;
  /** Per-competition accent (default gold). */
  accent?: Accent;
}> = ({ language, questionsCount, strings, titleFontSize = 150, seasonFontSize = 72, accent = DEFAULT_ACCENT }) => {
  const t = strings[language];
  const GOLD = accent.linear;
  const frame = useDesignFrame();
  const float = Math.sin((frame / DESIGN_FPS) * 1.8) * 30;
  const RULE_W = 120;

  return (
    <AbsoluteFill>
      {/* soft glow behind for depth (doesn't darken the theme) */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1600, height: 1020, borderRadius: "50%", background: "radial-gradient(ellipse 50% 50% at 50% 46%, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.15) 46%, rgba(0,0,0,0) 70%)", filter: "blur(10px)" }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${float}px)` }}>
          {/* SEASON kicker: accent text flanked by rules */}
          <div style={{ display: "flex", alignItems: "center", gap: 26, marginBottom: 30 }}>
            <div style={{ width: RULE_W, height: 5, borderRadius: 999, background: `linear-gradient(90deg, ${accent.glow(0)} 0%, ${accent.main} 100%)` }} />
            <span style={{ fontFamily: COND, fontWeight: 800, fontSize: seasonFontSize, letterSpacing: 9, color: accent.main, textShadow: `0 3px 12px rgba(0,0,0,0.65), 0 0 22px ${accent.glow(0.35)}`, whiteSpace: "nowrap" }}>
              {t.season}
            </span>
            <div style={{ width: RULE_W, height: 5, borderRadius: 999, background: `linear-gradient(90deg, ${accent.main} 0%, ${accent.glow(0)} 100%)` }} />
          </div>

          {/* TITLE — the hero */}
          <h1 style={{ margin: 0, fontFamily: COND, fontWeight: 800, textAlign: "center", lineHeight: 0.97, letterSpacing: 1, color: COLORS.white, textTransform: "uppercase" }}>
            {t.titleLines.map((line, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  fontSize: titleFontSize,
                  textShadow: "0 4px 0 rgba(0,0,0,0.3), 0 16px 40px rgba(0,0,0,0.85)",
                  filter: `drop-shadow(0 0 34px ${accent.glow(0.14)})`,
                }}
              >
                {line}
              </span>
            ))}
          </h1>

          {/* CHIPS row — dark-glass "N QUESTIONS" + accent "+ BONUS" */}
          <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 50, fontFamily: COND }}>
            {/* questions chip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "16px 40px 16px 16px",
                borderRadius: 999,
                background: "rgba(12,18,26,0.5)",
                backdropFilter: "blur(12px) saturate(1.2)",
                WebkitBackdropFilter: "blur(12px) saturate(1.2)",
                border: `2px solid ${accent.glow(0.5)}`,
                boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ width: 92, height: 92, borderRadius: "50%", background: GOLD, color: "#241500", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 70, fontWeight: 800, lineHeight: 1, paddingBottom: 4, boxSizing: "border-box", boxShadow: "0 8px 16px rgba(0,0,0,0.4), inset 0 3px 0 rgba(255,255,255,0.45)" }}>
                {questionsCount}
              </div>
              <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: 3, color: COLORS.white, textShadow: "0 3px 10px rgba(0,0,0,0.55)" }}>{t.questions}</span>
            </div>

            {/* bonus chip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "20px 44px",
                borderRadius: 999,
                background: GOLD,
                color: "#241500",
                boxShadow: "0 16px 40px rgba(0,0,0,0.5), inset 0 3px 0 rgba(255,255,255,0.45)",
              }}
            >
              <span style={{ fontSize: 66, fontWeight: 800, lineHeight: 1, display: "inline-block" }}>+</span>
              <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: 3, lineHeight: 1 }}>{t.bonus}</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
