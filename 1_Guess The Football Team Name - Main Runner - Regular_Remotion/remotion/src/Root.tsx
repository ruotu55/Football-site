import React from "react";
import { Composition } from "remotion";
import { QuizComposition } from "./QuizComposition";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Quiz"
    component={QuizComposition}
    durationInFrames={120}
    fps={60}
    width={2560}
    height={1440}
    defaultProps={{ title: "Quiz" }}
  />
);
