---
name: main-runner-maintainer
description: Maintain the Football Channel dual-runner project with zero-regression refactors. Use when editing Main Runner - Career Path or Main Runner - Lineups, updating app structure, or mirroring safe improvements across both folders.
---

# Main Runner Maintainer

## Scope
- `Main Runner - Career Path`
- `Main Runner - Lineups`

## Non-negotiable constraints
1. Keep output and behavior identical by default.
2. Keep both site folders independently runnable.
3. Mirror shared improvements in both folders.

## Fast orientation
1. Read root `README.md`.
2. Read target site's `ARCHITECTURE.md`.
3. Check target site's `js/app.js` entry flow.
4. Confirm equivalent change in sibling site if applicable.

## Safe refactor pattern
1. Keep `js/app.js` as orchestration entry only.
2. Move repetitive setup code into focused modules:
   - `js/dom-bindings.js`
   - `js/ui-panels.js`
3. Keep CSS behavior stable by extracting (not rewriting) overrides.
4. Preserve event order and initialization order.

## Bootstrap hybrid policy
- Bootstrap utilities are optional and opt-in only.
- Default runtime must remain unchanged.
- Enable manually with `window.__ENABLE_BOOTSTRAP_UTILS__ = true` before app init.

## Validation checklist
- App boots without console errors.
- Level switching and progress UI behave as before.
- Search/filter flows work.
- Countdown/video flow works.
- Shorts and non-shorts layouts match previous behavior.
