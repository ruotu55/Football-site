"""HTTP handler: launch a runner's local server and open it (dev server only).

Served under: POST /__launch-runner   body: { "runnerId": 1-8, "type": "long"|"short" }

The calendar calls this when you click an Empty / Ready-to-record pill: it finds
the matching runner folder, starts its run_site.py on a DETERMINISTIC port (so
the URL is predictable), waits for it to come up, opens the browser at the
runner's page, and returns the URL.

Port scheme (so each runner always lands on the same port, and never collides
with the calendar's 8899):
    port = 8900 + runnerId*2 + (1 if short else 0)
    e.g. runner 1 long -> 8902, runner 1 short -> 8903, ... runner 8 short -> 8917
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote, urlparse

if TYPE_CHECKING:
    from http.server import BaseHTTPRequestHandler

_ENDPOINT = "/__launch-runner"


def _matches(handler_path: str) -> bool:
    return urlparse(handler_path).path.rstrip("/") == _ENDPOINT


def _runner_port(runner_id: int, type_: str) -> int:
    return 8900 + runner_id * 2 + (1 if type_ == "short" else 0)


def _runner_folder(project_root: Path, runner_id: int, type_: str) -> Path | None:
    """Find the folder for (runnerId, type). Long-form folders end in 'Regular',
    Shorts in 'Shorts', and the folder name starts with '<id>_'."""
    suffix = "Regular" if type_ == "long" else "Shorts"
    for p in sorted(project_root.iterdir()):
        if not p.is_dir():
            continue
        name = p.name
        if name.startswith(f"{runner_id}_") and name.endswith(suffix) and (p / "run_site.py").is_file():
            return p
    return None


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _launch(folder: Path, port: int) -> bool:
    """Start the runner's server on a fixed port (detached). Returns True once
    the port is accepting connections."""
    creationflags = 0
    if os.name == "nt":
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP — keep running after the
        # calendar process, and don't share its console.
        creationflags = 0x00000008 | subprocess.CREATE_NEW_PROCESS_GROUP
    # Force UTF-8 stdout/stderr in the child. With --host 0.0.0.0 the runner
    # prints a LAN banner containing a non-breaking hyphen (U+2011); on a
    # non-UTF-8 console (e.g. Hebrew cp1255) that raises UnicodeEncodeError and
    # the server dies on startup -> "did not start in time".
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        subprocess.Popen(
            [sys.executable, "run_site.py", "--port", str(port),
             "--host", "0.0.0.0", "--no-browser", "--strict-port"],
            cwd=str(folder),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
        )
    except OSError:
        return False
    for _ in range(40):  # up to ~10s
        if _port_open(port):
            return True
        time.sleep(0.25)
    return False


def try_handle_post(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    if not _matches(handler.path):
        return False
    try:
        content_len = int(handler.headers.get("Content-Length", "0"))
        raw = handler.rfile.read(max(content_len, 0))
        body = json.loads(raw.decode("utf-8") if raw else "{}")
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"ok": False, "error": "Invalid request body"})
        return True

    try:
        runner_id = int(body.get("runnerId"))
    except (TypeError, ValueError):
        runner_id = 0
    type_ = body.get("type")
    if runner_id < 1 or runner_id > 13 or type_ not in ("long", "short"):
        _send_json(handler, 400, {"ok": False, "error": "Bad runnerId/type"})
        return True

    folder = _runner_folder(project_root, runner_id, type_)
    if folder is None:
        _send_json(handler, 404, {"ok": False, "error": f"No runner folder for id={runner_id} type={type_}"})
        return True

    port = _runner_port(runner_id, type_)
    # Build the runner URL with the SAME host the client used to reach the
    # calendar (its Host header). Local use -> 127.0.0.1; a remote device like
    # the recording Mac -> this PC's LAN IP, so the Mac can actually open it.
    host_header = handler.headers.get("Host", "") or ""
    req_host = host_header.split(":", 1)[0].strip() or "127.0.0.1"
    is_local = req_host in ("127.0.0.1", "localhost", "::1")
    url = f"http://{req_host}:{port}/{quote(folder.name)}/index.html"
    # Optional: auto-open a saved competition on the runner. The runner reads
    # ?open=<runnerId>|<type>|<episode> on load and loads that block.
    try:
        episode = int(body.get("episode"))
    except (TypeError, ValueError):
        episode = 0
    if episode >= 1:
        url += "?open=" + quote(f"{runner_id}|{type_}|{episode}")

    already = _port_open(port)
    if not already:
        if not _launch(folder, port):
            _send_json(handler, 500, {"ok": False, "error": "Runner server did not start in time", "url": url})
            return True

    # Open the runner here ONLY for a local request. For a remote client (the
    # Mac), don't open on this PC — the calendar page opens it in the browser
    # where the user actually clicked (via openOnClient below).
    if is_local:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    _send_json(handler, 200, {
        "ok": True, "url": url, "port": port,
        "alreadyRunning": already, "folder": folder.name,
        "openOnClient": not is_local,
    })
    return True


def _send_json(handler: BaseHTTPRequestHandler, code: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


__all__ = ["try_handle_post"]
