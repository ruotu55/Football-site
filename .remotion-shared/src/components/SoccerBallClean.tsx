import React from "react";

// Clean soccer ball: the white sphera + dark ring + dark "patches" (border-triangles)
// from the supplied CSS, with a clean single-polygon central pentagon and the 5 seams
// drawn as RADIAL lines from the pentagon's exact vertices straight outward. Rendered at
// any `diameter` (native 412px). Used for runner 3's intro emblem + the ball-open transition.
const DARK = "#212121";
// content-box is required or a global border-box collapses the border-triangle patches.
const CB = "content-box" as const;
const PATCH_BASE: React.CSSProperties = {
  position: "absolute",
  boxSizing: CB,
  width: 0,
  height: 0,
  borderTop: "140px solid transparent",
  borderBottom: "140px solid transparent",
};

// Central pentagon vertices (in 400-space, from the clip-path below) and the radial seam
// each shoots outward from the ball centre (200,200) through that vertex.
// Each seam runs from a pentagon vertex to the exact inner apex of its black patch (the
// patch tip points toward the centre), slightly overshooting into the patch so they meet
// with no gap. Patch apexes derived from the border-triangle geometry below.
const SEAMS: [number, number, number, number][] = [
  [200, 110, 200, 36], // top → patch-top apex (200,40)
  [290, 174.9, 364.5, 162.1], // upper-right → patch-middle-right apex (360.6,162.8)
  [255.6, 280, 297.3, 344.6], // lower-right → patch-bottom-right apex (295.1,341.2)
  [144.4, 280, 102.7, 344.6], // lower-left → patch-bottom-left apex (104.9,341.2)
  [110, 174.9, 35.5, 162.1], // upper-left → patch-middle-left apex (39.4,162.8)
];

export const SoccerBallClean: React.FC<{ diameter: number }> = ({ diameter }) => {
  const s = diameter / 412;
  return (
    <div style={{ width: diameter, height: diameter, position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 412, height: 412, transform: `scale(${s})`, transformOrigin: "top left" }}>
        {/* .ball */}
        <div
          style={{
            position: "relative",
            width: 412,
            height: 412,
            borderRadius: "50%",
            boxShadow: "0 16px 20px 0 rgba(0,0,0,0.14), 0 4px 40px 0 rgba(0,0,0,0.12), 0 8px 16px -4px rgba(0,0,0,0.2)",
            overflow: "hidden",
          }}
        >
          {/* .ball-sphera */}
          <div
            style={{
              position: "relative",
              boxSizing: CB,
              width: 400,
              height: 400,
              background: "#FFFFFF",
              border: `6px solid ${DARK}`,
              borderRadius: "50%",
              boxShadow: "inset -50px -50px 100px rgba(0,0,0,0.14)",
            }}
          >
            {/* patches (black regions) */}
            <div style={{ ...PATCH_BASE, top: -12, left: 60, borderLeft: "140px solid transparent", borderRight: "140px solid transparent", borderTop: `52px solid ${DARK}` }} />
            <div style={{ ...PATCH_BASE, top: 18, left: 0, borderLeft: `40px solid ${DARK}`, transform: "rotate(14deg)" }} />
            <div style={{ ...PATCH_BASE, top: 18, right: 0, borderRight: `40px solid ${DARK}`, transform: "rotate(-14deg)" }} />
            <div style={{ ...PATCH_BASE, bottom: -98, left: 74, borderLeft: `40px solid ${DARK}`, transform: "rotate(-57deg)" }} />
            <div style={{ ...PATCH_BASE, bottom: -98, right: 74, borderRight: `40px solid ${DARK}`, transform: "rotate(57deg)" }} />

            {/* central pentagon — single clean polygon */}
            <div style={{ position: "absolute", boxSizing: CB, left: 110, top: 110, width: 180, height: 170, background: DARK, clipPath: "polygon(50% 0%, 100% 38.2%, 80.9% 100%, 19.1% 100%, 0% 38.2%)" }} />

            {/* 5 radial seams from the pentagon vertices */}
            <svg style={{ position: "absolute", left: 0, top: 0, width: 400, height: 400, overflow: "visible" }} viewBox="0 0 400 400">
              {SEAMS.map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={DARK} strokeWidth={3.5} strokeLinecap="round" />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
