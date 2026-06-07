# CapCut draft templates

These JSON files are **verbatim copies of real, openable CapCut PC v8.7.0 drafts**
(`draft schema version 360000` / `new_version 171.0.0`). The build stage
(`render/build-capcut.mjs` via `render/capcut/schema.mjs`) deep-clones segments and
their referenced helper materials from these templates so generated drafts are
byte-compatible with this exact CapCut version — we never hand-author the helper-material
shapes.

## photo-draft.template.json

Copied from `…/CapCut/User Data/Projects/com.lveditor.draft/0606/draft_content.json`.

Its single photo segment references **7 helper materials** via `extra_material_refs`,
which resolve to these material arrays:
`speeds`, `placeholder_infos`, `canvases`, `sound_channel_mappings`, `material_colors`,
`loudnesses`, `vocal_separations`.

⚠️ The source `0606` is a **live project the user edits**, so its on-disk content (track
count, ref count, byte size) drifts over time. This vendored copy is **frozen** — the
build code and tests must read THIS file, never the live CapCut folder. The schema clone
collects helpers dynamically (scans every material array for the segment's ref ids), so it
adapts if a future refresh changes the count.

## rich-draft.template.json (added in Task B1)

A draft built in CapCut containing one photo + one text caption + one audio clip + one
transition, used as the clone source for text / audio / transition layers.

## Refreshing after a CapCut update

1. In CapCut, create a draft with the element types you need (photo; for the rich
   template also text + audio + a transition).
2. Copy its `draft_content.json` here over the matching template.
3. Re-run `node --test render/capcut/__tests__/` and fix any assertions that pinned an
   exact count (prefer asserting "every ref resolves" over a hardcoded number).
