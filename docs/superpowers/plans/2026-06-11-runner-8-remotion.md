# Runner 8 Remotion Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Remotion video project for quiz runner 8 ("Guess the Player Name") that renders a silhouetted player photo during the question and reveals the full-color photo + player name at REVEAL_START=185.

**Architecture:** Copy runner-2's project shell verbatim (package.json, remotion.config.ts, tsconfig.json, index.ts, schema.ts, FootballQuizDemo.tsx, render.mjs, Open Remotion Studio.bat, .gitignore). Replace only the bespoke Level scene (no pitch/slots — just a centered card with player photo + reveal bar), level-data.ts (single player per level), config.ts (runner-8 strings/theme), and build-data.mjs (reads "8|" blocks, resolvePhoto by club+name). The shared `@shared/*` layout, audio, transitions, intro/outro scenes, and Root.tsx all stay unchanged except Root.tsx which needs the runner-8 first save name as defaultProps.save.

**Tech Stack:** Remotion 4.0.474, React 19, TypeScript 5.8, zod, shared `.remotion-shared/src/` lib, Node build script.

---

## File Map

Files to **create** (all inside `___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\`):

| File | Responsibility |
|------|----------------|
| `package.json` | Project name, runner-8 render/still scripts |
| `remotion.config.ts` | Verbatim copy of runner-2 |
| `tsconfig.json` | Verbatim copy of runner-2 |
| `.gitignore` | Verbatim copy of runner-2 |
| `Open Remotion Studio.bat` | CRLF .bat, retitled for runner 8 |
| `src/index.ts` | Verbatim copy (registerRoot) |
| `src/schema.ts` | Verbatim copy (no formation field needed, kept to stay identical) |
| `src/config.ts` | Runner-8 INTRO_STRINGS, TITLE_FONT_SIZE=104, THEME_DEFAULT |
| `src/level-data.ts` | ResolvedLevel with playerName/display/photoPath/voices; resolveLevel |
| `src/FootballQuizDemo.tsx` | Verbatim copy changing only imports (Level, config, level-data) |
| `src/Root.tsx` | Verbatim copy changing COMPOSITION_ID source + defaultProps.save |
| `src/scenes/Level.tsx` | Bespoke: centered player-photo card + reveal bar + LevelBadge + Timer |
| `src/generated/.gitkeep` | Placeholder so the folder exists before first build |
| `scripts/build-data.mjs` | Reads "8|" blocks, resolves player photo + voice, emits saves.json + audio.json |
| `scripts/render.mjs` | Verbatim copy changing COMPOSITION_ID + QUIZ_NAME |

Files **not touched**: `.remotion-shared/`, `___Remotion___/_studio/`, runner-1 or runner-2 Remotion folders, any browser runner folders.

---

## Task 1: Create the project folder scaffold

**Files:**
- Create: `___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\package.json`
- Create: `___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\remotion.config.ts`
- Create: `___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\tsconfig.json`
- Create: `___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "guess-the-player-name-remotion",
  "version": "1.0.0",
  "description": "Remotion demo of the Guess The Football Player Name runner: intro + levels + ending",
  "private": true,
  "scripts": {
    "setup": "node scripts/build-data.mjs",
    "build-data": "node scripts/build-data.mjs",
    "studio": "remotion studio",
    "render": "node scripts/render.mjs",
    "render:draft": "remotion render Guess-The-Football-Player-Name-Regular out/draft.mp4 --scale=0.5",
    "still": "remotion still Guess-The-Football-Player-Name-Regular out/still.png",
    "upgrade": "remotion upgrade"
  },
  "dependencies": {
    "@remotion/cli": "4.0.474",
    "@remotion/google-fonts": "4.0.474",
    "@remotion/transitions": "4.0.474",
    "@remotion/zod-types": "^4.0.474",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "remotion": "4.0.474",
    "sharp": "^0.35.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/react": "19.2.7",
    "typescript": "5.8.3"
  }
}
```

- [ ] **Step 2: Create remotion.config.ts** (verbatim copy from runner-2)

```typescript
import path from "node:path";
import { Config } from "@remotion/cli/config";

const SHARED_SRC = path.resolve(process.cwd(), "..", "..", ".remotion-shared", "src");
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: { ...(config.resolve?.alias ?? {}), "@shared": SHARED_SRC },
    modules: [path.resolve(process.cwd(), "node_modules"), "node_modules"],
  },
}));

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setConcurrency(6);
Config.setTimeoutInMilliseconds(120000);
Config.setPublicDir(path.resolve(process.cwd(), "..", "..", ".remotion-shared", "public"));
```

- [ ] **Step 3: Create tsconfig.json** (verbatim copy from runner-2)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../../.remotion-shared/src/*"]
    }
  },
  "include": ["src", "../../.remotion-shared/src"]
}
```

- [ ] **Step 4: Create .gitignore** (verbatim copy from runner-2)

```
# Dependencies (contains the Remotion headless Chrome + webpack cache — >100MB)
node_modules/

# Remotion's downloaded browser + caches
.remotion/
**/.remotion/

# Rendered output (videos/stills are large and reproducible)
out/

# Installed skill cache (reinstall via: npx skills add remotion-dev/skills)
.agents/
.claude/

# Misc
*.log
.DS_Store
npm-debug.log*
```

- [ ] **Step 5: Create Open Remotion Studio.bat** (MUST be CRLF — see note below)

Content (write with LF first, then convert to CRLF using `unix2dos` or PowerShell):

```bat
@echo off
title Remotion Studio - Guess The Football Player Name
cd /d "%~dp0"

rem Ensure npm works when launched by double-click (Explorer PATH can differ)
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo   Remotion Studio - Guess The Football Player Name
echo   -------------------------------------------------
echo   Browser: http://localhost:3000
echo   Keep this window open while you work. Close it to stop the studio.
echo.

call npm.cmd run studio

echo.
echo   Studio stopped.
pause
```

After writing, convert to CRLF:
```powershell
$p = "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\Open Remotion Studio.bat"
$content = [System.IO.File]::ReadAllText($p)
$crlf = $content -replace "(?<!\r)\n", "`r`n"
[System.IO.File]::WriteAllText($p, $crlf, [System.Text.Encoding]::ASCII)
```

---

## Task 2: Create src/ entry files (verbatim copies)

**Files:**
- Create: `src/index.ts`
- Create: `src/schema.ts` (verbatim — runner-8 has no formation, but keeping identical lets Root.tsx/FootballQuizDemo.tsx compile without changes)

- [ ] **Step 1: Create src/index.ts** (verbatim)

```typescript
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

- [ ] **Step 2: Create src/schema.ts** (verbatim from runner-2 — imports SAVE_NAMES from ./level-data which runner 8 also exports)

```typescript
import { z } from "zod";
import { TRANSITION_EFFECTS } from "@shared/transitions";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import {
  COLOR_LABELS,
  COMPETITION_LABELS,
  EFFECT_LABELS,
  colorHexByLabel,
  competitionByLabel,
  effectIdByLabel,
} from "@shared/effects/effects-data";
import { FORMATION_LABELS } from "@shared/formations";
import { SAVE_NAMES } from "./level-data";

export const NONE_COMPETITION = "None — use Color + Effect";
export const AUTO_FORMATION = "Auto (from save)";
export const LANGUAGES = ["English", "Spanish"] as const;
export const ENDINGS = [
  "Random",
  "Think you know the answer?",
  "How many did you get?",
] as const;

const asEnum = (arr: readonly string[]) => arr as [string, ...string[]];

export const LEVEL_CHOICES = [
  "All", "1", "2", "3", "5", "10", "15", "20", "25", "30", "40", "50", "60",
] as const;

export const demoSchema = z.object({
  language: z.enum(LANGUAGES),

  save: z.enum(asEnum(SAVE_NAMES)),
  levels: z.enum(LEVEL_CHOICES),
  formation: z.enum(asEnum([AUTO_FORMATION, ...FORMATION_LABELS])),

  ending: z.enum(ENDINGS),

  competition: z.enum(asEnum([NONE_COMPETITION, ...COMPETITION_LABELS])),
  color: z.enum(asEnum(COLOR_LABELS)),
  effect: z.enum(asEnum(EFFECT_LABELS)),
  opacity: z.number().min(0).max(1),

  transition: z.enum(TRANSITION_EFFECTS),
});

export type DemoProps = z.infer<typeof demoSchema>;

export const resolveBackground = (
  p: Pick<DemoProps, "competition" | "color" | "effect" | "opacity">,
): ResolvedBackground => {
  const comp = competitionByLabel(p.competition);
  return {
    competition: comp ? comp.recipe : null,
    colorHex: colorHexByLabel(p.color),
    effectId: effectIdByLabel(p.effect),
    opacity: p.opacity,
  };
};
```

- [ ] **Step 3: Create src/generated/.gitkeep** (empty placeholder so the folder exists)

---

## Task 3: Create config.ts

**Files:**
- Create: `src/config.ts`

The color id `extra-deep-lavender` maps to label `"#9575CD - Football Player Name"` (from effects-data.ts line 16).
The effect id `sun-spiral-center` maps to label `"Sun spiral middle"` (from effects-data.ts line 27).

- [ ] **Step 1: Create src/config.ts**

```typescript
// Per-runner config for runner 8 — "Guess the Football Player Name".
// Everything that differs from the shared template lives here.
import type { IntroStringsByLanguage } from "@shared/scene-props";

export const COMPOSITION_ID = "Guess-The-Football-Player-Name-Regular";

// Intro title — MUST match the quiz-title voice + the runner's i18n landing title:
//   EN "GUESS THE FOOTBALL PLAYER NAME" (from i18n.js landingTitleFourParams)
//   ES "ADIVINA EL NOMBRE DEL JUGADOR DE FÚTBOL" (from i18n.js landingTitleFourParams)
export const INTRO_STRINGS: IntroStringsByLanguage = {
  English: {
    titleLines: ["Guess The Football", "Player Name"],
    season: "2025/6 SEASON",
    questions: "QUESTIONS",
    bonus: "BONUS",
  },
  Spanish: {
    titleLines: ["Adivina El Nombre", "Del Jugador De Fútbol"],
    season: "TEMPORADA 2025/6",
    questions: "PREGUNTAS",
    bonus: "BONUS",
  },
};

// Runner-8 title fits in 2 lines with default size.
export const TITLE_FONT_SIZE = 104;

// Background default: colorId "extra-deep-lavender" → label "#9575CD - Football Player Name"
// effectId "sun-spiral-center" → label "Sun spiral middle"
export const THEME_DEFAULT = {
  color: "#9575CD - Football Player Name",
  effect: "Sun spiral middle",
  opacity: 0.5,
} as const;
```

---

## Task 4: Create level-data.ts

**Files:**
- Create: `src/level-data.ts`

Runner 8 has ONE player per level (not a squad). `saves.json` shape: `{saves:[{name, levels:[{playerName, display, photoPath, revealVoiceEn, revealVoiceEs}]}]}`.

- [ ] **Step 1: Create src/level-data.ts**

```typescript
// Runner-8 data resolution. A level = ONE player; the answer is the player's NAME.
// build-data.mjs emits the player photo path + reveal voice paths per level.
import savesData from "./generated/saves.json";

type RawLevel = {
  playerName: string;
  display: string;
  photoPath: string | null;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};
type RawSave = { name: string; levels: RawLevel[] };

const SAVES = (savesData as { saves: RawSave[] }).saves;
export const SAVE_NAMES = SAVES.map((s) => s.name);

export type ResolvedLevel = {
  playerName: string;
  display: string;
  photoPath: string | null;
  revealVoiceEn: string | null;
  revealVoiceEs: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const levelCount = (saveName: string): number =>
  SAVES.find((s) => s.name === saveName)?.levels.length ?? 1;

export const resolveLevel = (
  saveName: string,
  levelNumber: number,
  _formationLabel: string | null,
): ResolvedLevel => {
  const save = SAVES.find((s) => s.name === saveName) ?? SAVES[0];
  const lvl = save.levels[clamp(levelNumber - 1, 0, save.levels.length - 1)];
  return {
    playerName: lvl.playerName,
    display: lvl.display,
    photoPath: lvl.photoPath,
    revealVoiceEn: lvl.revealVoiceEn ?? null,
    revealVoiceEs: lvl.revealVoiceEs ?? null,
  };
};
```

---

## Task 5: Create the bespoke Level scene

**Files:**
- Create: `src/scenes/Level.tsx`

The Level screen replicates the `career-team-quiz-card` from runner-8's browser runner:
- A single centered card (`min(64vh, 36rem)` wide, square aspect ratio) holding the player photo with `object-fit: cover` and `border-radius: 20px`.
- During question phase (frame < REVEAL_START=185): photo has a dark silhouette filter matching the browser CSS (`brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0)` + drop-shadows). An optional subtle cyan drop-shadow is included.
- A pill reveal bar below the card showing `"?"` during question, transitioning to the player's display name (uppercase) on reveal.
- On reveal (frame >= REVEAL_START): filter transitions to `none` (full color) over ~26 frames. Bar text swaps to player name.
- `LevelBadge` (top-left gold circle with level number) and `Timer` ring (top-right) both fade out on reveal — copied verbatim from runner-2's Level.tsx.
- Audio: ticking (−30 frames before REVEAL_START), stinger (at REVEAL_START), reveal voice (REVEAL_START + 5 frames) — copied verbatim from runner-2's Level.tsx.

- [ ] **Step 1: Create src/scenes/Level.tsx**

```tsx
import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, Img } from "remotion";
import type { ResolvedBackground } from "@shared/effects/AnimatedBackground";
import type { Language } from "@shared/paths";
import { sharedSrc } from "@shared/paths";
import { COLORS, fontFamily } from "@shared/theme";
import { DESIGN_FPS, useDesignFrame, useFrameScale } from "@shared/timing";
import type { ResolvedLevel } from "../level-data";
import audioManifest from "../generated/audio.json";

export const REVEAL_START = 185;

// ── Level Badge (top-left gold circle) ─────────────────────────────────────
const LevelBadge: React.FC<{ frame: number; n: number; opacity: number }> = ({ frame, n, opacity }) => {
  const pop = spring({
    frame,
    fps: DESIGN_FPS,
    config: { damping: 9, mass: 0.8, stiffness: 170 },
    durationInFrames: 32,
  });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  return (
    <div style={{ position: "absolute", top: 34, left: 40, opacity, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div
        style={{
          width: 156,
          height: 156,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 32%, #ffdf73 0%, #f7a81b 62%, #e07d09 100%)",
          border: "7px solid rgba(255,255,255,0.94)",
          boxShadow: "0 18px 38px rgba(0,0,0,0.55), inset 0 -8px 18px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 93,
          lineHeight: 1,
          color: "#241500",
          textShadow: "0 2px 0 rgba(255,255,255,0.25)",
        }}
      >
        {n}
      </div>
    </div>
  );
};

// ── Timer ring (top-right) ──────────────────────────────────────────────────
const Timer: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const T_START = 14;
  const T_END = REVEAL_START;
  const remain = interpolate(frame, [T_START, T_END], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.max(0, Math.ceil((T_END - Math.max(frame, T_START)) / DESIGN_FPS));
  const R = 66;
  const C = 2 * Math.PI * R;
  const pop = spring({ frame, fps: DESIGN_FPS, config: { damping: 12, mass: 0.7, stiffness: 160 }, durationInFrames: 26 });
  const scale = interpolate(pop, [0, 1], [0.2, 1]);
  const ringColor = remain < 0.16 ? "#ff4136" : COLORS.accent;
  return (
    <div style={{ position: "absolute", top: 34, right: 40, width: 162, height: 162, opacity, transform: `scale(${scale})`, transformOrigin: "top right" }}>
      <svg width={162} height={162} style={{ display: "block", filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.5))" }}>
        <circle cx={81} cy={81} r={R} fill="rgba(12,16,22,0.66)" stroke="rgba(255,255,255,0.16)" strokeWidth={14} />
        <circle
          cx={81}
          cy={81}
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - remain)}
          transform="rotate(-90 81 81)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: 72,
          color: COLORS.white,
          textShadow: "0 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        {secs}
      </div>
    </div>
  );
};

// ── Silhouette filter (question phase) → none (reveal phase) ───────────────
// Matches browser CSS on `.career-portrait-card__photo` (video-mode off, silhouette):
//   brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0) + drop-shadows
const SILHOUETTE_FILTER =
  "brightness(0) contrast(0) brightness(0.18) contrast(3.5) saturate(0) " +
  "drop-shadow(-1px -1px 2px rgba(70,95,130,0.22)) " +
  "drop-shadow(2px 3px 4px rgba(0,0,0,0.85)) " +
  "drop-shadow(4px 8px 16px rgba(0,0,0,0.6)) " +
  "drop-shadow(6px 18px 36px rgba(0,0,0,0.4)) " +
  "drop-shadow(0 0 6px rgba(60,90,130,0.12))";

// ── Level scene ─────────────────────────────────────────────────────────────
export const Level: React.FC<{
  bg: ResolvedBackground;
  level: ResolvedLevel;
  levelNumber: number;
  language: Language;
}> = ({ level, levelNumber, language }) => {
  const frame = useDesignFrame();
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);
  const revealVoice = language === "Spanish" ? level.revealVoiceEs : level.revealVoiceEn;

  // Reveal progress: 0 (question) → 1 (fully revealed) over 26 frames
  const revealProgress = interpolate(frame, [REVEAL_START, REVEAL_START + 26], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badge + timer fade out as reveal begins
  const uiOpacity = interpolate(revealProgress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });

  // Photo filter: silhouette → none
  // At revealProgress 0 → SILHOUETTE_FILTER; at 1 → "none"
  // We interpolate the brightness of the final reveal only (0.18→1 and contrast 3.5→1 and saturate 0→1)
  // Simplest approach: blend via opacity of a black overlay or just switch filter at REVEAL_START with a CSS transition.
  // For Remotion (no CSS transitions), we cross-fade two Img layers:
  //   - silhouette layer: opacity fades from 1 → 0
  //   - color layer: opacity fades from 0 → 1
  const silhouetteOpacity = interpolate(revealProgress, [0, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const colorOpacity = interpolate(revealProgress, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const photoSrc = level.photoPath ? sharedSrc(level.photoPath) : null;

  // Bar text: "?" → player display name (uppercase)
  const barText = revealProgress > 0.1 ? level.display.toUpperCase() : "?";
  const barFontSize = revealProgress > 0.1 ? 52 : 76; // name is smaller than "?"
  const barLetterSpacing = revealProgress > 0.1 ? 2 : 4;

  const CARD_SIZE = 480; // px at 1920×1080 (matches min(64vh)=~691px but we cap for safety)

  return (
    <AbsoluteFill>
      {/* Centered card + bar */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
          }}
        >
          {/* Photo card — square, rounded */}
          <div
            style={{
              position: "relative",
              width: CARD_SIZE,
              height: CARD_SIZE,
              borderRadius: 24,
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.22)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
              background: "rgba(10,16,26,0.6)",
            }}
          >
            {/* Fallback placeholder when no photo */}
            {!photoSrc && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily,
                  fontWeight: 800,
                  fontSize: 40,
                  color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}
              >
                {level.display}
              </div>
            )}

            {/* Silhouette layer (question phase) */}
            {photoSrc && (
              <Img
                src={photoSrc}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  opacity: silhouetteOpacity,
                  filter: SILHOUETTE_FILTER,
                }}
              />
            )}

            {/* Color layer (reveal phase) */}
            {photoSrc && (
              <Img
                src={photoSrc}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  opacity: colorOpacity,
                }}
              />
            )}
          </div>

          {/* Reveal bar — pill with "?" or player name */}
          <div
            style={{
              width: CARD_SIZE,
              height: 84,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(8,16,28,0.85)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 16px",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily,
                fontWeight: 800,
                fontSize: barFontSize,
                letterSpacing: barLetterSpacing,
                color: COLORS.white,
                lineHeight: 1,
                textAlign: "center",
                textTransform: "uppercase",
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                maxWidth: "100%",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {barText}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* UI overlays */}
      <LevelBadge frame={frame} n={levelNumber} opacity={uiOpacity} />
      <Timer frame={frame} opacity={uiOpacity} />

      {/* Audio */}
      <Sequence from={f(REVEAL_START - 30)} durationInFrames={f(30)}>
        <Audio src={staticFile(audioManifest.ticking)} volume={0.8} />
      </Sequence>
      <Sequence from={f(REVEAL_START)}>
        <Audio src={staticFile(audioManifest.stinger)} volume={0.5} />
      </Sequence>
      {revealVoice ? (
        <Sequence from={f(REVEAL_START + 5)}>
          <Audio src={staticFile(revealVoice)} volume={1} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
```

---

## Task 6: Create FootballQuizDemo.tsx and Root.tsx

**Files:**
- Create: `src/FootballQuizDemo.tsx`
- Create: `src/Root.tsx`

FootballQuizDemo.tsx is verbatim from runner-2 with only three import lines changed (Level, config, level-data). Runner-2's formation logic is fine to keep (resolveLevel ignores the `_formationLabel` argument in runner 8).

- [ ] **Step 1: Create src/FootballQuizDemo.tsx**

Copy runner-2's `FootballQuizDemo.tsx` verbatim. The only differences are:
1. Import `{ Level }` from `"./scenes/Level"` (same path — already matches)
2. Import `{ AUTO_FORMATION, resolveBackground, type DemoProps }` from `"./schema"` (same — no change)
3. Import `{ levelCount, resolveLevel }` from `"./level-data"` (same — no change)
4. Import `{ INTRO_STRINGS, TITLE_FONT_SIZE }` from `"./config"` (same — no change)

The file is therefore completely verbatim:

```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, type CalculateMetadataFunction } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import audioManifest from "./generated/audio.json";
import { Stage } from "@shared/components/Stage";
import { AnimatedBackground } from "@shared/effects/AnimatedBackground";
import { BallIntro, BALL_INTRO_FRAMES } from "@shared/scenes/BallIntro";
import { Intro } from "@shared/scenes/Intro";
import { Outro } from "@shared/scenes/Outro";
import { resolveEndingKey } from "@shared/ending";
import { getPresentation, transitionFramesFor } from "@shared/transitions";
import { iris } from "@shared/transitions/iris";
import { DESIGN_FPS, useFrameScale } from "@shared/timing";
import { Level } from "./scenes/Level";
import { AUTO_FORMATION, resolveBackground, type DemoProps } from "./schema";
import { levelCount, resolveLevel } from "./level-data";
import { INTRO_STRINGS, TITLE_FONT_SIZE } from "./config";

// Scene durations in DESIGN frames (30fps), scaled to the real fps at render time.
export const LEVEL_FRAMES = 320;
export const OUTRO_FRAMES_MIN = 130;
export const OUTRO_TAIL_FRAMES = 30;
export const ENDING_VOICE_DELAY_SEC = 0.5;
export const ENDING_VOICE_DELAY_FRAMES = Math.round(ENDING_VOICE_DELAY_SEC * DESIGN_FPS);
export const TRANSITION_FRAMES = 18;
export const IRIS_FRAMES = 39;

const langKey = (language: DemoProps["language"]) => (language === "Spanish" ? "spanish" : "english");

export const introFramesForLanguage = (
  language: DemoProps["language"],
  transFrames: number = TRANSITION_FRAMES,
): number => {
  const key = langKey(language);
  const sec =
    (audioManifest as { quizTitleDurationSec?: Record<string, number | null> }).quizTitleDurationSec?.[key] ??
    (key === "spanish" ? 6 : 5.36);
  return Math.ceil(sec * DESIGN_FPS) + transFrames;
};

type EndingDurationManifest = { endingDurationSec?: Record<string, Record<string, number | null>> };

export const outroFramesForEnding = (
  language: DemoProps["language"],
  endingKey: ReturnType<typeof resolveEndingKey>,
  transFrames: number = TRANSITION_FRAMES,
): number => {
  const key = langKey(language);
  const sec =
    (audioManifest as EndingDurationManifest).endingDurationSec?.[key]?.[endingKey] ??
    (endingKey === "how-many" ? 3.84 : 4.2);
  const voiceFrames = Math.ceil(sec * DESIGN_FPS);
  return Math.max(OUTRO_FRAMES_MIN, voiceFrames + OUTRO_TAIL_FRAMES - transFrames);
};

export const levelsToRender = (save: string, levels: string): number => {
  const all = levelCount(save);
  if (levels === "All") return all;
  return Math.max(1, Math.min(parseInt(levels, 10) || all, all));
};

export const totalFramesForFps = (
  fps: number,
  n: number,
  transFrames = TRANSITION_FRAMES,
  language: DemoProps["language"] = "English",
  ending: DemoProps["ending"] = "Random",
  save = "",
): number => {
  const endingKey = resolveEndingKey(ending, save);
  const outroFrames = outroFramesForEnding(language, endingKey, transFrames);
  const design =
    BALL_INTRO_FRAMES +
    introFramesForLanguage(language, transFrames) +
    n * LEVEL_FRAMES +
    outroFrames -
    IRIS_FRAMES -
    (n + 1) * transFrames;
  return Math.round((design * fps) / DESIGN_FPS);
};

export const calculateMetadata: CalculateMetadataFunction<DemoProps> = ({ props }) => {
  const n = levelsToRender(props.save, props.levels);
  const transFrames = transitionFramesFor(props.transition, TRANSITION_FRAMES);
  return {
    durationInFrames: totalFramesForFps(60, n, transFrames, props.language, props.ending, props.save),
  };
};

export const FootballQuizDemo: React.FC<DemoProps> = (props) => {
  const k = useFrameScale();
  const f = (designFrames: number) => Math.round(designFrames * k);

  const background = resolveBackground(props);
  const transFrames = transitionFramesFor(props.transition, TRANSITION_FRAMES);
  const timing = linearTiming({ durationInFrames: f(transFrames) });
  const transitionFor = () => getPresentation(props.transition);

  const n = levelsToRender(props.save, props.levels);
  const endingKey = resolveEndingKey(props.ending, props.save);
  const outroFrames = outroFramesForEnding(props.language, endingKey, transFrames);
  const introFrames = introFramesForLanguage(props.language, transFrames);
  const introStartDesign = BALL_INTRO_FRAMES - IRIS_FRAMES;
  const formationLabel = props.formation === AUTO_FORMATION ? null : props.formation;

  const levels = React.useMemo(
    () => Array.from({ length: n }, (_, i) => resolveLevel(props.save, i + 1, formationLabel)),
    [props.save, n, formationLabel],
  );

  const children: React.ReactNode[] = [];
  children.push(
    <TransitionSeries.Sequence key="ball" durationInFrames={f(BALL_INTRO_FRAMES)}>
      <BallIntro bg={background} />
    </TransitionSeries.Sequence>,
  );
  children.push(
    <TransitionSeries.Transition key="t-iris" presentation={iris()} timing={linearTiming({ durationInFrames: f(IRIS_FRAMES) })} />,
  );
  children.push(
    <TransitionSeries.Sequence key="intro" durationInFrames={f(introFrames)}>
      <Intro language={props.language} questionsCount={n} strings={INTRO_STRINGS} titleFontSize={TITLE_FONT_SIZE} />
    </TransitionSeries.Sequence>,
  );
  levels.forEach((lvl, i) => {
    children.push(<TransitionSeries.Transition key={`t-l${i}`} presentation={transitionFor()} timing={timing} />);
    children.push(
      <TransitionSeries.Sequence key={`l${i}`} durationInFrames={f(LEVEL_FRAMES)}>
        <Level bg={background} level={lvl} levelNumber={i + 1} language={props.language} />
      </TransitionSeries.Sequence>,
    );
  });
  children.push(<TransitionSeries.Transition key="t-out" presentation={transitionFor()} timing={timing} />);
  children.push(
    <TransitionSeries.Sequence key="out" durationInFrames={f(outroFrames)}>
      <Outro language={props.language} endingKey={endingKey} />
    </TransitionSeries.Sequence>,
  );

  // ── audio layer (absolute composition timing) ──
  const voiceLangKey = langKey(props.language);
  const quizTitleSrc = audioManifest.quizTitle[voiceLangKey];
  const endingSrc = audioManifest.ending[voiceLangKey][endingKey];
  const introEnd = introStartDesign + introFrames;
  const outroStart = introEnd - transFrames + (n - 1) * (LEVEL_FRAMES - transFrames) + LEVEL_FRAMES - transFrames;

  return (
    <>
      <Stage>
        <AnimatedBackground bg={background} />
        <AbsoluteFill>
          <TransitionSeries>{children}</TransitionSeries>
        </AbsoluteFill>
      </Stage>

      {audioManifest.bgm ? <Audio src={staticFile(audioManifest.bgm)} loop volume={0.22} /> : null}
      {quizTitleSrc ? (
        <Sequence from={f(introStartDesign)}>
          <Audio src={staticFile(quizTitleSrc)} volume={1} />
        </Sequence>
      ) : null}
      {endingSrc ? (
        <Sequence from={f(outroStart + ENDING_VOICE_DELAY_FRAMES)}>
          <Audio src={staticFile(endingSrc)} volume={1} />
        </Sequence>
      ) : null}
    </>
  );
};
```

- [ ] **Step 2: Create src/Root.tsx**

The first save name from runner-8 blocks is "Player names 1". The defaultProps.save must be a real save name from the data.

```tsx
import React from "react";
import { Composition } from "remotion";
import { FootballQuizDemo, calculateMetadata, totalFramesForFps } from "./FootballQuizDemo";
import { demoSchema } from "./schema";
import { COMPOSITION_ID, THEME_DEFAULT } from "./config";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={FootballQuizDemo}
      durationInFrames={totalFramesForFps(60, 5)}
      calculateMetadata={calculateMetadata}
      fps={60}
      width={1920}
      height={1080}
      schema={demoSchema}
      defaultProps={{
        save: "Player names 1" as const,
        levels: "1" as const,
        formation: "Auto (from save)" as const,
        language: "English" as const,
        ending: "Random" as const,
        competition: "None — use Color + Effect" as const,
        color: THEME_DEFAULT.color,
        effect: THEME_DEFAULT.effect,
        opacity: THEME_DEFAULT.opacity,
        transition: "Soft Iris" as const,
      }}
    />
  );
};
```

---

## Task 7: Create scripts/build-data.mjs

**Files:**
- Create: `scripts/build-data.mjs`

Runner-8 blocks use prefix `"8|"`. Each block's `teamsImportText` has lines in the format `"PlayerName - Club"`. For each line: playerName = part before ` - `; club = part after ` - `; display = `displayName(playerName)` (last name, or whole if one word); photoPath = `buildPhotoIndex(IMAGES)(club, playerName)`; revealVoice via `makeVoiceHelpers(VOICES_SRC, "Players Names").resolveTeamVoice(playerName, REVEAL_EN/REVEAL_ES)`.

Quiz title voice: `"Game name/Four Params Regular/english/Guess the football player name !!!.mp3"` (exact filename confirmed above). Spanish: no equivalent file found — will return null.

- [ ] **Step 1: Create scripts/build-data.mjs**

```mjs
// Runner 8 — "Guess the Football Player Name".
// Saves store only a player list (teamsImportText: "PlayerName - Club" per line).
// Emits src/generated/{saves,audio}.json and syncs assets into <repo>/.remotion-shared/public.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoPaths,
  displayName,
  buildPhotoIndex,
  makeVoiceHelpers,
  REVEAL_EN,
  REVEAL_ES,
  COMMON_ASSETS,
  buildAudioManifest,
  firstBgm,
  syncAssets,
  syncVoices,
} from "../../../.remotion-shared/src/build-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const P = repoPaths(projectDir);

const resolvePhoto = buildPhotoIndex(P.IMAGES);
// Player reveal voices live in "Players Names/<lang>/<phrase>/<Player>.mp3"
const V = makeVoiceHelpers(P.VOICES_SRC, "Players Names");

let missingPhotos = 0;
let missingRevealVoices = 0;

const data = JSON.parse(fs.readFileSync(P.SAVES_JSON, "utf-8"));
const blocks = data.blocks || {};
const saves = [];

for (const key of Object.keys(blocks)) {
  if (!key.startsWith("8|")) continue;
  const block = blocks[key];
  const name = String(block.name || "").trim();
  if (!name) continue; // unnamed blocks are placeholders
  const lines = String(block.teamsImportText || "")
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) continue;

  const levels = [];
  for (const line of lines) {
    const dashIdx = line.indexOf(" - ");
    const playerName = dashIdx >= 0 ? line.slice(0, dashIdx).trim() : line.trim();
    const club = dashIdx >= 0 ? line.slice(dashIdx + 3).trim() : "";
    if (!playerName) continue;

    const photoPath = resolvePhoto(club, playerName);
    if (!photoPath) missingPhotos += 1;

    const revealVoiceEn = V.resolveTeamVoice(playerName, REVEAL_EN);
    const revealVoiceEs = V.resolveTeamVoice(playerName, REVEAL_ES) || revealVoiceEn;
    if (!revealVoiceEn) missingRevealVoices += 1;

    levels.push({
      playerName,
      display: displayName(playerName),
      photoPath,
      revealVoiceEn,
      revealVoiceEs,
    });
  }
  if (levels.length) saves.push({ name, levels });
}

const OUT = path.join(projectDir, "src", "generated", "saves.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ saves }, null, 0));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✓ ${saves.length} saves, ${saves.reduce((n, s) => n + s.levels.length, 0)} levels -> src/generated/saves.json (${kb} KB)`);
console.log(`  unresolved: photos ${missingPhotos}, reveal voices ${missingRevealVoices}`);

// ── audio manifest ────────────────────────────────────────────────────────────
const bgm = firstBgm(V, P.VOICES_SRC);
// Exact filenames confirmed in .Storage/Voices/Game name/Four Params Regular/english/
const quizTitleEn = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/english", /player name/i));
// No Spanish "player name" voice exists in Game name/Four Params Regular/spanish — returns null gracefully
const quizTitleEs = V.voiceRel(V.findVoiceFile("Game name/Four Params Regular/spanish", /nombre del jugador/i));
const audio = buildAudioManifest(V, { bgm, quizTitleEn, quizTitleEs });
const AUDIO_OUT = path.join(projectDir, "src", "generated", "audio.json");
fs.writeFileSync(AUDIO_OUT, JSON.stringify(audio, null, 0));
console.log(`  audio: bgm ${audio.bgm ? "ok" : "MISSING"}, quizTitle EN ${audio.quizTitle.english ? "ok" : "—"}/ES ${audio.quizTitle.spanish ? "ok" : "—"}, reveal-voice missing: ${missingRevealVoices}`);

// ── sync assets + voices into the shared public folder ────────────────────────
const wanted = new Set();
for (const s of saves) {
  for (const lv of s.levels) {
    wanted.add(lv.photoPath);
  }
}
COMMON_ASSETS.forEach((p) => wanted.add(p));
const a = syncAssets([...wanted], P.IMAGES, P.SHARED_PUBLIC);
console.log(`  shared cache: +${a.copied} copied, ${a.upToDate} up-to-date, ${a.missing} missing`);
const v = syncVoices(V.wantedVoices, P.VOICES_SRC, P.SHARED_PUBLIC);
console.log(`  voices: +${v.copied} copied, ${v.upToDate} up-to-date, ${v.missing} missing`);
```

---

## Task 8: Create scripts/render.mjs

**Files:**
- Create: `scripts/render.mjs`

- [ ] **Step 1: Create scripts/render.mjs**

```mjs
// Render a video into the shared Ready Videos tree, grouped by QUIZ then language:
//   ___Remotion___/Ready Videos/<Quiz Name>/<Language>/<save>.mp4
// Usage:  npm run render -- --save "Player names 1" --language English --levels All [--fps 60]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSITION_ID = "Guess-The-Football-Player-Name-Regular";
const QUIZ_NAME = "Guess The Player Name";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const save = arg("save", "Player names 1");
const language = arg("language", "English");
const levels = arg("levels", "All");
const fps = arg("fps", "60");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const outDir = path.resolve(projectDir, "..", "Ready Videos", QUIZ_NAME, language);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${save}.mp4`);

const propsFile = path.join(projectDir, "out", ".render-props.json");
fs.mkdirSync(path.dirname(propsFile), { recursive: true });
fs.writeFileSync(propsFile, JSON.stringify({ save, language, levels }));

console.log(`▶ Rendering "${save}" (${language}, levels=${levels}) → ${outFile}`);
const cmd = `npx remotion render ${COMPOSITION_ID} "${outFile}" "--props=${propsFile}"`;
const res = spawnSync(cmd, { cwd: projectDir, stdio: "inherit", shell: true });
process.exit(res.status ?? 0);
```

---

## Task 9: Install dependencies and run build-data

**Files:** None (running commands)

- [ ] **Step 1: Install npm dependencies**

```powershell
cd "C:\Users\Rom\Documents\GitHub\Football Channel\___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion"
npm install --no-audit --no-fund
```

Expected: resolves ~350 packages, no errors. If `sharp` native build fails on Windows that's fine — it's optional for build-data.

- [ ] **Step 2: Run build-data**

```powershell
node scripts/build-data.mjs
```

Expected output (numbers approximate):
```
✓ 26 saves, ~550 levels -> src/generated/saves.json (~XX KB)
  unresolved: photos ~150, reveal voices ~100
  audio: bgm ok, quizTitle EN ok/ES —, reveal-voice missing: ~100
  shared cache: +NNN copied, NNN up-to-date, NNN missing
  voices: +NNN copied, NNN up-to-date, NNN missing
```

If the script errors:
- `Cannot find module '../../../.remotion-shared/src/build-lib.mjs'` → path is wrong; verify `path.resolve(__dirname, "..")` points to the project root, and `../../../` from `scripts/` reaches the repo root.
- `SAVES_JSON not found` → repoPaths walked up but missed `.Storage`; check the repo root detection logic.

- [ ] **Step 3: Verify generated files exist**

```powershell
ls src/generated/
```

Expected: `saves.json` and `audio.json` both present and non-empty.

---

## Task 10: Render verification stills

**Files:** None (running commands). `out/` dir is created by remotion automatically.

- [ ] **Step 1: Create out/ directory**

```powershell
mkdir out -Force
```

- [ ] **Step 2: Render silhouette still (frame 600 = question phase)**

Frame 600 at 60fps = design-frame 300, which is level 1, design frame 300 - BALL_INTRO(90) - intro(~186) = ~24 into level 1 (well before REVEAL_START=185).

```powershell
npx remotion still Guess-The-Football-Player-Name-Regular out/q.png --frame=600 --scale=0.5 --timeout=120000 --concurrency=2
```

Expected: Renders without error. `out/q.png` exists and is ~200-400 KB.

- [ ] **Step 3: Read and inspect out/q.png**

Use the Read tool to view `out/q.png`. Verify:
- Background has the deep lavender / sun-spiral-center effect
- A dark silhouetted player shape in the center card (no color visible, just a dark blob)
- Gold badge "1" in top-left
- Timer ring in top-right with a number
- Pill bar below card showing "?"

If the card is empty (no silhouette): `photoPath` was null for level 1 of "Player names 1"; check that `Images/Players/Club images/Bayern Munich/Harry Kane/` exists and `buildPhotoIndex` resolved it.

- [ ] **Step 4: Render reveal still (frame 830 = reveal phase)**

Frame 830 at 60fps = design-frame 415, which is BALL_INTRO(90) + intro(~186) = level start at ~276 design-frame. Level 1 starts at design-frame 276. REVEAL_START = 185. So reveal starts at design-frame 276 + 185 = 461. Frame 830 / (60/30) = design-frame 415 — still in question phase for level 1.

Recalculate: BALL_INTRO = 90df, IRIS = 39df, introFrames for EN ≈ ceil(~3.2s × 30) + 18 ≈ 114df. Level 1 starts at design-frame: 90 - 39 + 114 = 165df. Level 1 reveal at: 165 + 185 = 350df. At 60fps that's frame 700. Use frame 830 which is at design-frame 415 → still in level 1 (0..320df from level start) → local-frame 415 - 165 = 250 > 185 = REVEAL_START. So frame 830 IS in reveal phase.

Actually redo: design-frame = real-frame × (30/60). Frame 830 × 0.5 = design-frame 415. Level 1 occupies design-frames 165..485 (165 + 320 = 485). Local-frame within level 1 = 415 - 165 = 250 > REVEAL_START=185. ✓ This IS the reveal phase.

```powershell
npx remotion still Guess-The-Football-Player-Name-Regular out/r.png --frame=830 --scale=0.5 --timeout=120000 --concurrency=2
```

Expected: Renders without error. `out/r.png` exists.

- [ ] **Step 5: Read and inspect out/r.png**

Use the Read tool to view `out/r.png`. Verify:
- Background still visible with the effect
- The centered card shows the player in FULL COLOR (no dark filter)
- The pill bar shows the player's display name in uppercase (e.g. "KANE")
- Badge + timer are faded out (or invisible)

If the reveal bar still shows "?" (revealProgress not advancing): check that `REVEAL_START=185` in Level.tsx and that `useDesignFrame()` is returning the right local frame (it returns absolute design-frame; the level receives frames 165..485 in design-space; local frame within the level is absolute − level-start. **The Level component does NOT subtract a local offset** — it uses `useCurrentFrame()` via `useDesignFrame()` which is already local to the Sequence).

- [ ] **Step 6: Iterate if needed**

Common issues and fixes:

**Silhouette is invisible (card is black/empty)**: photoPath null for the first level. Check:
```powershell
node -e "const d=JSON.parse(require('fs').readFileSync('src/generated/saves.json','utf-8')); console.log(JSON.stringify(d.saves[0].levels[0], null, 2))"
```
If `photoPath` is null, `Harry Kane - Bayern Munich` didn't match. The photo index looks under `Images/Players/Club images/Bayern Munich/Harry Kane/`. Verify that folder exists:
```powershell
ls "C:\Users\Rom\Documents\GitHub\Football Channel\Images\Players\Club images\Bayern Munich\Harry Kane"
```
If the folder name differs (e.g., spaces/accents), adjust the teamsImportText parse logic or use `buildSquadPlayerIndex` as a fallback.

**Bar text doesn't switch to name**: The `revealProgress > 0.1` threshold uses `revealProgress` calculated from `frame` which is `useDesignFrame()` (the local frame inside the Sequence). Verify the Sequence wraps the Level with the right `durationInFrames`. If `frame` is always 0, the `useDesignFrame()` in Level calls `useCurrentFrame()` which IS local to the Sequence — this should work.

**TypeScript errors on `formation` field**: `schema.ts` has `formation` but `Level.tsx` ignores it and `resolveLevel` takes `_formationLabel` (ignored). The `FootballQuizDemo.tsx` still passes `formationLabel` to `resolveLevel` which is fine since `resolveLevel` ignores it.

---

## Self-Review Checklist

1. **Spec coverage check:**
   - ✓ Folder: `___Remotion___\8_Guess The Football Player Name - Main Runner - Regular_Remotion\`
   - ✓ runner-2 files copied verbatim: remotion.config.ts, tsconfig.json, src/index.ts, src/schema.ts, FootballQuizDemo.tsx
   - ✓ package.json: name changed to `guess-the-player-name-remotion`, composition id updated
   - ✓ render.mjs: COMPOSITION_ID + QUIZ_NAME updated
   - ✓ Open Remotion Studio.bat: retitled + CRLF conversion step included
   - ✓ config.ts: English titleLines ["Guess The Football","Player Name"], Spanish ["Adivina El Nombre","Del Jugador De Fútbol"], season, questions, bonus, TITLE_FONT_SIZE=104
   - ✓ THEME_DEFAULT: color `"#9575CD - Football Player Name"` (label for extra-deep-lavender), effect `"Sun spiral middle"` (label for sun-spiral-center), opacity 0.5
   - ✓ Level.tsx: centered card ~480px, silhouette filter (brightness/contrast/saturate), "?" bar, reveal to full color + name, LevelBadge + Timer verbatim from runner-2, REVEAL_START=185, audio ticking/stinger/voice sequences verbatim
   - ✓ level-data.ts: ResolvedLevel with playerName/display/photoPath/revealVoiceEn/revealVoiceEs, SAVE_NAMES, levelCount, resolveLevel
   - ✓ build-data.mjs: prefix "8|", named only, teamsImportText "PlayerName - Club" parse, photo via buildPhotoIndex, voice via makeVoiceHelpers("Players Names"), audio.json quiz title regex /player name/i for EN
   - ✓ npm install + node scripts/build-data.mjs verification steps
   - ✓ stills at frame 600 (silhouette "?") and frame 830 (color name) with iterate-if-needed guidance

2. **Placeholder scan:** No TBDs or incomplete steps found.

3. **Type consistency:**
   - `ResolvedLevel` in `level-data.ts` has `{ playerName, display, photoPath, revealVoiceEn, revealVoiceEs }` — used correctly in `Level.tsx` (`level.display`, `level.revealVoiceEn/Es`, `level.photoPath`)
   - `resolveLevel` signature: `(saveName: string, levelNumber: number, _formationLabel: string | null): ResolvedLevel` — called from `FootballQuizDemo.tsx` as `resolveLevel(props.save, i + 1, formationLabel)` ✓
   - `SAVE_NAMES` exported from `level-data.ts`, imported in `schema.ts` ✓
   - `COMPOSITION_ID` exported from `config.ts`, imported in `Root.tsx` ✓
   - `audioManifest.ticking` — built by `buildAudioManifest` which sets `ticking` from `V.voiceRel("Ticking sound/ticking sound.mp3")` ✓
