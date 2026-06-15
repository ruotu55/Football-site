# Images — Team Logos & Player Photos

How crests and player photos are stored, resolved, fetched, cropped, and cached.

Key files: `js/photo-helpers.js`, `js/photo-source-picker.js`, `js/bulk-photo-picker.js`, `js/photo-crop.js`, `js/paths.js`, `.Storage/shared/team-image-paths.js`, `.Storage/shared/image-cache.js`, `.Storage/shared/asset-probe.js`. Backend: `run_site.py` (`/__player-photo/*`, `/__team-logo/fetch`) + `.Storage/data/player-images.json`.

## Team logos / crests

**On disk:**
- Club: `Images/Teams/<Country>/<League>/<Team>.png` (the team's squad JSON has this as `imagePath`).
- Fallback: `Images/Teams/(1) Other Teams/<Team>.png` — for teams that don't map to a country/league folder. Aliases in `photo-helpers.js` (`CLUB_LOGO_OTHER_TEAMS_ALIASES`).
- National: `Images/National Team Logos/<Country>.png` (nationality normalization + alias map in `photo-helpers.js`, e.g. Turkish→Turkey).

**Resolution (`photo-helpers.js`):** `getClubLogoUrl()`, `getClubLogoOtherTeamsUrl()`, `getNationalTeamLogoLoadUrls()`, `getHeaderLogoUrlChain()` build fallback chains. Per-level override via `headerLogoOverrideRelPath` (app state); `stripLogoOverrideRelPath()` in `team-image-paths.js` strips `?_logo=` cache-bust before resolving.

**Remotion build-data resolver (`buildClubCrestIndex` in `.remotion-shared/src/build-lib.mjs`):** the Remotion `build-data.mjs` maps each career-history club name → a crest under `Images/Teams/` (skipping the `Competitions/` folder). Career-history club names come from Transfermarkt and are often **short** ("Birmingham", "Dortmund") while the crest files are **canonical/full** ("Birmingham City.png", "Borussia Dortmund.png"). Three-tier match: (1) **exact stem** (`clubStems` strips leading/trailing FC/AC/AS/etc.); (2) **token-subset fuzzy** (`clubTokens` → a file matches if every query token is in the filename's tokens or vice-versa, e.g. `Dortmund⊂Borussia Dortmund`; accepted **only when unambiguous** — a tie returns `null` so a wrong crest is never shown); (3) **`CREST_ALIASES`** map for abbreviations no token overlap can bridge (`Man City→Manchester City`, `Man Utd→Manchester United`, `Wolves`, `West Brom`, `Nott'm Forest`, `QPR`, `Hamburg→Hamburger SV`, `Sporting→Sporting CP`, `US Palermo→Palermo FC`, `Al-Hilal→Al-Hilal SC`, `Union SG`). Only aliases whose target crest exists in the repo are listed (verified) so it can't point at the wrong logo. Unresolved → `crestPath:null` → a "?" card in the video (genuinely-absent logos like FC Liefering, Vitesse, youth/reserve sides — fetch via the prep-panel LOGO button). Used by player-quiz runners 3/4/5/6/8; rebuild data to pick up changes.

**Fetch/update:** `POST /__team-logo/fetch` → `_resolve_team_logo_target()` saves either a user-pasted URL or an auto-fetch from `football-logos.cc`. Saved under `Images/Teams/...`. Body fields the fetch reads: `pageUrl` (football-logos.cc page → scrape 3000×3000 PNG), **`imageUrl`** (NEW — a DIRECT image URL, downloaded verbatim as the crest), else auto-fetch by name. The `imageUrl` branch runs FIRST (before pageUrl/auto): R1/R2 download via `_fetch_bytes(url)`, R3 via `_normalize_external_image_url()`+`_fetch_external_image_bytes()` and validates with `_ready_photo_bytes_look_like_image()`; on empty/failed → 404 `{ok:false,error:"Could not download image from that URL."}`. It sets `fetched=(raw_bytes,{name,fromUrl})` so the shared write + JSON response is unchanged.

**LOGO button = 2-option chooser (R1/R2/R3 Regular prep panels):** clicking LOGO now opens a tiny inline popup (`chooseLogoSource(anchorBtn)`, defined in each runner's client file — R1 `js/prep-panel.js`, R2 `js/pitch-render.js` in `appendLogoControls`, R3 `js/prep-panel.js` in `fetchCrestLogo`). The popup is a fixed-position `<div id="prep-logo-source-pop">` with inline styles (NO CSS file touched, so no `styles.css?v=` bump), dismissed on outside-click/resize; resolves `"page"` / `"image"` / `null`. **football-logos.cc (3000px)** → prompt → POST with `pageUrl` (existing). **Image URL** → prompt for a direct https URL → POST the SAME payload but with `imageUrl`. Success path unchanged (cache-bust BEFORE re-pointing the `<img>`, set override, `markPrepDirty()`, R3 also `markLevelUnsaved`). **Servers must be RESTARTED once** for the `imageUrl` server branch to load.

**Delete:** `POST /__team-logo/delete` (`_try_delete_team_logo`, runners 1 & 2 Regular) — body `{ relativePath }` (or the same `_resolve_team_logo_target(body)` fields the fetch uses). SAFETY: only deletes files that resolve to **under `Images/Teams/`** in the project root (rejects `..`, absolute, or outside that tree); idempotent (ignores already-gone). Registered in `do_POST` next to `_try_fetch_team_logo` and triggers `schedule_remotion_build_data()` (data-mutating).

**Prep-panel per-card LOGO + X (runners 1 & 2 Regular):** when Revealed is OFF the player-photo control row is hidden and a **LOGO + X** row shows instead (CSS toggle in `prep-panel.css`: `#prep-root:not(.prep-revealed)` shows `.slot-logo-controls`, hides `.slot-photo-controls`; `.prep-revealed` reverses it). **R2** (card front = CLUB crest): `appendLogoControls(front, slotIndex, player)` in `pitch-render.js` (national squads only) — LOGO `window.prompt`s a football-logos.cc URL → `POST /__team-logo/fetch {squadType:"club", currentSquadName:player.club, currentSquadImagePath:<resolved crest rel>, selectedEntry:{name:player.club}, pageUrl}`; on ok sets `state.slotClubCrestOverrideRelPathBySlot[slot]=rel+"?_logo="+ts`, `markPrepDirty()`, dispatches `prep:refresh-level`. X resolves the crest rel (override → league file → Other Teams) and `POST /__team-logo/delete {relativePath}`, then clears the override + refreshes. **R1** (card fronts = nationality FLAGS, NOT club logos): the LOGO + X pair lives on the side **`.prep-team-panel`** instead (`prep-panel.js` `buildTeamPanelPreview`, classes `prep-team-panel__logo-row/-btn/-del-btn`), targeting the LEVEL's club crest (`lvl.currentSquad.imagePath`); same fetch/delete payloads, updates the crest `<img>` in place. The `.slot-logo-controls` CSS is inert in R1 (no club-crest card fronts). `prep-panel.css` kept byte-identical across both runners.

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

### Career-runner Ready-photo search (Champions League + Sorare)
Career runners (3 & 5) use a different family of endpoints under `/__ready-photo/*` (not `/__player-photo/*`): `from-url`, `delete`, `remove-bg`, and **`/__ready-photo/search-candidates`**. The search endpoint (`_try_ready_photo_search_candidates` in `run_site.py`) takes `{ playerName, source: "uefa"|"sorare" }` and returns `{ ok, source, candidates:[{url,dataUrl}] }` via `_build_photo_candidates(urls, cap=10)` (server fetches each URL with the UEFA-aware header logic and previews it as a base64 dataUrl; the real `url` is what gets saved on click). Resolvers: `_uefa_cl_candidate_image_urls()` (pages `comp.uefa.com/v2/players?competitionId=1`, cached in `_UEFA_CL_PLAYERS_CACHE`; name-matches via `_photo_name_key`; rewrites to `/cutoff/…webp` transparent + `.jpg` fallback) and `_sorare_candidate_image_urls()` (Algolia `Player` index; app id + search key from Sorare's public GraphQL `config`, cached in `_SORARE_ALGOLIA_CFG`).
- **R5** (`5_…Club_Position_Country_Age`) exposes this via `createCareerGetPhotoControls()` in `pitch-render.js` — a "Get photo" control whose pick modal auto-loads both sources + a "Paste URL" fallback (`requestPhotoSearchCandidates` → render thumbnails → `requestReadyPhotoFromUrl(c.url)` on click).
- **R3** (`3_…Carrer Path` — a PREP PANEL) wires it from the prep panel's per-level **PHOTO** button: `openPhotoPickerModal()` in `js/prep-panel.js` builds a centered modal (classes `.prep-photo-pick-*` in `prep-panel.css`) with **Champions League / Sorare / Paste URL** buttons; CL/Sorare call `requestPhotoSearchCandidates()` and render clickable thumbnails, all saving via the shared `saveReadyPhotoFromUrl()` (POST `/__ready-photo/from-url` with the chosen/pasted url). NOTE R3's own `createCareerGetPhotoControls()` in `pitch-render.js` is the OLD paste-URL-only version (no candidate sections) — the prep panel does NOT use it. **The R3 server must be RESTARTED once** to pick up the new `/__ready-photo/search-candidates` route.

## Photo crop
`photo-crop.js` `openPhotoCropModal({imageUrl,title,onSave})` → draws crop region to canvas → PNG dataURL → `POST /__player-photo/save-crop` overwrites the file in place. CROP button on pitch slot controls (runners 1&2 Reg+Shorts).

## Caching & cache-busting
- `.Storage/shared/image-cache.js`: RAM cache of decoded `HTMLImageElement`s. `preloadImage(s)`, `applyCachedSrc(Chain)`, `waitForPendingImages()`, `invalidateCachedImage()`. URL normalization **strips `?v=`** so the same asset with different tokens shares one cache entry.
- `paths.js`: `bumpAssetCacheBust(relPath)` + `projectAssetUrlFresh(relPath)` append `?v=<timestamp>` to force a refetch after a file is overwritten (crop/fetch). Call after any in-place image write.
- `.Storage/shared/asset-probe.js`: `probeAssetUrl(Chain)` — HEAD/GET to verify a URL actually loads (used by PROD validation / preflight before committing to record).

## Career/video silhouette vs reveal
In video mode the hidden player shows a **silhouette** (`.career-silhouette`, Video Off) or a dimmed **reveal photo** (`.career-reveal-photo-img`, Video On), then reveals. Per-slot scale/offset fields live on the level (`silhouette*`, picture-offset deltas are additive). `resolveCareerPlayerPhotoUrl()` re-encodes via canvas (warm it in preflight to avoid a ~1s lag).
