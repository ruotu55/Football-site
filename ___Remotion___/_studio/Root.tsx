import React from "react";
import { Composition } from "remotion";

// Aggregator Studio root — registers EVERY runner's composition so one Remotion Studio
// lists them all under "Compositions". Launched by ___Remotion___/Open Remotion.bat
// (runs `remotion studio` from runner 2's folder so it reuses that project's installed
// Remotion + remotion.config.ts: the @shared alias + shared publicDir). No separate install.
//
// To add a new runner: add its three imports + one <Composition> below.

// ── Runner 1 — Guess the Team Name (by player nationality) ──
import {
  FootballQuizDemo as R1,
  calculateMetadata as r1meta,
  totalFramesForFps as r1total,
} from "../1_Guess The Football Team Name - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r1schema } from "../1_Guess The Football Team Name - Main Runner - Regular_Remotion/src/schema";

// ── Runner 2 — Guess the National Team (by player club) ──
import {
  FootballQuizDemo as R2,
  calculateMetadata as r2meta,
  totalFramesForFps as r2total,
} from "../2_Guess The Football National Team - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r2schema } from "../2_Guess The Football National Team - Main Runner - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t2 } from "../2_Guess The Football National Team - Main Runner - Regular_Remotion/src/config";

// ── Runner 3 — Player by Career Path ──
import {
  FootballQuizDemo as R3,
  calculateMetadata as r3meta,
  totalFramesForFps as r3total,
} from "../3_Guess The Player By Carrer Path - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r3schema } from "../3_Guess The Player By Carrer Path - Main Runner - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t3 } from "../3_Guess The Player By Carrer Path - Main Runner - Regular_Remotion/src/config";

// ── Runner 4 — Player by Career Stats ──
import {
  FootballQuizDemo as R4,
  calculateMetadata as r4meta,
  totalFramesForFps as r4total,
} from "../4_Guess The Player By Carrer Stats - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r4schema } from "../4_Guess The Player By Carrer Stats - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t4 } from "../4_Guess The Player By Carrer Stats - Regular_Remotion/src/config";

// ── Runner 5 — Player by Club/Position/Country/Age ──
import {
  FootballQuizDemo as R5,
  calculateMetadata as r5meta,
  totalFramesForFps as r5total,
} from "../5_Guess The Player By Club_Position_Country_Age - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r5schema } from "../5_Guess The Player By Club_Position_Country_Age - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t5 } from "../5_Guess The Player By Club_Position_Country_Age - Regular_Remotion/src/config";

// ── Runner 6 — Guess the Fake Information ──
import {
  FootballQuizDemo as R6,
  calculateMetadata as r6meta,
  totalFramesForFps as r6total,
} from "../6_Guess The Fake Informaiton - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r6schema } from "../6_Guess The Fake Informaiton - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t6 } from "../6_Guess The Fake Informaiton - Regular_Remotion/src/config";

// ── Runner 7 — Guess the Team Logo Name ──
import {
  FootballQuizDemo as R7,
  calculateMetadata as r7meta,
  totalFramesForFps as r7total,
} from "../7_Guess The Football Team Logo Name - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r7schema } from "../7_Guess The Football Team Logo Name - Main Runner - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t7 } from "../7_Guess The Football Team Logo Name - Main Runner - Regular_Remotion/src/config";

// ── Runner 8 — Guess the Player Name ──
import {
  FootballQuizDemo as R8,
  calculateMetadata as r8meta,
  totalFramesForFps as r8total,
} from "../8_Guess The Football Player Name - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r8schema } from "../8_Guess The Football Player Name - Main Runner - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t8 } from "../8_Guess The Football Player Name - Main Runner - Regular_Remotion/src/config";

// ── Runner 9 — Football Quiz Multiple Choice (A/B/C) ──
import {
  FootballQuizDemo as R9,
  calculateMetadata as r9meta,
  totalFramesForFps as r9total,
} from "../9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion/src/FootballQuizDemo";
import { demoSchema as r9schema } from "../9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion/src/schema";
import { THEME_DEFAULT as t9 } from "../9_Football Quiz Multiple Choice - Main Runner - Regular_Remotion/src/config";

// Shared defaults for the player/team runners (their save lists vary; pick a real one each).
const base = {
  levels: "1",
  formation: "Auto (from save)",
  language: "English",
  ending: "Random",
  competition: "None — use Color + Effect",
  transition: "Soft Iris",
} as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Guess-The-Football-Team-Name-Regular"
        component={R1}
        durationInFrames={r1total(60, 5)}
        calculateMetadata={r1meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r1schema}
        defaultProps={{
          save: "Champion League",
          levels: "1",
          formation: "Auto (from save)",
          language: "English",
          ending: "Random",
          competition: "Champions League",
          color: "#2E7D32 - Club by Nationality",
          effect: "Sun effect middle",
          opacity: 0.5,
          transition: "Soft Iris",
        } as any}
      />
      <Composition
        id="Guess-The-Football-National-Team-Regular"
        component={R2}
        durationInFrames={r2total(60, 5)}
        calculateMetadata={r2meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r2schema}
        defaultProps={{ ...base, save: "World Cup", competition: "World Cup", color: t2.color, effect: t2.effect, opacity: t2.opacity } as any}
      />
      <Composition
        id="Guess-The-Player-By-Career-Path-Regular"
        component={R3}
        durationInFrames={r3total(60, 5)}
        calculateMetadata={r3meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r3schema}
        defaultProps={{ ...base, save: "Mixed players 1", color: t3.color, effect: t3.effect, opacity: t3.opacity } as any}
      />
      <Composition
        id="Guess-The-Player-By-Career-Stats-Regular"
        component={R4}
        durationInFrames={r4total(60, 5)}
        calculateMetadata={r4meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r4schema}
        defaultProps={{ ...base, save: "Mixed players 1", color: t4.color, effect: t4.effect, opacity: t4.opacity } as any}
      />
      <Composition
        id="Guess-The-Player-By-Club-Position-Country-Age-Regular"
        component={R5}
        durationInFrames={r5total(60, 5)}
        calculateMetadata={r5meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r5schema}
        defaultProps={{ ...base, save: "Mixed players 1", color: t5.color, effect: t5.effect, opacity: t5.opacity } as any}
      />
      <Composition
        id="Guess-The-Fake-Information-Regular"
        component={R6}
        durationInFrames={r6total(60, 5)}
        calculateMetadata={r6meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r6schema}
        defaultProps={{ ...base, save: "Mixed players 1", color: t6.color, effect: t6.effect, opacity: t6.opacity } as any}
      />
      <Composition
        id="Guess-The-Football-Team-Logo-Name-Regular"
        component={R7}
        durationInFrames={r7total(60, 5)}
        calculateMetadata={r7meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r7schema}
        defaultProps={{ ...base, save: "Logos 1", color: t7.color, effect: t7.effect, opacity: t7.opacity } as any}
      />
      <Composition
        id="Guess-The-Football-Player-Name-Regular"
        component={R8}
        durationInFrames={r8total(60, 5)}
        calculateMetadata={r8meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r8schema}
        defaultProps={{ ...base, save: "Player names 1", color: t8.color, effect: t8.effect, opacity: t8.opacity } as any}
      />
      <Composition
        id="Football-Quiz-Multiple-Choice-Regular"
        component={R9}
        durationInFrames={r9total(60, 5)}
        calculateMetadata={r9meta}
        fps={60}
        width={1920}
        height={1080}
        schema={r9schema}
        defaultProps={{ save: "World Cup", levels: "1", language: "English", ending: "Random", competition: "None — use Color + Effect", color: t9.color, effect: t9.effect, opacity: t9.opacity, transition: "Soft Iris" } as any}
      />
    </>
  );
};
