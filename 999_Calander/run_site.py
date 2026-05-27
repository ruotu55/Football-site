#!/usr/bin/env python3
"""Serve the Football Channel repo root over HTTP and open the upload calendar.

The calendar fetches /__recording-status to learn which (runner, type, episode)
blocks are Empty / Ready / Recorded. That endpoint only works over http(s) —
opening the calendar via file:// hits CORS and shows everything as Empty.

This launcher is intentionally minimal: just static file serving + the
recording-status endpoint. It does NOT carry the runner-specific voice / OBS
endpoints, so it's safe to run alongside an actual runner on a different port.

Run (Windows, double-click run_site.bat) or:
    python "999_Calander/run_site.py"
    python "999_Calander/run_site.py" --no-browser
    python "999_Calander/run_site.py" -p 8899 --host 0.0.0.0
"""
from __future__ import annotations

import argparse
import errno
import importlib.util
import io
import os
import socket
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

CALENDAR_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CALENDAR_DIR.parent
CALENDAR_WEB_PREFIX = "/" + quote(CALENDAR_DIR.name, safe="")
DEFAULT_PORT = 8899


def _load_recording_status():
    """Import the shared recording-status handler used by every runner.

    Loading it the same way the runners do (importlib.util.spec_from_file_location)
    so a single source of truth lives in .Storage/Scripts/.
    """
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_recording_status.py"
    spec = importlib.util.spec_from_file_location("_fc_recording_status", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_recording_status.py")
    spec.loader.exec_module(mod)
    return mod


_recording_status_mod = _load_recording_status()


def _load_youtube():
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_youtube.py"
    spec = importlib.util.spec_from_file_location("_fc_youtube", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_youtube.py")
    spec.loader.exec_module(mod)
    return mod


_youtube_mod = _load_youtube()


def _load_launch_runner():
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_launch_runner.py"
    spec = importlib.util.spec_from_file_location("_fc_launch_runner", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_launch_runner.py")
    spec.loader.exec_module(mod)
    return mod


_launch_runner_mod = _load_launch_runner()


class CalendarRequestHandler(SimpleHTTPRequestHandler):
    """Static file serving for PROJECT_ROOT + recording-status, youtube, launch endpoints."""

    def do_GET(self) -> None:  # noqa: N802
        if _recording_status_mod.try_handle_get(self, PROJECT_ROOT):
            return
        if _youtube_mod.try_handle_get(self, PROJECT_ROOT):
            return
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Browser tab closed / reloaded mid-response.
            return

    def do_POST(self) -> None:  # noqa: N802
        if _recording_status_mod.try_handle_post(self, PROJECT_ROOT):
            return
        if _youtube_mod.try_handle_post(self, PROJECT_ROOT):
            return
        if _launch_runner_mod.try_handle_post(self, PROJECT_ROOT):
            return
        self.send_error(404, "Not found")


def _primary_lan_ipv4() -> str | None:
    """Best-effort guess of this PC's LAN IPv4 when listening on 0.0.0.0."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            addr = probe.getsockname()[0]
    except OSError:
        return None
    if addr.startswith("127."):
        return None
    return addr


def _try_bind(host: str, start_port: int, *, max_attempts: int):
    """Walk forward from start_port until we find a free one (or give up)."""
    last_err: OSError | None = None
    for port in range(start_port, start_port + max_attempts):
        try:
            httpd = ThreadingHTTPServer((host, port), CalendarRequestHandler)
            return httpd, port
        except OSError as e:
            last_err = e
            if e.errno not in (errno.EADDRINUSE, getattr(errno, "WSAEADDRINUSE", -1)):
                raise
            continue
    raise OSError(
        last_err.errno if last_err else 0,
        f"No free port in range {start_port}–{start_port + max_attempts - 1} "
        f"(last error: {last_err})",
    ) from last_err


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Football Channel calendar.")
    parser.add_argument(
        "-p", "--port", type=int, default=DEFAULT_PORT,
        help="First port to try (default: %(default)s)",
    )
    parser.add_argument(
        "--strict-port", action="store_true",
        help="Fail if the given port is busy instead of trying the next free port.",
    )
    parser.add_argument(
        "--no-browser", action="store_true",
        help="Do not open a browser tab",
    )
    parser.add_argument(
        "--host", default="127.0.0.1", metavar="ADDR",
        help="Listen address. Use 0.0.0.0 so other devices on your LAN can open the "
             "calendar (default: %(default)s).",
    )
    args = parser.parse_args()

    os.chdir(PROJECT_ROOT)

    if args.strict_port:
        try:
            httpd = ThreadingHTTPServer((args.host, args.port), CalendarRequestHandler)
        except OSError as e:
            if e.errno == errno.EADDRINUSE:
                print(
                    f"Port {args.port} is already in use. "
                    f"Run without --strict-port, or use: -p {args.port + 1}",
                    file=sys.stderr,
                )
            raise
        chosen = args.port
    else:
        httpd, chosen = _try_bind(args.host, args.port, max_attempts=30)
        if chosen != args.port:
            print(f"Note: port {args.port} was busy; using {chosen} instead.\n")

    url = f"http://127.0.0.1:{chosen}{CALENDAR_WEB_PREFIX}/index.html"
    print(f"Serving: {PROJECT_ROOT}")
    print(f"Open:    {url}")
    if args.host == "0.0.0.0":
        lan_ip = _primary_lan_ipv4()
        if lan_ip:
            print(f"LAN:     http://{lan_ip}:{chosen}{CALENDAR_WEB_PREFIX}/index.html")

    with httpd:
        if not args.no_browser:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
