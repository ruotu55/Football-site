// Template — "Slot Machine".
// A Vegas casino slot machine: a chrome/gold cabinet with a row of 4 REEL windows
// (club, position, country, age). Each reel SPINS a fast vertical scroll of
// placeholder symbols, then LOCKS to the real clue with a "ka-chunk" bounce as
// clueSpring settles (reels lock left→right in sequence). Rows of light bulbs blink
// around the frame. The hero stands centre with a warm gold rim. Reveal flashes a
// "JACKPOT" banner + the player's name.
import React from "react";
import { AbsoluteFill, Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, rand, REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const RED = "#d11e2a";
const GOLD = "#ffcf3f";
const FELT = "#0a2a1e";
const ACCENT = GOLD;

const REEL_W = 244, REEL_H = 268, REEL_GAP = 26;
const SYMBOLS = ["7", "★", "♠", "♣", "♦", "♥", "$", "⊛"];

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// One blinking bulb. Phase staggered by index so the row chases around the frame.
const Bulb: React.FC<{ frame: number; idx: number; size?: number }> = ({ frame, idx, size = 18 }) => {
  // chase pattern: bulb is bright when (frame/3 + idx) hits its slot
  const phase = Math.floor(frame / 3 + idx) % 4;
  const on = phase === 0 || phase === 2;
  const lit = on ? 1 : 0.28;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: on
        ? "radial-gradient(circle at 38% 34%, #fff 0%, #fff3b0 35%, #ffcf3f 70%, #c98a09 100%)"
        : "radial-gradient(circle at 38% 34%, #6b5a1e 0%, #4a3d11 70%, #2a2208 100%)",
      boxShadow: on
        ? "0 0 10px 3px rgba(255,207,63,0.9), inset 0 0 4px rgba(255,255,255,0.8)"
        : "inset 0 1px 2px rgba(0,0,0,0.6)",
      opacity: lit,
    }} />
  );
};

// A frame of light bulbs (top + bottom rows, left + right columns) around a box.
const BulbFrame: React.FC<{ frame: number; w: number; h: number }> = ({ frame, w, h }) => {
  const nx = Math.max(2, Math.floor(w / 40));
  const ny = Math.max(2, Math.floor(h / 40));
  const bulbs: React.ReactNode[] = [];
  let k = 0;
  for (let i = 0; i < nx; i++) {
    const x = (i / (nx - 1)) * (w - 18);
    bulbs.push(<div key={`t${i}`} style={{ position: "absolute", left: x, top: -9 }}><Bulb frame={frame} idx={k++} /></div>);
    bulbs.push(<div key={`b${i}`} style={{ position: "absolute", left: x, bottom: -9 }}><Bulb frame={frame} idx={k++} /></div>);
  }
  for (let j = 1; j < ny - 1; j++) {
    const y = (j / (ny - 1)) * (h - 18);
    bulbs.push(<div key={`l${j}`} style={{ position: "absolute", top: y, left: -9 }}><Bulb frame={frame} idx={k++} /></div>);
    bulbs.push(<div key={`r${j}`} style={{ position: "absolute", top: y, right: -9 }}><Bulb frame={frame} idx={k++} /></div>);
  }
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}>{bulbs}</div>;
};

// A single reel window: spins placeholder symbols, then locks to `children` with a
// ka-chunk bounce. `appear` is the clueSpring (0→1); `reelIndex` seeds the symbols.
const Reel: React.FC<{
  frame: number; appear: number; reelIndex: number; label: string; children: React.ReactNode;
}> = ({ frame, appear, reelIndex, label, children }) => {
  // Locked once the spring has essentially settled.
  const locked = appear > 0.92;
  // Ka-chunk bounce: a tiny overshoot dip as it locks.
  const lockT = interpolate(appear, [0.55, 0.82, 0.95, 1], [0, 1, -0.5, 0], clampOpts);
  const bounceY = lockT * 16; // px
  // Spinning strip: fast vertical scroll while not locked.
  const spinSpeed = 46; // px per frame of placeholder motion
  const cell = 96;
  const strip = SYMBOLS.length;
  const totalH = strip * cell;
  const offset = ((frame * spinSpeed) % totalH);
  const spinOpacity = interpolate(appear, [0.7, 0.92], [1, 0], clampOpts);
  const valueOpacity = interpolate(appear, [0.78, 0.95], [0, 1], clampOpts);
  const valueScale = interpolate(appear, [0.78, 0.95, 1], [0.5, 1.12, 1], clampOpts);

  return (
    <div style={{ position: "relative", width: REEL_W, transform: `translateY(${bounceY}px)` }}>
      {/* chrome/gold window bezel */}
      <div style={{
        position: "relative", width: REEL_W, height: REEL_H, borderRadius: 18,
        background: "linear-gradient(180deg, #fff6d0 0%, #ffcf3f 18%, #c98a09 50%, #8a5c05 82%, #ffcf3f 100%)",
        padding: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.55), inset 0 2px 4px rgba(255,255,255,0.7)",
      }}>
        {/* inner dark glass window */}
        <div style={{
          position: "relative", width: "100%", height: "100%", borderRadius: 10, overflow: "hidden",
          background: "linear-gradient(180deg, #06140f 0%, #0e2a1f 50%, #06140f 100%)",
          boxShadow: "inset 0 0 26px rgba(0,0,0,0.85)",
        }}>
          {/* spinning placeholder strip */}
          {spinOpacity > 0.01 && (
            <div style={{ position: "absolute", inset: 0, opacity: spinOpacity }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: -offset }}>
                {[...SYMBOLS, ...SYMBOLS, ...SYMBOLS].map((s, n) => {
                  const sym = SYMBOLS[(n + reelIndex) % SYMBOLS.length];
                  return (
                    <div key={n} style={{
                      height: cell, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: COND, fontWeight: 900, fontSize: 88,
                      color: sym === "7" ? RED : GOLD,
                      textShadow: "0 2px 6px rgba(0,0,0,0.7)",
                    }}>{sym}</div>
                  );
                })}
              </div>
              {/* vertical motion-blur gradient */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(180deg, rgba(6,20,15,0.95) 0%, rgba(6,20,15,0) 24%, rgba(6,20,15,0) 76%, rgba(6,20,15,0.95) 100%)",
              }} />
            </div>
          )}

          {/* locked value */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            opacity: valueOpacity, transform: `scale(${valueScale})`,
          }}>
            {children}
          </div>

          {/* glass sheen + centre payline */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 30%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 3, transform: "translateY(-1.5px)", background: locked ? "rgba(255,207,63,0.55)" : "rgba(209,30,42,0.55)", boxShadow: locked ? "0 0 8px rgba(255,207,63,0.8)" : "none" }} />
        </div>

        <BulbFrame frame={frame} w={REEL_W} h={REEL_H} />
      </div>

      {/* reel label plate */}
      <div style={{
        marginTop: 16, textAlign: "center", fontFamily: COND, fontWeight: 800, fontSize: 28,
        letterSpacing: "0.16em", color: GOLD, textShadow: "0 2px 4px rgba(0,0,0,0.8)",
      }}>{label}</div>
    </div>
  );
};

export const SlotMachine: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, uiOpacity, secs, timerRemain } = p;

  // JACKPOT reveal flash: blink bright while revealing.
  const jackpot = frame >= REVEAL_START;
  const flashOn = jackpot && Math.floor(frame / 4) % 2 === 0;
  const jackpotIn = interpolate(rp, [0.05, 0.3], [0, 1], clampOpts);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 80% at 50% 60%, ${FELT} 0%, #04130d 60%, #020a07 100%)` }}>
      {/* felt vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 50% 66%, rgba(0,0,0,0.35), rgba(0,0,0,0) 72%)" }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(255,207,63,0.5)" />

      {/* cabinet marquee header */}
      <div style={{
        position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)", zIndex: 42,
        padding: "10px 54px", borderRadius: 16,
        background: `linear-gradient(180deg, ${RED} 0%, #8c0f18 100%)`,
        border: `4px solid ${GOLD}`,
        boxShadow: "0 14px 34px rgba(0,0,0,0.55), inset 0 2px 4px rgba(255,255,255,0.3)",
      }}>
        <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 52, letterSpacing: "0.18em", color: GOLD, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}>
          LUCKY XI
        </div>
        <BulbFrame frame={frame} w={360} h={84} />
      </div>

      {/* reel row */}
      <div style={{ position: "absolute", top: 178, left: "50%", transform: "translateX(-50%)", display: "flex", gap: REEL_GAP, zIndex: 40 }}>
        <Reel frame={frame} appear={clueSpring(frame, 0)} reelIndex={0} label={clueLabel("club", language)}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: "78%", maxHeight: 150, objectFit: "contain", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }} />
            : <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 120, color: GOLD }}>?</span>}
        </Reel>

        <Reel frame={frame} appear={clueSpring(frame, 1)} reelIndex={3} label={clueLabel("position", language)}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 132, color: "#fff", textShadow: `0 0 18px ${GOLD}, 0 4px 12px rgba(0,0,0,0.7)` }}>
            {translatePosition(level.position, language)}
          </span>
        </Reel>

        <Reel frame={frame} appear={clueSpring(frame, 2)} reelIndex={5} label={clueLabel("country", language)}>
          {p.flagSrc
            ? <Img src={p.flagSrc} style={{ width: 184, height: 122, objectFit: "cover", borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.6)", border: `2px solid ${GOLD}` }} />
            : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 40, color: "#fff", textAlign: "center" }}>{level.country}</span>}
        </Reel>

        <Reel frame={frame} appear={clueSpring(frame, 3)} reelIndex={7} label={ageUnit(level.age, language)}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 150, color: "#fff", textShadow: `0 0 18px ${GOLD}, 0 4px 12px rgba(0,0,0,0.7)` }}>
            {level.age ?? "?"}
          </span>
        </Reel>
      </div>

      {/* JACKPOT banner on reveal */}
      {jackpotIn > 0.01 && (
        <div style={{
          position: "absolute", top: 132, left: "50%",
          transform: `translateX(-50%) scale(${interpolate(jackpotIn, [0, 1], [0.6, 1])})`,
          zIndex: 55, opacity: jackpotIn,
          fontFamily: COND, fontWeight: 900, fontSize: 120, letterSpacing: "0.06em",
          color: flashOn ? GOLD : "#fff",
          WebkitTextStroke: `5px ${RED}`, paintOrder: "stroke",
          textShadow: flashOn ? "0 0 34px rgba(255,207,63,0.95), 0 8px 24px rgba(0,0,0,0.8)" : "0 8px 24px rgba(0,0,0,0.8)",
        }}>
          JACKPOT
        </div>
      )}

      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={GOLD} />

      {/* level badge — casino chip */}
      <div style={{
        position: "absolute", top: 40, left: 44, zIndex: 60, width: 118, height: 118, borderRadius: "50%",
        opacity: uiOpacity,
        background: `radial-gradient(circle at 50% 34%, #ff5a64 0%, ${RED} 58%, #7a0c14 100%)`,
        border: `6px dashed ${GOLD}`,
        boxShadow: "0 12px 28px rgba(0,0,0,0.55), inset 0 0 0 4px rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: COND, fontWeight: 900, fontSize: 64, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.7)",
      }}>{p.levelNumber}</div>

      {/* timer ring */}
      <div style={{ position: "absolute", top: 40, right: 44, zIndex: 60, width: 122, height: 122, opacity: uiOpacity }}>
        <svg width={122} height={122}>
          <circle cx={61} cy={61} r={50} fill="rgba(6,20,15,0.8)" stroke="rgba(255,207,63,0.22)" strokeWidth={11} />
          <circle cx={61} cy={61} r={50} fill="none" stroke={timerRemain < 0.18 ? RED : GOLD} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - timerRemain)} transform="rotate(-90 61 61)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 900, fontSize: 58, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
