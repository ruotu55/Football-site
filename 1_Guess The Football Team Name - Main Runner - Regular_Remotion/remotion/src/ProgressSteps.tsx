import React from "react";

interface ProgressStepsProps {
  total: number;
  current: number;
}

const ACCENT = "#e8b500";
const DOT_SIZE = 28;
const DOT_ACTIVE_SIZE = 40;
const DOT_INACTIVE_COLOR = "rgba(255,255,255,0.25)";

export const ProgressSteps: React.FC<ProgressStepsProps> = ({ total, current }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        zIndex: 10,
      }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        const size = isActive ? DOT_ACTIVE_SIZE : DOT_SIZE;
        return (
          <div
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: isActive
                ? "var(--accent, " + ACCENT + ")"
                : DOT_INACTIVE_COLOR,
              border: isActive ? "none" : "2px solid rgba(255,255,255,0.35)",
              transition: "all 0.2s",
              boxShadow: isActive ? `0 0 14px 4px ${ACCENT}88` : "none",
            }}
          />
        );
      })}
    </div>
  );
};
