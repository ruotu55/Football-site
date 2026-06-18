// Template 4 — "Holo Vault".
// A futuristic neon hologram capsule. The hidden player floats as a cyan
// hologram with scanlines; four neon HUD panels light up one by one; a scan bar
// sweeps the figure. On reveal the hologram glitches and resolves to the real
// colour photo with a neon name plate.
import React from "react";
import { Img, interpolate } from "remotion";
import { fontFamily } from "@shared/theme";
import {
  clueSpring, translatePosition, ageUnit, clueLabel, nameParts,
  silhouetteOpacity, colorOpacity, rand,
  REVEAL_START, type TemplateProps,
} from "./common";

const COND = "'Barlow Condensed', sans-serif";
const CY = "#27e6ff";
const MG = "#ff3df0";

const HOLO_FILTER =
  "brightness(0) saturate(100%) invert(72%) sepia(60%) saturate(2200%) hue-rotate(140deg) brightness(1.15) " +
  "drop-shadow(0 0 18px rgba(39,230,255,0.85)) drop-shadow(0 0 40px rgba(39,230,255,0.4))";

const CAP = { x: 960, y: 540, w: 440, h: 660 };
const PANELS = [
  { x: 520, y: 392 },  // club
  { x: 520, y: 700 },  // position
  { x: 1400, y: 392 }, // country
  { x: 1400, y: 700 }, // age
] as const;

const HudPanel: React.FC<{ at: typeof PANELS[number]; appear: number; label: string; accent: string; children: React.ReactNode }> = ({ at, appear, label, accent, children }) => {
  const t = Math.min(1, Math.max(0, appear));
  return (
    <div style={{
      position: "absolute", left: at.x, top: at.y, width: 270, height: 200,
      transform: `translate(-50%,-50%) scale(${0.7 + t * 0.3})`, opacity: t,
    }}>
      {/* hex frame */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: "polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%)",
        background: "linear-gradient(160deg, rgba(10,30,44,0.78), rgba(6,16,26,0.72))",
        border: `2px solid ${accent}`,
        boxShadow: `0 0 26px ${accent}66, inset 0 0 24px ${accent}22`,
      }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 24, letterSpacing: "0.24em", color: accent, textShadow: `0 0 10px ${accent}` }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 96 }}>{children}</div>
      </div>
    </div>
  );
};

export const HoloVault: React.FC<TemplateProps> = (p) => {
  const { level, language, frame, revealProgress: rp, secs, timerRemain, uiOpacity } = p;
  const sOp = silhouetteOpacity(rp);
  const cOp = colorOpacity(rp);
  const { first, last } = nameParts(level.playerName, level.display);

  const revF = frame - REVEAL_START;
  // glitch jitter during the cross-fade
  const glitching = rp > 0 && rp < 0.6;
  const jx = glitching ? (rand(revF) - 0.5) * 18 : 0;
  const namePlate = interpolate(rp, [0.3, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scanY = (frame * 2.4) % 100;
  const float = Math.sin(frame * 0.05) * 10;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily }}>
      {/* perspective grid floor */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: 0.4 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const x = (i - 7.5) * 240;
          return <line key={`v${i}`} x1={960 + x} y1={720} x2={960 + x * 5} y2={1120} stroke={CY} strokeWidth={1.5} opacity={0.35} />;
        })}
        {Array.from({ length: 9 }, (_, i) => {
          const y = 720 + Math.pow(i / 8, 2) * 360;
          const sweep = ((frame * 0.4 + i * 2) % 9);
          return <line key={`h${i}`} x1={0} y1={y} x2={1920} y2={y} stroke={CY} strokeWidth={1.5} opacity={0.12 + (i === Math.round(sweep) ? 0.3 : 0)} />;
        })}
      </svg>
      {/* rising neon particles */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = rand(i + 4) * 1920;
        const y = (1080 - (frame * (1 + rand(i) * 2) + rand(i + 9) * 1080) % 1180);
        return <div key={`pt${i}`} style={{ position: "absolute", left: x, top: y, width: 4, height: 4, borderRadius: "50%", background: i % 3 ? CY : MG, opacity: 0.6, boxShadow: `0 0 8px ${i % 3 ? CY : MG}` }} />;
      })}

      {/* capsule */}
      <div style={{
        position: "absolute", left: CAP.x, top: CAP.y, width: CAP.w, height: CAP.h,
        transform: `translate(-50%,-50%)`,
      }}>
        {/* glass tube */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50% / 8%",
          background: "linear-gradient(180deg, rgba(39,230,255,0.06), rgba(39,230,255,0.02))",
          border: `2px solid rgba(39,230,255,0.35)`,
          boxShadow: `0 0 50px rgba(39,230,255,0.25), inset 0 0 60px rgba(39,230,255,0.12)`,
        }} />
        {/* base ring */}
        <div style={{ position: "absolute", left: "50%", bottom: -24, transform: "translateX(-50%)", width: CAP.w * 1.05, height: 46, borderRadius: "50%", background: "radial-gradient(circle, rgba(39,230,255,0.5), transparent 70%)" }} />
        {/* figure */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", transform: `translate(${jx}px, ${float}px)` }}>
          {p.photoSrc ? (
            <>
              <Img src={p.photoSrc} style={{ position: "absolute", bottom: 18, maxHeight: "92%", maxWidth: "86%", objectFit: "contain", filter: HOLO_FILTER, opacity: sOp }} />
              <Img src={p.photoSrc} style={{ position: "absolute", bottom: 18, maxHeight: "92%", maxWidth: "86%", objectFit: "contain", opacity: cOp, filter: "drop-shadow(0 8px 22px rgba(0,0,0,0.5))" }} />
            </>
          ) : (
            <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 300, color: "rgba(39,230,255,0.3)", opacity: sOp, alignSelf: "center", textShadow: `0 0 30px ${CY}` }}>?</span>
          )}
          {/* hologram scanlines overlay */}
          <div style={{ position: "absolute", inset: 0, opacity: sOp * 0.6, background: "repeating-linear-gradient(0deg, rgba(39,230,255,0.0) 0px, rgba(39,230,255,0.18) 2px, rgba(39,230,255,0.0) 4px)", mixBlendMode: "screen" }} />
          {/* sweep bar */}
          <div style={{ position: "absolute", left: 0, right: 0, top: `${scanY}%`, height: 8, background: "linear-gradient(90deg,transparent,rgba(39,230,255,0.7),transparent)", opacity: sOp, boxShadow: `0 0 18px ${CY}` }} />
        </div>
      </div>

      {/* HUD panels */}
      <HudPanel at={PANELS[0]} appear={clueSpring(frame, 0)} label={clueLabel("club", language)} accent={CY}>
        {p.clubSrc ? <Img src={p.clubSrc} style={{ maxHeight: 84, maxWidth: 100, objectFit: "contain", filter: `drop-shadow(0 0 10px ${CY}88)` }} /> : <span style={{ fontSize: 40, color: CY }}>?</span>}
      </HudPanel>
      <HudPanel at={PANELS[1]} appear={clueSpring(frame, 1)} label={clueLabel("position", language)} accent={MG}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 58, color: "#fff", textShadow: `0 0 14px ${MG}` }}>{translatePosition(level.position, language)}</span>
      </HudPanel>
      <HudPanel at={PANELS[2]} appear={clueSpring(frame, 2)} label={clueLabel("country", language)} accent={CY}>
        {p.flagSrc ? <Img src={p.flagSrc} style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 4, boxShadow: `0 0 14px ${CY}88` }} /> : <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 26, color: "#fff" }}>{level.country}</span>}
      </HudPanel>
      <HudPanel at={PANELS[3]} appear={clueSpring(frame, 3)} label={ageUnit(level.age, language)} accent={MG}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 62, color: "#fff", textShadow: `0 0 14px ${MG}` }}>{level.age ?? "?"}</span>
      </HudPanel>

      {/* neon name plate on reveal */}
      <div style={{
        position: "absolute", left: "50%", bottom: 64, transform: `translateX(-50%) scale(${0.8 + namePlate * 0.2})`,
        opacity: namePlate, textAlign: "center",
        padding: "12px 46px", borderRadius: 12,
        background: "linear-gradient(180deg, rgba(8,20,30,0.85), rgba(4,12,20,0.85))",
        border: `2px solid ${CY}`, boxShadow: `0 0 30px ${CY}66, inset 0 0 18px ${CY}22`,
      }}>
        {first ? <div style={{ fontFamily: COND, fontWeight: 600, fontSize: 32, letterSpacing: "0.16em", color: CY, textShadow: `0 0 12px ${CY}` }}>{first}</div> : null}
        <div style={{ fontFamily: COND, fontWeight: 900, fontSize: 76, lineHeight: 0.92, color: "#fff", textShadow: `0 0 18px ${CY}, 0 0 40px ${MG}55` }}>{last}</div>
      </div>

      {/* timer — neon ring (top-right) */}
      <div style={{ position: "absolute", top: 44, right: 56, opacity: uiOpacity, width: 130, height: 130 }}>
        <svg width={130} height={130}>
          <circle cx={65} cy={65} r={54} fill="rgba(6,16,26,0.7)" stroke={`${CY}40`} strokeWidth={8} />
          <circle cx={65} cy={65} r={54} fill="none" stroke={timerRemain < 0.18 ? MG : CY} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 54} strokeDashoffset={2 * Math.PI * 54 * (1 - timerRemain)} transform="rotate(-90 65 65)"
            style={{ filter: `drop-shadow(0 0 8px ${CY})` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COND, fontWeight: 800, fontSize: 62, color: "#fff", textShadow: `0 0 12px ${CY}` }}>{secs}</div>
      </div>

      {/* level badge (top-left) */}
      <div style={{
        position: "absolute", top: 48, left: 56, opacity: uiOpacity, width: 116, height: 116,
        clipPath: "polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%)",
        background: "linear-gradient(160deg, rgba(10,30,44,0.85), rgba(6,16,26,0.8))",
        border: `2px solid ${CY}`, boxShadow: `0 0 24px ${CY}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: COND, fontWeight: 800, fontSize: 64, color: "#fff", textShadow: `0 0 12px ${CY}`,
      }}>{p.levelNumber}</div>
    </div>
  );
};
