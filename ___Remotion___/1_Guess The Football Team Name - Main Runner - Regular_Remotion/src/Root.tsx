import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, calculateMetadata, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";

export const RemotionRoot: React.FC = () => {
  // 1080p (Full HD) @ 60fps. Duration is computed from the save + level count.
  return (
    <Composition
      id="Guess-The-Football-Team-Name-Regular"
      component={FootballQuizDemo}
      durationInFrames={totalFramesForFps(60, 5)}
      calculateMetadata={calculateMetadata}
      fps={60}
      width={1920}
      height={1080}
      schema={demoSchema}
      defaultProps={{"save":"Champion League" as const,"levels":"1" as const,"formation":"Auto (from save)" as const,"language":"English" as const,"competition":"Euro" as const,"transition":"Shine Wipe" as const}}
    />
  );
};
