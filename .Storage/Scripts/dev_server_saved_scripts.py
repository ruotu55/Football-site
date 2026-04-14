"""HTTP handlers for persisting runner \"Save Current Settings\" to disk (dev server only).

Served under: GET|POST /__runner-saved-scripts/<bucket>
Storage: <project_root>/storage/saved-scripts/<bucket>.json
"""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

if TYPE_CHECKING:
    from http.server import BaseHTTPRequestHandler

_LOCK = threading.Lock()
_BUCKET_RE = re.compile(r"^[a-z0-9_]{1,64}$")
_MAX_POST_BYTES = 12 * 1024 * 1024
_ENDPOINT_PREFIX = "/__runner-saved-scripts/"


def _saved_scripts_dir(project_root: Path) -> Path:
    return (project_root / ".Storage" / "storage" / "saved-scripts").resolve()


def parse_bucket(handler_path: str) -> str | None:
    path = urlparse(handler_path).path
    if not path.startswith(_ENDPOINT_PREFIX):
        return None
    rest = path[len(_ENDPOINT_PREFIX) :]
    bucket = rest.strip("/").split("/")[0]
    if not bucket or not _BUCKET_RE.fullmatch(bucket):
        return None
    return bucket


def _file_path(project_root: Path, bucket: str) -> Path:
    return _saved_scripts_dir(project_root) / f"{bucket}.json"


def _ensure_inside_storage(project_root: Path, path: Path) -> bool:
    base = _saved_scripts_dir(project_root)
    try:
        path.relative_to(base)
    except ValueError:
        return False
    return True


def _normalize_payload(raw: object) -> dict[str, object]:
    if not isinstance(raw, dict):
        return {"scripts": [], "folders": [], "folderStates": {}}
    scripts = raw.get("scripts")
    folders = raw.get("folders")
    folder_states = raw.get("folderStates")
    return {
        "scripts": scripts if isinstance(scripts, list) else [],
        "folders": folders if isinstance(folders, list) else [],
        "folderStates": folder_states if isinstance(folder_states, dict) else {},
    }


def _is_empty_payload(data: dict[str, object]) -> bool:
    scripts = data.get("scripts")
    folders = data.get("folders")
    fs = data.get("folderStates")
    return (
        (not isinstance(scripts, list) or len(scripts) == 0)
        and (not isinstance(folders, list) or len(folders) == 0)
        and (not isinstance(fs, dict) or len(fs) == 0)
    )


def try_handle_get(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    bucket = parse_bucket(handler.path)
    if bucket is None:
        return False
    path = _file_path(project_root, bucket)
    if not _ensure_inside_storage(project_root, path):
        handler.send_error(500, "Invalid storage path")
        return True
    with _LOCK:
        if not path.exists():
            payload = {"scripts": [], "folders": [], "folderStates": {}}
        else:
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {"scripts": [], "folders": [], "folderStates": {}}
            else:
                payload = _normalize_payload(raw)
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
    return True


def try_handle_post(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    bucket = parse_bucket(handler.path)
    if bucket is None:
        return False
    path = _file_path(project_root, bucket)
    if not _ensure_inside_storage(project_root, path):
        handler.send_error(500, "Invalid storage path")
        return True
    try:
        content_len = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        _send_json(handler, 400, {"error": "Invalid Content-Length"})
        return True
    if content_len > _MAX_POST_BYTES:
        _send_json(handler, 413, {"error": "Payload too large"})
        return True
    try:
        raw_body = handler.rfile.read(max(content_len, 0))
        parsed = json.loads(raw_body.decode("utf-8") if raw_body else "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"error": "Invalid JSON"})
        return True
    payload = _normalize_payload(parsed)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        try:
            path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        except OSError:
            _send_json(handler, 500, {"error": "Write failed"})
            return True
    _send_json(handler, 200, {"ok": True})
    return True


def _send_json(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


__all__ = ["parse_bucket", "try_handle_get", "try_handle_post"]
