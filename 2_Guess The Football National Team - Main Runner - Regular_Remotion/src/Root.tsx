import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, calculateMetadata, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";
import { COMPOSITION_ID, THEME_DEFAULT } from "./config";

export const RemotionRoot: React.FC = () => {
  // 1080p (Full HD) @ 60fps. Duration is computed from the save + level count.
  return (
    <Composition
      id={COMPOSITION_ID}
      component={FootballQuizDemo}
      durationInFrames={totalFramesForFps(60, 5)}
      calculateMetadata={calculateMetadata}
      fps={60}
      width={1920}
      height={1080}
      schema={demoSchema}
      defaultProps={{
        save: "World Cup" as const,
        levels: "1" as const,
        formation: "Auto (from save)" as const,
        language: "English" as const,
        ending: "Random" as const,
        competition: "World Cup" as const,
        color: THEME_DEFAULT.color,
        effect: THEME_DEFAULT.effect,
        opacity: THEME_DEFAULT.opacity,
        transition: "Soft Iris" as const,
      }}
    />
  );
};
