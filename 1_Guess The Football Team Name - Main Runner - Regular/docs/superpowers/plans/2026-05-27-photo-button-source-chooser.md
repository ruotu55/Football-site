# PHOTO Button Source Chooser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pitch-slot PHOTO button open a 3-way chooser (paste URL · fetch FUT cards from fut.gg · fetch from 365scores), where the two fetch options show a grid of candidate photos to pick from.

**Architecture:** Two new POST endpoints in `run_site.py` (`list-candidates` returns base64 data-URL thumbnails; `save-chosen` writes a picked image with the correct source-labelled filename, reusing a shared persist helper). One new self-contained ESM frontend module `js/photo-source-picker.js` (chooser modal + picker-grid modal, mirroring `js/photo-crop.js`). The PHOTO click handler in `js/pitch-render.js` swaps its direct URL-modal call for the chooser; the existing `applyFetchedPhoto` / `photoBodyBase` / URL-paste path are reused unchanged.

**Tech Stack:** Python stdlib `http.server` (no framework), vanilla ES modules, CSS. No test runner is installed (`pytest` unavailable); pure helpers are verified with a runnable stdlib `assert` script, endpoints with `curl` against the dev server, UI manually in the browser.

**Runner scope:** ONLY `1_Guess The Football Team Name - Main Runner - Regular`. Do NOT mirror to sibling runners.

---

## File Structure

- **Modify** `run_site.py`
  - Add constants `_PHOTO_CANDIDATE_LIMIT`, `_PHOTO_CANDIDATE_MAX_BYTES`.
  - Add helpers `_guess_image_mime(data)` and `_persist_player_photo_bytes(target_dir, index_section, index_key, image_bytes, source)`.
  - Add handlers `_try_list_player_photo_candidates(self)` and `_try_save_chosen_player_photo(self)`.
  - Register both in `do_POST`.
- **Create** `js/photo-source-picker.js` — exports `openPhotoSourceChooser(...)` and `openPhotoCandidatePicker(...)`.
- **Modify** `js/pitch-render.js` — import the new module, add two endpoint constants, swap the PHOTO click body to open the chooser.
- **Modify** `css/components/pitch.css` — add `.psrc-*` (chooser) and `.ppick-*` (picker) styles near the `.pcrop-*` block.
- **Modify** `index.html` — bump the `?v=` cache-buster on the stylesheet `<link>`.
- **Create** `tests/test_photo_mime.py` — stdlib assert test for `_guess_image_mime`.

> **Edit-storm caution (project memory):** the dev server live-reloads on file save. Prefer ONE `Write`/large `Edit` per file over many small edits.

---

## Task 1: Server — shared persist helper + image-mime detector

**Files:**
- Modify: `run_site.py` (add module-level constants + two functions near the other `_*_player_photo*` helpers, e.g. just above `def _try_auto_fetch_player_photo` — search for `def _try_auto_fetch_player_photo`)
- Test: `tests/test_photo_mime.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_photo_mime.py`:

```python
"""Stdlib assert test (no pytest needed): run with `python tests/test_photo_mime.py`."""
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("run_site", ROOT / "run_site.py")
run_site = importlib.util.module_from_spec(spec)
sys.modules["run_site"] = run_site
spec.loader.exec_module(run_site)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 8
GIF = b"GIF89a" + b"\x00" * 16
UNKNOWN = b"\x00\x01\x02\x03" + b"\x00" * 16

assert run_site._guess_image_mime(PNG) == "image/png", "PNG magic"
assert run_site._guess_image_mime(JPEG) == "image/jpeg", "JPEG magic"
assert run_site._guess_image_mime(WEBP) == "image/webp", "WEBP magic"
assert run_site._guess_image_mime(GIF) == "image/gif", "GIF magic"
assert run_site._guess_image_mime(UNKNOWN) == "image/png", "unknown falls back to png"
print("OK test_photo_mime")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python "tests/test_photo_mime.py"`
Expected: FAIL with `AttributeError: module 'run_site' has no attribute '_guess_image_mime'`.
(If import itself fails before that — e.g. run_site does module-level work — note it and stop; the helper functions still need to be reachable by import. The file only runs the server under `if __name__ == "__main__"`, so import should succeed.)

- [ ] **Step 3: Add constants + helpers in `run_site.py`**

Insert just above `def _try_auto_fetch_player_photo` is NOT possible (that's a method). Instead place these at module level near the other module-level `_*photo*` helpers (e.g. directly above `def _next_auto_photo_path` or near `_find_existing_photo_path_by_sha256`). Confirm `base64` and `hashlib` are already imported at the top of the file (they are — used by save-crop and auto-fetch).

```python
_PHOTO_CANDIDATE_LIMIT = 12
_PHOTO_CANDIDATE_MAX_BYTES = 8 * 1024 * 1024


def _guess_image_mime(data: bytes) -> str:
    """Best-effort MIME from magic bytes; defaults to PNG."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/png"


def _persist_player_photo_bytes(target_dir, index_section, index_key, image_bytes, source):
    """Dedup against target_dir by sha256, else write with a source-labelled
    filename (auto - fut.gg / auto - 365scores), then update the image index.
    Returns (http_status, response_dict) — never raises for the expected cases.
    """
    if not image_bytes:
        return (404, {"ok": False, "error": "Downloaded image is empty."})
    digest = hashlib.sha256(image_bytes).hexdigest()
    existing = _find_existing_photo_path_by_sha256(target_dir, digest)
    if existing is not None:
        rel_path = existing.relative_to(PROJECT_ROOT).as_posix()
        try:
            _update_player_images_index(index_section, index_key, rel_path)
        except OSError:
            return (500, {"ok": False, "error": "Failed to update player image index."})
        return (200, {
            "ok": True, "source": source, "relativePath": rel_path,
            "indexSection": index_section, "indexKey": index_key,
            "reusedExistingFile": True,
        })
    target_dir.mkdir(parents=True, exist_ok=True)
    out_path = _next_auto_photo_path(target_dir, source)
    try:
        out_path.write_bytes(image_bytes)
    except OSError:
        return (500, {"ok": False, "error": "Failed to write image file."})
    rel_path = out_path.relative_to(PROJECT_ROOT).as_posix()
    try:
        _update_player_images_index(index_section, index_key, rel_path)
    except OSError:
        return (500, {"ok": False, "error": "Failed to update player image index."})
    return (200, {
        "ok": True, "source": source, "relativePath": rel_path,
        "indexSection": index_section, "indexKey": index_key,
    })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python "tests/test_photo_mime.py"`
Expected: prints `OK test_photo_mime`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add "run_site.py" "tests/test_photo_mime.py"
git commit -m "feat(photo): add image-mime detector and shared persist helper"
```

---

## Task 2: Server — `/__player-photo/list-candidates` endpoint

**Files:**
- Modify: `run_site.py` (add method `_try_list_player_photo_candidates` near `_try_auto_fetch_player_photo`)

- [ ] **Step 1: Add the handler method**

Add as a method on the request handler class (same class that defines `_try_auto_fetch_player_photo`), placed right after `_try_auto_fetch_player_photo`:

```python
    def _try_list_player_photo_candidates(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-photo/list-candidates":
            return False
        try:
            body = self._read_json_body()
            player_name = str(body.get("playerName") or "").strip()
            player_club = str(body.get("playerClub") or "").strip()
            player_nationality = str(body.get("playerNationality") or "").strip()
            source = str(body.get("source") or "").strip().lower()
            if not player_name:
                raise ValueError("Missing player name.")
            if source not in ("fut.gg", "365scores"):
                raise ValueError("Unknown photo source.")
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        try:
            if source == "fut.gg":
                urls = _futgg_candidate_image_urls(player_name, player_club, player_nationality)
            else:
                urls = _365scores_candidate_image_urls(player_name, player_club)
        except Exception as exc:  # noqa: BLE001 — surface lookup failures to the user
            self._write_json(502, {"ok": False, "error": f"Lookup failed: {exc}"})
            return True

        candidates: list[dict] = []
        seen_hashes: set[str] = set()
        for url in urls or []:
            if len(candidates) >= _PHOTO_CANDIDATE_LIMIT:
                break
            try:
                data = _fetch_bytes(url)
            except Exception:  # noqa: BLE001 — skip a candidate that won't download
                continue
            if not data or len(data) > _PHOTO_CANDIDATE_MAX_BYTES:
                continue
            digest = hashlib.sha256(data).hexdigest()
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)
            mime = _guess_image_mime(data)
            data_url = f"data:{mime};base64," + base64.b64encode(data).decode("ascii")
            candidates.append({"url": url, "dataUrl": data_url})

        self._write_json(200, {"ok": True, "source": source, "candidates": candidates})
        return True
```

- [ ] **Step 2: Register in `do_POST`**

In `do_POST` (search for `if self._try_auto_fetch_player_photo():`), add the dispatch immediately after that block:

```python
        if self._try_auto_fetch_player_photo():
            return
        if self._try_list_player_photo_candidates():
            return
```

- [ ] **Step 3: Verify it loads (syntax/import)**

Run: `python -c "import importlib.util,pathlib; s=importlib.util.spec_from_file_location('rs', pathlib.Path('run_site.py')); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print('import ok')"`
Expected: prints `import ok` (no SyntaxError).

- [ ] **Step 4: Commit**

```bash
git add "run_site.py"
git commit -m "feat(photo): add list-candidates endpoint returning data-URL thumbnails"
```

---

## Task 3: Server — `/__player-photo/save-chosen` endpoint + refactor auto-fetch tail

**Files:**
- Modify: `run_site.py` (add method `_try_save_chosen_player_photo`; refactor the save tail of `_try_auto_fetch_player_photo` to use `_persist_player_photo_bytes`)

- [ ] **Step 1: Add the save-chosen handler method**

Add right after `_try_list_player_photo_candidates`:

```python
    def _try_save_chosen_player_photo(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-photo/save-chosen":
            return False
        try:
            body = self._read_json_body()
            source = str(body.get("source") or "").strip().lower()
            data_url = str(body.get("imageDataUrl") or "")
            if source not in ("fut.gg", "365scores"):
                raise ValueError("Unknown photo source.")
            if not data_url.lower().startswith("data:image/") or "," not in data_url:
                raise ValueError("Missing or invalid image data.")
            target_dir, index_section, index_key = _resolve_player_image_target(body)
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        try:
            image_bytes = base64.b64decode(data_url.split(",", 1)[1], validate=False)
        except Exception:  # noqa: BLE001
            self._write_json(400, {"ok": False, "error": "Could not decode chosen image."})
            return True

        status, payload = _persist_player_photo_bytes(
            target_dir, index_section, index_key, image_bytes, source
        )
        self._write_json(status, payload)
        return True
```

- [ ] **Step 2: Refactor the auto-fetch save tail to share the helper**

In `_try_auto_fetch_player_photo`, locate the final block that begins with:

```python
        if not image_bytes:
            self._write_json(404, {"ok": False, "error": "Downloaded image is empty."})
            return True

        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = _next_auto_photo_path(target_dir, source_used)
```

…through the closing `self._write_json(200, {... "indexKey": index_key, })  return True`. Replace that entire tail with:

```python
        status, payload = _persist_player_photo_bytes(
            target_dir, index_section, index_key, image_bytes, source_used
        )
        if status == 200 and payload.get("ok"):
            payload["preferredSource"] = preferred_source
        self._write_json(status, payload)
        return True
```

This preserves the prior response shape (it still returns `source`, `relativePath`, `indexSection`, `indexKey`, and re-adds `preferredSource`). Leave the page_url branch (which already has its own reuse logic earlier in the method) untouched.

- [ ] **Step 3: Register in `do_POST`**

Immediately after the `_try_list_player_photo_candidates` dispatch added in Task 2:

```python
        if self._try_list_player_photo_candidates():
            return
        if self._try_save_chosen_player_photo():
            return
```

- [ ] **Step 4: Verify import + run mime test again (no regression)**

Run: `python -c "import importlib.util,pathlib; s=importlib.util.spec_from_file_location('rs', pathlib.Path('run_site.py')); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print('import ok')"`
Expected: `import ok`.
Run: `python "tests/test_photo_mime.py"`
Expected: `OK test_photo_mime`.

- [ ] **Step 5: Live endpoint smoke test with curl**

Start the dev server in another terminal: `python run_site.py` (binds `127.0.0.1:8888` by default).
Then run (PowerShell `curl` is `Invoke-WebRequest`; use `curl.exe` for the real curl):

```bash
curl.exe -s -X POST http://127.0.0.1:8888/__player-photo/list-candidates \
  -H "Content-Type: application/json" \
  -d '{"playerName":"Dominic Solanke","playerClub":"Tottenham Hotspur","playerNationality":"England","squadType":"club","selectedEntry":{"path":""},"currentSquadName":"","source":"fut.gg"}'
```

Expected: JSON `{"ok": true, "source": "fut.gg", "candidates": [ {"url": "...", "dataUrl": "data:image/png;base64,..."}, ... ]}`. `candidates` may be empty if the player can't be resolved — that's a valid (non-error) response. A 400 means a bad body; a 502 means the lookup threw.

> Note: this requires network access and a resolvable player. If `candidates` is empty for a known player, that's a fut.gg-resolution issue in the pre-existing `_futgg_candidate_image_urls`, out of scope for this plan — record it but don't block.

- [ ] **Step 6: Commit**

```bash
git add "run_site.py"
git commit -m "feat(photo): add save-chosen endpoint; share persist helper with auto-fetch"
```

---

## Task 4: Frontend — `js/photo-source-picker.js` module

**Files:**
- Create: `js/photo-source-picker.js`

- [ ] **Step 1: Create the module**

Create `js/photo-source-picker.js` with the full contents:

```javascript
// js/photo-source-picker.js — "Add Player Photo" source chooser + candidate picker.
// Two self-contained modals (no dependencies), mirroring photo-crop.js.
//   openPhotoSourceChooser({ playerName, onPasteUrl, onFetchFutgg, onFetch365 })
//   openPhotoCandidatePicker({ title, loadCandidates, onSelect })
// loadCandidates: () => Promise<Array<{ url, dataUrl }>>  (owns the search call)
// onSelect:       (candidate) => Promise<void>            (throws -> inline error)

let chooserRoot = null;
let pickerRoot = null;

function ensureChooserRoot() {
  if (chooserRoot) return chooserRoot;
  const root = document.createElement("div");
  root.className = "psrc-modal";
  root.hidden = true;
  root.innerHTML = `
    <div class="psrc-backdrop" data-psrc-close></div>
    <div class="psrc-panel" role="dialog" aria-label="Add player photo">
      <h3 class="psrc-title">Add player photo</h3>
      <div class="psrc-name"></div>
      <div class="psrc-options">
        <button type="button" class="psrc-opt" data-psrc-action="url">
          <span class="psrc-opt-title">Paste image URL</span>
          <span class="psrc-opt-sub">Enter a direct link to an image</span>
        </button>
        <button type="button" class="psrc-opt" data-psrc-action="futgg">
          <span class="psrc-opt-title">Fetch FUT cards</span>
          <span class="psrc-opt-sub">Search fut.gg — pick from this player's cards</span>
        </button>
        <button type="button" class="psrc-opt" data-psrc-action="s365">
          <span class="psrc-opt-title">Fetch from 365scores</span>
          <span class="psrc-opt-sub">Search 365scores — pick the face photo</span>
        </button>
      </div>
      <div class="psrc-actions">
        <button type="button" class="psrc-btn psrc-btn-secondary" data-psrc-close>Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  chooserRoot = root;
  return root;
}

export function openPhotoSourceChooser({ playerName, onPasteUrl, onFetchFutgg, onFetch365 } = {}) {
  const root = ensureChooserRoot();
  const nameEl = root.querySelector(".psrc-name");
  nameEl.textContent = playerName ? `For: ${playerName}` : "";

  const close = () => {
    root.hidden = true;
    root.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  const onClick = (e) => {
    if (e.target?.dataset?.psrcClose !== undefined) { close(); return; }
    const opt = e.target.closest?.("[data-psrc-action]");
    if (!opt) return;
    const action = opt.dataset.psrcAction;
    close();
    if (action === "url") onPasteUrl?.();
    else if (action === "futgg") onFetchFutgg?.();
    else if (action === "s365") onFetch365?.();
  };
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  root.hidden = false;
}

function ensurePickerRoot() {
  if (pickerRoot) return pickerRoot;
  const root = document.createElement("div");
  root.className = "ppick-modal";
  root.hidden = true;
  root.innerHTML = `
    <div class="ppick-backdrop" data-ppick-close></div>
    <div class="ppick-panel" role="dialog" aria-label="Pick a photo">
      <h3 class="ppick-title">Pick a photo</h3>
      <div class="ppick-status"></div>
      <div class="ppick-grid" hidden></div>
      <div class="ppick-actions">
        <button type="button" class="ppick-btn ppick-btn-secondary" data-ppick-close>Close</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  pickerRoot = root;
  return root;
}

export function openPhotoCandidatePicker({ title, loadCandidates, onSelect } = {}) {
  const root = ensurePickerRoot();
  const titleEl = root.querySelector(".ppick-title");
  const statusEl = root.querySelector(".ppick-status");
  const grid = root.querySelector(".ppick-grid");
  titleEl.textContent = title || "Pick a photo";
  grid.hidden = true;
  grid.innerHTML = "";
  statusEl.hidden = false;
  statusEl.className = "ppick-status";
  statusEl.textContent = "Searching…";

  let cells = [];
  let busy = false;

  const close = () => {
    root.hidden = true;
    root.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  const showError = (msg) => {
    statusEl.hidden = false;
    statusEl.className = "ppick-status ppick-status-error";
    statusEl.textContent = msg;
  };
  const onClick = async (e) => {
    if (e.target?.dataset?.ppickClose !== undefined) { close(); return; }
    const cell = e.target.closest?.(".ppick-cell");
    if (!cell || busy) return;
    const candidate = cells[Number(cell.dataset.idx)];
    if (!candidate) return;
    busy = true;
    cell.classList.add("ppick-cell-busy");
    try {
      await onSelect?.(candidate);
      close();
    } catch (err) {
      showError(err?.message || "Failed to save photo.");
      cell.classList.remove("ppick-cell-busy");
      busy = false;
    }
  };

  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  root.hidden = false;

  (async () => {
    try {
      cells = (await loadCandidates?.()) || [];
    } catch (err) {
      showError(err?.message || "Search failed.");
      return;
    }
    if (!cells.length) {
      statusEl.hidden = false;
      statusEl.className = "ppick-status";
      statusEl.textContent = "No photos found for this player.";
      return;
    }
    statusEl.hidden = true;
    grid.hidden = false;
    grid.innerHTML = cells
      .map((c, i) => `<button type="button" class="ppick-cell" data-idx="${i}"><img src="${c.dataUrl}" alt="" draggable="false" /></button>`)
      .join("");
  })();
}
```

- [ ] **Step 2: Verify it parses as a module (no build step in this project)**

Run: `node --check "js/photo-source-picker.js"`
Expected: no output, exit 0 (syntax OK). (If `node` is unavailable, skip — it will be exercised in Task 7's browser test.)

- [ ] **Step 3: Commit**

```bash
git add "js/photo-source-picker.js"
git commit -m "feat(photo): add source-chooser + candidate-picker modal module"
```

---

## Task 5: Frontend — CSS for chooser + picker

**Files:**
- Modify: `css/components/pitch.css` (add after the `.pcrop-*` block — search for `.pcrop-handle[data-h="nw"]` to find the region)
- Modify: `index.html` (bump the stylesheet `?v=` token)

- [ ] **Step 1: Add styles to `css/components/pitch.css`**

Append at the end of the file (or directly after the `.pcrop-*` rules):

```css
/* Add-photo source chooser */
.psrc-modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
.psrc-modal[hidden] { display: none; }
.psrc-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.6); }
.psrc-panel {
  position: relative; background: #15171c; color: #fff; border: 1px solid #333;
  border-radius: 10px; padding: 1.25rem; width: 92vw; max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.psrc-title { margin: 0 0 0.15rem; font-size: 1.15rem; font-weight: 800; }
.psrc-name { margin: 0 0 0.85rem; font-size: 0.85rem; color: #aaa; line-height: 1.4; }
.psrc-options { display: flex; flex-direction: column; gap: 0.6rem; }
.psrc-opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem;
  text-align: left; padding: 0.7rem 0.85rem; background: #1d2027; color: #fff;
  border: 1px solid #333; border-radius: 8px; cursor: pointer;
}
.psrc-opt:hover { border-color: var(--accent); background: #232732; }
.psrc-opt-title { font-weight: 700; font-size: 0.95rem; }
.psrc-opt-sub { font-size: 0.78rem; color: #9aa; }
.psrc-actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
.psrc-btn { padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #333; cursor: pointer; }
.psrc-btn-secondary { background: #1d2027; color: #fff; }

/* Photo candidate picker grid */
.ppick-modal { position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; }
.ppick-modal[hidden] { display: none; }
.ppick-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.6); }
.ppick-panel {
  position: relative; background: #15171c; color: #fff; border: 1px solid #333;
  border-radius: 10px; padding: 1.25rem; width: 92vw; max-width: 640px;
  max-height: 88vh; overflow: auto; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.ppick-title { margin: 0 0 0.6rem; font-size: 1.15rem; font-weight: 800; }
.ppick-status { font-size: 0.9rem; color: #aaa; padding: 0.6rem 0; }
.ppick-status-error {
  color: #ef4444; background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 0.6rem 0.8rem;
}
.ppick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.6rem; }
.ppick-cell {
  padding: 0.35rem; background: #0c0d10; border: 1px solid #333; border-radius: 8px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 120px;
}
.ppick-cell:hover { border-color: var(--accent); }
.ppick-cell-busy { opacity: 0.5; pointer-events: none; }
.ppick-cell img { max-width: 100%; max-height: 150px; object-fit: contain; display: block; }
.ppick-actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
.ppick-btn { padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #333; cursor: pointer; }
.ppick-btn-secondary { background: #1d2027; color: #fff; }
```

- [ ] **Step 2: Bump the stylesheet cache-buster in `index.html`**

Find the main stylesheet `<link>` (search `index.html` for `styles.css` or the CSS link with `?v=`). Increment its `?v=` number by 1 (project memory: the dev server doesn't cache-bust CSS automatically). If the CSS is split and `pitch.css` is linked separately, bump that link instead.

- [ ] **Step 3: Commit**

```bash
git add "css/components/pitch.css" "index.html"
git commit -m "style(photo): add chooser + picker modal styles; bump css cache-buster"
```

---

## Task 6: Frontend — wire the PHOTO button to the chooser

**Files:**
- Modify: `js/pitch-render.js` (import near line 78; endpoint consts near lines 88-91; PHOTO click body near lines 1101-1112)

- [ ] **Step 1: Add the import**

Next to `import { openPhotoCropModal } from "./photo-crop.js";` (around line 78), add:

```javascript
import { openPhotoSourceChooser, openPhotoCandidatePicker } from "./photo-source-picker.js";
```

- [ ] **Step 2: Add endpoint constants**

Next to the other `*_ENDPOINT` consts (around lines 88-91), add:

```javascript
const LIST_PHOTO_CANDIDATES_ENDPOINT = "/__player-photo/list-candidates";
const SAVE_CHOSEN_PHOTO_ENDPOINT = "/__player-photo/save-chosen";
```

- [ ] **Step 3: Replace the PHOTO click body's modal call**

Inside the `photoBtn.addEventListener("click", ...)` handler, the current code (around lines 1101-1112) ends with:

```javascript
    openPlayerPhotoUrlModal(player?.name || "", async (imageUrl) => {
      const res = await fetch(PLAYER_PHOTO_FROM_URL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...photoBodyBase, imageUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not download photo from URL.");
      }
      applyFetchedPhoto(data);
    });
  });
```

Replace exactly that `openPlayerPhotoUrlModal(...);` call (keep everything above it — `photoBodyBase`, `applyFetchedPhoto`, the guards — unchanged) with:

```javascript
    const submitFromUrl = async (imageUrl) => {
      const res = await fetch(PLAYER_PHOTO_FROM_URL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...photoBodyBase, imageUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not download photo from URL.");
      }
      applyFetchedPhoto(data);
    };
    const fetchFromSource = (source) => {
      openPhotoCandidatePicker({
        title: `${source === "fut.gg" ? "FUT cards (fut.gg)" : "365scores"} — ${player?.name || "photo"}`,
        loadCandidates: async () => {
          const res = await fetch(LIST_PHOTO_CANDIDATES_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...photoBodyBase, source }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Photo search failed.");
          }
          return Array.isArray(data.candidates) ? data.candidates : [];
        },
        onSelect: async (candidate) => {
          const res = await fetch(SAVE_CHOSEN_PHOTO_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...photoBodyBase, source, imageDataUrl: candidate.dataUrl }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Failed to save photo.");
          }
          applyFetchedPhoto(data);
        },
      });
    };
    openPhotoSourceChooser({
      playerName: player?.name || "",
      onPasteUrl: () => openPlayerPhotoUrlModal(player?.name || "", submitFromUrl),
      onFetchFutgg: () => fetchFromSource("fut.gg"),
      onFetch365: () => fetchFromSource("365scores"),
    });
  });
```

- [ ] **Step 4: Verify module parses**

Run: `node --check "js/pitch-render.js"`
Expected: no output, exit 0. (Skip if `node` unavailable.)

- [ ] **Step 5: Commit**

```bash
git add "js/pitch-render.js"
git commit -m "feat(photo): PHOTO button opens 3-source chooser with picker"
```

---

## Task 7: Manual browser verification (end-to-end)

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `python run_site.py` and open the served URL (default `http://127.0.0.1:8888`). Load a club team so a pitch with player slots renders.

- [ ] **Step 2: Chooser appears**

Hover a player slot, click **PHOTO**. Expected: the chooser modal shows the player name and three options (Paste image URL / Fetch FUT cards / Fetch from 365scores). Esc and Cancel and backdrop all close it.

- [ ] **Step 3: Paste URL still works**

Choose **Paste image URL**, paste a known image URL (e.g. a 365scores `imagecache` URL), confirm. Expected: photo applies to the slot exactly as before this change.

- [ ] **Step 4: FUT cards picker**

Click PHOTO → **Fetch FUT cards**. Expected: "Searching…" then a grid of the player's card images. Click one. Expected: it applies to the slot, persists (a file named `auto - fut.gg*` under the player's image folder), and the slot uses the correct fut.gg framing.

- [ ] **Step 5: 365scores picker**

Click PHOTO → **Fetch from 365scores**. Expected: grid (usually one face image); pick it → applies, file named `auto - 365scores*`, correct framing.

- [ ] **Step 6: Empty + error states**

Try a player unlikely to resolve. Expected: "No photos found for this player." (no crash, no error styling). If the network is down, the picker shows a red error message with a Close button.

- [ ] **Step 7: Record results**

Note any failures with the exact console/server output. If all 6 steps pass, the feature is complete.

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** 3 options (URL/fut.gg/365) ✓ (Task 6); picker for both fetch sources ✓ (Tasks 2,4,6); server-side data-URL thumbnails ✓ (Task 2); correct source filenames/framing ✓ (Tasks 1,3); reuse of `applyFetchedPhoto`/`photoBodyBase`/URL path ✓ (Task 6); two new endpoints + shared persist helper ✓ (Tasks 1-3); CSS + cache-buster ✓ (Task 5); module mirrors photo-crop.js ✓ (Task 4); no sibling-runner edits ✓ (scope banner). Out-of-scope futbin/headless-Chrome correctly excluded.
- **Placeholder scan:** no TBD/TODO; every code step has full code.
- **Type/name consistency:** `_persist_player_photo_bytes(target_dir, index_section, index_key, image_bytes, source) -> (status, dict)` used identically in Tasks 1, 3; `_guess_image_mime` defined Task 1, used Task 2; endpoint paths match between server (Tasks 2,3) and client consts (Task 6: `LIST_PHOTO_CANDIDATES_ENDPOINT`, `SAVE_CHOSEN_PHOTO_ENDPOINT`); `loadCandidates`/`onSelect`/`candidate.dataUrl` consistent between module (Task 4) and caller (Task 6); response keys (`relativePath`, `indexSection`, `indexKey`, `source`) match what `applyFetchedPhoto` consumes.
