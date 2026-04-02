#!/usr/bin/env python3
# Run (no browser, PowerShell):
#   & "C:\Users\Rom\Desktop\‏‏תיקיה חדשה\Football Channel\Main Runner - Lineups - Shorts\run_site.bat" --no-browser
# macOS/Linux:
#   python3 "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Lineups - Shorts/run_site.py"
"""Serve Football Channel repo root; open this runner's index.html."""
from __future__ import annotations

import argparse
import errno
import io
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

RUNNER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = RUNNER_DIR.parent
_RUNNER_PARTS = RUNNER_DIR.relative_to(PROJECT_ROOT).parts
RUNNER_WEB_PREFIX = "/" + "/".join(quote(p, safe="") for p in _RUNNER_PARTS)
DEFAULT_PORT = 8889
LIVE_RELOAD_POLL_SECONDS = 0.6
LIVE_RELOAD_HEARTBEAT_SECONDS = 2.0
LIVE_RELOAD_IGNORED_DIRS = {".git", ".hg", ".svn", ".idea", ".vscode", "__pycache__", "node_modules", "storage"}
LIVE_RELOAD_IGNORED_SUFFIXES = {".pyc", ".pyo", ".tmp", ".swp", ".log"}
LIVE_RELOAD_SNIPPET = """
<script>
(() => {
  if (window.top !== window) return;
  window.__RUNNER_LIVE_RELOAD__ = true;
  const endpoint = "/__live-reload";
  let retryTimer = null;
  function connect() {
    const es = new EventSource(endpoint);
    es.addEventListener("reload", () => {
      try {
        if (typeof window.__captureRunnerState === "function") {
          window.__captureRunnerState();
        }
      } catch (err) {
        console.warn("State snapshot failed before reload.", err);
      }
      window.location.reload();
    });
    es.onerror = () => {
      es.close();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, 1000);
    };
  }
  connect();
})();
</script>
""".strip()


def _iter_watchable_files() -> list[Path]:
    files: list[Path] = []
    for root, dirs, filenames in os.walk(RUNNER_DIR):
        dirs[:] = [d for d in dirs if d not in LIVE_RELOAD_IGNORED_DIRS]
        for name in filenames:
            if name.startswith("."):
                continue
            suffix = Path(name).suffix.lower()
            if suffix in LIVE_RELOAD_IGNORED_SUFFIXES:
                continue
            files.append(Path(root) / name)
    files.sort()
    return files


def _build_watch_signature() -> int:
    parts: list[str] = []
    for path in _iter_watchable_files():
        try:
            stat = path.stat()
        except OSError:
            continue
        rel = path.relative_to(RUNNER_DIR).as_posix()
        parts.append(f"{rel}|{stat.st_mtime_ns}|{stat.st_size}")
    return hash("\n".join(parts))


def _watch_for_file_changes(httpd: "RunnerHTTPServer", stop_event: threading.Event) -> None:
    last_signature = _build_watch_signature()
    while not stop_event.is_set():
        time.sleep(LIVE_RELOAD_POLL_SECONDS)
        current_signature = _build_watch_signature()
        if current_signature == last_signature:
            continue
        last_signature = current_signature
        with httpd.reload_lock:
            httpd.reload_version += 1


class RunnerHTTPServer(ThreadingHTTPServer):
    # Disable generic address reuse and request exclusive ownership on Windows.
    # This prevents multiple servers from attaching to the same TCP port.
    allow_reuse_address = False

    def server_bind(self) -> None:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def __init__(self, server_address, handler_cls):  # noqa: ANN001
        super().__init__(server_address, handler_cls)
        self.reload_lock = threading.Lock()
        self.reload_version = 0


class RunnerRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:  # noqa: D401
        # Dev runner: always bypass browser cache so reload fetches fresh JS/CSS/HTML.
        if self.command in {"GET", "HEAD"}:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def _is_live_reload_endpoint(self) -> bool:
        return urlparse(self.path).path == "/__live-reload"

    def _send_live_reload_stream(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.wfile.flush()

        with self.server.reload_lock:
            # Baseline on connect so first subscription does not force a reload loop.
            last_sent = self.server.reload_version
        while True:
            with self.server.reload_lock:
                current = self.server.reload_version
            if current != last_sent:
                payload = f"event: reload\ndata: {current}\n\n".encode("utf-8")
                last_sent = current
            else:
                payload = b": keepalive\n\n"
            try:
                self.wfile.write(payload)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
            time.sleep(LIVE_RELOAD_HEARTBEAT_SECONDS)

    def _inject_live_reload_script(self, body: bytes) -> bytes:
        if not body:
            return body
        marker = b"</body>"
        index = body.rfind(marker)
        if index == -1:
            return body
        snippet = LIVE_RELOAD_SNIPPET.encode("utf-8")
        return body[:index] + snippet + b"\n" + body[index:]

    def do_GET(self) -> None:  # noqa: N802
        if self._is_live_reload_endpoint():
            self._send_live_reload_stream()
            return
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Browser navigation/reload can drop sockets mid-response.
            return

    def send_head(self):  # noqa: D401
        if self._is_live_reload_endpoint():
            return None
        parsed = urlparse(self.path)
        if not parsed.path.endswith(".html"):
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html", "index.htm"):
                index_path = os.path.join(path, index)
                if os.path.exists(index_path):
                    path = index_path
                    break
            else:
                return self.list_directory(path)

        try:
            with open(path, "rb") as f:
                raw = f.read()
        except OSError:
            self.send_error(404, "File not found")
            return None

        body = self._inject_live_reload_script(raw)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return io.BytesIO(body)


def _primary_lan_ipv4() -> str | None:
    """Guess this PC's LAN IPv4 for display when listening on 0.0.0.0."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            addr = probe.getsockname()[0]
    except OSError:
        return None
    if addr.startswith("127."):
        return None
    return addr


def _try_bind_httpd(host: str, start_port: int, *, max_attempts: int) -> tuple[RunnerHTTPServer, int]:
    last_err: OSError | None = None
    for port in range(start_port, start_port + max_attempts):
        try:
            httpd = RunnerHTTPServer((host, port), RunnerRequestHandler)
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
    parser = argparse.ArgumentParser(description="Run local HTTP server for the Lineups quiz UI.")
    parser.add_argument("-p", "--port", type=int, default=DEFAULT_PORT, help="First port to try (default: %(default)s)")
    parser.add_argument(
        "--strict-port",
        action="store_true",
        help="Fail if the given port is busy instead of trying the next free port.",
    )
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser tab")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        metavar="ADDR",
        help="Listen address. Use 0.0.0.0 so other devices on your LAN can open the site (default: %(default)s).",
    )
    args = parser.parse_args()

    os.chdir(PROJECT_ROOT)

    if args.strict_port:
        try:
            httpd = RunnerHTTPServer((args.host, args.port), RunnerRequestHandler)
        except OSError as e:
            if e.errno == errno.EADDRINUSE:
                inspect_cmd = (
                    f"netstat -ano | findstr :{args.port}"
                    if os.name == "nt"
                    else f"lsof -i TCP:{args.port} -s TCP:LISTEN"
                )
                print(
                    f"Port {args.port} is already in use.\n"
                    f"  • Stop the other server, or run without --strict-port, or use: -p {args.port + 1}\n"
                    f"  • See what is using it:  {inspect_cmd}",
                    file=sys.stderr,
                )
            raise
        chosen = args.port
    else:
        httpd, chosen = _try_bind_httpd(args.host, args.port, max_attempts=30)
        if chosen != args.port:
            print(f"Note: port {args.port} was busy; using {chosen} instead.\n")

    url = f"http://127.0.0.1:{chosen}{RUNNER_WEB_PREFIX}/index.html"
    print(f"Serving: {PROJECT_ROOT}")
    print(f"Open:    {url}")
    if args.host == "0.0.0.0":
        lan_ip = _primary_lan_ipv4()
        if lan_ip:
            print(f"LAN:     http://{lan_ip}:{chosen}{RUNNER_WEB_PREFIX}/index.html  (same Wi‑Fi/Ethernet as this PC)")
        else:
            print(
                "LAN:     Use http://<this-PC-IPv4>:"
                + str(chosen)
                + RUNNER_WEB_PREFIX
                + "/index.html on other devices.",
            )
            print("         Find the address with:  ipconfig  (IPv4 Address of your active adapter).")

    with httpd:
        stop_event = threading.Event()
        watch_thread = threading.Thread(
            target=_watch_for_file_changes,
            args=(httpd, stop_event),
            daemon=True,
        )
        watch_thread.start()
        if not args.no_browser:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
        finally:
            stop_event.set()


if __name__ == "__main__":
    main()
