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
from typing import Callable, Sequence
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
    # Register in sys.modules before exec_module so @dataclass decorators inside
    # the legacy module can resolve their own __module__ via sys.modules.get().
    sys.modules[spec.name] = legacy
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
