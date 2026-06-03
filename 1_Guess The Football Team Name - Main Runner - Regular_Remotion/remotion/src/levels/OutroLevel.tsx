import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { msToFrames } from "../timeline";
import { assetUrl } from "../assets";
import type { RemotionLevel } from "../props";

// Outro text from app's i18n.js TRANSLATIONS map.
// endingType: "think-you-know" | "how-many"
// language:   "english" | "spanish"
const OUTRO_TEXTS: Record<string, Record<string, { title: string; subtitle: string }>> = {
  english: {
    "think-you-know": {
      title: "THINK YOU KNOW THE ANSWER?",
      subtitle: "LET US KNOW IN THE COMMENTS!",
    },
    "how-many": {
      title: "HOW MANY DID YOU GET?",
      subtitle: "LET US KNOW IN THE COMMENTS!",
    },
  },
  spanish: {
    "think-you-know": {
      title: "¿CREES SABER LA RESPUESTA?",
      subtitle: "¡DÍNOSLO EN LOS COMENTARIOS!",
    },
    "how-many": {
      title: "¿CUÁNTAS ACERTASTE?",
      subtitle: "¡DÍNOSLO EN LOS COMENTARIOS!",
    },
  },
};

interface OutroLevelProps {
  level?: RemotionLevel;
  endingType?: "think-you-know" | "how-many";
  language?: string;
  assetBase: string;
}

const FONT_FAMILY = '"Barlow Condensed", "Arial Black", sans-serif';

export const OutroLevel: React.FC<OutroLevelProps> = ({
  endingType = "think-you-know",
  language = "english",
  assetBase,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lang = language === "spanish" ? "spanish" : "english";
  const type = endingType === "how-many" ? "how-many" : "think-you-know";
  const tx = OUTRO_TEXTS[lang][type];

  // Logo source (language-aware — the app has English/Spanish logo variants)
  const logoFile =
    lang === "spanish"
      ? "Images/Logo/Football Quiz Logo Spanish.png"
      : "Images/Logo/Football Quiz Logo English.png";
  const logoSrc = assetUrl(logoFile, assetBase);
  const likeSrc = assetUrl("Images/Emojis/like.png", assetBase);
  const subscribeSrc = assetUrl("Images/Emojis/Subscribe.png", assetBase);

  // Like/subscribe icons: app uses pop-in-left/right animations starting at
  // animation-delay 2.7s / 3.0s. Reproduce with interpolate.
  const likeDelay = msToFrames(2700, fps);
  const likeEnd = likeDelay + msToFrames(800, fps);
  const subDelay = msToFrames(3000, fps);
  const subEnd = subDelay + msToFrames(800, fps);

  const likeOpacity = interpolate(frame, [likeDelay, likeEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const likeScale = interpolate(frame, [likeDelay, likeEnd], [0.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subOpacity = interpolate(frame, [subDelay, subEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subScale = interpolate(frame, [subDelay, subEnd], [0.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Top row: like + logo + subscribe — matches .outro-top-row layout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 72,
          width: "100%",
          maxWidth: 2160,
          marginBottom: 24,
        }}
      >
        {/* Like emoji */}
        <Img
          src={likeSrc}
          style={{
            width: 240,
            height: "auto",
            objectFit: "contain",
            opacity: likeOpacity,
            transform: `translateX(${interpolate(frame, [likeDelay, likeEnd], [-120, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px) scale(${likeScale}) rotate(-8deg)`,
            filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
          }}
        />

        {/* Logo image — static, always visible (app has opacity:1 for outro logo) */}
        <Img
          src={logoSrc}
          style={{
            width: 1000, // ~78% of ~1280 effective width; matches outro.html inline style
            height: "auto",
            objectFit: "contain",
            opacity: 1,
          }}
        />

        {/* Subscribe emoji */}
        <Img
          src={subscribeSrc}
          style={{
            width: 240,
            height: "auto",
            objectFit: "contain",
            opacity: subOpacity,
            transform: `translateX(${interpolate(frame, [subDelay, subEnd], [120, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px) scale(${subScale}) rotate(8deg)`,
            filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
            marginLeft: 36,
          }}
        />
      </div>

      {/* Outro title — e.g. "HOW MANY DID YOU GET?" */}
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 148,
          fontWeight: 800,
          textAlign: "center",
          textTransform: "uppercase",
          color: "#ffffff",
          textShadow: "0 4px 15px rgba(0,0,0,0.8)",
          marginTop: 48,
          transform: "translateY(-10vh)",
          lineHeight: 1,
        }}
      >
        {tx.title}
      </div>

      {/* Outro subtitle — "LET US KNOW IN THE COMMENTS!" */}
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 124,
          fontWeight: 800,
          textAlign: "center",
          textTransform: "uppercase",
          color: "#ff3b30",
          marginTop: 24,
          transform: "translateY(-10vh)",
          textShadow: "0 4px 10px rgba(0,0,0,0.7)",
        }}
      >
        {tx.subtitle}
      </div>
    </AbsoluteFill>
  );
};
