"""HTTP handlers for the shared "import aliases" map used by all runners.

When the user manually picks a player during import and answers "Yes" to
"Always use X when the import has Y?", the mapping is persisted here so it
applies to every runner — Regular and Shorts, 1 through 8.

Served under: GET|POST /__runner-import-aliases
Storage: <project_root>/.Storage/storage/import-aliases.json
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

if TYPE_CHECKING:
    from http.server import BaseHTTPRequestHandler

_LOCK = threading.Lock()
_ENDPOINT = "/__runner-import-aliases"
_MAX_POST_BYTES = 2 * 1024 * 1024
_MAX_ALIASES = 50_000
_MAX_KEY_LEN = 256
_MAX_VAL_LEN = 256


def _aliases_file(project_root: Path) -> Path:
    return (project_root / ".Storage" / "storage" / "import-aliases.json").resolve()


def _matches_endpoint(handler_path: str) -> bool:
    return urlparse(handler_path).path == _ENDPOINT


def _normalize_key(key: object) -> str | None:
    if not isinstance(key, str):
        return None
    norm = key.strip().lower()
    if not norm or len(norm) > _MAX_KEY_LEN:
        return None
    return norm


def _normalize_value(val: object) -> str | None:
    if not isinstance(val, str):
        return None
    v = val.strip()
    if not v or len(v) > _MAX_VAL_LEN:
        return None
    return v


def _sanitize_map(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        nk = _normalize_key(k)
        nv = _normalize_value(v)
        if nk is None or nv is None:
            continue
        out[nk] = nv
        if len(out) >= _MAX_ALIASES:
            break
    return out


def _read_aliases(project_root: Path) -> dict[str, str]:
    path = _aliases_file(project_root)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if isinstance(raw, dict) and isinstance(raw.get("aliases"), dict):
        return _sanitize_map(raw["aliases"])
    return _sanitize_map(raw)


def _write_aliases(project_root: Path, aliases: dict[str, str]) -> None:
    path = _aliases_file(project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"aliases": aliases}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def try_handle_get(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    if not _matches_endpoint(handler.path):
        return False
    with _LOCK:
        aliases = _read_aliases(project_root)
    _send_json(handler, 200, {"aliases": aliases})
    return True


def try_handle_post(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    if not _matches_endpoint(handler.path):
        return False
    try:
        content_len = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        _send_json(handler, 400, {"error": "Invalid Content-Length"})
        return True
    if content_len > _MAX_POST_BYTES:
        _send_json(handler, 413, {"error": "Payload too large"})
        return True
    try:
        body = handler.rfile.read(max(content_len, 0))
        parsed = json.loads(body.decode("utf-8") if body else "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"error": "Invalid JSON"})
        return True
    if not isinstance(parsed, dict):
        _send_json(handler, 400, {"error": "Body must be a JSON object"})
        return True

    merge_in = _sanitize_map(parsed.get("merge"))
    replace_in = parsed.get("aliases")
    delete_keys = parsed.get("delete")

    with _LOCK:
        if isinstance(replace_in, dict):
            current = _sanitize_map(replace_in)
        else:
            current = _read_aliases(project_root)
            if merge_in:
                current.update(merge_in)
            if isinstance(delete_keys, list):
                for k in delete_keys:
                    nk = _normalize_key(k)
                    if nk is not None:
                        current.pop(nk, None)
        try:
            _write_aliases(project_root, current)
        except OSError:
            _send_json(handler, 500, {"error": "Write failed"})
            return True
        result = dict(current)
    _send_json(handler, 200, {"ok": True, "aliases": result})
    return True


def _send_json(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


__all__ = ["try_handle_get", "try_handle_post"]
