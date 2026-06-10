import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Original: 1080p @ 30fps */}
      <Composition
        id="FootballQuizDemo"
        component={FootballQuizDemo}
        durationInFrames={totalFramesForFps(30)}
        fps={30}
        width={1920}
        height={1080}
        schema={demoSchema}
        defaultProps={{
          competitionBackground: "None — use Color + Effect",
          backgroundColor: "#2E7D32 - Club by Nationality",
          backgroundEffect: "YouTube thumbnails",
          opacity: 0.5,
          transitionEffect: "Fog",
        }}
      />

      {/* New: 4K (2160p) @ 60fps */}
      <Composition
        id="FootballQuizDemo4K60"
        component={FootballQuizDemo}
        durationInFrames={totalFramesForFps(60)}
        fps={60}
        width={3840}
        height={2160}
        schema={demoSchema}
        defaultProps={{"competitionBackground":"Champions League" as const,"backgroundColor":"#2E7D32 - Club by Nationality" as const,"backgroundEffect":"Sun effect middle" as const,"opacity":0,"transitionEffect":"Fog" as const}}
      />
    </>
  );
};
