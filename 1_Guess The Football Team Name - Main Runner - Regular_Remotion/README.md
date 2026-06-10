# Guess The Football Team Name — Remotion demo

A small [Remotion](https://www.remotion.dev/) recreation of the
**1_Guess The Football Team Name - Main Runner - Regular** runner's video flow:

**Ball intro → quiz-type intro → 1 level → ending** (~20s), available as two
compositions:

The **ball intro** (`src/scenes/BallIntro.tsx`) ports the runner's ball-preloader:
4 soccer balls orbit inward and gooey-merge (SVG goo filter) into one ball
(`src/components/SoccerBall.tsx`), which expands to fill the screen and then
"opens" via a circular iris (`src/transitions/iris.tsx`) to reveal the quiz type.


| Composition id | Resolution | fps | Output |
|---|---|---|---|
| `FootballQuizDemo` | 1920×1080 | 30 | `out/demo.mp4` |
| `FootballQuizDemo4K60` | 3840×2160 | 60 | `out/demo-4k60.mp4` |

Both run from the same scene code. Everything is authored in a 1920×1080 /
30fps "design space" (`src/timing.ts`): a `Stage` wrapper scales the layout to
any resolution, and a virtual design-frame keeps the animation playing at the
same real-time speed at any fps. So a single codebase renders crisply at 1080p30
or native 4K60.

The single level uses real save data: level 2 of the **"Champion League"** save
(`recording-status.json → blocks["1|long|1"]`), i.e. **Real Madrid** in a 4-3-3.

## What it shows

1. **Intro** — animated title, "2025/6 SEASON", "30 QUESTIONS + BONUS", logo.
2. **Level** — SVG football pitch (the runner's real 4-3-3 coordinates), 11 Real
   Madrid players (real photos) popping in, then a side panel slides in from the
   left to reveal the answer: **Real Madrid** crest + Spain flag.
3. **Ending** — like/subscribe emojis, logo, "THINK YOU KNOW THE ANSWER?".

All animation is Remotion-native (`spring` / `interpolate`) per the
remotion-best-practices skill. CSS transitions/keyframes are intentionally avoided.

## Studio controls (props)

Open `npm run studio` and use the **right sidebar** to edit these live (no
re-render needed). They're a Zod schema (`src/schema.ts`) and the option lists
are ported 1:1 from the runner's `.Storage/shared/backgrounds/background-theme.js`
(`src/effects/effects-data.ts`). The animated background renders at the
composition level so it stays continuous across scene cuts
(`src/effects/AnimatedBackground.tsx`).

> Remotion forbids CSS `@keyframes`, so every effect is driven by
> `useCurrentFrame()` instead — and **every effect moves**.

- **Competition Background** — `None — use Color + Effect`, or one of 11
  competitions (Champions League, Europa, Conference, Premier League, La Liga,
  Bundesliga, Serie A, Ligue 1, World Cup, Euro). Picking one **overrides**
  Color + Effect with that competition's gradient + moving pattern
  (stars drift / chevrons drift / diagonal slide / rotating rays).
- **Background Color** — all **16** runner colors (labelled hex).
- **Background Effect** — all **10** runner effects, all animated: Sun effect
  middle / top-right / top-left, Sun spiral middle, Center circles, Floating
  emojis, Rising question marks, Diagonal flow, YouTube thumbnails, Rising
  soccer balls.
- **Opacity** — 0–1 (effect intensity).
- **Transition Effect** — applied to both cut points. Default **Fog** (a blurred
  white-mist dissolve, used between the intro and the first level). Other
  options: Fade, Slide, Wipe, Flip, Clock Wipe. `src/transitions/`.

## Real assets

Copied into `public/` from the repo (`/Images`):

- `brand/logo.png` — Football Quiz logo
- `brand/crest.png` — Real Madrid crest
- `brand/flag.png` — Spain flag
- `brand/like.png`, `brand/subscribe.png` — outro emojis
- `players/*.webp` — the 11 starting-XI player photos

Font: **Barlow Condensed** (the runner's title font) via `@remotion/google-fonts`.

## Commands

```bash
npm install
npm run studio          # live preview at http://localhost:3000
npm run render          # 1080p30 -> out/demo.mp4
npm run render:4k60     # 4K 60fps -> out/demo-4k60.mp4
npm run still           # single still -> out/still.png
```

## Source layout

- `src/Root.tsx` — registers the `FootballQuizDemo` composition
- `src/FootballQuizDemo.tsx` — `TransitionSeries` stitching the 3 scenes
- `src/scenes/{Intro,Level,Outro}.tsx`
- `src/components/{Pitch,PlayerSlot,RevealPanel}.tsx`
- `src/data.ts` — the XI + team (formation coords from the runner)
- `src/theme.ts` — brand colors + font
