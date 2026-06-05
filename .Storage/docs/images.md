# Images — Team Logos & Player Photos

How crests and player photos are stored, resolved, fetched, cropped, and cached.

Key files: `js/photo-helpers.js`, `js/photo-source-picker.js`, `js/bulk-photo-picker.js`, `js/photo-crop.js`, `js/paths.js`, `.Storage/shared/team-image-paths.js`, `.Storage/shared/image-cache.js`, `.Storage/shared/asset-probe.js`. Backend: `run_site.py` (`/__player-photo/*`, `/__team-logo/fetch`) + `.Storage/data/player-images.json`.

## Team logos / crests

**On disk:**
- Club: `Images/Teams/<Country>/<League>/<Team>.png` (the team's squad JSON has this as `imagePath`).
- Fallback: `Images/Teams/(1) Other Teams/<Team>.png` — for teams that don't map to a country/league folder. Aliases in `photo-helpers.js` (`CLUB_LOGO_OTHER_TEAMS_ALIASES`).
- National: `Images/National Team Logos/<Country>.png` (nationality normalization + alias map in `photo-helpers.js`, e.g. Turkish→Turkey).

**Resolution (`photo-helpers.js`):** `getClubLogoUrl()`, `getClubLogoOtherTeamsUrl()`, `getNationalTeamLogoLoadUrls()`, `getHeaderLogoUrlChain()` build fallback chains. Per-level override via `headerLogoOverrideRelPath` (app state); `stripLogoOverrideRelPath()` in `team-image-paths.js` strips `?_logo=` cache-bust before resolving.

**Fetch/update:** `POST /__team-logo/fetch` → `_resolve_team_logo_target()` saves either a user-pasted URL or an auto-fetch from `football-logos.cc`. Saved under `Images/Teams/...`.

**Legacy bug:** `normalizeLegacyTeamImageRelPath()` (`team-image-paths.js`) auto-rewrites old `Teams Images/X` → `Images/Teams/X`. The stray `Teams Images/` folder is a known historical bug — canonical is `Images/Teams/`.

## Player photos

**On disk:**
- Club: `Images/Players/Club images/<Country>/<League>/<Club>/<Player>/<SourcePrefix><Id>.<hash>.webp` (or `.png`). Example auto file: `Auto - fut.gg.png`, then `Auto - fut.gg - 2.png`.
- National: `Images/Players/Nationality images/<Region>/<Country>/<Player>/<file>` (Region = UEFA/CONMEBOL/AFC/CAF/OFC/CONCACAF…).
- Career/reveal clean portraits: `Images/Players No Background/Ready photos/<Player>.png` (`careerReadyPhotoRelPath()` in `paths.js`).

**Index — `.Storage/data/player-images.json`:**
```json
{ "club": { "Country|League|Club|Player": ["Images/Players/Club images/…webp", …] },
  "nationality": { "Region|Country|Player": ["…webp", …] } }
```
Multiple photos per player allowed (fallback chain). Updated by `_update_player_images_index()` in `run_site.py` on every save. Photos dedupe by SHA-256 of content.

**Resolution (`photo-helpers.js` `playerPhotoPaths()`):** tries (1) current-squad club key, (2) the player's explicit `club`, (3) the player's `nationality`. Key parts sanitized via `sanitizePhotoKeyPart()`.

## Photo fetching / source picker
- `photo-source-picker.js`: `openPhotoSourceChooser()` — modal offering **paste URL / fut.gg / 365scores** (runners 1&2 also UEFA + Sorare). `openPhotoCandidatePicker()` shows a thumbnail grid.
- `bulk-photo-picker.js`: `openBulkPhotoPicker()` — per-player rows, "fetch all" across sources.
- Backend endpoints (`run_site.py`): `/__player-photo/list-candidates`, `/auto-fetch`, `/save-chosen`, `/from-url`, `/save-crop`, `/delete`. Candidate URL builders: `_futgg_candidate_image_urls()`, `_365scores_candidate_image_urls()`.
- **futbin is Cloudflare-blocked** server-side (403). Use **fut.gg** instead.
- UEFA images stall if `Accept` advertises `image/avif` — the fetch uses a no-avif Accept + uefa Referer.

## Photo crop
`photo-crop.js` `openPhotoCropModal({imageUrl,title,onSave})` → draws crop region to canvas → PNG dataURL → `POST /__player-photo/save-crop` overwrites the file in place. CROP button on pitch slot controls (runners 1&2 Reg+Shorts).

## Caching & cache-busting
- `.Storage/shared/image-cache.js`: RAM cache of decoded `HTMLImageElement`s. `preloadImage(s)`, `applyCachedSrc(Chain)`, `waitForPendingImages()`, `invalidateCachedImage()`. URL normalization **strips `?v=`** so the same asset with different tokens shares one cache entry.
- `paths.js`: `bumpAssetCacheBust(relPath)` + `projectAssetUrlFresh(relPath)` append `?v=<timestamp>` to force a refetch after a file is overwritten (crop/fetch). Call after any in-place image write.
- `.Storage/shared/asset-probe.js`: `probeAssetUrl(Chain)` — HEAD/GET to verify a URL actually loads (used by PROD validation / preflight before committing to record).

## Career/video silhouette vs reveal
In video mode the hidden player shows a **silhouette** (`.career-silhouette`, Video Off) or a dimmed **reveal photo** (`.career-reveal-photo-img`, Video On), then reveals. Per-slot scale/offset fields live on the level (`silhouette*`, picture-offset deltas are additive). `resolveCareerPlayerPhotoUrl()` re-encodes via canvas (warm it in preflight to avoid a ~1s lag).
