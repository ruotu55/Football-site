# "Update Data" Button — Per-Runner Squad Refresh from Transfermarkt

**Date:** 2026-05-02
**Status:** Draft — pending implementation plan

## Goal

Add an **Update Data** button to the Quiz controls panel of every Main Runner. Clicking it opens a modal where the user pastes a Transfermarkt session cookie and clicks **Apply**; the server then refreshes the squad JSON file for every team currently sitting in that runner's in-memory levels list, while the modal shows live progress ("12 / 30 — refreshing Arsenal FC…") and a final summary.

The feature is built on top of the project's existing legacy refresh scripts (`Squad Formation/_transfermarkt_*` paths and `Legacy/Legacy - Scripts/generate_squads_from_transfermarkt.py`) — no legacy script is modified.

## Non-goals

- Persisting the cookie between sessions (user re-pastes every Apply — confirmed in brainstorm).
- Diffing fetched data vs. on-disk JSON (always full overwrite — confirmed).
- Refreshing teams that aren't in the active levels list (e.g., teams in Saved scripts) — out of scope.
- Adding new TM scraping logic — we reuse legacy helpers verbatim.
- Any change to the eight runners' visual style, formations, or quiz logic.

## User flow

1. User opens any Main Runner (Lineups Regular/Shorts, Four Parameters Regular/Shorts, Career Path Regular/Shorts, Player Stats Regular/Shorts).
2. They configure their levels (each level holds one team via `selectedEntry`).
3. **Quiz controls › Quiz tab**: they click **Update Data**.
4. Modal opens with a cookie textarea and Apply / Cancel.
5. They paste their Transfermarkt cookie and click **Apply**.
6. The Apply button hides; a progress section appears: counter line + progress bar.
7. Counter updates roughly every 500 ms: "12 / 30 — refreshing Arsenal FC…".
8. On completion: summary panel: "Done. 28 ok, 2 failed: [list of paths]".
9. User closes the modal. Each refreshed team's JSON on disk now reflects current Transfermarkt data; reloading any saved script picks up the new values.

## Architecture

```
[browser]                                     [run_site.py]                     [legacy helpers]
  Quiz controls › Quiz tab
   └── new "Update Data" button
       └── opens modal: cookie textarea + Apply
           └── POST /__update-data/start  ─────► dev_server_update_data.py
               body: { cookie, paths[] }          └── thread: TMKT() session
                                                       └── for each path:
                                                            • read JSON, get kind/cid
                                                            • fetch_squad_payload(...)
                                                            • _serialize_squad(...)
                                                            • write file
                                                            • update in-memory state
           ◄── { jobId }
       polls every 500ms
           GET /__update-data/progress?id=… ───►   returns { status, total, done, current, ok, failed[] }
       updates "12 / 30 — refreshing Arsenal FC…" + bar
       on done: shows summary "28 ok, 2 failed: [list]"
```

### Component boundaries

- **`.Storage/Scripts/dev_server_update_data.py`** (new). Self-contained backend module exposing `try_handle_get(handler, project_root)` and `try_handle_post(handler, project_root)` — the project's existing convention (`dev_server_saved_scripts.py`, `dev_server_runner_blob.py`). Owns the worker thread, the in-memory job state, and the legacy-helper dispatch.
- **`<runner>/js/update-data.js`** (new, eight copies — one per runner). Owns the modal lifecycle, request, polling, and DOM updates. Pure browser code; no shared state with other JS modules beyond `appState.levelsData` (read-only).
- **Eight `run_site.py`** files. Each gets ~10 lines: a loader function for the new module and two dispatch lines in the request handler — same pattern they already use for the existing two shared modules.
- **Eight `controls.html`, `modals.html`, `dom-bindings.js`, `bootstrap-hybrid.js`** files. Per-runner UI wiring.

The dependency graph stays clean: the new backend module imports from the legacy helpers; the legacy helpers know nothing about the new module. Frontend modules don't depend on each other.

## Backend design — `dev_server_update_data.py`

### Public API

```python
def try_handle_get(handler, project_root: Path) -> bool   # returns True iff handled
def try_handle_post(handler, project_root: Path) -> bool
```

### HTTP routes

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `POST` | `/__update-data/start` | `{ "cookie": str, "paths": [str, …] }` | `{ "jobId": str }` (200) <br>`{ "error": str }` (400) <br>`{ "error": "busy", "jobId": str }` (409) |
| `GET` | `/__update-data/progress` | `?id=<jobId>` | `{ status, total, done, current, ok_count, failed: [{path, error}, …] }` |

`status` ∈ `"running" | "done" | "error" | "unknown"`.

### Job state

A single module-level dict guarded by `threading.Lock`:

```python
_JOB = {
    "id": str | None,
    "status": "running" | "done" | "error" | None,
    "total": int,
    "done": int,
    "current": str,           # human-readable label of the team currently being fetched
    "ok_count": int,
    "failed": [ {"path": str, "error": str}, … ],
    "started_at": float,
}
```

Only one job runs at a time. A second `start` call while `status == "running"` returns 409 with the live job's `jobId` so the frontend can resume polling. Once a job is `"done"`, the next `start` overwrites the state.

### Path validation (security)

For every incoming `path`:

1. Strip a leading `../` (the runner-relative form the frontend's `teams-index.json` uses) and resolve to an absolute path.
2. Reject anything not under `project_root / ".Storage" / "Squad Formation" / "Teams"` **or** `project_root / ".Storage" / "Squad Formation" / "Nationalities"` — both are valid because Lineups runners pick from both subtrees.
3. Reject if not a `.json` file or doesn't exist.

Failed validation aborts the whole `start` request with HTTP 400 (no partial worker started).

### Worker thread

The thread runs `asyncio.run(_refresh_all(...))`:

1. `os.environ["TRANSFERMARKT_COOKIE"] = cookie` (process-wide; safe because there's only one job at a time).
2. Load the nationality map from `.Storage/Squad Formation/_transfermarkt_nationality_id_map.json` (same as legacy).
3. Open one `async with TMKT() as tmkt:` session.
4. Resolve season meta once (`_season_hint(tmkt)`).
5. Iterate the unique paths with a `Semaphore(4)` (matches `refresh_all_club_squads_from_transfermarkt.py` default).
6. For each path:
   - Read the JSON file. Extract `kind`, `transfermarktClubId` (clubs) or national-team id (nationals — the legacy national refresher resolves it from the country name when missing), `imagePath`, `name`.
   - Update `_JOB["current"]` to the team's `name` field from the JSON (e.g. `"Arsenal FC"`, `"France"`) **before** the network call. If `name` is missing, fall back to the file stem.
   - Dispatch:
     - **`kind == "club"`**: call `fetch_squad_payload(tmkt, cid, …, national_team_squad=False, …)` → `_serialize_squad(kind="club", …)`.
     - **`kind == "nationality"`**: call `fetch_squad_payload(tmkt, nat_id, …, national_team_squad=True, …)` → `_serialize_squad(kind="nationality", …)`. (The legacy national-team scripts use the literal string `"nationality"`; the country JSONs on disk also have `kind: "nationality"`.)
     - Other / unknown `kind`: count as failure with `error="unsupported kind: <kind>"`.
   - Write the resulting payload to the same file path with `json.dumps(..., indent=2, ensure_ascii=False) + "\n"`.
   - Increment `_JOB["done"]` and either `ok_count` or append to `failed[]`.
7. When all paths processed, set `status = "done"`.
8. On unhandled exception in the worker (e.g., TM API completely down): set `status = "error"`, store the message in `_JOB["error"]`, return.

The legacy helpers already handle: WAF retries, ceapi → leistungsdaten fallback, goalkeeper conceded/clean-sheets HTML scraping, transfer history, club & national career totals. We inherit all of it.

### Imports from legacy

The module loads `generate_squads_from_transfermarkt.py` via `importlib.util.spec_from_file_location` (same trick `run_site.py` already uses for the other shared modules) and pulls these symbols:

- `fetch_squad_payload`
- `_serialize_squad`
- `_get_club_safe`
- `_season_hint`
- `season_context_for_club`
- `resolve_team_id` (only used as fallback if `transfermarktClubId` is missing in a JSON)
- `OUT_TEAMS`, `PROJECT` (for path-base validation if needed)

It also imports `TMKT` from the sibling `tmkt` module (the legacy refreshers do this via `sys.path.insert(0, _SCRIPT_DIR)`).

## Frontend design

### Per-runner files added / changed

| File | Change |
|---|---|
| `html/controls.html` | Add `<button id="btn-update-data" class="panel-toggle">Update Data</button>` inside `#panel-landing`, after the `Levels Control` button. |
| `html/modals.html` | Add `#update-data-modal` (reuses `swap-modal` skeleton). Children: title "Update Data", cookie `<textarea id="update-data-cookie">`, Apply/Cancel row, hidden `#update-data-progress` block (counter + bar + summary). |
| `js/update-data.js` (new) | Module exporting `initUpdateData()` which wires button click → modal open, Cancel/close → reset, Apply → POST + poll. |
| `js/dom-bindings.js` | Import and call `initUpdateData()` once during bootstrap (alongside the existing initializers). |
| `js/bootstrap-hybrid.js` | Add the new JS file to the module-import list (matches existing pattern). |

### `update-data.js` — behavior

1. **Open modal**: clears any prior progress state, focuses the cookie textarea.
2. **Apply click**:
   - Read cookie value (trimmed). If empty → inline error "Paste your Transfermarkt cookie to continue."; abort.
   - Collect paths from `appState.levelsData` (skipping logo/intro/bonus/outro entries that have `selectedEntry == null`):
     ```js
     const paths = [...new Set(
       appState.levelsData
         .map(l => l?.selectedEntry?.path)
         .filter(p => typeof p === "string" && p.length > 0)
     )];
     ```
   - If `paths.length === 0` → inline error "No teams selected in your levels."; abort.
   - POST to `/__update-data/start` with `{ cookie, paths }`. On 409, treat as "resume" and poll the returned `jobId`.
   - Hide Apply, show progress section, store the returned `jobId`, start polling.
3. **Polling** (`setInterval` 500 ms):
   - GET `/__update-data/progress?id=<jobId>`.
   - Update `#update-data-counter` to `${done} / ${total} — refreshing ${current}…`.
   - Update `#update-data-bar` width to `${(done/total)*100}%`.
   - On `status === "done"`:
     - Stop polling.
     - Summary text: if `failed.length === 0` → `"Done. All ${ok_count} teams refreshed successfully."` else `"Done. ${ok_count} ok, ${failed.length} failed."` followed by a `<ul>` of `failed[].path` and `failed[].error`.
     - Re-enable Apply (so the user can paste a fresh cookie and run again). The cookie textarea is **not** auto-cleared — it stays so a second Apply only requires re-clicking the button.
   - On `status === "error"`: stop polling, show inline error.
4. **Cancel / close**: stops polling, leaves the backend job running (it'll finish on its own); reopening the modal during a live run resumes polling via 409 handling.

### Visual

The modal reuses existing `swap-modal` styling: dark panel, rounded corners, header with title + close X. The progress bar is a 100%-width container `<div>` with an inner `<div>` whose width is set in JS. Summary panel uses the same red color (`#ef4444`) the project already uses for delete confirmations.

No new CSS file — the few extra rules live inline in `controls.html`/`modals.html`, matching how the project already does small tweaks.

## Per-runner wiring (eight `run_site.py`)

After the two existing `_load_runner_*` blocks, add:

```python
def _load_runner_update_data():
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_update_data.py"
    spec = importlib.util.spec_from_file_location("_fc_runner_update_data", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_update_data.py")
    spec.loader.exec_module(mod)
    return mod

_runner_update_mod = _load_runner_update_data()
```

In the GET handler (next to the existing two dispatch lines):

```python
if _runner_update_mod.try_handle_get(self, PROJECT_ROOT):
    return
```

In the POST handler:

```python
if _runner_update_mod.try_handle_post(self, PROJECT_ROOT):
    return
```

Net: ~10 added lines per `run_site.py`, no removals, no re-ordering.

## Error handling

| Condition | Behavior |
|---|---|
| Empty cookie | Frontend inline error; no request sent. |
| No teams in levels | Frontend inline error; no request sent. |
| Path validation fails on backend | HTTP 400, no worker started; frontend shows error. |
| Concurrent `start` while job running | HTTP 409 with the live job's `jobId`; frontend resumes polling. |
| Per-team fetch failure | Counted in `failed[]`; batch continues. |
| Unhandled worker exception (TM down, network gone) | `status = "error"`; frontend shows the error message. |
| Server killed mid-run | In-flight team's file may be partial; user re-runs Apply. |
| Stale `jobId` polled | Backend returns `{"status": "unknown"}`; frontend stops polling and shows "Job no longer tracked". |

## Files touched

| File | Action |
|---|---|
| `.Storage/Scripts/dev_server_update_data.py` | **new** (~300 LOC) |
| 8 × `Main Runner - …/run_site.py` | +~10 lines (loader + 2 dispatch lines) |
| 8 × `Main Runner - …/html/controls.html` | + button |
| 8 × `Main Runner - …/html/modals.html` | + modal |
| 8 × `Main Runner - …/js/update-data.js` | **new** |
| 8 × `Main Runner - …/js/dom-bindings.js` | + initializer wiring |
| 8 × `Main Runner - …/js/bootstrap-hybrid.js` | + import the new module |
| `.Storage/Legacy/Legacy - Scripts/*` | **untouched** |

## Testing strategy

- **Backend unit-style**: a small `python` script that imports `dev_server_update_data` and calls `_refresh_all` directly with a single valid path and a mocked `TMKT` (smoke test path validation, kind dispatch, error capture).
- **End-to-end manual**:
  1. `cd "Main Runner - Lineups - Regular" && python run_site.py --no-browser`.
  2. Open browser, configure 3 levels (e.g., Arsenal FC, France, Real Madrid).
  3. Quiz tab → Update Data → paste cookie → Apply.
  4. Verify counter, bar, current name update; verify summary; verify all three JSON files have updated `mtime` and the `appearances` / `goals_conceded` fields look right for the current season.
- **Cross-runner smoke**: repeat step 1–4 in one Shorts runner and one player-centric runner (e.g., Career Path Regular) to confirm the wiring works in all eight.
- **Concurrent click**: click Apply twice rapidly — second response should be 409 with the same `jobId`, frontend keeps polling without duplicating the run.
- **Bad path**: temporarily craft a request with `paths: ["../../etc/passwd"]` — backend should respond 400.

## Open questions for the implementation phase

None blocking. The following are tactical and to be resolved during writing-plans / coding:

- Exact wording of the inline-error and summary strings (English; Spanish parity is out of scope for v1 since the modal is a developer-facing utility).
- Whether to give the modal a "live log" tab as a v2 follow-up (Approach C from brainstorm) — not in v1.
