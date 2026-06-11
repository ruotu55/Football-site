import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, fontFamily } from "../theme";
import { type Language } from "../paths";
import type { IntroStringsByLanguage } from "../scene-props";
import { DESIGN_FPS, useDesignFrame } from "../timing";

// Shared Intro shell — identical layout + animation for every runner. The text
// (title lines / season / questions / bonus) is injected via `strings` so each
// runner shows its own quiz title (matching its quiz-title voice + landing title).
export const Intro: React.FC<{
  language: Language;
  questionsCount: number;
  strings: IntroStringsByLanguage;
  /** Title font size (px). Runners with longer titles pass a smaller size. */
  titleFontSize?: number;
}> = ({ language, questionsCount, strings, titleFontSize = 104 }) => {
  const frame = useDesignFrame();
  const t = strings[language];
  // Bob: plain translateY (sub-pixel, anti-aliased per frame) — NO GPU layer/willChange,
  // which re-samples the text raster and makes it shimmer. 30px travel @ 1.8 rad/s.
  const float = Math.sin((frame / DESIGN_FPS) * 1.8) * 30;

  return (
    <AbsoluteFill>
      {/* Center title block */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${float}px)`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <h1
            style={{
              margin: 0,
              fontFamily,
              fontWeight: 800,
              textAlign: "center",
              lineHeight: 0.94,
              letterSpacing: 1,
              color: COLORS.white,
              textShadow: "0 10px 30px rgba(0,0,0,0.8)",
              textTransform: "uppercase",
            }}
          >
            {/* full phrase (matches the voice) — sized to fit the longest line */}
            {t.titleLines.map((line, i) => (
              <span key={i} style={{ display: "block", fontSize: titleFontSize }}>
                {line}
              </span>
            ))}
          </h1>

          <div
            style={{
              fontFamily,
              fontWeight: 800,
              fontSize: 84,
              letterSpacing: 7,
              color: COLORS.red,
              textShadow: "0 6px 18px rgba(0,0,0,0.6)",
              marginTop: 26,
            }}
          >
            {t.season}
          </div>

          {/* Questions ticket — gold number stub + dark body, perforated divider */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "stretch",
              marginTop: 54,
              borderRadius: 30,
              overflow: "hidden",
              border: "3px solid rgba(255,255,255,0.14)",
              boxShadow: "0 22px 52px rgba(0,0,0,0.55), 0 0 28px rgba(255,202,40,0.18)",
              fontFamily,
            }}
          >
            {/* number stub (gold) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 150,
                padding: "26px 30px",
                background: "linear-gradient(180deg, #ffe07a 0%, #f7a81b 68%, #e07d09 100%)",
                color: "#241500",
                fontWeight: 800,
                fontSize: 128,
                lineHeight: 1,
                textShadow: "0 2px 0 rgba(255,255,255,0.3)",
              }}
            >
              {/* the big numeral sits low in its line-box — lift it to the badge centre */}
              <span style={{ display: "inline-block", transform: "translateY(-4px)" }}>{questionsCount}</span>
            </div>

            {/* body (dark) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                padding: "0 52px 0 40px",
                background: "linear-gradient(180deg, #222c38 0%, #0c1118 100%)",
              }}
            >
              <span
                style={{
                  fontSize: 76,
                  fontWeight: 800,
                  letterSpacing: 3,
                  lineHeight: 1,
                  color: COLORS.white,
                  textShadow: "0 3px 10px rgba(0,0,0,0.55)",
                }}
              >
                {t.questions}
              </span>
              <span
                style={{
                  width: 94,
                  height: 94,
                  borderRadius: "50%",
                  background: "linear-gradient(180deg, #ffe07a 0%, #f7a81b 70%, #e07d09 100%)",
                  color: "#241500",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 76,
                  fontWeight: 800,
                  lineHeight: 1,
                  paddingBottom: 4,
                  boxSizing: "border-box",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.4), inset 0 3px 0 rgba(255,255,255,0.45)",
                }}
              >
                +
              </span>
              <span
                style={{
                  fontSize: 76,
                  fontWeight: 800,
                  letterSpacing: 3,
                  lineHeight: 1,
                  color: COLORS.white,
                  textShadow: "0 3px 10px rgba(0,0,0,0.55)",
                }}
              >
                {t.bonus}
              </span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
