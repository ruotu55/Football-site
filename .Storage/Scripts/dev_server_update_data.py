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
import secrets
import threading
from pathlib import Path
from typing import Callable, Iterable, Sequence
from urllib.parse import parse_qs, urlparse


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
    # Always spawn a daemon thread — even in tests — so that try_handle_post
    # returns the 200 immediately and the job is left in "running" state until
    # the runner finishes.  Test fakes complete in microseconds so state is
    # effectively settled before the caller checks it.
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
    "try_handle_get",
    "try_handle_post",
    "_set_runner_for_tests",
]
