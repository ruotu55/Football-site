// Template — "Comic Pop".
// Comic-book / pop-art take: Ben-Day halftone dot patches, thick black outlines,
// jagged starburst "BOOM" shapes behind each clue. Each clue POPS in with a big
// scale-overshoot + slight rotate + a 1–2 frame impact shake. The hero gets a bold
// black comic rim; reveal fires a halftone "POW" burst + huge comic name banner.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, popSpring, translatePosition, ageUnit, clueLabel, rand,
  HeroPlayer, RevealName, REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const RED = "#ff2e3e";
const YELLOW = "#ffd400";
const BLUE = "#1f7bff";
const INK = "#0a0a0a";

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Ben-Day halftone dot texture (CSS only — no SVG filters).
const halftone = (dot: string, size = 12, alpha = 0.9): React.CSSProperties => ({
  backgroundImage: `radial-gradient(${dot} ${alpha * 26}%, rgba(0,0,0,0) ${alpha * 27}%)`,
  backgroundSize: `${size}px ${size}px`,
});

// Jagged starburst clip-path (deterministic spikes around a circle).
const starburst = (seed: number, spikes = 14): string => {
  const pts: string[] = [];
  for (let k = 0; k < spikes * 2; k++) {
    const ang = (Math.PI * k) / spikes - Math.PI / 2;
    const outer = k % 2 === 0;
    const r = outer ? 48 + rand(seed + k) * 4 : 30 + rand(seed + k * 3) * 6;
    const x = 50 + Math.cos(ang) * r;
    const y = 50 + Math.sin(ang) * r;
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(",")})`;
};

// One clue burst: starburst back-plate + bold value, POP scale-overshoot + impact shake.
const ClueBurst: React.FC<{
  appear: number; frame: number; seed: number; label: string;
  fill: string; rot: number; children: React.ReactNode;
}> = ({ appear, frame, seed, label, fill, rot, children }) => {
  const op = interpolate(appear, [0, 0.18], [0, 1], clampOpts);
  // scale with overshoot then settle
  const scale = interpolate(appear, [0, 0.5, 0.78, 1], [0.2, 1.22, 0.94, 1], clampOpts);
  // 1–2 frame impact shake right as it lands (appear crosses ~0.5)
  const land = interpolate(appear, [0.46, 0.5, 0.56, 0.62], [0, 1, -0.6, 0], clampOpts);
  const shake = land * (rand(seed * 7) - 0.5) * 22;
  const spin = interpolate(appear, [0, 1], [rot * 2.4, rot], clampOpts);

  return (
    <div style={{
      position: "relative", width: 290, height: 290,
      opacity: op, transform: `translateX(${shake}px) scale(${scale}) rotate(${spin}deg)`,
      transformOrigin: "center center",
      filter: "drop-shadow(7px 9px 0 rgba(0,0,0,0.9))",
    }}>
      {/* jagged ink starburst (outer black) */}
      <div style={{ position: "absolute", inset: -8, background: INK, clipPath: starburst(seed) }} />
      {/* colour starburst face */}
      <div style={{ position: "absolute", inset: 4, background: fill, clipPath: starburst(seed + 99) }} />
      {/* halftone dot overlay tint */}
      <div style={{ position: "absolute", inset: 4, clipPath: starburst(seed + 99), ...halftone("rgba(0,0,0,0.32)", 11) }} />
      {/* content */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 10 }}>
        <div style={{
          fontFamily: COND, fontWeight: 900, fontSize: 30, letterSpacing: "0.06em",
          color: "#fff", WebkitTextStroke: "3px #0a0a0a", paintOrder: "stroke",
          transform: "rotate(-3deg)", marginBottom: 2,
        }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 150 }}>{children}</div>
      </div>
    </div>
  );
};

const bigText = (size: number): React.CSSProperties => ({
  fontFamily: COND, fontWeight: 900, fontSize: size, lineHeight: 0.9,
  color: "#fff", WebkitTextStroke: "6px #0a0a0a", paintOrder: "stroke",
  textShadow: "4px 4px 0 rgba(0,0,0,0.35)",
});

export const ComicPop: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity, levelNumber } = p;

  // POW burst on reveal
  const powAppear = popSpring(frame, REVEAL_START + 4, { damping: 11, stiffness: 180, durationInFrames: 26 });
  const powScale = interpolate(powAppear, [0, 0.55, 0.8, 1], [0, 1.25, 0.9, 1], clampOpts);
  const powSpin = interpolate(powAppear, [0, 1], [-30, -8], clampOpts);
  const powOp = interpolate(powAppear, [0, 0.2], [0, 1], clampOpts);

  return (
    <AbsoluteFill style={{ background: "#101522" }}>
      {/* comic backdrop: pop-art radial + bold ben-day field */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 90% at 50% 40%, #2a3550 0%, #141b2c 55%, #0a0e18 100%)" }} />
      <AbsoluteFill style={{ ...halftone("rgba(255,255,255,0.06)", 14), opacity: 0.7 }} />
      {/* radiating speed lines (CSS conic) behind the hero */}
      <AbsoluteFill style={{
        background: "repeating-conic-gradient(from 0deg at 50% 78%, rgba(255,255,255,0.05) 0deg 2deg, rgba(0,0,0,0) 2deg 9deg)",
        opacity: 0.5,
      }} />
      {/* bottom darkening for the figure to read */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 58% 62% at 50% 70%, rgba(0,0,0,0.45), rgba(0,0,0,0) 70%)" }} />

      {/* HERO with bold comic ink rim */}
      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,212,0,0.55)" />

      {/* TOP ROW — two clues top-left & top-right region, two more on far sides */}
      {/* CLUB — top-left burst */}
      <div style={{ position: "absolute", top: 24, left: 250, zIndex: 42 }}>
        <ClueBurst appear={clueSpring(frame, 0)} frame={frame} seed={11} label={clueLabel("club", language)} fill={RED} rot={-6}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: 138, maxHeight: 138, objectFit: "contain", filter: "drop-shadow(3px 4px 0 rgba(0,0,0,0.85))" }} />
            : <span style={bigText(96)}>?</span>}
        </ClueBurst>
      </div>

      {/* POSITION — top-right burst */}
      <div style={{ position: "absolute", top: 24, right: 250, zIndex: 42 }}>
        <ClueBurst appear={clueSpring(frame, 1)} frame={frame} seed={31} label={clueLabel("position", language)} fill={BLUE} rot={6}>
          <span style={bigText(112)}>{translatePosition(level.position, language)}</span>
        </ClueBurst>
      </div>

      {/* COUNTRY — far left, mid */}
      <div style={{ position: "absolute", top: 372, left: 56, zIndex: 42 }}>
        <ClueBurst appear={clueSpring(frame, 2)} frame={frame} seed={53} label={clueLabel("country", language)} fill={YELLOW} rot={-8}>
          {p.flagSrc
            ? <div style={{ width: 168, height: 112, border: "5px solid #0a0a0a", boxShadow: "4px 5px 0 rgba(0,0,0,0.4)", overflow: "hidden" }}>
                <Img src={p.flagSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            : <span style={{ ...bigText(42), WebkitTextStroke: "4px #0a0a0a" }}>{level.country}</span>}
        </ClueBurst>
      </div>

      {/* AGE — far right, mid */}
      <div style={{ position: "absolute", top: 372, right: 56, zIndex: 42 }}>
        <ClueBurst appear={clueSpring(frame, 3)} frame={frame} seed={77} label={ageUnit(level.age, language)} fill={RED} rot={7}>
          <span style={bigText(118)}>{level.age ?? "?"}</span>
        </ClueBurst>
      </div>

      {/* REVEAL — POW halftone starburst behind the name */}
      {powOp > 0 ? (
        <div style={{
          position: "absolute", left: "50%", top: "44%", zIndex: 48,
          transform: `translate(-50%,-50%) scale(${powScale}) rotate(${powSpin}deg)`,
          opacity: powOp, width: 560, height: 560, pointerEvents: "none",
        }}>
          <div style={{ position: "absolute", inset: 0, background: INK, clipPath: starburst(404, 18) }} />
          <div style={{ position: "absolute", inset: 14, background: YELLOW, clipPath: starburst(409, 18) }} />
          <div style={{ position: "absolute", inset: 14, clipPath: starburst(409, 18), ...halftone("rgba(0,0,0,0.30)", 13) }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{
              fontFamily: COND, fontWeight: 900, fontSize: 168, color: RED,
              WebkitTextStroke: "9px #0a0a0a", paintOrder: "stroke",
              transform: "rotate(-8deg)", lineHeight: 0.9,
            }}>POW!</span>
          </div>
        </div>
      ) : null}

      {/* big comic name banner */}
      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={YELLOW} />

      {/* LEVEL BADGE — comic star, top-left */}
      <div style={{ position: "absolute", top: 36, left: 44, zIndex: 60, width: 128, height: 128, opacity: uiOpacity,
        filter: "drop-shadow(5px 6px 0 rgba(0,0,0,0.85))" }}>
        <div style={{ position: "absolute", inset: 0, background: INK, clipPath: starburst(202, 12) }} />
        <div style={{ position: "absolute", inset: 6, background: YELLOW, clipPath: starburst(208, 12) }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: COND, fontWeight: 900, fontSize: 70, color: INK, transform: "rotate(-4deg)" }}>{levelNumber}</div>
      </div>

      {/* TIMER — comic ring with chunky number, top-right */}
      <div style={{ position: "absolute", top: 36, right: 44, zIndex: 60, width: 132, height: 132, opacity: uiOpacity }}>
        <svg width={132} height={132} style={{ filter: "drop-shadow(4px 5px 0 rgba(0,0,0,0.85))" }}>
          <circle cx={66} cy={66} r={54} fill="#fff" stroke={INK} strokeWidth={8} />
          <circle cx={66} cy={66} r={50} fill="none" stroke={INK} strokeWidth={16} opacity={0.18} />
          <circle cx={66} cy={66} r={50} fill="none" stroke={timerRemain < 0.2 ? RED : BLUE} strokeWidth={16} strokeLinecap="butt"
            strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - timerRemain)} transform="rotate(-90 66 66)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: COND, fontWeight: 900, fontSize: 64, color: INK,
          WebkitTextStroke: "2px #0a0a0a", transform: "rotate(-3deg)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
