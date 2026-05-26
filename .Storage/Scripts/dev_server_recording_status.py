"""HTTP handlers for the per-episode recording queue (dev server only).

Served under: GET|POST /__recording-status
Storage:     <project_root>/.Storage/storage/recording-status.json

Schema (all keys + values are JSON-serialisable):

    {
      "blocks": {
        "<runnerId>|<type>|<episode>": {
          "name":      "<user-entered block name>",
          "script":    { /* same shape the runner's Save Script flow stores */ },
          "recorded":  { "english": <timestamp|null>, "spanish": <timestamp|null> },
          "updatedAt": <timestamp>
        },
        ...
      }
    }

This is a single shared store: every runner reads/writes the slice that
belongs to its own (runnerId, type), and the calendar reads everything so
it can paint badges on each pill.
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
_MAX_POST_BYTES = 24 * 1024 * 1024  # higher than saved-scripts: 20 blocks × 2 langs of script data
_ENDPOINT = "/__recording-status"
_BLOCK_KEY_RE = re.compile(r"^\d+\|(?:long|short)\|\d+$")


def _store_path(project_root: Path) -> Path:
    return (project_root / ".Storage" / "storage" / "recording-status.json").resolve()


def _matches_endpoint(handler_path: str) -> bool:
    path = urlparse(handler_path).path.rstrip("/")
    return path == _ENDPOINT


def _empty_payload() -> dict[str, object]:
    return {"blocks": {}}


def _normalize_block(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None
    name = raw.get("name")
    script = raw.get("script")
    recorded = raw.get("recorded")
    if not isinstance(name, str):
        name = ""
    if not isinstance(script, dict):
        script = {}
    if not isinstance(recorded, dict):
        recorded = {}
    english = recorded.get("english")
    spanish = recorded.get("spanish")
    if not isinstance(english, (int, float)):
        english = None
    if not isinstance(spanish, (int, float)):
        spanish = None
    updated_at = raw.get("updatedAt")
    if not isinstance(updated_at, (int, float)):
        updated_at = 0
    return {
        "name": name,
        "script": script,
        "recorded": {"english": english, "spanish": spanish},
        "updatedAt": updated_at,
    }


def _normalize_payload(raw: object) -> dict[str, object]:
    blocks_in = raw.get("blocks") if isinstance(raw, dict) else None
    if not isinstance(blocks_in, dict):
        return _empty_payload()
    blocks_out: dict[str, object] = {}
    for key, value in blocks_in.items():
        if not isinstance(key, str) or not _BLOCK_KEY_RE.fullmatch(key):
            continue
        normalized = _normalize_block(value)
        if normalized is None:
            continue
        blocks_out[key] = normalized
    return {"blocks": blocks_out}


def _read_store(project_root: Path) -> dict[str, object]:
    path = _store_path(project_root)
    if not path.exists():
        return _empty_payload()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty_payload()
    return _normalize_payload(raw)


def _write_store(project_root: Path, payload: dict[str, object]) -> bool:
    path = _store_path(project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        return False
    return True


def try_handle_get(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    if not _matches_endpoint(handler.path):
        return False
    with _LOCK:
        payload = _read_store(project_root)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
    return True


def try_handle_post(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    """POST body is one of:

        { "op": "replace", "payload": { "blocks": {...} } }
            Full overwrite — used by the runner when persisting a block edit.

        { "op": "stampRecording", "key": "1|long|5", "language": "english" }
            Atomic stamp from a successful OBS recording. The server reads the
            current store, sets blocks[key].recorded[language] = now, and writes
            back. Required so two simultaneously-running runners can't clobber
            each other's status with stale snapshots.
    """
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
        raw_body = handler.rfile.read(max(content_len, 0))
        parsed = json.loads(raw_body.decode("utf-8") if raw_body else "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"error": "Invalid JSON"})
        return True

    op = parsed.get("op") if isinstance(parsed, dict) else None

    if op == "replace":
        payload = _normalize_payload(parsed.get("payload"))
        with _LOCK:
            if not _write_store(project_root, payload):
                _send_json(handler, 500, {"error": "Write failed"})
                return True
        _send_json(handler, 200, {"ok": True, "blocks": len(payload["blocks"])})
        return True

    if op == "stampRecording":
        key = parsed.get("key")
        language = parsed.get("language")
        timestamp = parsed.get("timestamp")
        if not isinstance(key, str) or not _BLOCK_KEY_RE.fullmatch(key):
            _send_json(handler, 400, {"error": "Invalid block key"})
            return True
        if language not in ("english", "spanish"):
            _send_json(handler, 400, {"error": "Invalid language"})
            return True
        if not isinstance(timestamp, (int, float)):
            _send_json(handler, 400, {"error": "Invalid timestamp"})
            return True
        with _LOCK:
            payload = _read_store(project_root)
            blocks = payload.setdefault("blocks", {})
            block = blocks.get(key)
            if not isinstance(block, dict):
                _send_json(handler, 404, {"error": "Block not found"})
                return True
            recorded = block.setdefault("recorded", {"english": None, "spanish": None})
            recorded[language] = timestamp
            block["updatedAt"] = timestamp
            if not _write_store(project_root, payload):
                _send_json(handler, 500, {"error": "Write failed"})
                return True
        _send_json(handler, 200, {"ok": True})
        return True

    _send_json(handler, 400, {"error": "Unknown op"})
    return True


def _send_json(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


__all__ = ["try_handle_get", "try_handle_post"]
