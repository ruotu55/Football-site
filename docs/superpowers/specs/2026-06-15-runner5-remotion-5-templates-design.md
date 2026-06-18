# Runner 5 Remotion — 5 swappable "guess the hidden player" templates

**Date:** 2026-06-15
**Scope:** `___Remotion___/5_Guess The Player By Club_Position_Country_Age - Regular_Remotion` only. No browser-runner or sibling-runner changes.

## Goal

Replace the single "5 frosted boxes" Level layout with **5 distinct, animated, premium templates** for the hidden-player quiz. The 4 clues (club crest, position, country flag, age) animate in one-by-one during the countdown; the player photo + name reveal after the timer (frame `REVEAL_START = 185`). The user previews all 5 and keeps the favorite.

## Architecture

- `scenes/Level.tsx` becomes a thin **orchestrator**: resolves the design frame, `revealProgress`, `uiOpacity`, timer seconds, asset srcs, and drives the **audio** (ticking / flip stinger / reveal voice — unchanged). It renders the **selected template** component, passing a single `TemplateProps`.
- `templates/common.tsx` — shared `TemplateProps` type + helpers: clue-reveal schedule (`clueSpring`), `translatePosition`, `ageUnit`, silhouette filter, `nameParts`.
- `templates/` — five self-contained visual components. Each renders its OWN timer, level badge, clue cluster, silhouette/reveal, and ambient "objects". This is what makes them feel completely different.
- `templates/index.ts` — registry: `id → { label, component }`. Drives both the schema enum and the preview compositions.

### Clue reveal schedule (design frames, 30fps space)
Clues appear sequentially at ~25 / 55 / 85 / 115, each a spring pop, all settled by ~135 — leaving tension before reveal at 185.

## The 5 templates

1. **FUT Gold Card** (`FutGoldCard`) — premium gold FIFA-style card; clues slot into the card one by one; reveal ignites gold + name banner + confetti. Objects: floating gold sparkles, shine sweep.
2. **Scout Dossier** (`ScoutDossier`) — detective evidence board, paper/ink; clue chips pin in with drawn connector lines to the silhouette; reveal = photo colors in + red CONFIRMED stamp. Objects: paper grain, pins, dotted lines.
3. **Broadcast HUD** (`BroadcastHud`) — ESPN/Sky motion-graphics; stat bars sweep L→R one at a time; reveal = name lower-third + flash. Objects: moving accent wedges, particle streaks, ticker.
4. **Holo Vault** (`HoloVault`) — neon hologram capsule; clues as orbiting HUD rings; reveal = glitch-to-clear to real photo. Objects: grid floor, scan-lines, neon particles.
5. **Stadium Spotlight** (`StadiumSpotlight`) — cinematic dark stadium; clues rise on lit pedestal plates; reveal = floodlights snap on + LED name board. Objects: light cone, smoke, bokeh, lens flare.

## Selection mechanism (the "button per template")

- `schema.ts` gains a `template` enum (default `fut-gold`), shown as a dropdown on the main full composition.
- `Root.tsx` registers **5 extra single-level preview compositions** (`Preview · 1 FUT Gold`, …) — each ~one level long — so each appears as a clickable entry in the Studio sidebar.
- After the user picks, wire the chosen id as the main composition default; optionally remove the rest.

## Constraints honored

- Main composition `defaultProps` stays a flat inline literal (Studio "Save default props" gotcha).
- Bonus level still freezes at `REVEAL_START` with `muteReveal` (no flip) — templates must keep the answer hidden until `revealProgress > 0`.
- All authored in 1920×1080 / 30fps design space via `useDesignFrame` / `useFrameScale`.
