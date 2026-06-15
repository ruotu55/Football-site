# Guess The Football Team Name — Remotion

A [Remotion](https://www.remotion.dev/) recreation of the
**Guess The Football Team Name** runner, driven by the project's real saves and
shared image library. One composition:

| Composition id | Resolution | fps |
|---|---|---|
| `Guess-The-Football-Team-Name-Regular` | 3840×2160 | 60 |

**Flow:** ball intro → quiz-type intro → level (pitch) → ending (~19s).

## Setup

```bash
npm install
npm run setup     # builds src/generated/saves.json AND syncs the referenced
                  # image subset into the ONE shared folder all projects use:
                  # <repo>/.remotion-shared/public
npm run studio    # live preview at http://localhost:3000
```

`npm run setup` (= `npm run build-data`) must be run once, and again whenever the
saves or image library change. It reads `../.Storage/storage/recording-status.json`
and walks `../Images/`, so the repo must stay one level above this project.

## Studio controls (right sidebar, grouped)

Driven by a Zod schema (`src/schema.ts`):

- **Quiz**
  - **Save** — which saved block to load (Champion League, Premier League, …).
  - **Level** — `1..N`; picks which level (team) of that save to show.
  - **Formation** — `Auto (from save)` or any of 13 (4-3-3, 4-4-2, 3-5-2, …).
  - **Language** — English / Spanish (logo, intro title, ending text).
  - **Questions count** — the intro's "N QUESTIONS" number.

There is no Ending control. At **50% of the levels** the BONUS flow plays:
**BONUS window** (starburst + "BONUS QUESTION!" + one of 5 voice variants from
`.Storage/Voices/Bonus/<lang>/bonus-01..05.mp3`, picked per save)
→ the **bonus level** (its sequence is cut at the reveal tick, so the countdown
runs out but the answer is NEVER revealed) → the **mid-quiz break** ("Think you
know the answer?" + "Comment below!", voice from `.Storage/Voices/Ending Guess/`)
→ the quiz continues. The outro is ALWAYS "How many did you get?".
- **Look**
  - **Background** — competition / color / effect / opacity (16 colors, 10 moving
    effects, 11 competitions; a competition overrides color+effect).
  - **Transition** — Fog (default), Fade, Slide, Wipe, Flip, Clock Wipe.

## Render

```bash
npm run render    # -> out/demo-4k60.mp4 (uses the saved default props)
```

Render a specific config by passing props, e.g.:

```bash
npx remotion render Guess-The-Football-Team-Name-Regular out/arsenal.mp4 \
  --props='{"quiz":{"save":"Premier league","level":3,"formation":"4-4-2","language":"English","ending":"Random","questionsCount":30},"look":{...}}'
```

## Architecture

- **Data** — `scripts/build-data.mjs` reads the runner-1 saves + walks the image
  library, resolving each level's squad (player photos by name, nationality
  flags, team crest) into `src/generated/saves.json`. `src/level-data.ts` loads
  it and, for a chosen save+level+formation, picks the XI (preferring players
  that have a photo) laid out on the formation.
- **Shared assets (one copy for all projects)** — `remotion.config.ts` sets
  `publicDir` to `<repo>/.remotion-shared/public`, a SINGLE shared folder used by
  every Remotion project (no per-project duplication). `build-data` syncs only
  the *referenced* files into it (union; skips already-synced). The repo's
  `Images/` is the source; the shared folder is a git-ignored cache. Studio serves
  it in place; renders copy just this bounded subset (~140 MB), not the 624 MB
  library. `src/paths.ts` resolves `staticFile("Teams/…")` etc.
- **Scenes** — `src/scenes/{BallIntro,Intro,Level,Outro}.tsx`,
  components `src/components/{SoccerBall,Pitch,PlayerSlot,RevealPanel,Stage}.tsx`,
  effects `src/effects/`, transitions `src/transitions/`.
- **Resolution/fps independence** — everything is authored in a 1920×1080 / 30fps
  design space (`src/timing.ts`): a `Stage` wrapper scales the layout, a virtual
  design-frame keeps timing constant. Renders crisply at 4K60.
- All animation is Remotion-native (`spring`/`interpolate`); CSS keyframes are
  avoided (they don't render).
- **Audio** — `src/generated/audio.json` (from `build-data`): BGM, quiz-title,
  per-level reveal voices, ticking/stinger, the **mid-break voice** (`midBreak`:
  "Think you know the answer? Comment below… let's continue!") and the **ending
  voice** (always `how-many`). `src/ending.ts` exposes `breakAfterLevels(n)`;
  `FootballQuizDemo.tsx` stamps the break + ending `<Audio>` at each
  transition-start frame.

## Reusing for new quiz types

The build script + `saves.json` model + `src/paths.ts` + `public/shared` sync are
the shared core. A new quiz type: copy the project, run `npm run setup`, reuse
the data/paths, and swap only the quiz-specific scenes.

Design notes: [docs/2026-06-10-shared-data-controls-design.md](docs/2026-06-10-shared-data-controls-design.md).
