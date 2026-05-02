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
