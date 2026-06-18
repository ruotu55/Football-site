// Template — "Tactics Chalkboard".
// A football coach's tactical board. A dark green/blue board with faint chalk-dust
// texture and a thin wooden frame. The four clues are drawn ON the board in CHALK:
// each in a hand-drawn (slightly wobbly) chalk box with a chalk arrow pointing at
// the hero. Boxes + arrows DRAW ON via SVG stroke-dasharray/strokeDashoffset
// animated by clueSpring (like ScoutDossier's connectors). Reveal writes the
// player's NAME in big chalk and swipes a chalk underline beneath it.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel, nameParts,
  HeroPlayer, rand, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', " + fontFamily;
const CHALK = "#eef3ec";           // off-white chalk
const CHALK_DIM = "rgba(238,243,236,0.62)";
const ACCENT = "#ffe27a";          // chalk-yellow

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Hero focus point the arrows aim toward.
const HERO = { x: 960, y: 560 };

// Each clue box: position (box centre), size, and the side of the box the arrow
// leaves from heading toward the hero.
const SLOTS = [
  { x: 300,  y: 250, w: 300, h: 190, key: "club" as const },     // top-left
  { x: 1620, y: 250, w: 300, h: 190, key: "position" as const }, // top-right
  { x: 250,  y: 660, w: 300, h: 190, key: "country" as const },  // mid-left
  { x: 1670, y: 660, w: 300, h: 190, key: "age" as const },      // mid-right
] as const;

// Build a slightly-wobbly rounded-rect path so the box looks hand-drawn in chalk.
// `seed` jiggles the corner control points deterministically (no Math.random).
const wobblyBox = (cx: number, cy: number, w: number, h: number, seed: number): string => {
  const x = cx - w / 2, y = cy - h / 2;
  const j = (n: number) => (rand(seed + n) - 0.5) * 9; // ±4.5px jitter
  const x0 = x + j(1),  y0 = y + j(2);
  const x1 = x + w + j(3), y1 = y + j(4);
  const x2 = x + w + j(5), y2 = y + h + j(6);
  const x3 = x + j(7),  y3 = y + h + j(8);
  // mid-edge wobble points keep the strokes from being dead-straight
  const mt = `${(x0 + x1) / 2 + j(9)},${(y0 + y1) / 2 + j(10)}`;
  const mr = `${(x1 + x2) / 2 + j(11)},${(y1 + y2) / 2 + j(12)}`;
  const mb = `${(x2 + x3) / 2 + j(13)},${(y2 + y3) / 2 + j(14)}`;
  const ml = `${(x3 + x0) / 2 + j(15)},${(y3 + y0) / 2 + j(16)}`;
  return `M ${x0},${y0} Q ${mt} ${x1},${y1} Q ${mr} ${x2},${y2} Q ${mb} ${x3},${y3} Q ${ml} ${x0},${y0} Z`;
};

// Approx visual length of the wobbly box perimeter for the draw-on dash maths.
const boxLen = (w: number, h: number) => 2 * (w + h) * 1.08;

// A chalk arrow from a point on the box edge toward the hero. Returns the line
// path plus two short arrow-head strokes near the hero end.
const arrowPaths = (s: typeof SLOTS[number]) => {
  // start just inside the box edge facing the hero
  const sx = s.x + Math.sign(HERO.x - s.x) * (s.w / 2 - 6);
  const sy = s.y + s.h / 2 - 8;
  // stop short of the hero so the arrow points at, not into, the figure
  const dx = HERO.x - sx, dy = HERO.y - sy;
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist, uy = dy / dist;
  const ex = sx + ux * (dist - 240);
  const ey = sy + uy * (dist - 240);
  // arrow head wings
  const wing = 34;
  const ax = ux * Math.cos(0.5) - uy * Math.sin(0.5);
  const ay = ux * Math.sin(0.5) + uy * Math.cos(0.5);
  const bx = ux * Math.cos(-0.5) - uy * Math.sin(-0.5);
  const by = ux * Math.sin(-0.5) + uy * Math.cos(-0.5);
  const line = `M ${sx},${sy} L ${ex},${ey}`;
  const head =
    `M ${ex},${ey} L ${ex - ax * wing},${ey - ay * wing} ` +
    `M ${ex},${ey} L ${ex - bx * wing},${ey - by * wing}`;
  return { line, head, len: dist - 240 };
};

const ChalkBox: React.FC<{
  slot: typeof SLOTS[number]; appear: number; label: string; children: React.ReactNode;
}> = ({ slot, appear, label, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  // content fades/rises in AFTER the box has started drawing
  const cOp = interpolate(appear, [0.45, 0.85], [0, 1], clamp);
  const cy = interpolate(appear, [0.45, 0.85], [16, 0], clamp);
  return (
    <div style={{
      position: "absolute",
      left: slot.x - slot.w / 2, top: slot.y - slot.h / 2,
      width: slot.w, height: slot.h,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      opacity: t, transform: `translateY(${cy}px)`,
    }}>
      <div style={{
        position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
        fontFamily: COND, fontWeight: 700, fontSize: 30, letterSpacing: "0.22em",
        color: ACCENT, opacity: cOp, whiteSpace: "nowrap",
        textShadow: "0 0 8px rgba(255,226,122,0.35)",
      }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: cOp, width: "100%", height: "100%",
      }}>{children}</div>
    </div>
  );
};

export const TacticsChalkboard: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;
  const { full } = nameParts(level.playerName, level.display);

  // Reveal chalk-write of the name + underline swipe.
  const nameOp = interpolate(rp, [0.30, 0.52], [0, 1], clamp);
  const nameY = interpolate(rp, [0.30, 0.55], [40, 0], clamp);
  const underline = interpolate(rp, [0.46, 0.74], [0, 1], clamp); // 0→1 swipe width
  const NAME_W = 1500;

  // chalk-dust specks (deterministic)
  const dust = Array.from({ length: 60 }, (_, i) => ({
    x: rand(i + 1) * 1920,
    y: rand(i + 41) * 1080,
    r: 0.6 + rand(i + 91) * 2.2,
    o: 0.04 + rand(i + 131) * 0.10,
  }));

  // small tactical X/O marks scattered like a real chalkboard, faint
  const marks = Array.from({ length: 7 }, (_, i) => ({
    x: 220 + rand(i + 200) * 1480,
    y: 420 + rand(i + 230) * 520,
    o: rand(i + 260) > 0.5,
    s: 22 + rand(i + 290) * 16,
  }));

  return (
    <AbsoluteFill style={{ fontFamily, overflow: "hidden" }}>
      {/* ── Board surface ─────────────────────────────────────────────── */}
      <AbsoluteFill style={{
        background:
          "radial-gradient(120% 110% at 50% 36%, #1b4034 0%, #16352b 46%, #143040 100%)",
      }} />
      {/* faint chalk-dust wash + smear streaks */}
      <AbsoluteFill style={{
        background:
          "radial-gradient(70% 50% at 28% 30%, rgba(238,243,236,0.05), rgba(0,0,0,0) 60%)," +
          "radial-gradient(60% 45% at 78% 70%, rgba(238,243,236,0.045), rgba(0,0,0,0) 60%)",
        mixBlendMode: "screen",
      }} />

      {/* chalk-dust specks */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {dust.map((d, i) => (
          <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={CHALK} opacity={d.o} />
        ))}
        {/* faint tactical X / O marks */}
        {marks.map((m, i) => m.o ? (
          <g key={`m${i}`} stroke={CHALK} strokeWidth={2.4} opacity={0.12} strokeLinecap="round">
            <line x1={m.x - m.s} y1={m.y - m.s} x2={m.x + m.s} y2={m.y + m.s} />
            <line x1={m.x + m.s} y1={m.y - m.s} x2={m.x - m.s} y2={m.y + m.s} />
          </g>
        ) : (
          <circle key={`m${i}`} cx={m.x} cy={m.y} r={m.s} fill="none" stroke={CHALK} strokeWidth={2.4} opacity={0.12} />
        ))}
      </svg>

      {/* ── Wooden frame ──────────────────────────────────────────────── */}
      <AbsoluteFill style={{
        border: "22px solid #3b2a18",
        boxShadow:
          "inset 0 0 0 4px #5a4326, inset 0 0 60px rgba(0,0,0,0.55), 0 0 120px rgba(0,0,0,0.4)",
        borderRadius: 8,
        pointerEvents: "none",
      }} />

      {/* ── Chalk boxes + arrows drawing on (SVG) ─────────────────────── */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: uiOpacity }}>
        {/* chalky rough edge: a soft white feathering via low-opacity wide stroke under the crisp one */}
        {SLOTS.map((s, i) => {
          const draw = Math.min(1, Math.max(0, clueSpring(frame, i)));
          const bl = boxLen(s.w, s.h);
          const box = wobblyBox(s.x, s.y, s.w, s.h, i * 7 + 3);
          const ar = arrowPaths(s);
          // arrow draws on slightly after its box
          const aDraw = Math.min(1, Math.max(0, clueSpring(frame, i) * 1.25 - 0.25));
          const headOp = interpolate(aDraw, [0.85, 1], [0, 1], clamp);
          return (
            <g key={`box${i}`}>
              {/* soft chalk halo */}
              <path d={box} fill="none" stroke={CHALK} strokeWidth={9} opacity={0.10}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={bl} strokeDashoffset={bl * (1 - draw)} />
              {/* crisp chalk stroke */}
              <path d={box} fill="none" stroke={CHALK} strokeWidth={3.4} opacity={0.92}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={bl} strokeDashoffset={bl * (1 - draw)} />
              {/* arrow shaft */}
              <path d={ar.line} fill="none" stroke={ACCENT} strokeWidth={4} opacity={0.9}
                strokeLinecap="round"
                strokeDasharray={ar.len} strokeDashoffset={ar.len * (1 - aDraw)} />
              {/* arrow head */}
              <path d={ar.head} fill="none" stroke={ACCENT} strokeWidth={4} opacity={headOp}
                strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>

      {/* ── Clue contents drawn inside the boxes ──────────────────────── */}
      <ChalkBox slot={SLOTS[0]} appear={clueSpring(frame, 0)} label={clueLabel("club", language)}>
        {p.clubSrc
          ? <Img src={p.clubSrc} style={{ maxWidth: 150, maxHeight: 110, objectFit: "contain", filter: "drop-shadow(0 0 6px rgba(0,0,0,0.5)) brightness(1.04)" }} />
          : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 96, color: CHALK }}>?</span>}
      </ChalkBox>

      <ChalkBox slot={SLOTS[1]} appear={clueSpring(frame, 1)} label={clueLabel("position", language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 116, color: CHALK, lineHeight: 0.9, textShadow: "0 0 10px rgba(238,243,236,0.25)" }}>{translatePosition(level.position, language)}</span>
      </ChalkBox>

      <ChalkBox slot={SLOTS[2]} appear={clueSpring(frame, 2)} label={clueLabel("country", language)}>
        {p.flagSrc
          ? <Img src={p.flagSrc} style={{ width: 168, height: 112, objectFit: "cover", borderRadius: 4, boxShadow: "0 0 0 3px rgba(238,243,236,0.55), 0 6px 16px rgba(0,0,0,0.5)" }} />
          : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 40, color: CHALK, textAlign: "center" }}>{level.country}</span>}
      </ChalkBox>

      <ChalkBox slot={SLOTS[3]} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 128, color: ACCENT, lineHeight: 0.9, textShadow: "0 0 12px rgba(255,226,122,0.35)" }}>{level.age ?? "?"}</span>
      </ChalkBox>

      {/* ── Hero player (white chalk rim) ─────────────────────────────── */}
      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(238,243,236,0.55)" />

      {/* ── Reveal: name written in chalk + underline swipe ───────────── */}
      {nameOp > 0 ? (
        <div style={{
          position: "absolute", left: "50%", bottom: 70, width: NAME_W,
          transform: `translate(-50%, ${nameY}px)`, opacity: nameOp,
          textAlign: "center", zIndex: 55,
        }}>
          <div style={{
            fontFamily: COND, fontWeight: 800, fontSize: 150, lineHeight: 0.9,
            letterSpacing: "0.02em", color: CHALK, whiteSpace: "nowrap",
            textShadow: "0 0 18px rgba(238,243,236,0.30), 0 6px 22px rgba(0,0,0,0.7)",
          }}>{full}</div>
          {/* chalk underline swipe */}
          <svg width={NAME_W} height={40} style={{ display: "block", margin: "6px auto 0" }}>
            <path
              d={`M ${NAME_W * 0.12},20 q ${NAME_W * 0.19},14 ${NAME_W * 0.38},8 t ${NAME_W * 0.38},-4`}
              fill="none" stroke={ACCENT} strokeWidth={9} strokeLinecap="round"
              strokeDasharray={NAME_W} strokeDashoffset={NAME_W * (1 - underline)}
              opacity={0.95} />
          </svg>
        </div>
      ) : null}

      {/* ── Level badge — chalk circle, top-left ──────────────────────── */}
      <div style={{ position: "absolute", top: 46, left: 52, zIndex: 60, opacity: uiOpacity }}>
        <svg width={132} height={132} style={{ position: "absolute", inset: 0 }}>
          <circle cx={66} cy={66} r={56} fill="rgba(8,18,14,0.35)"
            stroke={CHALK} strokeWidth={3.2} opacity={0.9}
            strokeDasharray="6 9" />
        </svg>
        <div style={{ width: 132, height: 132, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 20, letterSpacing: "0.2em", color: CHALK_DIM, marginBottom: -8 }}>
            {language === "Spanish" ? "NIVEL" : "LEVEL"}
          </div>
          <div style={{ fontFamily: COND, fontWeight: 800, fontSize: 78, color: CHALK, lineHeight: 1, textShadow: "0 0 10px rgba(238,243,236,0.3)" }}>{p.levelNumber}</div>
        </div>
      </div>

      {/* ── Timer — chalk ring, top-right ─────────────────────────────── */}
      <div style={{ position: "absolute", top: 46, right: 52, zIndex: 60, width: 134, height: 134, opacity: uiOpacity }}>
        <svg width={134} height={134}>
          <circle cx={67} cy={67} r={56} fill="rgba(8,18,14,0.35)"
            stroke={CHALK} strokeWidth={4} opacity={0.22} />
          <circle cx={67} cy={67} r={56} fill="none"
            stroke={timerRemain < 0.18 ? "#ff6b5e" : ACCENT} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 56} strokeDashoffset={2 * Math.PI * 56 * (1 - timerRemain)}
            transform="rotate(-90 67 67)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 70, color: secs <= 1 ? "#ff6b5e" : CHALK, textShadow: "0 0 12px rgba(238,243,236,0.3)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
