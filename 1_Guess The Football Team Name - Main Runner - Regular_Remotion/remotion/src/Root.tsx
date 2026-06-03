import React from "react";
import { Composition } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { QuizComposition } from "./QuizComposition";
import { buildTimeline } from "./timeline";
import { assetUrl } from "./assets";
import { endingVoiceRelPath } from "./audio/voicePaths";
import type { RemotionProps } from "./props";

const SAMPLE_PROPS: RemotionProps = {
  script: "sample", totalLevelsCount: 6, questionCount: 3, bgmSongs: [],
  bundledVoiceVariants: null, endingType: "think-you-know", transitionEffect: "grid-overlay",
  levels: [], width: 2560, height: 1440, fps: 60, language: "english",
  assetBase: "http://127.0.0.1:8975",
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Quiz"
    component={QuizComposition as any}
    width={2560}
    height={1440}
    fps={60}
    durationInFrames={600}
    defaultProps={SAMPLE_PROPS}
    calculateMetadata={async ({ props }) => {
      const p = props as unknown as RemotionProps;
      const fps = p.fps ?? 60;
      let outroVoiceMs = 2500; // safe default if probe fails
      try {
        const rel = endingVoiceRelPath(p.endingType, p.language);
        if (rel && p.assetBase) {
          const url = assetUrl(rel, p.assetBase);
          outroVoiceMs = Math.round((await getAudioDurationInSeconds(url)) * 1000);
        }
      } catch {
        outroVoiceMs = 2500;
      }
      const tl = buildTimeline({ questionCount: p.questionCount, fps, endingType: p.endingType, outroVoiceMs });
      return { durationInFrames: tl.totalDurationFrames, fps, width: p.width ?? 2560, height: p.height ?? 1440 };
    }}
  />
);
