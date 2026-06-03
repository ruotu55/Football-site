import React from "react";
import { Composition } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { QuizComposition } from "./QuizComposition";
import { buildTimeline } from "./timeline";
import { assetUrl } from "./assets";
import { endingVoiceRelPath, quizTitleRelPath, progressVoiceRelPath, revealVoiceRelPath } from "./audio/voicePaths";
import type { RemotionProps } from "./props";
import { transitionDurationMs } from "./transitions/transitionDurations";
import samplePropsJson from "../sample-props.json";

// Use the real sample JSON as defaultProps so Studio renders the full Arsenal pitch.
// The cast via unknown handles the loose JSON type vs. strict RemotionProps.
const SAMPLE_PROPS: RemotionProps = samplePropsJson as unknown as RemotionProps;

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
      const lang = p.language ?? "english";

      /** Probe one voice file; return ms rounded, or fallback on any error. */
      async function probeDurationMs(rel: string, fallback: number): Promise<number> {
        if (!rel || !p.assetBase) return fallback;
        try {
          return Math.round((await getAudioDurationInSeconds(assetUrl(rel, p.assetBase))) * 1000);
        } catch {
          return fallback;
        }
      }

      // Probe all named voices in parallel.
      const [rulesMs, endingMs, revealMs, warmUpMs, seriousMs, nerdsMs, geniusMs] =
        await Promise.all([
          probeDurationMs(quizTitleRelPath(p.quizType ?? "club-by-nat", lang), 3000),
          probeDurationMs(endingVoiceRelPath(p.endingType, lang), 2500),
          // Reveal: probe the first question level's revealVoiceRel if present.
          probeDurationMs(
            (p.levels?.find((l) => !l.isLogo && !l.isIntro && !l.isOutro)?.revealVoiceRel) ??
              revealVoiceRelPath("Arsenal", "plain", lang),
            1500,
          ),
          probeDurationMs(progressVoiceRelPath("warmUp", lang), 2000),
          probeDurationMs(progressVoiceRelPath("serious", lang), 2000),
          probeDurationMs(progressVoiceRelPath("nerds",   lang), 2000),
          probeDurationMs(progressVoiceRelPath("genius",  lang), 2000),
        ]);

      const outroVoiceMs = endingMs;
      const voiceDurationsMs: Record<string, number> = {
        rules: rulesMs, ending: endingMs, reveal: revealMs,
        warmUp: warmUpMs, serious: seriousMs, nerds: nerdsMs, genius: geniusMs,
      };

      const tl = buildTimeline({ questionCount: p.questionCount, fps, endingType: p.endingType, outroVoiceMs, transitionMs: transitionDurationMs(p.transitionEffect) });
      return {
        durationInFrames: tl.totalDurationFrames,
        fps,
        width: p.width ?? 2560,
        height: p.height ?? 1440,
        props: { ...p, outroVoiceMs, voiceDurationsMs },
      };
    }}
  />
);
