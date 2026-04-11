#!/usr/bin/env python3
# Run (no browser, PowerShell):
#   & "C:\Users\Rom\Desktop\‏‏תיקיה חדשה\Football Channel\Main Runner - Career Path - Regular\run_site.bat" --no-browser
# macOS/Linux:
#   python3 "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Career Path - Regular/run_site.py"
"""Serve Football Channel repo root; open this runner's index.html."""
from __future__ import annotations

import argparse
import errno
import importlib.util
import io
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

RUNNER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = RUNNER_DIR.parent
QUIZ_TITLE_VOICE_DIR = PROJECT_ROOT / "Voices" / "Game name"
QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE = {
    "player-by-career-stats": "Guess the football player by career stats !!!.mp3",
    "player-by-career": "Guess the football player by career path !!!.mp3",
}
QUIZ_TITLE_PROMPT_BY_QUIZ_TYPE = {
    "player-by-career-stats": "Hey everyone, let's start. ... GUESS THE PLAYER BY CAREER STATS!!",
    "player-by-career": "Hey everyone, let's start. ... GUESS THE FOOTBALL PLAYER BY CAREER PATH!!",
}
ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY"
ELEVENLABS_VOICE_ID_ENV = "ELEVENLABS_VOICE_ID"
ELEVENLABS_MODEL_ID_ENV = "ELEVENLABS_MODEL_ID"
ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_ELEVENLABS_API_KEY = "0f5a57c70ec1b1c8f6d5e121dc257d098997632020d4891bb392feb9e0510700"
DEFAULT_ELEVENLABS_VOICE_ID = "yl2ZDV1MzN4HbQJbMihG"
DEFAULT_ELEVENLABS_MODEL_ID = "eleven_v3"
FIXED_QUIZ_TITLE_VOICE = "en-US-AndrewNeural"

def _load_runner_saved_scripts():  # noqa: D401
    path = PROJECT_ROOT / "dev_server_saved_scripts.py"
    spec = importlib.util.spec_from_file_location("_fc_runner_saved_scripts", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_saved_scripts.py")
    spec.loader.exec_module(mod)
    return mod


_runner_saved_mod = _load_runner_saved_scripts()

_RUNNER_PARTS = RUNNER_DIR.relative_to(PROJECT_ROOT).parts
RUNNER_WEB_PREFIX = "/" + "/".join(quote(p, safe="") for p in _RUNNER_PARTS)
DEFAULT_PORT = 8886
CAREER_SIZE_FAVORITES_FILE = RUNNER_DIR / "storage" / "career-size-favorites.json"
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


def _normalize_quiz_title_voice_inputs(
    quiz_type: str | None,
    specific_title: str | None = None,
) -> tuple[str, str, Path]:
    qt = str(quiz_type or "").strip()
    if qt not in QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE:
        raise ValueError("Unsupported quiz type.")
    filename = QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE[qt]
    base_prompt = QUIZ_TITLE_PROMPT_BY_QUIZ_TYPE.get(qt) or filename.removesuffix(".mp3")
    clean_specific = re.sub(r"^\+\s*", "", str(specific_title or "").strip())
    if clean_specific:
        prompt = f"{base_prompt} {clean_specific}".strip()
        safe_specific = _safe_path_component(clean_specific)[:140].strip()
        out_name = f"{qt} + {safe_specific}.mp3" if safe_specific else filename
    else:
        prompt = base_prompt
        out_name = filename
    return qt, prompt, QUIZ_TITLE_VOICE_DIR / out_name


def _project_relative_web_path(path: Path) -> str:
    rel_parts = path.relative_to(PROJECT_ROOT).parts
    return "/" + "/".join(quote(p, safe="") for p in rel_parts)


def _elevenlabs_api_key() -> str:
    return str(os.environ.get(ELEVENLABS_API_KEY_ENV) or "").strip() or DEFAULT_ELEVENLABS_API_KEY


def _resolve_elevenlabs_voice_id(requested_voice: str) -> str:
    raw = str(requested_voice or "").strip()
    if re.fullmatch(r"[A-Za-z0-9]{20,}", raw):
        return raw
    configured = str(os.environ.get(ELEVENLABS_VOICE_ID_ENV) or "").strip()
    if configured:
        return configured
    return DEFAULT_ELEVENLABS_VOICE_ID


def _elevenlabs_model_id() -> str:
    return str(os.environ.get(ELEVENLABS_MODEL_ID_ENV) or "").strip() or DEFAULT_ELEVENLABS_MODEL_ID


def _generate_elevenlabs_speech_mp3(text: str, requested_voice: str, out_path: Path) -> tuple[str, str]:
    api_key = _elevenlabs_api_key()
    if not api_key:
        raise RuntimeError("Missing ELEVENLABS_API_KEY.")
    voice_id = _resolve_elevenlabs_voice_id(requested_voice)
    model_id = _elevenlabs_model_id()
    endpoint = (
        "https://api.elevenlabs.io/v1/text-to-speech/"
        + quote(voice_id, safe="")
        + f"?output_format={quote(ELEVENLABS_OUTPUT_FORMAT, safe='')}"
    )
    payload = {
        "text": str(text or ""),
        "model_id": model_id,
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            audio_bytes = resp.read()
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")
        except Exception:
            detail = ""
        if detail:
            raise RuntimeError(f"ElevenLabs HTTP {exc.code}: {detail}") from exc
        raise RuntimeError(f"ElevenLabs HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"ElevenLabs request failed: {exc}") from exc

    if not audio_bytes:
        raise RuntimeError("ElevenLabs returned empty audio.")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(audio_bytes)
    return voice_id, model_id


def _sanitize_size_favorites(raw: object) -> dict[str, dict[str, float | str]]:
    if not isinstance(raw, dict):
        return {}
    cleaned: dict[str, dict[str, float | str]] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, dict):
            continue
        key_norm = key.lower()
        if key_norm.startswith("club::"):
            try:
                badge_scale = float(value.get("badgeScale"))
                year_nudge = float(value.get("yearNudge"))
            except (TypeError, ValueError):
                continue
            cleaned[key_norm] = {
                "type": "club",
                "badgeScale": badge_scale,
                "yearNudge": year_nudge,
            }
            continue

        try:
            y_offset = float(value.get("silhouetteYOffset"))
            scale_x = float(value.get("silhouetteScaleX"))
            scale_y = float(value.get("silhouetteScaleY"))
        except (TypeError, ValueError):
            continue
        cleaned[key_norm] = {
            "type": "player",
            "silhouetteYOffset": y_offset,
            "silhouetteScaleX": scale_x,
            "silhouetteScaleY": scale_y,
        }
    return cleaned


def _read_size_favorites_file() -> dict[str, dict[str, float]]:
    if not CAREER_SIZE_FAVORITES_FILE.exists():
        return {}
    try:
        raw = json.loads(CAREER_SIZE_FAVORITES_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return _sanitize_size_favorites(raw)


def _write_size_favorites_file(data: dict[str, dict[str, float]]) -> None:
    CAREER_SIZE_FAVORITES_FILE.parent.mkdir(parents=True, exist_ok=True)
    CAREER_SIZE_FAVORITES_FILE.write_text(
        json.dumps(data, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


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


class RunnerRequestHandler(SimpleHTTPRequestHandler):
    _CACHEABLE_ASSET_SUFFIXES = (
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".svg",
        ".ico",
        ".avif",
        ".bmp",
    )

    def _is_cacheable_static_asset_request(self) -> bool:
        """True for image URLs so repeated <img> loads reuse the browser cache."""
        path = unquote(urlparse(self.path).path).lower()
        return path.endswith(self._CACHEABLE_ASSET_SUFFIXES)

    def end_headers(self) -> None:  # noqa: D401
        # Dev runner: bypass cache for HTML/JS/CSS/JSON so edits and reloads stay fresh.
        # Allow caching for images: UI may recreate <img> nodes; without cache headers the
        # dev server forces a full re-fetch. projectAssetUrlFresh() adds ?v= per page load
        # so a full refresh still gets new URLs.
        if self.command in {"GET", "HEAD"}:
            if self._is_cacheable_static_asset_request():
                self.send_header("Cache-Control", "public, max-age=86400")
            else:
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
        super().end_headers()

    def _is_live_reload_endpoint(self) -> bool:
        return urlparse(self.path).path == "/__live-reload"

    def _is_size_favorites_endpoint(self) -> bool:
        return urlparse(self.path).path == "/api/career-size-favorites"

    def _send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid Content-Length header.") from exc
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("Request body must be valid JSON.") from exc
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object.")
        return data

    def _try_serve_quiz_title_voice_status(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__quiz-title-voice/status":
            return False
        query = {}
        for part in parsed.query.split("&"):
            if not part:
                continue
            k, _, v = part.partition("=")
            query[unquote(k)] = unquote(v.replace("+", " "))
        try:
            _quiz_type, _prompt, out_path = _normalize_quiz_title_voice_inputs(
                query.get("quizType"),
                query.get("specificTitle"),
            )
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        self._send_json(
            200,
            {
                "ok": True,
                "exists": out_path.is_file(),
                "src": _project_relative_web_path(out_path) if out_path.is_file() else "",
            },
        )
        return True

    def _try_generate_quiz_title_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__quiz-title-voice/generate":
            return False
        try:
            body = self._read_json_body()
            _quiz_type, prompt_text, out_path = _normalize_quiz_title_voice_inputs(
                body.get("quizType"),
                body.get("specificTitle"),
            )
            requested_voice = str(body.get("voice") or FIXED_QUIZ_TITLE_VOICE).strip()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, requested_voice, out_path)
        except Exception as exc:  # noqa: BLE001
            self._send_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._send_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._send_json(
            200,
            {
                "ok": True,
                "src": _project_relative_web_path(out_path),
                "voice": chosen_voice,
                "model": model,
                "provider": "elevenlabs",
            },
        )
        return True

    def _try_delete_quiz_title_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__quiz-title-voice/delete":
            return False
        try:
            body = self._read_json_body()
            _quiz_type, _prompt, out_path = _normalize_quiz_title_voice_inputs(
                body.get("quizType"),
                body.get("specificTitle"),
            )
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        removed = 0
        if out_path.exists():
            out_path.unlink(missing_ok=True)
            removed = 1
        self._send_json(200, {"ok": True, "removed": removed})
        return True

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
        if _runner_saved_mod.try_handle_get(self, PROJECT_ROOT):
            return
        if self._try_serve_quiz_title_voice_status():
            return
        if self._is_live_reload_endpoint():
            self._send_live_reload_stream()
            return
        if self._is_size_favorites_endpoint():
            self._send_json(200, _read_size_favorites_file())
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

    def do_POST(self) -> None:  # noqa: N802
        if _runner_saved_mod.try_handle_post(self, PROJECT_ROOT):
            return
        if self._try_generate_quiz_title_voice():
            return
        if self._try_delete_quiz_title_voice():
            return
        if not self._is_size_favorites_endpoint():
            self._send_json(404, {"error": "Not found"})
            return
        try:
            content_len = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return
        if content_len > 2_000_000:
            self._send_json(413, {"error": "Payload too large"})
            return
        try:
            body = self.rfile.read(max(content_len, 0))
            parsed = json.loads(body.decode("utf-8") if body else "{}")
            cleaned = _sanitize_size_favorites(parsed)
            _write_size_favorites_file(cleaned)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Invalid JSON payload"})
            return
        self._send_json(200, {"ok": True})


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


def _enable_windows_ansi_colors() -> None:
    """Try enabling ANSI escape sequences on Windows consoles."""
    if os.name != "nt":
        return
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        if handle in (0, -1):
            return
        mode = ctypes.c_uint()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)) == 0:
            return
        enable_vt = 0x0004
        kernel32.SetConsoleMode(handle, mode.value | enable_vt)
    except Exception:
        return


def _print_lan_url_reminder(lan_url: str) -> None:
    _enable_windows_ansi_colors()
    red = "\x1b[31m"
    reset = "\x1b[0m"
    for idx in range(10):
        print(f"{red}[LAN URL {idx + 1}/10] {lan_url}{reset}")


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
    parser = argparse.ArgumentParser(description="Run local HTTP server for the Career Path quiz UI.")
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
            lan_url = f"http://{lan_ip}:{chosen}{RUNNER_WEB_PREFIX}/index.html"
            print(f"LAN:     {lan_url}  (same Wi‑Fi/Ethernet as this PC)")
            _print_lan_url_reminder(lan_url)
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
