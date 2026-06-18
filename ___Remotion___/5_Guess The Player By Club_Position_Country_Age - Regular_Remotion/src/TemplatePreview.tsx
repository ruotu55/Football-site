// A quick single-level preview of ONE template (question countdown → reveal),
// used by the per-template "Preview · …" compositions in the Studio sidebar so
// each template is one click away without rendering the whole video.
import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { Stage } from "@shared/components/Stage";
import { AnimatedBackground } from "@shared/effects/AnimatedBackground";
import { Level } from "./scenes/Level";
import { resolveBackground } from "./schema";
import { resolveLevel } from "./level-data";
import { LANGUAGES } from "./schema";
import { COMPETITION_LABELS } from "@shared/effects/effects-data";
import { TEMPLATE_IDS } from "./templates";
import { SAVE_NAMES } from "./level-data";

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

export const previewSchema = z.object({
  template: z.enum(asEnum(TEMPLATE_IDS)),
  save: z.enum(asEnum(SAVE_NAMES)),
  levelNumber: z.number().int().min(1).max(60),
  language: z.enum(LANGUAGES),
  competition: z.enum(asEnum(COMPETITION_LABELS)),
});

export type PreviewProps = z.infer<typeof previewSchema>;

// One level lasts the design LEVEL_FRAMES; at 30fps preview that's a 1:1 mapping.
export const PREVIEW_FRAMES = 320;

export const TemplatePreview: React.FC<PreviewProps> = ({ template, save, levelNumber, language, competition }) => {
  const background = resolveBackground({ competition });
  const level = resolveLevel(save, levelNumber, null);
  return (
    <Stage>
      <AnimatedBackground bg={background} />
      <AbsoluteFill>
        <Level bg={background} level={level} levelNumber={levelNumber} language={language} template={template} />
      </AbsoluteFill>
    </Stage>
  );
};
