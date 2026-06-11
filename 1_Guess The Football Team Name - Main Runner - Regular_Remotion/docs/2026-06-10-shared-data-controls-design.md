# Remotion quiz: shared assets/data + data-driven controls — design

**Date:** 2026-06-10
**Project:** `1_Guess The Football Team Name - Main Runner - Regular_Remotion`

## Goal

Stop the Remotion project from carrying its own copied assets and hard-coded
single team. Instead:

1. **Share** the repo's image library + saves (one source of truth for every
   future quiz-type project).
2. Drive the video from a **loaded save**: a `Save` control picks a saved block,
   a `Level` number picks which level (team) within it, and the pitch renders
   that level's squad — like the runner.
3. Add grouped **Studio controls** so teams/levels (and later formation,
   language, ending) are editable without code.

Built in **two phases**.

## Control model (decided)

- **Save** — dropdown of runner-1 saved blocks (e.g. "Champion League",
  "Mixed teams 1"), read from `recording-status.json`.
- **Level** — number `1..N`; selects which *playable* level (team) of that save
  to render. A save holds all its levels; changing the number changes the team.
- **Look** (existing): Background (competition / color / effect / opacity) +
  Transition.
- **Phase 2:** Formation, Language (EN/ES), Ending type.

## Why a build step

Player photo files have **hashed names** (`26-….webp`) and Remotion runs in the
browser, which cannot list folders. So resolution happens once, at build time,
in Node (which has `fs`).

---

## Phase 1 — shared foundation + Save/Level controls

### 1.1 Shared junctions
`scripts/link-shared.mjs` (run via `npm run setup`) creates Windows directory
junctions (`fs.symlinkSync(target, path, "junction")`, no admin needed):

- `public/shared` → `<repo>/Images`
- `public/data`   → `<repo>/.Storage/storage`

So `staticFile("shared/Teams/Spain/LaLiga/Real Madrid.png")` and
`staticFile("shared/Logo/Football Quiz Logo English.png")` serve the real files.
`.gitignore` adds `public/shared` and `public/data` (machine-local, recreated by
`npm run setup`). The copied `public/{brand,players,natflags,emojis}` are deleted.

### 1.2 Data build script
`scripts/build-data.mjs` (Node) → emits `src/generated/saves.json`:

```jsonc
{
  "saves": [
    {
      "name": "Champion League",
      "levels": [
        {
          "teamName": "Real Madrid",
          "crestPath": "shared/Teams/Spain/LaLiga/Real Madrid.png",
          "formationId": "433",
          "country": "Spain",
          "players": [
            { "name": "Vinicius Junior", "display": "Vinícius Jr",
              "position": "Left Winger", "nationality": "Brazil",
              "flagPath": "shared/Nationality/South America/Brazil.png",
              "photoPath": "shared/Players/Club images/Spain/LaLiga/Real Madrid/Vinicius Junior/26-….webp" }
          ]
        }
      ]
    }
  ]
}
```

Steps:
1. Read `recording-status.json`; keep blocks keyed `1|long|*`.
2. For each block, keep **playable** levels (have `currentSquad`; skip
   `isLogo/isIntro/isOutro`). Flatten `currentSquad.{goalkeepers,defenders,midfielders,attackers}`
   into `players` (tagged by group).
3. Build a **player-photo index** by walking `Images/Players/Club images/**`
   (`<Country>/<League>/<Club>/<Player>/<file>.webp`) → map `(club, normalizedName)` → first webp.
4. Build a **flag index** by walking `Images/Nationality/**` → `normalizedCountry` → png.
5. Resolve each player's `photoPath` (via index; `null` → silhouette fallback in
   the component) and `flagPath` (via nationality). `crestPath` comes from the
   save's `currentSquad.imagePath` (rewrite `Images/…` → `shared/…`).
6. Write `src/generated/saves.json`. Run via `npm run build-data` (re-run when
   images/saves change). Log counts of unresolved photos/flags.

Normalization mirrors the runner's accent/punctuation handling so names match.

### 1.3 Schema + controls
`src/schema.ts`:
- `save`: `z.enum([...saveNames])` (from `saves.json`, default first).
- `level`: `z.number().min(1)` (clamped to the save's level count in code).
- Keep `competitionBackground / backgroundColor / backgroundEffect / opacity / transitionEffect`.

Grouped via a nested `z.object` (`quiz: {...}`, `look: {...}`) so Studio shows
collapsible sections.

### 1.4 Wiring
- A `resolveLevel(save, level)` helper reads `saves.json`, clamps the level,
  returns the resolved team (crest, players, formationId).
- `Level.tsx` / `FootballQuizDemo.tsx` consume the resolved team instead of the
  hard-coded `data.ts`. XI for the level = pick by the level's `formationId`
  (1 GK + def/mid/fwd counts) from the squad groups (first-N per group).
- All asset references (logo, emojis, crest, player photos, flags) switch to
  `staticFile("shared/…")`. `data.ts` (hard-coded Real Madrid) is removed.
- Intro/Outro keep English defaults this phase.

### 1.5 Verify
Render stills for two different saves and two different level numbers; confirm
the correct teams, crests, photos and flags resolve from `shared/`.

---

## Phase 2 — formation / language / ending controls (outline)

- **Formation**: `z.enum` of formation labels; port `formations.js` coords into
  `src/formations.ts`; the level uses the chosen formation (overriding the
  save's `formationId`).
- **Language** EN/ES: switches the logo (English/Spanish), intro title text, and
  ending text (mirrors the runner's i18n strings).
- **Ending type**: random / think-you-know / how-many → outro copy.

## Reusability (future)

The junctions + `build-data.mjs` + `saves.json` model + `paths.ts` are the
**shared core**. A new quiz type copies the project, runs `npm run setup` +
`npm run build-data`, reuses the data/paths, and swaps only the quiz-specific
scenes. A formal shared npm package is a later step once 2–3 types exist.

## Risks / notes

- **Unresolved photos/flags**: name-matching can miss; the build logs misses and
  the component shows a silhouette fallback. Acceptable for Phase 1.
- **Junctions not in git**: intentional; `npm run setup` recreates them. The repo
  must be at the expected relative location (`Images/`, `.Storage/` two levels up).
- **saves.json size**: runner-1 only; imported into the bundle. If too large
  later, switch to `fetch(staticFile("generated/saves.json"))` in `calculateMetadata`.
