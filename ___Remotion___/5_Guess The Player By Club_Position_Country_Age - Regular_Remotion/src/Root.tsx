import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, calculateMetadata, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";
import { TemplatePreview, previewSchema, PREVIEW_FRAMES } from "./TemplatePreview";
import { TEMPLATES, TEMPLATE_IDS } from "./templates";

export const RemotionRoot: React.FC = () => {
  // 1080p (Full HD) @ 60fps. Duration is computed from the save + level count.
  // NOTE: `id` must be a literal string (= COMPOSITION_ID in config.ts) and defaultProps a
  // fully inline literal (`as const` ok, no variable refs) or the Studio's "Save default
  // props" fails with "Could not find or extract defaultProps". Values mirror config.ts
  // THEME_DEFAULT.
  return (
    <>
      <Composition
        id="Guess-The-Player-By-Club-Position-Country-Age-Regular"
        component={FootballQuizDemo}
        durationInFrames={totalFramesForFps(60, 5)}
        calculateMetadata={calculateMetadata}
        fps={60}
        width={1920}
        height={1080}
        schema={demoSchema}
        defaultProps={{"save":"Mixed players 1" as const,"levels":"3" as const,"formation":"Auto (from save)" as const,"language":"English" as const,"competition":"Generic 1" as const,"transition":"Soft Iris" as const,"template":"scout-dossier" as const}}
      />

      {/* ── Per-template single-level previews (click each in the sidebar) ──────── */}
      {TEMPLATE_IDS.map((id, i) => (
        <Composition
          key={id}
          id={`Preview-${i + 1}-${TEMPLATES[id].label.replace(/[^A-Za-z0-9]+/g, "-")}`}
          component={TemplatePreview}
          durationInFrames={PREVIEW_FRAMES}
          fps={30}
          width={1920}
          height={1080}
          schema={previewSchema}
          defaultProps={{
            template: id,
            save: "Mixed players 1",
            levelNumber: 1,
            language: "English" as const,
            competition: "Generic 1",
          }}
        />
      ))}
    </>
  );
};
