import React from "react";

// The runner's CSS soccer ball (css/components/landing.css .ball-sphera + patches),
// ported as static styled divs. Base box is 400x400; `diameter` scales it.
const BLACK = "#212121";

const triBase: React.CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  borderTop: "140px solid transparent",
  borderBottom: "140px solid transparent",
};

const lineBase: React.CSSProperties = {
  position: "absolute",
  width: 60,
  height: 2,
  background: BLACK,
};

export const SoccerBall: React.FC<{ diameter: number; noShadow?: boolean }> = ({
  diameter,
  noShadow,
}) => {
  const scale = diameter / 400;
  return (
    <div
      style={{
        width: 400,
        height: 400,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          boxShadow: noShadow
            ? "none"
            : "0 16px 20px 0 rgba(0,0,0,0.14), 0 4px 40px 0 rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 400,
            height: 400,
            background: "#FFFFFF",
            border: `6px solid ${BLACK}`,
            borderRadius: "50%",
            boxShadow: "inset -50px -50px 100px rgba(0,0,0,0.14)",
          }}
        >
          {/* top */}
          <div
            style={{
              ...triBase,
              top: 0,
              left: 60,
              borderLeft: "140px solid transparent",
              borderRight: "140px solid transparent",
              borderTop: `40px solid ${BLACK}`,
            }}
          >
            <div style={{ ...lineBase, width: 2, height: 122, top: 6, left: -1 }} />
          </div>

          {/* middle-left */}
          <div
            style={{
              ...triBase,
              top: 18,
              left: 0,
              borderLeft: `40px solid ${BLACK}`,
              transform: "rotate(14deg)",
            }}
          >
            <div style={{ ...lineBase, top: -1, left: 6 }} />
          </div>

          {/* middle-right */}
          <div
            style={{
              ...triBase,
              top: 18,
              right: 0,
              borderRight: `40px solid ${BLACK}`,
              transform: "rotate(-14deg)",
            }}
          >
            <div style={{ ...lineBase, top: -1, right: 6 }} />
          </div>

          {/* center pentagon */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 128,
              height: 128,
              marginLeft: -64,
              marginTop: -64,
              background: BLACK,
              clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
            }}
          />

          {/* bottom-left */}
          <div
            style={{
              ...triBase,
              bottom: -98,
              left: 74,
              borderLeft: `40px solid ${BLACK}`,
              transform: "rotate(-57deg)",
            }}
          >
            <div style={{ ...lineBase, top: -1, left: 6 }} />
          </div>

          {/* bottom-right */}
          <div
            style={{
              ...triBase,
              bottom: -98,
              right: 74,
              borderRight: `40px solid ${BLACK}`,
              transform: "rotate(57deg)",
            }}
          >
            <div style={{ ...lineBase, top: -1, right: 6 }} />
          </div>
        </div>
      </div>
    </div>
  );
};
