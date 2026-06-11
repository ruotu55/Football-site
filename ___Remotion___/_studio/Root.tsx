import React from "react";
import { Composition } from "remotion";

// Aggregator Studio root — registers EVERY runner's composition so one Remotion Studio
// lists them all under "Compositions". Each new runner adds two imports + one <Composition>.
//
// Launched by ___Remotion___/Open Remotion.bat, which runs `remotion studio` from a
// runner folder (so it reuses that runner's installed Remotion + remotion.config.ts:
// the @shared alias + shared publicDir). No separate install for this folder.

// ── Runner 1 — Guess the Team Name (by player nationality) ──
import {
  FootballQuizDemo as Runner1,
  calculateMetadata as runner1Meta,
  totalFramesForFps as runner1Total,
} from "../1_Guess The Football Team Name - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as runner1Schema } from "../1_Guess The Football Team Name - Main Runner - Regular_Remotion/src/schema";

// ── Runner 2 — Guess the National Team (by player club) ──
import {
  FootballQuizDemo as Runner2,
  calculateMetadata as runner2Meta,
  totalFramesForFps as runner2Total,
} from "../2_Guess The Football National Team - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as runner2Schema } from "../2_Guess The Football National Team - Main Runner - Regular_Remotion/src/schema";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Guess-The-Football-Team-Name-Regular"
        component={Runner1}
        durationInFrames={runner1Total(60, 5)}
        calculateMetadata={runner1Meta}
        fps={60}
        width={1920}
        height={1080}
        schema={runner1Schema}
        defaultProps={{
          save: "Champion League" as const,
          levels: "1" as const,
          formation: "Auto (from save)" as const,
          language: "English" as const,
          ending: "Random" as const,
          competition: "Champions League" as const,
          color: "#2E7D32 - Club by Nationality" as const,
          effect: "Sun effect middle" as const,
          opacity: 0.5,
          transition: "Soft Iris" as const,
        }}
      />
      <Composition
        id="Guess-The-Football-National-Team-Regular"
        component={Runner2}
        durationInFrames={runner2Total(60, 5)}
        calculateMetadata={runner2Meta}
        fps={60}
        width={1920}
        height={1080}
        schema={runner2Schema}
        defaultProps={{
          save: "World Cup" as const,
          levels: "1" as const,
          formation: "Auto (from save)" as const,
          language: "English" as const,
          ending: "Random" as const,
          competition: "World Cup" as const,
          color: "#1B5E20 - National Team by Club" as const,
          effect: "YouTube thumbnails" as const,
          opacity: 0.5,
          transition: "Soft Iris" as const,
        }}
      />
    </>
  );
};
