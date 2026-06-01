# Football Quiz (Multiple Choice) — Main Runner Regular — Design

**Date:** 2026-06-01
**Status:** Approved, implementing

## Goal
A new "Main Runner - Regular" quiz: a football multiple-choice quiz with **3 answers (A/B/C)**.
It alternates two question styles (strict 25 + 25) and ships with a first saved script,
**"World Cup"**, containing 50 authored questions (EN + ES) with downloaded topic images and
full voice (intro + question + answer) wired through the existing ElevenLabs pipeline.

## Identity
- **Folder:** `9_Football Quiz Multiple Choice - Main Runner - Regular`
- **Base:** cloned from `6_Guess The Fake Informaiton - Regular` (closest: card layout, not pitch).
- **RUNNER_ID:** `9` (recording-queue.js)
- **RUNNER_VARIANT:** `"Football Quiz MCQ"` (own voice namespace — avoids cross-runner voice collisions)
- **quizType:** `"football-quiz-mcq"` (runner is generic MCQ; "World Cup" is the first saved script)
- **Default port:** auto (DEFAULT_PORT base, sequential bind as other runners)

## Two question layouts (strict alternating: Q1 trivia, Q2 player, ...)
- **trivia** (odd): topic image (left) + three text answer rows A/B/C.
- **which-player** (even): three player **photo cards** A/B/C (photos from `player-images.json`) + question text.
- **Reveal:** on timer end, correct row/card highlights green, others dim (reuse runner 6 reveal-class + timer/level-advance flow).

## New visuals (not already used)
- **Background color:** deep magenta `#C2185B`, id `quiz-football-mcq`, added to
  `.Storage/shared/backgrounds/background-theme.js` COLORS.
- **Transition:** new `wc-sweep` — gold diagonal light-bar sweep — added to transitions registry + CSS,
  set as this runner's default. All existing transitions remain selectable.

## Data: MCQ save schema
Per-question object (stored in a new saved-scripts file for runner 9):
```jsonc
{
  "questionType": "trivia" | "which-player",
  "questionText": { "english": "...", "spanish": "..." },
  "answers": [
    { "id": "A", "text": { "english": "...", "spanish": "..." }, "playerKey": null, "photoPath": null },
    { "id": "B", ... },
    { "id": "C", ... }
  ],
  "correctAnswerId": "A",
  "topicImage": "Images/Quiz/World Cup/<slug>.webp"  // trivia only; null for which-player
}
```
- `playerKey` references a `player-images.json` key for which-player answers; `photoPath` resolved/frozen on save.
- `levelsData` = array of these. First save = **"World Cup"**, 50 questions (25 trivia + 25 which-player).

## Trivia images
Downloaded into `Images/Quiz/World Cup/<slug>.<ext>` (same approach as player photos). 25 images.

## Voice (intro + question + answer)
- New phrase templates: intro title, per-question text, correct-answer text.
- Files: `.Storage/Voices/Game name/Football Quiz MCQ/<lang>/<slug>.mp3` (intro),
  `.Storage/Voices/MCQ/Football Quiz MCQ/<lang>/questions/<slug>.mp3`,
  `.../answers/<slug>.mp3`. Slug derived deterministically from text.
- **"Create voice for all"** bulk button enumerates every question + correct answer (EN & ES) and
  generates on click (~200 files). NOT auto-generated during build.

## Out of scope (v1)
- No in-app visual question editor. The 50 questions are authored as data (save JSON); user reviews/edits.

## Build phases
- **A** scaffold runner 9 (clone, rename identity, new color + transition)
- **B** MCQ rendering (2 layouts) + reveal + timer/flow
- **C** save schema + import + 50 World Cup questions
- **D** trivia image downloads
- **E** voice templating + bulk button
- **Verify** launch, render/reveal/transition, no console errors
