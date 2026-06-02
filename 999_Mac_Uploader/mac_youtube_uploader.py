#!/usr/bin/env python3
"""Football Channel — Mac-side YouTube uploader.

WHY THIS EXISTS
---------------
The quiz site (run_site.py) runs on the Windows PC, but recording happens on
this Mac via the shared LAN URL. OBS writes the .mkv to a folder ON THIS MAC,
so the PC's upload script can't see the file. To upload a video you must read
its bytes, and the bytes live here — therefore the upload has to run here.

This is a TINY standalone helper. It is NOT the website. It just:
  * tells each runner where on THIS MAC to record (so OBS saves locally), and
  * receives the calendar's "Upload to YouTube" request and uploads the local
    file using your existing YouTube credentials.

The calendar's Upload button auto-detects this helper (on localhost) and sends
the job here instead of to the PC. Nothing else about your workflow changes.

It reuses the exact upload logic from the main site (dev_server_youtube.py) so
behaviour matches the PC: same quota-fallback chain, same scheduling, same
playlist handling, same custom-thumbnail support.

SETUP (one time) — see README.md. In short:
  1. Copy `.Storage/Scripts/dev_server_youtube.py` from the PC repo into this folder.
  2. Copy the `.Storage/youtube/` folder from the PC repo into this folder as `youtube/`.
  3. Edit `uploader-config.json` if you want a different record folder/port.
  4. Double-click "Start Uploader.command" (or run `python3 mac_youtube_uploader.py`).

Leave the Terminal window open while you record and upload.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

HERE = Path(__file__).resolve().parent

# Never let a non-ASCII character in a log line crash the server (Windows
# consoles default to a legacy codepage; macOS is UTF-8 anyway).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

DEFAULT_CONFIG = {
    # Port this helper listens on (must match the calendar's expectation; the
    # calendar defaults to 9876, override with localStorage 'fcMacUploaderUrl').
    "port": 9876,
    # Where OBS should record on THIS MAC. "~" expands to your home folder.
    # Per-language subfolders (English / Spanish) are created automatically.
    "recordingsRoot": "~/Movies/Football Channel",
    # Where your YouTube credentials live (client_secret*.json + token_*.json +
    # playlists.json). Relative paths are resolved against this folder.
    "youtubeDir": "./youtube",
}


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    path = HERE / "uploader-config.json"
    if path.is_file():
        try:
            user = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(user, dict):
                cfg.update({k: v for k, v in user.items() if v not in (None, "")})
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[uploader] WARNING: could not read uploader-config.json: {exc}")
    return cfg


CONFIG = load_config()
PORT = int(CONFIG.get("port", 9876))
RECORDINGS_ROOT = str(CONFIG.get("recordingsRoot", "~/Movies/Football Channel"))


def _resolve_under_here(p: str) -> Path:
    p = os.path.expanduser(str(p))
    path = Path(p)
    return path if path.is_absolute() else (HERE / path)


YOUTUBE_DIR = _resolve_under_here(CONFIG.get("youtubeDir", "./youtube")).resolve()

# --------------------------------------------------------------------------
# Reuse the main site's upload logic
# --------------------------------------------------------------------------

sys.path.insert(0, str(HERE))
try:
    import dev_server_youtube as yt  # type: ignore
except ImportError:
    print("\n[uploader] ERROR: dev_server_youtube.py not found next to this script.")
    print("           Copy it from the PC repo: .Storage/Scripts/dev_server_youtube.py")
    print(f"           into: {HERE}\n")
    sys.exit(1)

# All credential / playlist / thumbnail files resolve to YOUTUBE_DIR regardless
# of the project_root we hand the reused handlers. This decouples the bundle
# layout from the repo's `.Storage/youtube` structure.
yt._yt_dir = lambda project_root=None: YOUTUBE_DIR  # type: ignore[attr-defined]

# project_root is otherwise unused by the upload/status handlers once _yt_dir is
# overridden, but they still accept it — pass the bundle dir.
PROJECT_ROOT = HERE

# --------------------------------------------------------------------------
# Duplicate-upload guard (the hard guarantee that a file is never uploaded
# twice). A video upload takes a while; if the browser's connection drops
# before it hears "success", the calendar shows the job as failed and offers
# "Retry" — which would upload the SAME file again. To make that impossible:
#   * ALL uploads are serialised by one lock (also quota/bandwidth friendly).
#   * The result of each completed upload is cached, keyed by the file's
#     identity (path + size + modified-time). A repeat request for the same
#     file returns the EXISTING video id instead of uploading again.
# So even if you click Upload/Retry ten times, only one video reaches YouTube.
# (Re-recording changes the file's size/mtime, so a genuinely new take still
#  uploads as expected.)
# --------------------------------------------------------------------------
_UPLOAD_LOCK = threading.Lock()
_UPLOADED = {}  # file-identity key -> {"videoId", "playlistId", "publishAt"}


def _file_identity(video_path: Path, channel: str) -> str:
    st = video_path.stat()
    return f"{channel}|{video_path.resolve()}|{st.st_size}|{int(st.st_mtime)}"


# --------------------------------------------------------------------------
# Recording directory (problem #1: OBS must save to a Mac folder)
# --------------------------------------------------------------------------

def recordings_dir_for(language: str) -> Path:
    lang = (language or "").strip().lower()
    is_spanish = lang.startswith("sp") or lang == "es" or lang == "espanol" or lang == "español"
    folder = "Spanish" if is_spanish else "English"
    root = Path(os.path.expanduser(RECORDINGS_ROOT))
    d = (root / folder).resolve()
    d.mkdir(parents=True, exist_ok=True)
    return d


# --------------------------------------------------------------------------
# HTTP server (CORS + Private Network Access so the PC-origin page can call us)
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "FCMacUploader/1.0"

    # Inject CORS on EVERY response (including those _send_json writes), because
    # the calendar page is served from the PC origin (http://192.168.x.x:8888)
    # and this helper is on http://localhost:<port> — a cross-origin request.
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome's Private Network Access: a request from a private-IP page to
        # localhost is gated behind this preflight header.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _safe_json(self, code: int, payload: dict) -> bool:
        """Like _json but tolerant of a client that already hung up. Returns
        False if the response couldn't be delivered (connection gone)."""
        try:
            self._json(code, payload)
            return True
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            sys.stderr.write("[uploader] client disconnected before it got the response "
                             "(the result is cached, so a retry will not re-upload).\n")
            return False

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")
        if path == "/__ping":
            self._safe_json(200, {"ok": True, "service": "fc-mac-uploader", "version": "1.0"})
            return
        if path == "/__obs-recordings-dir":
            qs = parse_qs(urlparse(self.path).query)
            language = (qs.get("language") or [""])[0]
            try:
                d = recordings_dir_for(language)
            except OSError as exc:
                self._safe_json(500, {"ok": False, "error": f"Could not create recordings folder: {exc}"})
                return
            self._safe_json(200, {"ok": True, "recordingsDir": str(d), "language": language or "english"})
            return
        try:
            if yt.try_handle_get(self, PROJECT_ROOT):
                return
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        except Exception as exc:  # never crash the handler thread
            self._safe_json(500, {"ok": False, "error": str(exc)})
            return
        self._safe_json(404, {"ok": False, "error": "Not found"})

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(max(length, 0)) if length > 0 else b""
        return json.loads(raw.decode("utf-8")) if raw else {}

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path.rstrip("/")
        # The upload is the only long-running, duplicate-sensitive call — we own
        # it here (dedup + disconnect-safe). Thumbnails/etc. are delegated.
        if path == "/__youtube-upload":
            try:
                body = self._read_json_body()
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                self._safe_json(400, {"ok": False, "error": "Invalid request body"})
                return
            self.handle_upload(body)
            return
        try:
            if yt.try_handle_post(self, PROJECT_ROOT):
                return
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        except Exception as exc:
            self._safe_json(500, {"ok": False, "error": str(exc)})
            return
        self._safe_json(404, {"ok": False, "error": "Not found"})

    def handle_upload(self, body: dict) -> None:
        """Upload one local video to YouTube, guaranteeing no duplicate ever.

        Reuses the site's exact building blocks (slot/quota chain, resumable
        upload, thumbnail, playlist) from dev_server_youtube.py, but wraps them
        with a per-file dedup cache so a dropped connection + retry can never
        create a second video."""
        channel = body.get("channel")
        video_path_raw = body.get("videoPath")
        title = (body.get("title") or "").strip()
        description = body.get("description") or ""
        tags = body.get("tags") if isinstance(body.get("tags"), list) else []
        publish_at = body.get("publishAt")
        playlist_name = body.get("playlistName") or ""
        thumb = body.get("thumbnail") if isinstance(body.get("thumbnail"), dict) else None

        if channel not in ("en", "es"):
            self._safe_json(400, {"ok": False, "error": "channel must be 'en' or 'es'"})
            return
        if not title:
            self._safe_json(400, {"ok": False, "error": "title is required"})
            return
        if not video_path_raw:
            self._safe_json(400, {"ok": False, "error": "videoPath is required"})
            return
        video_path = Path(str(video_path_raw))
        if not video_path.is_file():
            self._safe_json(404, {"ok": False, "error": f"Video file not found: {video_path}"})
            return

        thumb_bytes = thumb_mime = None
        if thumb and thumb.get("dataBase64"):
            try:
                thumb_bytes = base64.b64decode(thumb["dataBase64"])
                thumb_mime = thumb.get("mime") or "image/jpeg"
            except Exception:
                self._safe_json(400, {"ok": False, "error": "Invalid thumbnail data"})
                return

        key = _file_identity(video_path, channel)

        # One upload at a time + dedup inside the lock = atomic "upload once".
        with _UPLOAD_LOCK:
            if key in _UPLOADED:
                cached = _UPLOADED[key]
                sys.stderr.write(f"[uploader] DEDUP: '{video_path.name}' already uploaded "
                                 f"as {cached['videoId']} — returning existing video, NOT re-uploading.\n")
                self._safe_json(200, {
                    "ok": True,
                    "videoId": cached["videoId"],
                    "playlistId": cached.get("playlistId"),
                    "warning": "This exact file was already uploaded in this session — returned the "
                               "existing video instead of creating a duplicate.",
                })
                return

            lang_code = "es" if channel == "es" else "en"
            snippet = {
                "title": title[:100],
                "description": description,
                "tags": [str(t) for t in tags][:60],
                "categoryId": yt._SPORTS_CATEGORY_ID,
                "defaultLanguage": lang_code,
                "defaultAudioLanguage": lang_code,
            }
            status = {"privacyStatus": "private", "selfDeclaredMadeForKids": False}
            if publish_at:
                status["publishAt"] = publish_at

            slots = yt._available_slots(PROJECT_ROOT, channel)
            if not slots:
                self._safe_json(400, {"ok": False, "error":
                    f"The {channel.upper()} channel isn't authorized — check the bundle's youtube/ folder."})
                return

            try:
                file_size = video_path.stat().st_size
                video_id = used_access = used_slot = None
                quota_hit = []
                for idx, slot in enumerate(slots):
                    try:
                        access = yt._access_token_slot(PROJECT_ROOT, channel, slot)
                        upload_url = yt._start_resumable(access, snippet, status, file_size)
                        video = yt._upload_chunks(upload_url, video_path, file_size)
                        video_id = video.get("id")
                        used_access, used_slot = access, slot
                        break
                    except urllib.error.HTTPError as e:
                        if yt._is_quota_error(e):
                            quota_hit.append(slot)
                            if idx < len(slots) - 1:
                                continue
                        raise

                if not video_id:
                    msg = "All projects are out of daily quota." if quota_hit else "Upload returned no video id."
                    self._safe_json(502, {"ok": False, "error": msg})
                    return

                warnings = []
                if quota_hit:
                    warnings.append(f"Project slot(s) {quota_hit} were out of quota; used slot {used_slot}.")
                if thumb_bytes:
                    try:
                        yt._set_thumbnail(used_access, video_id, thumb_bytes, thumb_mime)
                    except Exception as e:
                        warnings.append(f"Thumbnail not applied: {e}")
                playlist_id = None
                if playlist_name:
                    try:
                        playlist_id = yt._find_or_create_playlist(PROJECT_ROOT, channel, used_access, playlist_name)
                        if playlist_id:
                            yt._add_to_playlist(used_access, playlist_id, video_id)
                    except Exception as e:
                        warnings.append(f"Playlist step failed: {e}")

                # Record success BEFORE replying. If the reply can't be delivered
                # (client hung up), a retry will hit this cache and not re-upload.
                _UPLOADED[key] = {"videoId": video_id, "playlistId": playlist_id, "publishAt": publish_at}
                sys.stderr.write(f"[uploader] uploaded '{video_path.name}' -> {video_id}\n")

                resp = {"ok": True, "videoId": video_id, "playlistId": playlist_id}
                if warnings:
                    resp["warning"] = " | ".join(warnings)
                self._safe_json(200, resp)
            except urllib.error.HTTPError as e:
                detail = ""
                try:
                    detail = e.read().decode("utf-8", "replace")[:600]
                except Exception:
                    pass
                self._safe_json(502, {"ok": False, "error": f"YouTube API error {e.code}: {e.reason}", "detail": detail})
            except Exception as e:
                self._safe_json(500, {"ok": False, "error": str(e)})

    # Quieter, single-line logging.
    def log_message(self, fmt, *args):
        sys.stderr.write("[uploader] %s - %s\n" % (self.address_string(), fmt % args))


def _auth_summary() -> str:
    try:
        en = yt._channel_authorized(PROJECT_ROOT, "en")
        es = yt._channel_authorized(PROJECT_ROOT, "es")
    except Exception:
        return "could not read credentials"
    mark = lambda ok: "authorized" if ok else "NOT authorized"
    return f"EN channel {mark(en)}, ES channel {mark(es)}"


def main() -> None:
    print("=" * 64)
    print(" Football Channel - Mac YouTube Uploader")
    print("=" * 64)
    print(f" Listening on : http://localhost:{PORT}")
    print(f" Recordings   : {Path(os.path.expanduser(RECORDINGS_ROOT)).resolve()}")
    print(f"                (English/ and Spanish/ subfolders made on demand)")
    print(f" Credentials  : {YOUTUBE_DIR}")
    if not YOUTUBE_DIR.is_dir():
        print("   [!] credentials folder not found - copy the PC repo's")
        print("       .Storage/youtube/ into this bundle as 'youtube/'.")
    else:
        print(f"   {_auth_summary()}")
    print("-" * 64)
    print(" Leave this window open while you record and upload.")
    print(" Press Ctrl+C to stop.")
    print("=" * 64)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[uploader] stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
