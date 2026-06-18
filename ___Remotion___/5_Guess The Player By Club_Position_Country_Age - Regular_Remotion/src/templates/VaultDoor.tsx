// Template — "Vault / Heist".
// A heavy bank-vault chamber in brushed steel + gold. The four clues sit on
// circular combination DIALS: each dial ring rotates and its needle swings to
// settle on the clue value (driven by clueSpring, with a mechanical wobble);
// the value reads BIG in the dial centre. Steel rivets ring every panel.
// The hero stands in a lit vault chamber (gold rim). SIGNATURE MOMENT: on reveal
// a heavy circular vault DOOR (steel disc + spoked locking wheel) splits into two
// leaves that slide apart (driven by revealProgress) to expose the player, then the
// name lands on a stamped gold nameplate.
import React from "react";
import { AbsoluteFill, Img, interpolate, Easing } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel,
  HeroPlayer, RevealName, rand, REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', " + fontFamily;
const ACCENT = "#e8b54a";       // gold
const STEEL = "#8a95a3";        // brushed steel
const GUNMETAL = "#1c2128";     // dark gunmetal
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Brushed-steel surface (vertical hairline streaks via repeating gradient).
const brushedSteel = (a: string, b: string) =>
  `repeating-linear-gradient(95deg, ${a} 0px, ${b} 2px, ${a} 4px), ` +
  `linear-gradient(160deg, ${a}, ${b})`;

// A ring of bolt/rivet heads around a circle of radius `r`.
const Rivets: React.FC<{ count: number; r: number; size?: number; color?: string }> = ({
  count, r, size = 14, color = "#cfd6de",
}) => (
  <>
    {Array.from({ length: count }).map((_, i) => {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      return (
        <div key={i} style={{
          position: "absolute", left: "50%", top: "50%", width: size, height: size, borderRadius: "50%",
          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
          background: `radial-gradient(circle at 35% 30%, #f3f6f9, ${color} 55%, #5b6470 100%)`,
          boxShadow: "inset 0 0 2px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
        }} />
      );
    })}
  </>
);

// ── Combination dial ────────────────────────────────────────────────────────────
// The graduated ring rotates into place; a gold needle swings to the value; the
// value reads BIG in the centre. `appear` (0→~1.1) drives the mechanical settle.
const DIAL = 256;
const Dial: React.FC<{ appear: number; label: string; seed: number; children: React.ReactNode }> = ({
  appear, label, seed, children,
}) => {
  const t = Math.min(1.12, Math.max(0, appear));
  const op = interpolate(appear, [0, 0.22], [0, 1], clamp);
  // Ring over-rotates then settles (clueSpring already overshoots a touch).
  const ringRot = interpolate(t, [0, 1], [-150 - rand(seed) * 60, 0]);
  const needleRot = interpolate(t, [0, 1], [200, 0]) + interpolate(t, [0.7, 1], [10, 0], clamp);
  const ticks = 24;
  return (
    <div style={{ width: DIAL, height: DIAL, position: "relative", opacity: op }}>
      {/* outer steel housing */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: brushedSteel("#9aa4b1", "#5c656f"),
        boxShadow: "0 18px 40px rgba(0,0,0,0.55), inset 0 2px 4px rgba(255,255,255,0.25), inset 0 -4px 10px rgba(0,0,0,0.6)",
      }} />
      <Rivets count={8} r={DIAL / 2 - 16} size={13} />
      {/* graduated rotating ring */}
      <div style={{
        position: "absolute", inset: 26, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 38%, #2b313a, ${GUNMETAL} 70%, #0d1014)`,
        border: `3px solid ${ACCENT}`,
        boxShadow: `inset 0 0 28px rgba(0,0,0,0.85), 0 0 0 2px rgba(0,0,0,0.5)`,
        transform: `rotate(${ringRot}deg)`,
      }}>
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * Math.PI * 2;
          const major = i % 6 === 0;
          const rr = DIAL / 2 - 38;
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          return (
            <div key={i} style={{
              position: "absolute", left: "50%", top: "50%",
              width: major ? 5 : 3, height: major ? 18 : 10, borderRadius: 2,
              background: major ? ACCENT : "rgba(207,214,222,0.7)",
              transform: `translate(-50%,-50%) translate(${x}px, ${y}px) rotate(${(a * 180) / Math.PI + 90}deg)`,
            }} />
          );
        })}
      </div>
      {/* fixed top index marker (where the needle points) */}
      <div style={{
        position: "absolute", left: "50%", top: 18, width: 0, height: 0, transform: "translateX(-50%)",
        borderLeft: "10px solid transparent", borderRight: "10px solid transparent",
        borderTop: `16px solid ${ACCENT}`, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))", zIndex: 5,
      }} />
      {/* swinging needle */}
      <div style={{
        position: "absolute", left: "50%", top: "50%", width: 8, height: DIAL / 2 - 40,
        transformOrigin: "50% 100%", transform: `translate(-50%,-100%) rotate(${needleRot}deg)`,
        background: `linear-gradient(to top, #6b5320, ${ACCENT})`, borderRadius: 4,
        boxShadow: "0 0 8px rgba(232,181,74,0.6)", zIndex: 4,
      }} />
      {/* centre value cap (BIG) */}
      <div style={{
        position: "absolute", inset: DIAL * 0.27, borderRadius: "50%",
        background: brushedSteel("#aeb7c2", "#6c7681"),
        border: "3px solid rgba(0,0,0,0.4)",
        boxShadow: "inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6, overflow: "hidden",
      }}>{children}</div>
      {/* label plate under the dial */}
      <div style={{
        position: "absolute", left: "50%", bottom: -34, transform: "translateX(-50%)",
        fontFamily: COND, fontWeight: 800, fontSize: 26, letterSpacing: "0.2em", color: ACCENT,
        textShadow: "0 2px 4px rgba(0,0,0,0.7)", whiteSpace: "nowrap",
      }}>{label}</div>
    </div>
  );
};

export const VaultDoor: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, levelNumber, uiOpacity } = p;

  // Vault-door leaves slide apart on reveal.
  const doorOpen = interpolate(rp, [0.0, 0.55], [0, 1], { easing: Easing.inOut(Easing.cubic), ...clamp });
  const leafShift = interpolate(doorOpen, [0, 1], [0, 1180]); // px each leaf travels
  const wheelSpin = interpolate(rp, [0, 0.35], [0, 220], clamp); // unlock spin before slide
  // Door looms (slightly pre-reveal a heavy disc covers the chamber centre).
  const doorVisible = rp < 0.62;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 80% at 50% 46%, #2a313b, ${GUNMETAL} 64%, #0c0f13)` }}>
      {/* steel back wall plates */}
      <AbsoluteFill style={{ background: brushedSteel("#222831", "#171c22"), opacity: 0.55 }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 50% 55% at 50% 60%, rgba(232,181,74,0.10), rgba(0,0,0,0) 60%)" }} />

      {/* lit vault chamber: warm pool of light behind the hero */}
      <div style={{
        position: "absolute", left: "50%", bottom: 0, width: 760, height: 760, transform: "translateX(-50%)",
        background: "radial-gradient(ellipse 60% 50% at 50% 70%, rgba(232,181,74,0.28), rgba(0,0,0,0) 72%)",
        zIndex: 5,
      }} />

      <HeroPlayer photoSrc={p.photoSrc} revealProgress={rp} rimColor="rgba(232,181,74,0.55)" />

      {/* ── two-per-side combination dials, clear of the centred hero ── */}
      <div style={{ position: "absolute", top: 92, left: 70, display: "flex", flexDirection: "column", gap: 96, zIndex: 40 }}>
        <Dial appear={clueSpring(frame, 0)} label={clueLabel("club", language)} seed={11}>
          {p.clubSrc
            ? <Img src={p.clubSrc} style={{ maxWidth: "84%", maxHeight: "84%", objectFit: "contain", filter: "drop-shadow(0 3px 7px rgba(0,0,0,0.6))" }} />
            : <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 84, color: "#fff" }}>?</span>}
        </Dial>
        <Dial appear={clueSpring(frame, 1)} label={clueLabel("position", language)} seed={23}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 96, color: "#11161c", textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}>{translatePosition(level.position, language)}</span>
        </Dial>
      </div>

      <div style={{ position: "absolute", top: 92, right: 70, display: "flex", flexDirection: "column", gap: 96, zIndex: 40 }}>
        <Dial appear={clueSpring(frame, 2)} label={clueLabel("country", language)} seed={37}>
          {p.flagSrc
            ? <Img src={p.flagSrc} style={{ width: "78%", height: "54%", objectFit: "cover", borderRadius: 6, boxShadow: "0 3px 9px rgba(0,0,0,0.6)" }} />
            : <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 30, color: "#11161c" }}>{level.country}</span>}
        </Dial>
        <Dial appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)} seed={49}>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 104, color: "#11161c", textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}>{level.age ?? "?"}</span>
        </Dial>
      </div>

      {/* ── SIGNATURE: heavy circular vault door split into two leaves ── */}
      {doorVisible && (
        <div style={{ position: "absolute", inset: 0, zIndex: 45, pointerEvents: "none", overflow: "hidden" }}>
          {[-1, 1].map((dir) => (
            <div key={dir} style={{
              position: "absolute", top: 0, bottom: 0,
              left: dir === -1 ? 0 : "50%", right: dir === -1 ? "50%" : 0,
              transform: `translateX(${dir * leafShift}px)`,
              overflow: "hidden",
            }}>
              {/* leaf face: brushed steel slab with edge bevel */}
              <div style={{
                position: "absolute", inset: 0,
                background: brushedSteel("#7e8893", "#3c434c"),
                boxShadow: dir === -1
                  ? "inset -14px 0 30px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.4)"
                  : "inset 14px 0 30px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.4)",
                borderRight: dir === -1 ? "4px solid #11151b" : undefined,
                borderLeft: dir === 1 ? "4px solid #11151b" : undefined,
              }} />
              {/* rivet columns near the seam */}
              <div style={{ position: "absolute", top: 0, bottom: 0, [dir === -1 ? "right" : "left"]: 34, width: 0 } as React.CSSProperties}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} style={{
                    position: "absolute", top: `${8 + i * 11}%`, left: 0, width: 18, height: 18, borderRadius: "50%",
                    transform: "translateX(-50%)",
                    background: "radial-gradient(circle at 35% 30%, #f3f6f9, #c2cad3 55%, #5b6470 100%)",
                    boxShadow: "inset 0 0 2px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
                  }} />
                ))}
              </div>
            </div>
          ))}

          {/* central spoked locking wheel (sits on the seam, spins then parts with leaves) */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            transform: `translate(-50%,-50%) scale(${interpolate(doorOpen, [0, 1], [1, 0.55], clamp)})`,
            opacity: interpolate(doorOpen, [0.35, 0.85], [1, 0], clamp),
          }}>
            <div style={{ width: 360, height: 360, position: "relative", transform: `rotate(${wheelSpin}deg)` }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: `radial-gradient(circle at 42% 36%, #aeb7c2, ${STEEL} 55%, #4a525c 100%)`,
                border: `8px solid ${ACCENT}`,
                boxShadow: "0 14px 40px rgba(0,0,0,0.6), inset 0 0 40px rgba(0,0,0,0.55)",
              }} />
              <Rivets count={12} r={150} size={16} />
              {/* spokes */}
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{
                  position: "absolute", left: "50%", top: "50%", width: 34, height: 320, borderRadius: 14,
                  transformOrigin: "50% 50%",
                  transform: `translate(-50%,-50%) rotate(${(i / 5) * 360}deg)`,
                  background: `linear-gradient(90deg, #5b636e, ${STEEL} 45%, #c7ced6 50%, ${STEEL} 55%, #4d555f)`,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.55)",
                }} />
              ))}
              {/* hub cap */}
              <div style={{
                position: "absolute", left: "50%", top: "50%", width: 110, height: 110, borderRadius: "50%",
                transform: "translate(-50%,-50%)",
                background: `radial-gradient(circle at 40% 34%, #f2d488, ${ACCENT} 58%, #8a6312)`,
                border: "5px solid #2a2010",
                boxShadow: "inset 0 2px 6px rgba(255,255,255,0.5), 0 4px 10px rgba(0,0,0,0.6)",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* stamped gold nameplate */}
      <RevealName playerName={level.playerName} display={level.display} revealProgress={rp} accent={ACCENT} />

      {/* ── level badge: rivet-ringed steel medallion ── */}
      <div style={{ position: "absolute", top: 40, left: 44, zIndex: 60, width: 122, height: 122, opacity: uiOpacity }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: brushedSteel("#aeb7c2", "#6c7681"),
          border: `4px solid ${ACCENT}`,
          boxShadow: "0 12px 28px rgba(0,0,0,0.55), inset 0 2px 5px rgba(255,255,255,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: COND, fontWeight: 900, fontSize: 66, color: GUNMETAL, textShadow: "0 1px 0 rgba(255,255,255,0.4)",
        }}>{levelNumber}</div>
        <Rivets count={8} r={54} size={9} />
      </div>

      {/* ── timer: gauge dial ── */}
      <div style={{ position: "absolute", top: 40, right: 44, zIndex: 60, width: 126, height: 126, opacity: uiOpacity }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: brushedSteel("#9aa4b1", "#5c656f"),
          boxShadow: "0 12px 28px rgba(0,0,0,0.55), inset 0 2px 5px rgba(255,255,255,0.3)",
        }} />
        <Rivets count={8} r={56} size={9} />
        <svg width={126} height={126} style={{ position: "absolute", inset: 0 }}>
          <circle cx={63} cy={63} r={46} fill="rgba(12,15,19,0.85)" stroke="rgba(0,0,0,0.5)" strokeWidth={10} />
          <circle cx={63} cy={63} r={46} fill="none" stroke={timerRemain < 0.18 ? "#ff4136" : ACCENT} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 46} strokeDashoffset={2 * Math.PI * 46 * (1 - timerRemain)} transform="rotate(-90 63 63)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 900, fontSize: 58, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}>{secs}</div>
      </div>
    </AbsoluteFill>
  );
};
