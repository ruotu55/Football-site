import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, calculateMetadata, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";

export const RemotionRoot: React.FC = () => {
  // 1080p (Full HD) @ 60fps. Duration is computed from the save + level count.
  // NOTE: `id` must be a literal string (= COMPOSITION_ID in config.ts) and defaultProps a
  // fully inline literal (`as const` ok, no variable refs) or the Studio's "Save default
  // props" fails with "Could not find or extract defaultProps". Values mirror config.ts
  // THEME_DEFAULT; save = first entry of generated saves.json.
  return (
    <Composition
      id="Guess-The-Football-Team-Logo-Name-Regular"
      component={FootballQuizDemo}
      durationInFrames={totalFramesForFps(60, 5)}
      calculateMetadata={calculateMetadata}
      fps={60}
      width={1920}
      height={1080}
      schema={demoSchema}
      defaultProps={{
        save: "Logos 1" as const,
        levels: "1" as const,
        formation: "Auto (from save)" as const,
        language: "English" as const,
        ending: "Random" as const,
        competition: "Generic 2" as const,
        transition: "Soft Iris" as const,
      }}
    />
  );
};
