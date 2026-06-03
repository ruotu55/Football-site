# PHOTO button: three-source chooser with image picker

**Runner scope:** Only `1_Guess The Football Team Name - Main Runner - Regular`. Do not mirror to sibling runners.

## Goal

Today, clicking the **PHOTO** button on a pitch slot opens the URL-paste modal directly.
Replace that single action with a **source chooser** offering three ways to add a player photo:

1. **Paste URL** — unchanged behaviour (existing `/__player-photo/from-url`).
2. **Fetch FUT cards** — search for the player, show **all** of their card photos in a grid, user picks one.
3. **Fetch from 365scores** — search for the player, show the candidate face image(s) in the same grid, user picks one.

## Key constraint (why not literal futbin)

The user's request named **futbin**. Verified at design time: futbin's entire domain — including its image CDN `cdn3.futbin.com` — sits behind Cloudflare and returns **HTTP 403** to any non-browser (server-side) request. The existing photo pipeline downloads images server-side, so it cannot fetch futbin.

Decision (confirmed with user): power the "card photos" option with **fut.gg** instead. fut.gg hosts the same FUT card renders, already works reliably server-side, and the codebase already has `_futgg_candidate_image_urls(name, club, nat)` returning **all** of a player's card images. The button/label will reference "FUT cards" / fut.gg, not futbin.

## What already exists (reused, not rebuilt)

- `appendAutoPhotoFetchButton(...)` in `js/pitch-render.js` builds the slot controls (CROP / PHOTO / X) and holds `photoBodyBase` (player/squad identity) and `applyFetchedPhoto(data)` (updates `appState.playerImages` + re-renders).
- `openPlayerPhotoUrlModal(name, submitFn)` — the existing URL-paste modal (option 1, untouched).
- Server: `_futgg_candidate_image_urls(...)`, `_365scores_candidate_image_urls(...)` return lists of image URLs. `_fetch_bytes(url)` downloads (works for fut.gg + 365scores). `_resolve_player_image_target(body)` → `(target_dir, index_section, index_key)`. `_next_auto_photo_path(dir, source)` names files `auto - fut.gg.png` / `auto - 365scores.png` (the framing rules in `applyPlayerPhotoFramingForSourceRelPath` key off these names). `_find_existing_photo_path_by_sha256` + `_update_player_images_index` handle dedup + index.

## Architecture

### Display strategy: server-side thumbnails (avoid CORS/hotlink surprises)

Candidate images are **downloaded server-side and returned as base64 data URLs** for the picker to render. Rationale: we already learned the browser can't be trusted to load/hotlink arbitrary CDN images (Cloudflare), and `<img>`-tag display vs. `fetch()`-readability differ. Downloading on the server (which provably works for fut.gg + 365scores) and handing back data URLs makes the picker render reliably and lets the chosen image be saved from the same bytes — no second download, no canvas-taint issues. Candidate count is capped (default 12) and per-image byte size is bounded.

### New server endpoints (`run_site.py`)

1. **`POST /__player-photo/list-candidates`**
   - Body: `{ playerName, playerClub, playerNationality, squadType, selectedEntry, currentSquadName, source }` where `source ∈ {"fut.gg","365scores"}`.
   - Calls the matching candidate function, downloads each URL (capped, size-bounded, dedup identical bytes), returns
     `{ ok: true, source, candidates: [ { url, dataUrl } ] }`.
   - On no matches: `{ ok: true, source, candidates: [] }` (picker shows an empty state — not an error).
   - Network/lookup failure: `404`/`502` with `{ ok:false, error }`.

2. **`POST /__player-photo/save-chosen`**
   - Body: `{ ...target identity fields, source, imageDataUrl }`.
   - Decodes the data URL (same parsing as `/__player-photo/save-crop`), dedups against the target dir by sha256 (reuse existing file if identical), else writes to `_next_auto_photo_path(target_dir, source)` so the file carries the correct `auto - fut.gg` / `auto - 365scores` name (preserves framing rules).
   - Updates the image index; responds with the **same shape** auto-fetch returns:
     `{ ok, source, relativePath, indexSection, indexKey }` so the existing `applyFetchedPhoto(data)` consumes it unchanged.

3. **Refactor:** factor the "save bytes → dedup → write with source label → update index → build response dict" tail shared by `_try_auto_fetch_player_photo` and the new `save-chosen` handler into one helper (e.g. `_persist_player_photo_bytes(target_dir, index_section, index_key, image_bytes, source)`), to avoid divergence. Both POST handlers are registered in `do_POST` alongside the existing `_try_*` dispatch calls.

### New frontend module: `js/photo-source-picker.js`

Mirrors `photo-crop.js` (self-contained ESM module, lazily-created DOM root, no deps). Exports:

- `openPhotoSourceChooser({ playerName, onPasteUrl, onFetchFutgg, onFetch365 })`
  Small modal with the player name and three buttons. Each button closes the chooser and invokes the matching callback. Esc / backdrop / Cancel closes.

- `openPhotoCandidatePicker({ title, loadCandidates, onSelect })`
  Modal showing a grid of candidate thumbnails. States: **loading** (spinner/text while `loadCandidates()` resolves), **empty** ("No photos found for this player."), **error** (message + Close), **grid** (clickable thumbnails). Clicking a thumbnail calls `await onSelect(candidate)`; on success closes, on failure shows the error inline and re-enables the grid. `loadCandidates()` returns the `candidates` array (so the picker owns the loading UI).

### Wiring in `js/pitch-render.js`

In the `photoBtn` click handler, replace the current direct `openPlayerPhotoUrlModal(...)` call with `openPhotoSourceChooser(...)`. The three callbacks:

- **onPasteUrl** → existing `openPlayerPhotoUrlModal(playerName, submitFn)` flow (POST `from-url` → `applyFetchedPhoto`). No change to that path.
- **onFetchFutgg** → `openPhotoCandidatePicker` whose `loadCandidates` POSTs `list-candidates` with `source:"fut.gg"`, and whose `onSelect(c)` POSTs `save-chosen` with `source:"fut.gg"` + `c.dataUrl`, then `applyFetchedPhoto(data)` (reusing the existing `photoBodyBase` + `applyFetchedPhoto`).
- **onFetch365** → identical to fut.gg with `source:"365scores"`.

`photoBodyBase` and `applyFetchedPhoto` are reused as-is. New endpoint path constants live with the existing `*_ENDPOINT` consts near the top of the file. The module import goes next to `import { openPhotoCropModal } from "./photo-crop.js";`.

### Markup + CSS

- Chooser + picker DOM are created by the new module (like `photo-crop.js`), so **no** `modals.html` edits are strictly required. (The existing URL modal stays in `modals.html`.)
- New CSS classes (`.psrc-*` chooser, `.ppick-*` picker) added to `css/components/pitch.css` near the `.pcrop-*` block, matching the dark modal styling. Bump the `?v=` cache-buster on the stylesheet `<link>` in `index.html` so the new CSS loads.

## Error handling

- list-candidates lookup miss → empty grid with friendly text, not an error.
- Network failures (lookup or per-image download) → picker error state with the server message + Close.
- save-chosen failure → inline error in the picker; grid stays open so the user can pick another.
- Existing `from-url` path keeps its current error handling.

## Out of scope

- No change to sibling runners (folders 2–8).
- No literal futbin scraping / no headless-Chrome fetch path.
- No change to CROP, X (delete), photo cycling, or framing logic.

## Manual test plan

With `run_site.py` serving the runner and a team loaded:
1. PHOTO → chooser shows three options + player name.
2. Paste URL → still works exactly as before.
3. FUT cards → grid of the player's card photos appears; pick one → it applies to the slot and persists (file named `auto - fut.gg*`, correct framing).
4. 365scores → grid (usually one face) → pick → applies, file named `auto - 365scores*`.
5. Player with no fut.gg/365 match → empty-state message, no crash.
6. Cancel/Esc/backdrop close cleanly at each step.
