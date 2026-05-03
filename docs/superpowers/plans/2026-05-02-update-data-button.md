# Update Data Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Update Data" button to every Main Runner's Quiz controls that, after the user pastes a Transfermarkt cookie and clicks Apply, refreshes the squad JSON of every team in the active levels list while showing live progress.

**Architecture:** One new shared backend module (`.Storage/Scripts/dev_server_update_data.py`) wired into each runner's `run_site.py` via the existing `try_handle_get` / `try_handle_post` convention. The module imports the legacy refresh helpers (`generate_squads_from_transfermarkt.py` from `.Storage/Legacy/Legacy - Scripts/`) and runs a single `TMKT()` async session in a daemon thread, dispatching club vs. nationality based on each JSON's `kind` field. The frontend ships the active levels' team paths to the backend, polls a progress endpoint every 500 ms, and renders counter / bar / summary in a new modal.

**Tech Stack:** Python 3.11 (stdlib `http.server`, `asyncio`, `threading`, `json`, `unittest`), vanilla JS modules (no framework), HTML/CSS reusing the existing `swap-modal` skeleton. Legacy helpers: `tmkt.TMKT`, `generate_squads_from_transfermarkt.fetch_squad_payload` / `_serialize_squad` / `_get_club_safe` / `_season_hint` / `season_context_for_club`.

**Spec:** `docs/superpowers/specs/2026-05-02-update-data-button-design.md`

---

## File map

| File | Action |
|---|---|
| `.Storage/Scripts/dev_server_update_data.py` | **new** — backend module |
| `.Storage/Scripts/tests/__init__.py` | **new** — package marker |
| `.Storage/Scripts/tests/test_update_data.py` | **new** — unittest suite |
| `Main Runner - Lineups - Regular/run_site.py` | + ~10 lines (loader + dispatch) |
| `Main Runner - Lineups - Regular/html/controls.html` | + Update Data button |
| `Main Runner - Lineups - Regular/html/modals.html` | + Update Data modal |
| `Main Runner - Lineups - Regular/js/update-data.js` | **new** |
| `Main Runner - Lineups - Regular/js/dom-bindings.js` | + element refs |
| `Main Runner - Lineups - Regular/js/app.js` | + import + init call |
| 7 × other `Main Runner - …/{run_site.py, html/controls.html, html/modals.html, js/update-data.js, js/dom-bindings.js, js/app.js}` | replicate Lineups Regular changes |

The 8 runners are: `Main Runner - Lineups - Regular`, `Main Runner - Lineups - Shorts`, `Main Runner - Four parameters - Regular`, `Main Runner - Four parameters - Shorts`, `Main Runner - Career Path - Regular`, `Main Runner - Career Path - Shorts`, `Main Runner - Player stats`, `Main Runner - Player stats shorts`.

---

## Task 1: Backend module — path validation (TDD)

**Files:**
- Create: `.Storage/Scripts/dev_server_update_data.py`
- Create: `.Storage/Scripts/tests/__init__.py`
- Create: `.Storage/Scripts/tests/test_update_data.py`

- [ ] **Step 1: Create the empty test package marker**

Create `.Storage/Scripts/tests/__init__.py` with content:

```python
```

(Empty file — just makes the folder importable.)

- [ ] **Step 2: Write the first failing test**

Create `.Storage/Scripts/tests/test_update_data.py`:

```python
"""Tests for dev_server_update_data."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
_MODULE_PATH = _SCRIPTS_DIR / "dev_server_update_data.py"


def _load():
    spec = importlib.util.spec_from_file_location("dev_server_update_data", _MODULE_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class ValidatePathsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        teams = self.root / ".Storage" / "Squad Formation" / "Teams" / "England" / "Premier League"
        nats = self.root / ".Storage" / "Squad Formation" / "Nationalities" / "Europe"
        teams.mkdir(parents=True)
        nats.mkdir(parents=True)
        (teams / "Arsenal FC.json").write_text("{}", encoding="utf-8")
        (nats / "France.json").write_text("{}", encoding="utf-8")
        self.mod = _load()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_accepts_team_path_with_dotdot_prefix(self) -> None:
        # Frontend ships paths like "../.Storage/Squad Formation/Teams/.../X.json"
        path = "../.Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"
        resolved = self.mod._validate_and_resolve_path(self.root, path)
        self.assertTrue(resolved.is_file())
        self.assertEqual(resolved.name, "Arsenal FC.json")

    def test_accepts_nationality_path(self) -> None:
        path = "../.Storage/Squad Formation/Nationalities/Europe/France.json"
        resolved = self.mod._validate_and_resolve_path(self.root, path)
        self.assertTrue(resolved.is_file())

    def test_rejects_traversal_above_subtrees(self) -> None:
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(self.root, "../../../etc/passwd")

    def test_rejects_outside_squad_formation(self) -> None:
        other = self.root / "elsewhere.json"
        other.write_text("{}", encoding="utf-8")
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(self.root, "elsewhere.json")

    def test_rejects_non_json(self) -> None:
        bad = self.root / ".Storage" / "Squad Formation" / "Teams" / "x.txt"
        bad.write_text("", encoding="utf-8")
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(
                self.root,
                ".Storage/Squad Formation/Teams/x.txt",
            )

    def test_rejects_missing_file(self) -> None:
        with self.assertRaises(self.mod.InvalidPathError):
            self.mod._validate_and_resolve_path(
                self.root,
                ".Storage/Squad Formation/Teams/Nope.json",
            )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd "c:/Users/Rom/Documents/GitHub/Football Channel" && python -m unittest .Storage.Scripts.tests.test_update_data -v`

Expected: ImportError or FileNotFoundError because `dev_server_update_data.py` doesn't exist yet.

If the dotted-path doesn't work because of the leading dot in `.Storage`, run instead:

```bash
python ".Storage/Scripts/tests/test_update_data.py"
```

Expected: same failure.

- [ ] **Step 4: Create the minimal module to pass path-validation tests**

Create `.Storage/Scripts/dev_server_update_data.py`:

```python
"""HTTP handlers for the per-runner Update Data feature (dev server only).

Endpoints (mounted from each runner's run_site.py):
  POST /__update-data/start    body: {"cookie": str, "paths": [str, ...]}
  GET  /__update-data/progress?id=<jobId>

The worker thread imports legacy refresh helpers from
    .Storage/Legacy/Legacy - Scripts/generate_squads_from_transfermarkt.py
without modifying them.
"""
from __future__ import annotations

import json
from pathlib import Path


_TEAMS_SUBPATH = (".Storage", "Squad Formation", "Teams")
_NAT_SUBPATH = (".Storage", "Squad Formation", "Nationalities")


class InvalidPathError(ValueError):
    """Raised when a client-supplied team JSON path fails validation."""


def _strip_leading_dotdot(path: str) -> str:
    """Drop a single leading '../' if present (frontend's runner-relative form)."""
    s = path.replace("\\", "/")
    if s.startswith("../"):
        s = s[3:]
    return s


def _validate_and_resolve_path(project_root: Path, path: str) -> Path:
    """Resolve a client-supplied path under the project root and verify it lies
    inside Squad Formation/Teams or Squad Formation/Nationalities.

    Raises InvalidPathError if anything is off (traversal, wrong subtree, wrong
    extension, missing file).
    """
    if not isinstance(path, str) or not path.strip():
        raise InvalidPathError("empty path")
    rel = _strip_leading_dotdot(path.strip())
    candidate = (project_root / rel).resolve()

    teams_root = (project_root / Path(*_TEAMS_SUBPATH)).resolve()
    nat_root = (project_root / Path(*_NAT_SUBPATH)).resolve()

    inside = False
    for root in (teams_root, nat_root):
        try:
            candidate.relative_to(root)
            inside = True
            break
        except ValueError:
            continue
    if not inside:
        raise InvalidPathError(f"outside Squad Formation/(Teams|Nationalities): {path}")
    if candidate.suffix.lower() != ".json":
        raise InvalidPathError(f"not a .json file: {path}")
    if not candidate.is_file():
        raise InvalidPathError(f"file does not exist: {path}")
    return candidate


__all__ = ["InvalidPathError", "_validate_and_resolve_path"]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python ".Storage/Scripts/tests/test_update_data.py" -v`

Expected: 6 tests, all pass.

- [ ] **Step 6: Commit**

```bash
git add ".Storage/Scripts/dev_server_update_data.py" \
        ".Storage/Scripts/tests/__init__.py" \
        ".Storage/Scripts/tests/test_update_data.py"
git commit -m "feat(update-data): add path validation for backend module"
```

---

## Task 2: Backend module — job state machine (TDD)

**Files:**
- Modify: `.Storage/Scripts/dev_server_update_data.py`
- Modify: `.Storage/Scripts/tests/test_update_data.py`

The job state is a single dict guarded by a lock. Only one job runs at a time; concurrent `start()` while running returns the live job's id.

- [ ] **Step 1: Add the failing test class**

Append to `.Storage/Scripts/tests/test_update_data.py` (above the `if __name__` block):

```python
class JobStateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load()
        # Reset the singleton between tests
        self.mod._reset_job_for_tests()

    def test_initial_state_is_idle(self) -> None:
        self.assertEqual(self.mod._snapshot_job(None), {"status": "unknown"})

    def test_register_job_returns_id_and_running(self) -> None:
        jid = self.mod._register_job(total=3)
        self.assertIsInstance(jid, str)
        self.assertGreater(len(jid), 0)
        snap = self.mod._snapshot_job(jid)
        self.assertEqual(snap["status"], "running")
        self.assertEqual(snap["total"], 3)
        self.assertEqual(snap["done"], 0)
        self.assertEqual(snap["ok_count"], 0)
        self.assertEqual(snap["failed"], [])
        self.assertEqual(snap["current"], "")

    def test_concurrent_register_returns_existing_id(self) -> None:
        first = self.mod._register_job(total=2)
        with self.assertRaises(self.mod.JobAlreadyRunningError) as ctx:
            self.mod._register_job(total=5)
        self.assertEqual(ctx.exception.job_id, first)

    def test_record_progress_updates_counters(self) -> None:
        jid = self.mod._register_job(total=2)
        self.mod._set_current(jid, "Arsenal FC")
        self.mod._record_ok(jid)
        self.mod._set_current(jid, "France")
        self.mod._record_failure(jid, "France.json", "boom")
        snap = self.mod._snapshot_job(jid)
        self.assertEqual(snap["done"], 2)
        self.assertEqual(snap["ok_count"], 1)
        self.assertEqual(snap["failed"], [{"path": "France.json", "error": "boom"}])

    def test_finish_marks_done(self) -> None:
        jid = self.mod._register_job(total=1)
        self.mod._record_ok(jid)
        self.mod._finish(jid)
        snap = self.mod._snapshot_job(jid)
        self.assertEqual(snap["status"], "done")

    def test_after_done_register_returns_new_id(self) -> None:
        first = self.mod._register_job(total=1)
        self.mod._record_ok(first)
        self.mod._finish(first)
        second = self.mod._register_job(total=1)
        self.assertNotEqual(first, second)

    def test_unknown_id_is_unknown(self) -> None:
        self.mod._register_job(total=1)
        self.assertEqual(
            self.mod._snapshot_job("nope-not-a-real-id"),
            {"status": "unknown"},
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python ".Storage/Scripts/tests/test_update_data.py" -v`

Expected: `JobStateTest` cases all fail with `AttributeError` (functions not defined yet).

- [ ] **Step 3: Add the job state machine to the module**

Append to `.Storage/Scripts/dev_server_update_data.py` (just before the `__all__` line; remove the existing `__all__` and re-define it at the bottom of the file):

```python
import secrets
import threading


class JobAlreadyRunningError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(f"a job is already running: {job_id}")
        self.job_id = job_id


_JOB_LOCK = threading.Lock()
_JOB: dict | None = None


def _reset_job_for_tests() -> None:
    """Clear the singleton — only meant for unit tests."""
    global _JOB
    with _JOB_LOCK:
        _JOB = None


def _register_job(total: int) -> str:
    global _JOB
    with _JOB_LOCK:
        if _JOB is not None and _JOB.get("status") == "running":
            raise JobAlreadyRunningError(_JOB["id"])
        jid = secrets.token_hex(8)
        _JOB = {
            "id": jid,
            "status": "running",
            "total": int(total),
            "done": 0,
            "current": "",
            "ok_count": 0,
            "failed": [],
            "error": "",
        }
        return jid


def _set_current(job_id: str, label: str) -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["current"] = str(label)


def _record_ok(job_id: str) -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["done"] += 1
            _JOB["ok_count"] += 1


def _record_failure(job_id: str, path: str, error: str) -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["done"] += 1
            _JOB["failed"].append({"path": str(path), "error": str(error)})


def _finish(job_id: str, error: str = "") -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["status"] = "error" if error else "done"
            if error:
                _JOB["error"] = str(error)


def _snapshot_job(job_id: str | None) -> dict:
    with _JOB_LOCK:
        if _JOB is None:
            return {"status": "unknown"}
        if job_id is None or _JOB["id"] != job_id:
            return {"status": "unknown"}
        # Shallow copy + deep-copy failed list so callers can't mutate
        return {
            "status": _JOB["status"],
            "total": _JOB["total"],
            "done": _JOB["done"],
            "current": _JOB["current"],
            "ok_count": _JOB["ok_count"],
            "failed": list(_JOB["failed"]),
            "error": _JOB["error"],
        }
```

Replace the bottom-of-file `__all__` with:

```python
__all__ = [
    "InvalidPathError",
    "JobAlreadyRunningError",
    "_validate_and_resolve_path",
    "_register_job",
    "_set_current",
    "_record_ok",
    "_record_failure",
    "_finish",
    "_snapshot_job",
    "_reset_job_for_tests",
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python ".Storage/Scripts/tests/test_update_data.py" -v`

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ".Storage/Scripts/dev_server_update_data.py" \
        ".Storage/Scripts/tests/test_update_data.py"
git commit -m "feat(update-data): add single-job state machine"
```

---

## Task 3: Backend module — HTTP routes (TDD)

**Files:**
- Modify: `.Storage/Scripts/dev_server_update_data.py`
- Modify: `.Storage/Scripts/tests/test_update_data.py`

This task wires `try_handle_get` and `try_handle_post` but stubs out the actual TM work via an injectable runner so the tests don't need the network.

- [ ] **Step 1: Write the failing HTTP-layer tests**

Append to `.Storage/Scripts/tests/test_update_data.py`:

```python
import io
from http.server import BaseHTTPRequestHandler


class _FakeHandler:
    """Minimal stand-in for BaseHTTPRequestHandler that records the response."""

    def __init__(self, method: str, path: str, body: bytes = b"") -> None:
        self.command = method
        self.path = path
        self.headers = {"Content-Length": str(len(body))}
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self.status: int | None = None
        self.response_headers: dict[str, str] = {}

    # Methods the module is expected to call
    def send_response(self, code: int) -> None:
        self.status = code

    def send_header(self, k: str, v: str) -> None:
        self.response_headers[k] = v

    def end_headers(self) -> None:
        pass

    def send_error(self, code: int, msg: str = "") -> None:
        self.status = code
        self.wfile.write(msg.encode("utf-8"))

    def body_json(self) -> dict:
        raw = self.wfile.getvalue()
        return json.loads(raw.decode("utf-8")) if raw else {}


class HttpRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        teams = self.root / ".Storage" / "Squad Formation" / "Teams" / "England" / "Premier League"
        teams.mkdir(parents=True)
        (teams / "Arsenal FC.json").write_text(
            json.dumps({"kind": "club", "name": "Arsenal FC", "transfermarktClubId": 11}),
            encoding="utf-8",
        )
        self.mod = _load()
        self.mod._reset_job_for_tests()

        # Inject a fake worker so we don't hit the network during tests.
        self._calls = []

        def fake_runner(project_root, cookie, resolved_paths, job_id):
            self._calls.append({"cookie": cookie, "paths": list(resolved_paths), "job_id": job_id})
            for _ in resolved_paths:
                self.mod._record_ok(job_id)
            self.mod._finish(job_id)

        self.mod._set_runner_for_tests(fake_runner)

    def tearDown(self) -> None:
        self.tmp.cleanup()
        self.mod._set_runner_for_tests(None)
        self.mod._reset_job_for_tests()

    def test_get_progress_unknown_when_no_job(self) -> None:
        h = _FakeHandler("GET", "/__update-data/progress?id=xxx")
        handled = self.mod.try_handle_get(h, self.root)
        self.assertTrue(handled)
        self.assertEqual(h.status, 200)
        self.assertEqual(h.body_json(), {"status": "unknown"})

    def test_get_unknown_path_returns_false(self) -> None:
        h = _FakeHandler("GET", "/some/other/path")
        self.assertFalse(self.mod.try_handle_get(h, self.root))

    def test_post_start_happy_path(self) -> None:
        body = json.dumps({
            "cookie": "tm-session=abc",
            "paths": ["../.Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"],
        }).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 200)
        resp = h.body_json()
        self.assertIn("jobId", resp)
        # Worker is synchronous in tests, so the job is already done.
        snap = self.mod._snapshot_job(resp["jobId"])
        self.assertEqual(snap["status"], "done")
        self.assertEqual(snap["ok_count"], 1)
        # Runner saw the resolved (absolute) path
        self.assertEqual(len(self._calls), 1)
        self.assertEqual(self._calls[0]["cookie"], "tm-session=abc")
        self.assertEqual(len(self._calls[0]["paths"]), 1)
        self.assertTrue(str(self._calls[0]["paths"][0]).endswith("Arsenal FC.json"))

    def test_post_start_rejects_empty_cookie(self) -> None:
        body = json.dumps({"cookie": "", "paths": []}).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 400)
        self.assertIn("cookie", h.body_json().get("error", "").lower())

    def test_post_start_rejects_empty_paths(self) -> None:
        body = json.dumps({"cookie": "x", "paths": []}).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 400)
        self.assertIn("paths", h.body_json().get("error", "").lower())

    def test_post_start_rejects_traversal(self) -> None:
        body = json.dumps({
            "cookie": "x",
            "paths": ["../../../etc/passwd"],
        }).encode("utf-8")
        h = _FakeHandler("POST", "/__update-data/start", body)
        self.assertTrue(self.mod.try_handle_post(h, self.root))
        self.assertEqual(h.status, 400)

    def test_post_start_409_when_busy(self) -> None:
        # Block the runner so the first job stays "running"
        block = threading.Event()

        def slow_runner(project_root, cookie, resolved_paths, job_id):
            block.wait(timeout=2)
            for _ in resolved_paths:
                self.mod._record_ok(job_id)
            self.mod._finish(job_id)

        self.mod._set_runner_for_tests(slow_runner)

        body = json.dumps({
            "cookie": "x",
            "paths": ["../.Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"],
        }).encode("utf-8")

        h1 = _FakeHandler("POST", "/__update-data/start", body)
        self.mod.try_handle_post(h1, self.root)
        self.assertEqual(h1.status, 200)
        first_id = h1.body_json()["jobId"]

        h2 = _FakeHandler("POST", "/__update-data/start", body)
        self.mod.try_handle_post(h2, self.root)
        self.assertEqual(h2.status, 409)
        self.assertEqual(h2.body_json().get("jobId"), first_id)

        block.set()  # let the worker thread finish
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python ".Storage/Scripts/tests/test_update_data.py" -v`

Expected: HttpRoutesTest cases fail (`try_handle_get` / `try_handle_post` / `_set_runner_for_tests` don't exist yet).

- [ ] **Step 3: Add the HTTP layer + worker dispatch to the module**

Append to `.Storage/Scripts/dev_server_update_data.py`:

```python
from typing import Callable, Iterable, Sequence
from urllib.parse import parse_qs, urlparse


_GET_PROGRESS_PATH = "/__update-data/progress"
_POST_START_PATH = "/__update-data/start"
_MAX_POST_BYTES = 4 * 1024 * 1024
_MAX_PATHS = 500

# A runner function: (project_root, cookie, resolved_paths, job_id) -> None.
# The default runner spawns a thread that talks to Transfermarkt; tests inject a fake.
_RunnerFn = Callable[[Path, str, Sequence[Path], str], None]
_runner_override: _RunnerFn | None = None


def _set_runner_for_tests(fn: _RunnerFn | None) -> None:
    """Inject a synchronous fake runner. Pass None to restore the default."""
    global _runner_override
    _runner_override = fn


def _send_json(handler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def try_handle_get(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    if parsed.path != _GET_PROGRESS_PATH:
        return False
    qs = parse_qs(parsed.query)
    job_id = (qs.get("id") or [None])[0]
    _send_json(handler, 200, _snapshot_job(job_id))
    return True


def try_handle_post(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    if parsed.path != _POST_START_PATH:
        return False
    try:
        content_len = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        _send_json(handler, 400, {"error": "Invalid Content-Length"})
        return True
    if content_len > _MAX_POST_BYTES:
        _send_json(handler, 413, {"error": "Payload too large"})
        return True
    try:
        raw = handler.rfile.read(max(content_len, 0))
        body = json.loads(raw.decode("utf-8") if raw else "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"error": "Invalid JSON"})
        return True
    if not isinstance(body, dict):
        _send_json(handler, 400, {"error": "Body must be a JSON object"})
        return True

    cookie = body.get("cookie")
    paths = body.get("paths")
    if not isinstance(cookie, str) or not cookie.strip():
        _send_json(handler, 400, {"error": "cookie required"})
        return True
    if not isinstance(paths, list) or not paths:
        _send_json(handler, 400, {"error": "paths must be a non-empty list"})
        return True
    if len(paths) > _MAX_PATHS:
        _send_json(handler, 400, {"error": f"too many paths (max {_MAX_PATHS})"})
        return True

    # De-dupe while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for p in paths:
        if not isinstance(p, str):
            _send_json(handler, 400, {"error": "paths must contain only strings"})
            return True
        if p not in seen:
            seen.add(p)
            unique.append(p)

    resolved: list[Path] = []
    try:
        for p in unique:
            resolved.append(_validate_and_resolve_path(project_root, p))
    except InvalidPathError as exc:
        _send_json(handler, 400, {"error": str(exc)})
        return True

    try:
        job_id = _register_job(total=len(resolved))
    except JobAlreadyRunningError as exc:
        _send_json(handler, 409, {"error": "busy", "jobId": exc.job_id})
        return True

    runner = _runner_override or _default_runner
    if _runner_override is not None:
        # Tests run synchronously; production spawns a daemon thread.
        runner(project_root, cookie.strip(), resolved, job_id)
    else:
        thread = threading.Thread(
            target=runner,
            args=(project_root, cookie.strip(), resolved, job_id),
            daemon=True,
        )
        thread.start()

    _send_json(handler, 200, {"jobId": job_id})
    return True


def _default_runner(
    project_root: Path,
    cookie: str,
    resolved_paths: Sequence[Path],
    job_id: str,
) -> None:
    """Production runner. Imports legacy helpers and runs an asyncio session."""
    # Body added in Task 4 — leave a stub for now so the import resolves.
    _finish(job_id, error="default runner not implemented yet")
```

Update `__all__` at the bottom of the file to also include:

```python
"try_handle_get",
"try_handle_post",
"_set_runner_for_tests",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python ".Storage/Scripts/tests/test_update_data.py" -v`

Expected: all 21 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ".Storage/Scripts/dev_server_update_data.py" \
        ".Storage/Scripts/tests/test_update_data.py"
git commit -m "feat(update-data): add HTTP routes with injectable runner"
```

---

## Task 4: Backend module — production runner that calls TM

**Files:**
- Modify: `.Storage/Scripts/dev_server_update_data.py`

This task replaces the `_default_runner` stub with the real implementation that imports legacy helpers and refreshes each team JSON. It's not unit-testable without a Transfermarkt cookie, so we cover it via the manual end-to-end test in Task 8.

- [ ] **Step 1: Replace the `_default_runner` stub**

Replace the `_default_runner` function in `.Storage/Scripts/dev_server_update_data.py` with:

```python
def _default_runner(
    project_root: Path,
    cookie: str,
    resolved_paths: Sequence[Path],
    job_id: str,
) -> None:
    """Production runner: one TMKT() session, dispatches club vs nationality per file."""
    import asyncio
    import importlib.util
    import os
    import sys

    legacy_dir = project_root / ".Storage" / "Legacy" / "Legacy - Scripts"
    if not legacy_dir.is_dir():
        _finish(job_id, error=f"legacy scripts folder missing: {legacy_dir}")
        return

    # Make `tmkt` importable (the legacy refreshers do the same).
    if str(legacy_dir) not in sys.path:
        sys.path.insert(0, str(legacy_dir))

    try:
        import certifi  # noqa: F401  (legacy module sets SSL_CERT_FILE on import)
    except ImportError:
        pass

    spec = importlib.util.spec_from_file_location(
        "_fc_generate_squads",
        legacy_dir / "generate_squads_from_transfermarkt.py",
    )
    if spec is None or spec.loader is None:
        _finish(job_id, error="cannot load generate_squads_from_transfermarkt.py")
        return
    legacy = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(legacy)
    except Exception as exc:
        _finish(job_id, error=f"failed loading legacy module: {exc}")
        return

    try:
        from tmkt import TMKT  # type: ignore
    except Exception as exc:
        _finish(job_id, error=f"failed importing TMKT: {exc}")
        return

    os.environ["TRANSFERMARKT_COOKIE"] = cookie

    nat_map_path = project_root / ".Storage" / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict = {}
    if nat_map_path.is_file():
        try:
            nationality_map = json.loads(nat_map_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            nationality_map = {}

    asyncio.run(
        _refresh_all_async(
            legacy=legacy,
            tmkt_cls=TMKT,
            nationality_map=nationality_map,
            resolved_paths=resolved_paths,
            job_id=job_id,
        )
    )


async def _refresh_all_async(
    legacy,
    tmkt_cls,
    nationality_map: dict,
    resolved_paths: Sequence[Path],
    job_id: str,
) -> None:
    import asyncio

    club_cache: dict = {}
    nt_cache: dict = {}
    player_cache: dict = {}
    stats_cache: dict = {}
    transfer_cache: dict = {}
    club_career_cache: dict = {}
    national_career_cache: dict = {}

    try:
        async with tmkt_cls() as tmkt:
            season_meta = await legacy._season_hint(tmkt)
            season_id = season_meta.get("seasonId") if isinstance(season_meta, dict) else None
            if isinstance(season_id, str) and season_id.isdigit():
                season_id = int(season_id)
            elif not isinstance(season_id, int):
                season_id = None

            sem = asyncio.Semaphore(4)

            async def one(jp: Path) -> None:
                try:
                    raw = json.loads(jp.read_text(encoding="utf-8"))
                except json.JSONDecodeError as exc:
                    _record_failure(job_id, str(jp), f"bad JSON: {exc}")
                    return
                kind = raw.get("kind")
                cid_raw = raw.get("transfermarktClubId")
                rel_img = (raw.get("imagePath") or "").strip().replace("\\", "/")
                label = str(raw.get("name") or jp.stem)
                _set_current(job_id, label)

                try:
                    cid = int(cid_raw)
                except (TypeError, ValueError):
                    _record_failure(job_id, str(jp), "missing transfermarktClubId")
                    return

                async with sem:
                    try:
                        if kind == "club":
                            cdata = await legacy._get_club_safe(tmkt, cid)
                            official = (cdata or {}).get("name") or label
                            official = official.strip() or f"club-{cid}"
                            season_meta_club, sid_club = await legacy.season_context_for_club(
                                tmkt,
                                cid,
                                club_data=cdata,
                                fallback_meta=season_meta,
                            )
                            smc = season_meta_club if isinstance(season_meta_club, dict) else {}
                            comp_stats = (
                                str(smc.get("competitionId")).strip().upper()
                                if smc.get("competitionId")
                                else None
                            )
                            lbl = (
                                str(smc.get("label")).strip()
                                if smc.get("label")
                                else None
                            )
                            squads = await legacy.fetch_squad_payload(
                                tmkt,
                                cid,
                                official_squad_name=official,
                                nationality_map=nationality_map,
                                club_name_cache=club_cache,
                                nt_name_cache=nt_cache,
                                player_cache=player_cache,
                                stats_cache=stats_cache,
                                transfer_cache=transfer_cache,
                                club_career_cache=club_career_cache,
                                national_career_cache=national_career_cache,
                                season_id=sid_club,
                                national_team_squad=False,
                                season_competition_id=comp_stats,
                                season_label_hint=lbl,
                            )
                            payload = legacy._serialize_squad(
                                kind="club",
                                label=official,
                                rel_image=rel_img,
                                tm_id=cid,
                                season_meta=season_meta_club,
                                squads=squads,
                            )
                        elif kind == "nationality":
                            cdata = await legacy._get_club_safe(tmkt, cid)
                            base = (cdata or {}).get("name") or label
                            try:
                                official = legacy._strip_youth_nt_display(base.strip())
                            except AttributeError:
                                official = base.strip()
                            official = official.strip() or f"nt-{cid}"
                            squads = await legacy.fetch_squad_payload(
                                tmkt,
                                cid,
                                official_squad_name="",
                                nationality_map=nationality_map,
                                club_name_cache=club_cache,
                                nt_name_cache=nt_cache,
                                player_cache=player_cache,
                                stats_cache=stats_cache,
                                transfer_cache=transfer_cache,
                                club_career_cache=club_career_cache,
                                national_career_cache=national_career_cache,
                                season_id=season_id,
                                national_team_squad=True,
                            )
                            payload = legacy._serialize_squad(
                                kind="nationality",
                                label=official,
                                rel_image=rel_img,
                                tm_id=cid,
                                season_meta=season_meta,
                                squads=squads,
                            )
                        else:
                            _record_failure(job_id, str(jp), f"unsupported kind: {kind!r}")
                            return

                        jp.write_text(
                            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8",
                        )
                        _record_ok(job_id)
                    except Exception as exc:  # noqa: BLE001
                        _record_failure(job_id, str(jp), f"{type(exc).__name__}: {exc}")

            await asyncio.gather(*(one(p) for p in resolved_paths))
        _finish(job_id)
    except Exception as exc:  # noqa: BLE001
        _finish(job_id, error=f"{type(exc).__name__}: {exc}")
```

- [ ] **Step 2: Re-run the existing tests to verify nothing broke**

Run: `python ".Storage/Scripts/tests/test_update_data.py" -v`

Expected: all 21 tests still pass (the runner is overridden in tests).

- [ ] **Step 3: Sanity-check the legacy import path resolves**

Run:

```bash
python -c "import importlib.util, sys; from pathlib import Path; \
root=Path('c:/Users/Rom/Documents/GitHub/Football Channel'); \
ld=root/'.Storage'/'Legacy'/'Legacy - Scripts'; sys.path.insert(0, str(ld)); \
spec=importlib.util.spec_from_file_location('g', ld/'generate_squads_from_transfermarkt.py'); \
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); \
print('OK', hasattr(m,'fetch_squad_payload'), hasattr(m,'_season_hint'), hasattr(m,'season_context_for_club'))"
```

Expected output: `OK True True True`.

If any of those is `False`, the legacy module's exports have moved — stop and inspect `generate_squads_from_transfermarkt.py` before continuing.

- [ ] **Step 4: Commit**

```bash
git add ".Storage/Scripts/dev_server_update_data.py"
git commit -m "feat(update-data): real worker dispatching club vs nationality"
```

---

## Task 5: Wire backend module into Lineups Regular's `run_site.py`

**Files:**
- Modify: `Main Runner - Lineups - Regular/run_site.py`

The two existing shared modules (`dev_server_runner_blob.py`, `dev_server_saved_scripts.py`) are loaded around lines 1714–1737 and dispatched in the request handler around lines 2558–2586. Mirror that pattern.

- [ ] **Step 1: Add the loader function**

Open `Main Runner - Lineups - Regular/run_site.py` and find the existing `_load_runner_json_blob` function and the `_runner_blob_mod = _load_runner_json_blob()` line (around line 1727–1737).

Immediately after the `_runner_blob_mod = _load_runner_json_blob()` line, add:

```python
def _load_runner_update_data():  # noqa: D401
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_update_data.py"
    spec = importlib.util.spec_from_file_location("_fc_runner_update_data", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_update_data.py")
    spec.loader.exec_module(mod)
    return mod


_runner_update_mod = _load_runner_update_data()
```

- [ ] **Step 2: Add the GET dispatch**

Find the GET dispatch block (around line 2558–2560) that contains:

```python
if _runner_blob_mod.try_handle_get(self, PROJECT_ROOT):
    ...
if _runner_saved_mod.try_handle_get(self, PROJECT_ROOT):
    ...
```

Immediately after the `_runner_saved_mod.try_handle_get(...)` block, add (matching the surrounding indentation and `return` style — read the lines around it first):

```python
        if _runner_update_mod.try_handle_get(self, PROJECT_ROOT):
            return
```

- [ ] **Step 3: Add the POST dispatch**

Find the POST dispatch block (around line 2584–2586). Immediately after the `_runner_saved_mod.try_handle_post(...)` block, add:

```python
        if _runner_update_mod.try_handle_post(self, PROJECT_ROOT):
            return
```

- [ ] **Step 4: Smoke-test the server starts**

Run: `cd "c:/Users/Rom/Documents/GitHub/Football Channel/Main Runner - Lineups - Regular" && python run_site.py --no-browser` in a background terminal.

Open another terminal and:

```bash
curl -s "http://localhost:8888/__update-data/progress?id=nope"
```

Expected: `{"status": "unknown"}`

Stop the server (Ctrl+C in the background terminal).

If port 8888 is in use, check `DEFAULT_PORT` in `run_site.py` for the right port.

- [ ] **Step 5: Commit**

```bash
git add "Main Runner - Lineups - Regular/run_site.py"
git commit -m "feat(update-data): mount backend in Lineups Regular run_site"
```

---

## Task 6: Frontend for Lineups Regular — modal HTML, JS module, wiring

**Files:**
- Modify: `Main Runner - Lineups - Regular/html/controls.html`
- Modify: `Main Runner - Lineups - Regular/html/modals.html`
- Create: `Main Runner - Lineups - Regular/js/update-data.js`
- Modify: `Main Runner - Lineups - Regular/js/dom-bindings.js`
- Modify: `Main Runner - Lineups - Regular/js/app.js`

- [ ] **Step 1: Add the Update Data button to controls.html**

Open `Main Runner - Lineups - Regular/html/controls.html`.

Find the existing "Levels Control" button (it has `id="btn-levels-control"`, around line 91) and the immediately following `#levels-reorder-list` div.

Immediately after the closing `</div>` of `#levels-reorder-list` (around line 92), insert:

```html
  <button
    type="button"
    id="btn-update-data"
    class="panel-toggle"
    style="width: 100%; margin-top: 0.8rem; font-weight: 800; background: rgba(255,255,255,0.05); color: var(--accent); border: 1px dashed var(--accent);"
  >
    Update Data
  </button>
```

- [ ] **Step 2: Add the Update Data modal to modals.html**

Open `Main Runner - Lineups - Regular/html/modals.html`. Append (before the file's final newline, after the last existing modal div):

```html
<div id="update-data-modal" class="swap-modal" hidden>
  <div class="swap-modal-content" style="padding: 0; max-width: 660px; width: 90vw;">
    <div class="swap-modal-header">
      <h3>Update Data</h3>
      <button type="button" class="swap-modal-close" id="update-data-modal-close" aria-label="Close">&times;</button>
    </div>
    <div style="padding: 1.5rem;" id="update-data-form">
      <div style="font-size: 0.78rem; color: #aaa; margin-bottom: 0.6rem; line-height: 1.5;">
        Paste the Transfermarkt session cookie below. Apply will refresh the squad JSON of every team currently in your levels list.
      </div>
      <textarea id="update-data-cookie" placeholder="Paste cookie…" style="width: 100%; height: 110px; padding: 0.6rem; margin: 0 0 0.8rem 0; background: #000; color: #fff; border: 1px solid #333; border-radius: 4px; box-sizing: border-box; font-family: monospace; font-size: 0.8rem; resize: vertical;" autocomplete="off" spellcheck="false"></textarea>
      <div id="update-data-error" style="color: #ef4444; font-size: 0.8rem; margin-bottom: 0.8rem; display: none; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; padding: 0.6rem 0.8rem; line-height: 1.6;"></div>
      <div style="display: flex; gap: 1rem; justify-content: flex-end;">
        <button id="update-data-cancel" class="panel-toggle">Cancel</button>
        <button id="update-data-apply" class="panel-toggle" style="background: var(--accent); color: #000;">Apply</button>
      </div>
    </div>
    <div id="update-data-progress" style="padding: 1.5rem; display: none;">
      <div id="update-data-counter" style="font-size: 0.85rem; color: #ddd; margin-bottom: 0.6rem;">Starting…</div>
      <div style="background: rgba(255,255,255,0.08); border-radius: 4px; height: 10px; overflow: hidden;">
        <div id="update-data-bar" style="background: var(--accent); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
      </div>
      <div id="update-data-summary" style="margin-top: 1rem; font-size: 0.85rem; color: #ddd; display: none;"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Create the JS module**

Create `Main Runner - Lineups - Regular/js/update-data.js`:

```javascript
import { appState } from "./state.js";

const POLL_INTERVAL_MS = 500;

let pollTimer = null;
let activeJobId = null;

function $(id) {
  return document.getElementById(id);
}

function showError(msg) {
  const el = $("update-data-error");
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function clearError() {
  showError("");
}

function setProgressMode(on) {
  const form = $("update-data-form");
  const prog = $("update-data-progress");
  if (form) form.style.display = on ? "none" : "block";
  if (prog) prog.style.display = on ? "block" : "none";
}

function resetModalState() {
  clearError();
  setProgressMode(false);
  const summary = $("update-data-summary");
  if (summary) {
    summary.style.display = "none";
    summary.replaceChildren();
  }
  const bar = $("update-data-bar");
  if (bar) bar.style.width = "0%";
  const counter = $("update-data-counter");
  if (counter) counter.textContent = "Starting…";
  const apply = $("update-data-apply");
  if (apply) apply.disabled = false;
}

function openModal() {
  resetModalState();
  const modal = $("update-data-modal");
  if (modal) modal.hidden = false;
  const ta = $("update-data-cookie");
  if (ta) ta.focus();
}

function closeModal() {
  stopPolling();
  const modal = $("update-data-modal");
  if (modal) modal.hidden = true;
}

function collectPaths() {
  const levels = Array.isArray(appState.levelsData) ? appState.levelsData : [];
  const seen = new Set();
  const out = [];
  for (const lvl of levels) {
    const p = lvl && lvl.selectedEntry && lvl.selectedEntry.path;
    if (typeof p === "string" && p.length > 0 && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function stopPolling() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function renderProgress(snap) {
  const counter = $("update-data-counter");
  const bar = $("update-data-bar");
  const total = snap.total || 0;
  const done = snap.done || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  if (bar) bar.style.width = pct + "%";
  if (counter) {
    if (snap.status === "running") {
      const cur = snap.current ? ` — refreshing ${snap.current}…` : "";
      counter.textContent = `${done} / ${total}${cur}`;
    } else if (snap.status === "done") {
      counter.textContent = `${done} / ${total} — done`;
    } else if (snap.status === "error") {
      counter.textContent = `Error: ${snap.error || "unknown error"}`;
    } else {
      counter.textContent = "Job no longer tracked.";
    }
  }
}

function renderSummary(snap) {
  const el = $("update-data-summary");
  if (!el) return;
  el.replaceChildren();
  if (snap.status === "error") {
    const p = document.createElement("div");
    p.style.color = "#ef4444";
    p.textContent = `Failed: ${snap.error || "unknown error"}`;
    el.appendChild(p);
    el.style.display = "block";
    return;
  }
  const ok = snap.ok_count || 0;
  const failed = Array.isArray(snap.failed) ? snap.failed : [];
  const summary = document.createElement("div");
  if (failed.length === 0) {
    summary.textContent = `Done. All ${ok} teams refreshed successfully.`;
  } else {
    summary.textContent = `Done. ${ok} ok, ${failed.length} failed.`;
  }
  el.appendChild(summary);
  if (failed.length > 0) {
    const ul = document.createElement("ul");
    ul.style.marginTop = "0.6rem";
    ul.style.paddingLeft = "1.2rem";
    ul.style.color = "#ef4444";
    for (const f of failed) {
      const li = document.createElement("li");
      li.style.marginBottom = "0.3rem";
      li.textContent = `${f.path}: ${f.error}`;
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }
  el.style.display = "block";
}

async function pollOnce() {
  if (!activeJobId) return;
  let snap;
  try {
    const res = await fetch(`/__update-data/progress?id=${encodeURIComponent(activeJobId)}`);
    snap = await res.json();
  } catch (err) {
    return; // transient; next tick will retry
  }
  renderProgress(snap);
  if (snap.status === "done" || snap.status === "error" || snap.status === "unknown") {
    stopPolling();
    activeJobId = null;
    renderSummary(snap);
    const apply = $("update-data-apply");
    if (apply) apply.disabled = false;
    setProgressMode(true); // keep progress block visible to show summary
  }
}

function startPolling(jobId) {
  stopPolling();
  activeJobId = jobId;
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

async function applyUpdate() {
  clearError();
  const cookieEl = $("update-data-cookie");
  const cookie = cookieEl ? cookieEl.value.trim() : "";
  if (!cookie) {
    showError("Paste your Transfermarkt cookie to continue.");
    return;
  }
  const paths = collectPaths();
  if (paths.length === 0) {
    showError("No teams selected in your levels.");
    return;
  }
  const apply = $("update-data-apply");
  if (apply) apply.disabled = true;
  let res, body;
  try {
    res = await fetch("/__update-data/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie, paths }),
    });
    body = await res.json();
  } catch (err) {
    if (apply) apply.disabled = false;
    showError(`Network error: ${err.message || err}`);
    return;
  }
  if (res.status === 409 && body && body.jobId) {
    setProgressMode(true);
    startPolling(body.jobId);
    return;
  }
  if (!res.ok) {
    if (apply) apply.disabled = false;
    showError(body && body.error ? body.error : `HTTP ${res.status}`);
    return;
  }
  if (!body || !body.jobId) {
    if (apply) apply.disabled = false;
    showError("Server did not return a job id.");
    return;
  }
  setProgressMode(true);
  startPolling(body.jobId);
}

export function initUpdateData() {
  const openBtn = $("btn-update-data");
  const closeBtn = $("update-data-modal-close");
  const cancelBtn = $("update-data-cancel");
  const applyBtn = $("update-data-apply");
  if (openBtn) openBtn.onclick = openModal;
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (applyBtn) applyBtn.onclick = applyUpdate;
}
```

- [ ] **Step 4: Add element refs in dom-bindings.js**

Open `Main Runner - Lineups - Regular/js/dom-bindings.js`. After the existing `els.btnLevelsControl = ...` line (line 100), insert:

```javascript
    els.btnUpdateData = document.getElementById("btn-update-data");
    els.updateDataModal = document.getElementById("update-data-modal");
```

- [ ] **Step 5: Wire the init in app.js**

Open `Main Runner - Lineups - Regular/js/app.js`.

Near the top with the other imports (around line 28 where `initSavedScripts` is imported), add:

```javascript
import { initUpdateData } from "./update-data.js";
```

Find the line `initSavedScripts({ populateSubTypes, updateSetupUI, updateLanding });` (around line 987). Immediately after it, add:

```javascript
    initUpdateData();
```

- [ ] **Step 6: Smoke-test the UI shows**

Run: `cd "c:/Users/Rom/Documents/GitHub/Football Channel/Main Runner - Lineups - Regular" && python run_site.py`

Expected: browser opens. In the Quiz tab, scroll down — the "Update Data" button is visible. Clicking it opens the modal. Cancel/X closes it. Clicking Apply with empty cookie shows "Paste your Transfermarkt cookie to continue." Clicking Apply with a cookie but no levels selected shows "No teams selected in your levels."

Stop the server.

- [ ] **Step 7: Commit**

```bash
git add "Main Runner - Lineups - Regular/html/controls.html" \
        "Main Runner - Lineups - Regular/html/modals.html" \
        "Main Runner - Lineups - Regular/js/update-data.js" \
        "Main Runner - Lineups - Regular/js/dom-bindings.js" \
        "Main Runner - Lineups - Regular/js/app.js"
git commit -m "feat(update-data): UI + frontend wiring in Lineups Regular"
```

---

## Task 7: Replicate the runner-side changes to the other 7 runners

**Files (per runner — repeat the block 7 times):**
- Modify: `Main Runner - <name>/run_site.py`
- Modify: `Main Runner - <name>/html/controls.html`
- Modify: `Main Runner - <name>/html/modals.html`
- Create: `Main Runner - <name>/js/update-data.js`
- Modify: `Main Runner - <name>/js/dom-bindings.js`
- Modify: `Main Runner - <name>/js/app.js`

The 7 remaining runners:

1. `Main Runner - Lineups - Shorts`
2. `Main Runner - Four parameters - Regular`
3. `Main Runner - Four parameters - Shorts`
4. `Main Runner - Career Path - Regular`
5. `Main Runner - Career Path - Shorts`
6. `Main Runner - Player stats`
7. `Main Runner - Player stats shorts`

For **each** of those 7 runners, do the following 7 steps. The code is identical to Task 5 + Task 6; pattern-match exact line numbers within each runner's file.

- [ ] **Step 1: For runner 1 (Lineups Shorts) — wire backend in run_site.py**

Find the existing `_runner_blob_mod = _load_runner_json_blob()` line in `Main Runner - Lineups - Shorts/run_site.py`. Right after it, add the same loader block from Task 5 Step 1:

```python
def _load_runner_update_data():  # noqa: D401
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_update_data.py"
    spec = importlib.util.spec_from_file_location("_fc_runner_update_data", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_update_data.py")
    spec.loader.exec_module(mod)
    return mod


_runner_update_mod = _load_runner_update_data()
```

Find the GET dispatch block (search for `_runner_saved_mod.try_handle_get(self, PROJECT_ROOT)` in the file) and add right after that block:

```python
        if _runner_update_mod.try_handle_get(self, PROJECT_ROOT):
            return
```

Find the POST dispatch (search for `_runner_saved_mod.try_handle_post(self, PROJECT_ROOT)`) and add right after:

```python
        if _runner_update_mod.try_handle_post(self, PROJECT_ROOT):
            return
```

- [ ] **Step 2: For runner 1 — add button + modal HTML**

Insert the same Update Data button into `Main Runner - Lineups - Shorts/html/controls.html` (find a sensible spot inside `#panel-landing` — typically just after `#levels-reorder-list` if it exists; otherwise after the levels input):

```html
  <button
    type="button"
    id="btn-update-data"
    class="panel-toggle"
    style="width: 100%; margin-top: 0.8rem; font-weight: 800; background: rgba(255,255,255,0.05); color: var(--accent); border: 1px dashed var(--accent);"
  >
    Update Data
  </button>
```

Append the same modal block from Task 6 Step 2 to `Main Runner - Lineups - Shorts/html/modals.html`.

- [ ] **Step 3: For runner 1 — copy update-data.js verbatim**

Copy the contents of `Main Runner - Lineups - Regular/js/update-data.js` verbatim into `Main Runner - Lineups - Shorts/js/update-data.js`. The module imports `./state.js`, which exists in every runner with `appState.levelsData` — no per-runner adaptation needed.

Run:

```bash
cp "Main Runner - Lineups - Regular/js/update-data.js" "Main Runner - Lineups - Shorts/js/update-data.js"
```

- [ ] **Step 4: For runner 1 — add element refs in dom-bindings.js**

Open `Main Runner - Lineups - Shorts/js/dom-bindings.js`. Inside the `bindDomElements` function (or its equivalent — verify the function name), add at the end of the binding section:

```javascript
    els.btnUpdateData = document.getElementById("btn-update-data");
    els.updateDataModal = document.getElementById("update-data-modal");
```

- [ ] **Step 5: For runner 1 — import and call init in app.js**

Open `Main Runner - Lineups - Shorts/js/app.js`. Add the import near other imports:

```javascript
import { initUpdateData } from "./update-data.js";
```

Find the spot right after `initSavedScripts(...)` is called (search for `initSavedScripts`). Add:

```javascript
    initUpdateData();
```

If the runner doesn't call `initSavedScripts`, look for any other init call in the same vicinity (e.g. `initLevelControls(...)` or the `bindDomElements()` invocation) and add the call there.

- [ ] **Step 6: For runner 1 — smoke-test it**

Run: `cd "c:/Users/Rom/Documents/GitHub/Football Channel/Main Runner - Lineups - Shorts" && python run_site.py`

Expected: button visible, modal opens/closes, Apply with empty cookie shows error.

Stop server.

- [ ] **Step 7: For runner 1 — commit**

```bash
git add "Main Runner - Lineups - Shorts/"
git commit -m "feat(update-data): wire feature into Lineups Shorts"
```

- [ ] **Step 8: Repeat steps 1–7 for runner 2 (Four parameters Regular)**

Same pattern, against `Main Runner - Four parameters - Regular`.

- [ ] **Step 9: Repeat steps 1–7 for runner 3 (Four parameters Shorts)**

Same pattern, against `Main Runner - Four parameters - Shorts`.

- [ ] **Step 10: Repeat steps 1–7 for runner 4 (Career Path Regular)**

Same pattern, against `Main Runner - Career Path - Regular`.

- [ ] **Step 11: Repeat steps 1–7 for runner 5 (Career Path Shorts)**

Same pattern, against `Main Runner - Career Path - Shorts`.

- [ ] **Step 12: Repeat steps 1–7 for runner 6 (Player stats)**

Same pattern, against `Main Runner - Player stats`.

- [ ] **Step 13: Repeat steps 1–7 for runner 7 (Player stats shorts)**

Same pattern, against `Main Runner - Player stats shorts`.

---

## Task 8: End-to-end manual verification

**Files:** none (this is a runtime check).

This is the only test that actually hits Transfermarkt. You'll need a live cookie value pulled from a logged-in browser session at transfermarkt.com.

- [ ] **Step 1: Pick a small set of levels in Lineups Regular**

Run: `cd "c:/Users/Rom/Documents/GitHub/Football Channel/Main Runner - Lineups - Regular" && python run_site.py`

In the browser:
1. Go to the Saved tab and load any saved script that includes 2–3 club teams plus 1 national team (or build one fresh in the Quiz tab).
2. Confirm the levels list under "Levels Control" shows what you expect.

- [ ] **Step 2: Capture the on-disk timestamp of one team's JSON**

In a separate terminal:

```bash
ls -l ".Storage/Squad Formation/Teams/England/Premier League/Arsenal FC.json"
```

Note the modification time (replace the path with whichever team you actually selected).

- [ ] **Step 3: Run the refresh**

Click **Update Data** → paste a fresh Transfermarkt cookie → **Apply**.

Watch the modal:
- Counter and bar advance.
- "Refreshing X…" updates the team name.
- On done: summary line is shown.

- [ ] **Step 4: Verify the file was rewritten and looks correct**

Re-run the `ls -l` from Step 2 — modification time should be newer.

Open the file in a text editor and spot-check that fields you know change (e.g. a player's `appearances` for the current league season, `age`, `goals`, `goals_conceded` for a goalkeeper) reflect current values.

- [ ] **Step 5: Test concurrent click**

Open the modal again, paste cookie, click Apply, then immediately click Apply a second time before the first run finishes (you can refresh the page to re-open the modal and click Apply again). Expected: the second click resumes polling the existing job rather than starting a new one (no duplicate writes, single counter advancing).

- [ ] **Step 6: Test bad cookie**

Click Update Data, paste a clearly invalid cookie (e.g. `"INVALID"`), Apply. Expected: the run starts but every team ends up in the `failed[]` list with a Transfermarkt-side error; summary shows "0 ok, N failed".

- [ ] **Step 7: Test "no levels"**

Reset the levels (or just open a runner with no levels yet configured). Click Update Data → Apply (with cookie). Expected: inline error "No teams selected in your levels." No request sent.

- [ ] **Step 8: Cross-runner smoke**

Repeat steps 1–4 in:
- `Main Runner - Career Path - Regular` (player-centric runner — confirm wiring works there)
- `Main Runner - Player stats shorts` (a Shorts runner)

Each should refresh the team JSON behind the selected entries. The same JSON files power every runner; once they're refreshed, all runners see the new data.

- [ ] **Step 9: Commit any tweaks**

If you discover bugs in Steps 1–8, fix them, commit a focused fix per bug:

```bash
git add <changed files>
git commit -m "fix(update-data): <what you fixed>"
```

If everything works, no commit needed for this task — it's purely verification.

---

## Self-review notes (already addressed in this plan)

- **Spec coverage**: every section of the spec maps to a task (path validation → Task 1; job state → Task 2; HTTP routes → Task 3; production worker → Task 4; runner wiring → Task 5+7; UI → Task 6+7; manual testing → Task 8).
- **No placeholders**: all code blocks are full and runnable.
- **Type consistency**: function names match across tasks (`_validate_and_resolve_path`, `_register_job`, `_set_current`, `_record_ok`, `_record_failure`, `_finish`, `_snapshot_job`, `_set_runner_for_tests`, `_default_runner`, `try_handle_get`, `try_handle_post`, `initUpdateData`); HTTP shapes match between backend tests, backend code, and frontend fetches; modal element IDs match across HTML and JS.
- **Spec correction (mid-plan)**: the spec was updated before plan-writing to use `kind == "nationality"` (not `"national"`) and to validate paths under both `Squad Formation/Teams/` and `Squad Formation/Nationalities/`. The plan reflects the corrected spec.
