import React, { useLayoutEffect } from "react";
import { AbsoluteFill } from "remotion";
import type { BgTheme } from "./props";

interface BackgroundThemeProps {
  bgTheme?: BgTheme | null;
}

export const BackgroundTheme: React.FC<BackgroundThemeProps> = ({ bgTheme }) => {
  // Apply root attributes and CSS vars on every render (layout effect = synchronous,
  // before paint) so the captured CSS selectors match immediately.
  useLayoutEffect(() => {
    if (!bgTheme) return;
    const root = document.documentElement;
    if (bgTheme.colorAttr) root.setAttribute("data-shared-background-color", bgTheme.colorAttr);
    if (bgTheme.effectAttr) root.setAttribute("data-shared-background-effect", bgTheme.effectAttr);
    if (bgTheme.bgStage) root.style.setProperty("--bg-stage", bgTheme.bgStage);
    if (bgTheme.lineOpacity) root.style.setProperty("--shared-line-opacity", bgTheme.lineOpacity);
    if (bgTheme.effectOpacity) root.style.setProperty("--shared-effect-opacity", bgTheme.effectOpacity);
  });

  if (!bgTheme) {
    // Fallback: old placeholder gradient for the sample-less case.
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(to bottom, #0b1622 0%, #142436 100%)",
        }}
      />
    );
  }

  // Build the base layer style: use the exact computed background captured from the
  // live app body (resolved gradient + pattern) when available. This ensures competition
  // themes (diagonal gradient + stripe pattern) render correctly even though the body's
  // CSS rules are hidden behind this opaque full-bleed layer.
  // TODO: palette ::before/::after effects hidden behind base layer; reproduce as real layers later.
  const c = bgTheme.computed;
  const baseStyle: React.CSSProperties =
    c && c.backgroundImage && c.backgroundImage !== "none"
      ? {
          backgroundColor: c.backgroundColor || bgTheme.bgStage || "#0b1622",
          backgroundImage: c.backgroundImage,
          backgroundSize: c.backgroundSize || "100% 100%",
          backgroundRepeat: c.backgroundRepeat || "no-repeat",
          backgroundPosition: c.backgroundPosition || "center",
        }
      : { backgroundColor: bgTheme.bgStage || "#0b1622" };

  return (
    <>
      {/* Base fill: paints the computed gradient/pattern directly so competition themes
          show correctly (flat bgStage was hiding the gradient behind this layer). */}
      <AbsoluteFill style={{ ...baseStyle, zIndex: 0 }} />

      {/* The captured CSS: targets `body` which is the Remotion render root.
          Includes the `:root[attr][attr] body { background: ... }` rule + keyframes
          + ::before/::after overlays. */}
      {bgTheme.css ? <style>{bgTheme.css}</style> : null}

      {/* Particle containers (emoji / question-marks / soccer-balls).
          Competition themes have none; palette effects may have them. */}
      {bgTheme.particlesHtml.map((html, idx) => (
        <div
          key={idx}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
        />
      ))}
    </>
  );
};
