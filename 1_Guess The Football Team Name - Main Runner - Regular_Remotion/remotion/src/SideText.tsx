import React from "react";

/**
 * App-wide decorative chrome: "ULTIMATE FOOTBALL QUIZ" rotated down both
 * left and right edges.  Mirrors .side-text from css/components/decor.css.
 * Rendered in QuizComposition above all phases so it appears on every frame.
 */
export const SideText: React.FC = () => {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 48, // 2rem at 24px root
    fontWeight: 800,
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 4,
    pointerEvents: "none",
    zIndex: 100,
    whiteSpace: "nowrap",
    textAlign: "center",
    lineHeight: 1,
  };

  return (
    <>
      {/* Left side: rotated 180deg so text reads bottom-to-top */}
      <div
        style={{
          ...baseStyle,
          left: 24, // 1rem at 24px root
          transform: "translateY(-50%) rotate(180deg)",
        }}
      >
        ULTIMATE FOOTBALL QUIZ
      </div>
      {/* Right side: normal vertical-rl direction (top-to-bottom) */}
      <div
        style={{
          ...baseStyle,
          right: 24, // 1rem at 24px root
          transform: "translateY(-50%)",
        }}
      >
        ULTIMATE FOOTBALL QUIZ
      </div>
    </>
  );
};
