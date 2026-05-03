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

import sys as _ud_sys


def _gk_log(msg: str) -> None:
    """stderr log line tagged for the GK scrape diagnostic stream."""
    print(f"[update-data][gk] {msg}", file=_ud_sys.stderr, flush=True)


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


def _apply_career_totals_monotonic_guard(new_payload: dict, old_payload: dict) -> None:
    """Mutate new_payload in place so career totals never regress vs old_payload.

    For every player matched by name across the four position buckets, ensures that
    `club_career_totals` and `national_team_career_totals` fields (`appearances`,
    `goals`, `assists`, `goals_conceded`, `clean_sheets`) never go down. If the new
    value is None or numerically less than the old value, the old value wins.

    The legacy scraper occasionally returns 0/None for goalkeeper goals_conceded and
    clean_sheets when the HTML page is partially blocked or the parser misaligns;
    this guard keeps career stats monotonic without trying to fix the legacy code.
    """
    if not isinstance(new_payload, dict) or not isinstance(old_payload, dict):
        return
    fields = ("appearances", "goals", "assists", "goals_conceded", "clean_sheets")
    totals_keys = ("club_career_totals", "national_team_career_totals")
    for bucket in ("goalkeepers", "defenders", "midfielders", "attackers"):
        new_list = new_payload.get(bucket)
        old_list = old_payload.get(bucket)
        if not isinstance(new_list, list) or not isinstance(old_list, list):
            continue
        old_by_name = {}
        for op in old_list:
            if isinstance(op, dict):
                name = op.get("name")
                if isinstance(name, str):
                    old_by_name[name] = op
        for np in new_list:
            if not isinstance(np, dict):
                continue
            op = old_by_name.get(np.get("name"))
            if not isinstance(op, dict):
                continue
            for tk in totals_keys:
                nt = np.get(tk)
                ot = op.get(tk)
                if not isinstance(nt, dict) or not isinstance(ot, dict):
                    continue
                for f in fields:
                    nv = nt.get(f)
                    ov = ot.get(f)
                    if not isinstance(ov, (int, float)):
                        continue
                    if nv is None or (isinstance(nv, (int, float)) and nv < ov):
                        nt[f] = ov


import re as _re_gk


_GK_HEADER_GC_PATTERNS = [
    r"\bgoals?\s*conceded\b",   # English
    r"\bgegentore?\b",          # German
    r"\bg\.?\s*against\b",      # alt English
    r"\bgoals?\s*against\b",
]
_GK_HEADER_CS_PATTERNS = [
    r"\bclean\s*sheets?\b",     # English
    r"\bzu\s*null\b",           # German
    r"\bohne\s*gegentor\b",     # German alt
    r"\bsh(?:eet|t)s?\s*ohne",  # mixed
]


def _gk_match_header(text: str, patterns: list[str]) -> bool:
    """Case-insensitive whole-word match against any of the patterns."""
    s = (text or "").strip()
    for pat in patterns:
        if _re_gk.search(pat, s, _re_gk.IGNORECASE):
            return True
    return False


def _gk_parse_int(cell: str) -> int | None:
    """Parse a Transfermarkt-style stat cell like '252', '1.234', '-' into int (or None)."""
    s = (cell or "").strip().replace("–", "-").replace("—", "-")
    if s in ("", "-", "—"):
        return None
    s = s.replace(".", "").replace(",", "")
    if s.isdigit():
        return int(s)
    return None


def _gk_extract_totals_from_html(html: str) -> tuple[int | None, int | None]:
    """Return (goals_conceded, clean_sheets) parsed from a leistungsdatendetails HTML.

    Strategy: find the table whose header row contains a 'Goals conceded' (or
    German equivalent) column. Look up the column indices for goals_conceded
    and clean_sheets. Then find the Total row (footer or first data row labelled
    "Total") and read those columns.

    Returns (None, None) if the page is empty / blocked / shape unrecognized.
    """
    if not html or _tm_html_blocked_local(html):
        return (None, None)

    # Find every <table>...</table> chunk and try each one.
    for table_match in _re_gk.finditer(r"(?is)<table[^>]*>(.*?)</table>", html):
        table = table_match.group(1)

        # First, locate header rows. They may live inside <thead> or be the first <tr>.
        thead_match = _re_gk.search(r"(?is)<thead[^>]*>(.*?)</thead>", table)
        header_block = thead_match.group(1) if thead_match else table
        header_tr_iter = _re_gk.finditer(r"(?is)<tr[^>]*>(.*?)</tr>", header_block)

        gc_col: int | None = None
        cs_col: int | None = None
        n_cols = 0

        for tr_match in header_tr_iter:
            tr_inner = tr_match.group(1)
            cells = _re_gk.findall(r"(?is)<th[^>]*>(.*?)</th>", tr_inner)
            if not cells:
                continue
            # Strip nested HTML and whitespace from each header cell text.
            texts = []
            for c in cells:
                t = _re_gk.sub(r"<[^>]+>", " ", c)
                t = _re_gk.sub(r"\s+", " ", t).strip()
                texts.append(t)
            n_cols = max(n_cols, len(texts))
            for i, t in enumerate(texts):
                if gc_col is None and _gk_match_header(t, _GK_HEADER_GC_PATTERNS):
                    gc_col = i
                if cs_col is None and _gk_match_header(t, _GK_HEADER_CS_PATTERNS):
                    cs_col = i

        if gc_col is None and cs_col is None:
            continue  # not a GK-relevant table

        # Find the Total row — look in <tfoot> first, then for any <tr> whose first
        # cell text contains "Total" or "Gesamt".
        total_tr: str | None = None
        tfoot_match = _re_gk.search(r"(?is)<tfoot[^>]*>(.*?)</tfoot>", table)
        if tfoot_match:
            for tr_match in _re_gk.finditer(r"(?is)<tr[^>]*>(.*?)</tr>", tfoot_match.group(1)):
                total_tr = tr_match.group(1)
                break  # first tr in tfoot is the totals row

        if total_tr is None:
            for tr_match in _re_gk.finditer(r"(?is)<tr[^>]*>(.*?)</tr>", table):
                tr_inner = tr_match.group(1)
                first_cell = _re_gk.search(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", tr_inner)
                if not first_cell:
                    continue
                ft = _re_gk.sub(r"<[^>]+>", " ", first_cell.group(1))
                ft = _re_gk.sub(r"\s+", " ", ft).strip().lower()
                if ft.startswith("total") or ft.startswith("gesamt") or ft.startswith("zusammen"):
                    total_tr = tr_inner
                    break

        if not total_tr:
            continue

        # Extract td texts from the Total row.
        td_chunks = _re_gk.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", total_tr)
        td_texts: list[str] = []
        for c in td_chunks:
            t = _re_gk.sub(r"<[^>]+>", " ", c)
            t = _re_gk.sub(r"\s+", " ", t).strip()
            td_texts.append(t)

        gc_val: int | None = None
        cs_val: int | None = None
        if gc_col is not None and gc_col < len(td_texts):
            gc_val = _gk_parse_int(td_texts[gc_col])
        if cs_col is not None and cs_col < len(td_texts):
            cs_val = _gk_parse_int(td_texts[cs_col])

        # Only accept if at least one was found.
        if gc_val is not None or cs_val is not None:
            return (gc_val, cs_val)

    return (None, None)


def _tm_html_blocked_local(html: str) -> bool:
    """Cheap WAF detection without depending on the legacy module."""
    if not html:
        return True
    head = html[:8000].lower()
    return ("human verification" in head) or ("captcha-container" in head)


async def _refresh_gk_totals_for_player(
    fill_module,
    tmkt,
    *,
    pid: int,
    relative_url: str | None,
) -> tuple[int | None, int | None]:
    """Fetch a goalkeeper's leistungsdatendetails page and extract (goals_conceded, clean_sheets)."""
    if not relative_url:
        _gk_log(f"  pid={pid}: no relativeUrl, skip")
        return (None, None)
    m = _re_gk.search(r"/([^/]+)/profil/spieler/(\d+)", relative_url)
    if not m:
        _gk_log(f"  pid={pid}: relativeUrl={relative_url!r} did NOT match /<slug>/profil/spieler/<pid>")
        return (None, None)
    slug = m.group(1)
    pid_s = m.group(2)
    path_on_site = f"/{slug}/leistungsdatendetails/spieler/{pid_s}"
    try:
        html = await fill_module._fetch_tm_html_prefer_session(tmkt, path_on_site)
    except Exception as exc:  # noqa: BLE001
        _gk_log(f"  pid={pid}: fetch raised {type(exc).__name__}: {exc}")
        return (None, None)
    html_len = len(html or "")
    blocked = _tm_html_blocked_local(html or "")
    _gk_log(f"  pid={pid}: fetched path={path_on_site} html_len={html_len} blocked={blocked}")
    if blocked or html_len == 0:
        return (None, None)
    gc, cs = _gk_extract_totals_from_html(html)
    _gk_log(f"  pid={pid}: parsed (goals_conceded, clean_sheets) = ({gc}, {cs})")
    if gc is None and cs is None:
        # Dump first 800 chars of the response head for diagnosis
        head = (html[:800] or "").replace("\n", " ").replace("\r", " ")
        _gk_log(f"  pid={pid}: parser returned (None, None). HTML head: {head}")
    return (gc, cs)


async def _patch_gk_career_totals(
    jp: Path,
    fill_module,
    tmkt,
    *,
    player_cache: dict,
    legacy,
) -> None:
    """Re-fetch each goalkeeper's career goals_conceded + clean_sheets."""
    try:
        data = json.loads(jp.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        _gk_log(f"{jp.name}: bad JSON on read, skip")
        return
    gks = data.get("goalkeepers")
    if not isinstance(gks, list) or not gks:
        _gk_log(f"{jp.name}: no goalkeepers, skip")
        return

    _gk_log(
        f"{jp.name}: starting GK refresh "
        f"({len(gks)} goalkeepers, {len(player_cache)} player_cache entries)"
    )

    changed = False
    for gk in gks:
        if not isinstance(gk, dict):
            continue
        gk_name = (gk.get("name") or "").strip()
        if not gk_name:
            _gk_log(f"  GK entry has no name, skip")
            continue
        old_gc = (gk.get("club_career_totals") or {}).get("goals_conceded")
        _gk_log(f"  matching '{gk_name}' (current goals_conceded={old_gc})...")

        matched_pid = None
        matched_rel = None
        for pid_s, pr in player_cache.items():
            if not isinstance(pr, dict) or not pr.get("success"):
                continue
            d = pr.get("data") or {}
            full = (d.get("name") or "").strip()
            if full == gk_name:
                matched_pid = pid_s
                matched_rel = d.get("relativeUrl")
                break

        if matched_pid is None:
            # Try a fuzzy fallback on a few common variants before giving up.
            simple = gk_name.lower()
            for pid_s, pr in player_cache.items():
                if not isinstance(pr, dict) or not pr.get("success"):
                    continue
                d = pr.get("data") or {}
                full = (d.get("name") or "").strip().lower()
                if full and (full == simple or full in simple or simple in full):
                    matched_pid = pid_s
                    matched_rel = d.get("relativeUrl")
                    _gk_log(f"    fuzzy matched '{gk_name}' -> player_cache name={d.get('name')!r}")
                    break

        if matched_pid is None:
            # Final fallback: scan player_cache for any entry whose data.lastName
            # is a suffix of gk_name (handles abbreviations like 'G. Donnarumma').
            for pid_s, pr in player_cache.items():
                if not isinstance(pr, dict) or not pr.get("success"):
                    continue
                d = pr.get("data") or {}
                last = (d.get("lastName") or "").strip().lower()
                if last and last in gk_name.lower():
                    matched_pid = pid_s
                    matched_rel = d.get("relativeUrl")
                    _gk_log(f"    last-name matched '{gk_name}' -> player_cache lastName={d.get('lastName')!r}")
                    break

        if matched_pid is None:
            # Show what names ARE in the cache so we can see what we missed
            names = []
            for pr in player_cache.values():
                if isinstance(pr, dict) and pr.get("success"):
                    n = (pr.get("data") or {}).get("name")
                    if n:
                        names.append(n)
            sample = ", ".join(names[:8])
            _gk_log(f"    NO MATCH in player_cache for '{gk_name}'. cache has {len(names)} named entries. first 8: {sample}")
            continue

        try:
            pid_int_local = int(matched_pid)
        except (TypeError, ValueError):
            _gk_log(f"    pid_s={matched_pid!r} not int, skip")
            continue

        _gk_log(f"    matched: pid_s={matched_pid} relativeUrl={matched_rel!r}")
        gc, cs = await _refresh_gk_totals_for_player(
            fill_module, tmkt, pid=pid_int_local, relative_url=matched_rel,
        )
        cct = gk.setdefault("club_career_totals", {})
        before_gc = cct.get("goals_conceded")
        before_cs = cct.get("clean_sheets")
        applied = []
        if gc is not None and gc > 0 and cct.get("goals_conceded") != gc:
            cct["goals_conceded"] = gc
            applied.append(f"goals_conceded {before_gc}->{gc}")
            changed = True
        if cs is not None and cs > 0 and cct.get("clean_sheets") != cs:
            cct["clean_sheets"] = cs
            applied.append(f"clean_sheets {before_cs}->{cs}")
            changed = True
        if applied:
            _gk_log(f"    applied: {', '.join(applied)}")
        else:
            _gk_log(f"    no patch applied (gc={gc}, cs={cs}, before_gc={before_gc}, before_cs={before_cs})")

    if changed:
        jp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        _gk_log(f"{jp.name}: wrote file with patched GK totals")
    else:
        _gk_log(f"{jp.name}: no changes to write")


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

    fill_spec = importlib.util.spec_from_file_location(
        "_fc_fill_shirts",
        legacy_dir / "fill_shirt_numbers_from_transfermarkt.py",
    )
    if fill_spec is None or fill_spec.loader is None:
        _finish(job_id, error="cannot load fill_shirt_numbers_from_transfermarkt.py")
        return
    fill_module = importlib.util.module_from_spec(fill_spec)
    sys.modules[fill_spec.name] = fill_module
    try:
        fill_spec.loader.exec_module(fill_module)
    except Exception as exc:
        _finish(job_id, error=f"failed loading fill module: {exc}")
        return

    try:
        from tmkt import TMKT  # type: ignore
    except Exception as exc:
        _finish(job_id, error=f"failed importing TMKT: {exc}")
        return

    nat_map_path = project_root / ".Storage" / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict = {}
    if nat_map_path.is_file():
        try:
            nationality_map = json.loads(nat_map_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            nationality_map = {}

    prev_cookie = os.environ.get("TRANSFERMARKT_COOKIE")
    os.environ["TRANSFERMARKT_COOKIE"] = cookie
    try:
        asyncio.run(
            _refresh_all_async(
                legacy=legacy,
                fill_module=fill_module,
                tmkt_cls=TMKT,
                nationality_map=nationality_map,
                resolved_paths=resolved_paths,
                job_id=job_id,
            )
        )
    finally:
        if prev_cookie is None:
            os.environ.pop("TRANSFERMARKT_COOKIE", None)
        else:
            os.environ["TRANSFERMARKT_COOKIE"] = prev_cookie


async def _refresh_all_async(
    legacy,
    fill_module,
    tmkt_cls,
    nationality_map: dict,
    resolved_paths: Sequence[Path],
    job_id: str,
) -> None:
    import asyncio

    try:
        club_cache: dict = {}
        nt_cache: dict = {}
        player_cache: dict = {}
        stats_cache: dict = {}
        transfer_cache: dict = {}
        club_career_cache: dict = {}
        national_career_cache: dict = {}

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

                cid: int | None
                try:
                    cid = int(cid_raw) if cid_raw is not None else None
                except (TypeError, ValueError):
                    cid = None

                async with sem:
                    _set_current(job_id, label)
                    if cid is None:
                        # Re-resolve the TM id by team name. Some JSONs have
                        # transfermarktClubId=null because they were built from
                        # a fallback when TM search originally failed.
                        try:
                            cid = await legacy.resolve_team_id(
                                tmkt,
                                [label],
                                want_national=(kind == "nationality"),
                            )
                        except Exception as exc:  # noqa: BLE001
                            cid = None
                    if cid is None:
                        _record_failure(
                            job_id,
                            str(jp),
                            "no Transfermarkt match found by name "
                            f"(team {label!r} has no transfermarktClubId in JSON)",
                        )
                        return
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

                        # Career totals are monotonic — never let a re-fetch regress
                        # them. Defends against legacy scraper quirks (zeroed
                        # goals_conceded for GKs, off-by-one clean_sheets, etc).
                        _apply_career_totals_monotonic_guard(payload, raw)

                        jp.write_text(
                            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8",
                        )
                        # Fetch fresh shirt numbers from TM's rueckennummern page
                        # (the squads endpoint doesn't include them). Failure here
                        # leaves shirt_numbers blank but the squad data is still
                        # refreshed, so we count this as ok and log to stderr.
                        season_label = ""
                        try:
                            season_label = (
                                (payload.get("source") or {})
                                .get("season", {})
                                .get("label")
                                or ""
                            )
                        except Exception:  # noqa: BLE001
                            season_label = ""
                        try:
                            await fill_module.fill_file(
                                jp,
                                tmkt,
                                season_label=season_label,
                                dry_run=False,
                                concurrency=2,
                                quiet=True,
                            )
                        except Exception as shirt_exc:  # noqa: BLE001
                            import sys as _sys
                            print(
                                f"[update-data] shirt-fill failed for {jp.name}: "
                                f"{type(shirt_exc).__name__}: {shirt_exc}",
                                file=_sys.stderr,
                                flush=True,
                            )
                        # Fix goalkeeper club_career_totals: the legacy parser
                        # leaves goals_conceded/clean_sheets at 0 because TM's
                        # column layout shifted. We re-fetch the GK's
                        # leistungsdatendetails page and extract by header.
                        try:
                            await _patch_gk_career_totals(
                                jp,
                                fill_module,
                                tmkt,
                                player_cache=player_cache,
                                legacy=legacy,
                            )
                        except Exception as gk_exc:  # noqa: BLE001
                            import sys as _sys
                            print(
                                f"[update-data] gk-totals refresh failed for {jp.name}: "
                                f"{type(gk_exc).__name__}: {gk_exc}",
                                file=_sys.stderr,
                                flush=True,
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
    "_apply_career_totals_monotonic_guard",
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
    "_gk_extract_totals_from_html",
    "_refresh_gk_totals_for_player",
    "_patch_gk_career_totals",
]
