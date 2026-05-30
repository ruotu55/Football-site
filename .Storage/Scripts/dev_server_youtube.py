"""HTTP handlers for uploading recorded videos to YouTube (dev server only).

Served under:
    GET  /__youtube-status                 -> which channels are authorized
    POST /__youtube-upload                 -> upload a video, schedule it, add to playlist

Design notes
------------
* No third-party Python packages. OAuth token refresh and the resumable upload
  are done with urllib, matching the rest of run_site.py.
* Two channels: "en" and "es". Each has its own OAuth refresh token produced by
  the one-time helper `authorize_youtube.py`.
* Files live under <project_root>/.Storage/youtube/ (gitignored):
    client_secret.json   - OAuth client (Desktop app) downloaded from Google Cloud
    token_en.json        - refresh token for the English channel
    token_es.json        - refresh token for the Spanish channel
    playlists.json        - cache of { "en": { "<quizTitle>": "<playlistId>" }, "es": {...} }
* Uploads go out as `private` with `status.publishAt` set to the calendar slot,
  so YouTube auto-publishes at the scheduled time. Quota: ~1600 units/upload.

POST /__youtube-upload body:
    {
      "channel":      "en" | "es",
      "videoPath":    "C:\\\\...\\\\file.mkv",   # absolute path OBS wrote
      "title":        "...",
      "description":  "...",
      "tags":         ["...", ...],            # optional
      "publishAt":    "2026-05-31T15:00:00Z",  # RFC3339 UTC; optional (omit = private, no schedule)
      "playlistName": "Guess The Football Team Name"  # optional; auto-create/find on the channel
    }
Response: { "ok": true, "videoId": "...", "playlistId": "..."|null }
"""
from __future__ import annotations

import json
import base64
import os
import re
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

if TYPE_CHECKING:
    from http.server import BaseHTTPRequestHandler

_LOCK = threading.Lock()
_UPLOAD_LOCK = threading.Lock()  # serialise uploads — quota + bandwidth friendly
_CHUNK_SIZE = 8 * 1024 * 1024     # 8 MiB (must be a multiple of 256 KiB)
_SPORTS_CATEGORY_ID = "17"        # YouTube "Sports"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
_PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists"
_PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems"
_THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"

try:
    import certifi  # type: ignore

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()


# ---------------------------------------------------------------------------
# Paths / file helpers
# ---------------------------------------------------------------------------

def _yt_dir(project_root: Path) -> Path:
    return (project_root / ".Storage" / "youtube").resolve()


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


# ---------------------------------------------------------------------------
# Project "slots" — a quota-fallback chain. Slot 1 is the original project
# (client_secret.json + token_<channel>.json). Slots 2..N each add another
# Cloud project's quota:
#     client_secret_2.json   token_<channel>_2.json
#     client_secret_3.json   token_<channel>_3.json
# An upload walks slot 1 -> 2 -> 3 and only advances to the next slot when the
# current one is OUT OF QUOTA. (More projects to multiply quota is discouraged
# by the YouTube API ToS — this is the user's explicit choice.)
# ---------------------------------------------------------------------------

MAX_SLOTS = 5


def _client_file(project_root: Path, slot: int) -> Path:
    name = "client_secret.json" if slot == 1 else f"client_secret_{slot}.json"
    return _yt_dir(project_root) / name


def _token_file(project_root: Path, channel: str, slot: int) -> Path:
    name = f"token_{channel}.json" if slot == 1 else f"token_{channel}_{slot}.json"
    return _yt_dir(project_root) / name


def _load_client(path: Path) -> dict | None:
    raw = _read_json(path)
    if not isinstance(raw, dict):
        return None
    node = raw.get("installed") or raw.get("web") or raw
    cid, secret = node.get("client_id"), node.get("client_secret")
    return {"client_id": cid, "client_secret": secret} if cid and secret else None


def _client_secret(project_root: Path, channel: str | None = None) -> dict | None:
    """Back-compat: returns slot-1's client (used by the status endpoint)."""
    return _load_client(_client_file(project_root, 1))


def _channel_token(project_root: Path, channel: str) -> dict | None:
    return _read_json(_token_file(project_root, channel, 1))


def _channel_authorized(project_root: Path, channel: str) -> bool:
    """True if ANY slot is authorized for this channel."""
    return len(_available_slots(project_root, channel)) > 0


def _available_slots(project_root: Path, channel: str) -> list[int]:
    """Ordered slots that have BOTH a client secret and a token for this channel."""
    out = []
    for slot in range(1, MAX_SLOTS + 1):
        client = _load_client(_client_file(project_root, slot))
        tok = _read_json(_token_file(project_root, channel, slot))
        if client and tok and tok.get("refresh_token"):
            out.append(slot)
    return out


# ---------------------------------------------------------------------------
# OAuth: exchange a slot's stored refresh token for a short-lived access token
# ---------------------------------------------------------------------------

def _access_token_slot(project_root: Path, channel: str, slot: int) -> str:
    client = _load_client(_client_file(project_root, slot))
    if not client:
        raise RuntimeError(f"Missing/invalid {_client_file(project_root, slot).name}")
    token = _read_json(_token_file(project_root, channel, slot))
    if not token or not token.get("refresh_token"):
        raise RuntimeError(f"Slot {slot} not authorized for '{channel}'")
    body = urllib.parse.urlencode({
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "refresh_token": token["refresh_token"],
        "grant_type": "refresh_token",
    }).encode("utf-8")
    req = urllib.request.Request(_TOKEN_URL, data=body, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
        data = json.loads(r.read().decode("utf-8"))
    access = data.get("access_token")
    if not access:
        raise RuntimeError("Token refresh returned no access_token")
    return access


def _is_quota_error(err: urllib.error.HTTPError) -> bool:
    """A YouTube 403 caused by exhausted daily quota / rate limit."""
    if err.code not in (403, 429):
        return False
    try:
        body = err.read().decode("utf-8", "replace")
        err.fp = None  # consumed
    except Exception:
        body = ""
    return any(s in body for s in ("quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded", "rateLimitExceeded"))


# ---------------------------------------------------------------------------
# Playlists — find by name (cached) or create on the channel
# ---------------------------------------------------------------------------

def _playlists_cache(project_root: Path) -> dict:
    raw = _read_json(_yt_dir(project_root) / "playlists.json")
    return raw if isinstance(raw, dict) else {}


def _save_playlists_cache(project_root: Path, cache: dict) -> None:
    path = _yt_dir(project_root) / "playlists.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def _api_json(url: str, access: str, *, method: str = "GET", payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Authorization": f"Bearer {access}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def _find_or_create_playlist(project_root: Path, channel: str, access: str, name: str) -> str | None:
    if not name:
        return None
    with _LOCK:
        cache = _playlists_cache(project_root)
        ch = cache.setdefault(channel, {})
        if name in ch:
            return ch[name]
    # Not cached: create a new private playlist named after the quiz type.
    created = _api_json(
        f"{_PLAYLISTS_URL}?part=snippet,status",
        access,
        method="POST",
        payload={
            "snippet": {"title": name, "description": f"{name} — auto-managed by the upload calendar."},
            "status": {"privacyStatus": "public"},
        },
    )
    pid = created.get("id")
    if not pid:
        return None
    with _LOCK:
        cache = _playlists_cache(project_root)
        cache.setdefault(channel, {})[name] = pid
        _save_playlists_cache(project_root, cache)
    return pid


def _add_to_playlist(access: str, playlist_id: str, video_id: str) -> None:
    _api_json(
        f"{_PLAYLIST_ITEMS_URL}?part=snippet",
        access,
        method="POST",
        payload={
            "snippet": {
                "playlistId": playlist_id,
                "resourceId": {"kind": "youtube#video", "videoId": video_id},
            }
        },
    )


# ---------------------------------------------------------------------------
# Custom thumbnail — uploads the raw image bytes UNMODIFIED (no resize/recompress)
# ---------------------------------------------------------------------------

def _set_thumbnail(access: str, video_id: str, image_bytes: bytes, mime: str) -> None:
    """thumbnails.set — uploads the exact bytes the user picked. YouTube stores
    the original and derives its own display sizes; we never touch the pixels,
    so quality/size is preserved. Requires the channel to be allowed custom
    thumbnails (phone-verified) or YouTube returns 403."""
    url = f"{_THUMBNAIL_URL}?videoId={urllib.parse.quote(video_id)}"
    req = urllib.request.Request(url, data=image_bytes, method="POST", headers={
        "Authorization": f"Bearer {access}",
        "Content-Type": mime or "application/octet-stream",
        "Content-Length": str(len(image_bytes)),
    })
    with urllib.request.urlopen(req, timeout=120, context=_SSL_CTX) as r:
        r.read()  # 200 = applied


# ---------------------------------------------------------------------------
# Resumable upload (chunked PUT)
# ---------------------------------------------------------------------------

def _start_resumable(access: str, snippet: dict, status: dict, file_size: int) -> str:
    body = json.dumps({"snippet": snippet, "status": status}).encode("utf-8")
    req = urllib.request.Request(_UPLOAD_URL, data=body, method="POST", headers={
        "Authorization": f"Bearer {access}",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": str(file_size),
        "X-Upload-Content-Type": "video/*",
    })
    with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as r:
        location = r.headers.get("Location")
    if not location:
        raise RuntimeError("Resumable upload init returned no Location header")
    return location


def _upload_chunks(upload_url: str, video_path: Path, file_size: int) -> dict:
    """PUT the file in chunks. Each non-final chunk returns HTTP 308 (Resume
    Incomplete); the final chunk returns 200/201 with the video resource."""
    with open(video_path, "rb") as f:
        offset = 0
        while offset < file_size:
            chunk = f.read(_CHUNK_SIZE)
            if not chunk:
                break
            end = offset + len(chunk) - 1
            req = urllib.request.Request(upload_url, data=chunk, method="PUT", headers={
                "Content-Length": str(len(chunk)),
                "Content-Range": f"bytes {offset}-{end}/{file_size}",
            })
            try:
                with urllib.request.urlopen(req, timeout=600, context=_SSL_CTX) as r:
                    # Final chunk: 200/201 with JSON body (the video resource).
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 308:
                    # Resume Incomplete — server accepted this chunk, continue.
                    offset = end + 1
                    continue
                raise
    raise RuntimeError("Upload finished without a final video resource response")


# ---------------------------------------------------------------------------
# HTTP entrypoints
# ---------------------------------------------------------------------------

def _matches(handler_path: str, endpoint: str) -> bool:
    return urlparse(handler_path).path.rstrip("/") == endpoint


# ---------------------------------------------------------------------------
# Per-video custom thumbnails: set ahead of time in the calendar (one per
# competition + channel), stored as small JSON files, used at upload time.
# ---------------------------------------------------------------------------

def _thumb_dir(project_root: Path) -> Path:
    return _yt_dir(project_root) / "thumbnails"


def _safe_token(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", str(s)).strip("_") or "x"


def _thumb_path(project_root: Path, key: str, channel: str) -> Path:
    return _thumb_dir(project_root) / f"{_safe_token(key)}__{_safe_token(channel)}.json"


def _handle_thumbnail_get(handler: BaseHTTPRequestHandler, project_root: Path) -> None:
    qs = urllib.parse.parse_qs(urlparse(handler.path).query)
    key = (qs.get("key") or [""])[0]
    channel = (qs.get("channel") or [""])[0]
    if not key or channel not in ("en", "es"):
        _send_json(handler, 400, {"ok": False, "error": "key and channel(en|es) required"})
        return
    data = _read_json(_thumb_path(project_root, key, channel))
    if not data or not data.get("dataBase64"):
        _send_json(handler, 200, {"ok": True, "exists": False})
        return
    _send_json(handler, 200, {
        "ok": True, "exists": True,
        "dataBase64": data.get("dataBase64"),
        "mime": data.get("mime") or "image/jpeg",
        "name": data.get("name") or "",
    })


def _handle_thumbnail_save(handler: BaseHTTPRequestHandler, project_root: Path, body: dict) -> None:
    key = body.get("key")
    channel = body.get("channel")
    data_b64 = body.get("dataBase64")
    if not key or channel not in ("en", "es") or not data_b64:
        _send_json(handler, 400, {"ok": False, "error": "key, channel(en|es) and dataBase64 required"})
        return
    try:
        base64.b64decode(data_b64)  # validate it decodes
    except Exception:
        _send_json(handler, 400, {"ok": False, "error": "Invalid image data"})
        return
    _thumb_dir(project_root).mkdir(parents=True, exist_ok=True)
    payload = {
        "mime": body.get("mime") or "image/jpeg",
        "name": body.get("name") or "",
        "dataBase64": data_b64,
    }
    _thumb_path(project_root, key, channel).write_text(json.dumps(payload), encoding="utf-8")
    _send_json(handler, 200, {"ok": True})


def _handle_thumbnail_delete(handler: BaseHTTPRequestHandler, project_root: Path, body: dict) -> None:
    key = body.get("key")
    channel = body.get("channel")
    if not key or channel not in ("en", "es"):
        _send_json(handler, 400, {"ok": False, "error": "key and channel(en|es) required"})
        return
    try:
        _thumb_path(project_root, key, channel).unlink(missing_ok=True)
    except OSError:
        pass
    _send_json(handler, 200, {"ok": True})


def try_handle_get(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    if _matches(handler.path, "/__youtube-thumbnail"):
        _handle_thumbnail_get(handler, project_root)
        return True
    if not _matches(handler.path, "/__youtube-status"):
        return False
    payload = {
        "clientSecret": _client_secret(project_root) is not None,
        "clientSecrets": {
            "en": _client_secret(project_root, "en") is not None,
            "es": _client_secret(project_root, "es") is not None,
        },
        "channels": {
            "en": _channel_authorized(project_root, "en"),
            "es": _channel_authorized(project_root, "es"),
        },
    }
    _send_json(handler, 200, payload)
    return True


def try_handle_post(handler: BaseHTTPRequestHandler, project_root: Path) -> bool:
    is_thumb = _matches(handler.path, "/__youtube-thumbnail")
    is_thumb_delete = _matches(handler.path, "/__youtube-thumbnail/delete")
    if not (is_thumb or is_thumb_delete or _matches(handler.path, "/__youtube-upload")):
        return False
    try:
        content_len = int(handler.headers.get("Content-Length", "0"))
        raw = handler.rfile.read(max(content_len, 0))
        body = json.loads(raw.decode("utf-8") if raw else "{}")
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        _send_json(handler, 400, {"ok": False, "error": "Invalid request body"})
        return True

    if is_thumb_delete:
        _handle_thumbnail_delete(handler, project_root, body)
        return True
    if is_thumb:
        _handle_thumbnail_save(handler, project_root, body)
        return True

    channel = body.get("channel")
    video_path_raw = body.get("videoPath")
    title = (body.get("title") or "").strip()
    description = body.get("description") or ""
    tags = body.get("tags") if isinstance(body.get("tags"), list) else []
    publish_at = body.get("publishAt")
    playlist_name = body.get("playlistName") or ""
    # Optional custom thumbnail: { dataBase64, mime }. Raw bytes are uploaded
    # unmodified via thumbnails.set, so the image keeps its original quality.
    thumb = body.get("thumbnail") if isinstance(body.get("thumbnail"), dict) else None
    thumb_bytes = None
    thumb_mime = None
    if thumb and thumb.get("dataBase64"):
        try:
            thumb_bytes = base64.b64decode(thumb["dataBase64"])
            thumb_mime = thumb.get("mime") or "image/jpeg"
        except Exception:
            _send_json(handler, 400, {"ok": False, "error": "Invalid thumbnail data"})
            return True

    if channel not in ("en", "es"):
        _send_json(handler, 400, {"ok": False, "error": "channel must be 'en' or 'es'"})
        return True
    if not title:
        _send_json(handler, 400, {"ok": False, "error": "title is required"})
        return True
    if not video_path_raw:
        _send_json(handler, 400, {"ok": False, "error": "videoPath is required"})
        return True

    video_path = Path(str(video_path_raw))
    if not video_path.is_file():
        _send_json(handler, 404, {"ok": False, "error": f"Video file not found: {video_path}"})
        return True

    # Mark the video's language so YouTube knows EN videos are English and ES
    # videos Spanish (drives discoverability + the right auto-captions).
    lang_code = "es" if channel == "es" else "en"
    snippet = {
        "title": title[:100],  # YouTube hard-caps titles at 100 chars
        "description": description,
        "tags": [str(t) for t in tags][:60],
        "categoryId": _SPORTS_CATEGORY_ID,
        "defaultLanguage": lang_code,       # language of title/description
        "defaultAudioLanguage": lang_code,  # spoken-audio language
    }
    status = {"privacyStatus": "private", "selfDeclaredMadeForKids": False}
    if publish_at:
        status["publishAt"] = publish_at  # RFC3339 UTC -> auto-publish

    slots = _available_slots(project_root, channel)
    if not slots:
        _send_json(handler, 400, {"ok": False, "error":
                   f"The {channel.upper()} channel isn't authorized on any project — run authorize_youtube.py --channel {channel}."})
        return True

    try:
        with _UPLOAD_LOCK:
            file_size = video_path.stat().st_size
            video_id = None
            used_access = None
            used_slot = None
            quota_hit = []

            # Walk the project chain: only advance to the next slot when the
            # current project is out of quota. Any other error stops here.
            for idx, slot in enumerate(slots):
                try:
                    access = _access_token_slot(project_root, channel, slot)
                    upload_url = _start_resumable(access, snippet, status, file_size)
                    video = _upload_chunks(upload_url, video_path, file_size)
                    video_id = video.get("id")
                    used_access = access
                    used_slot = slot
                    break
                except urllib.error.HTTPError as e:
                    if _is_quota_error(e):
                        quota_hit.append(slot)
                        if idx < len(slots) - 1:
                            continue  # fall through to the next project
                    raise

            if not video_id:
                msg = "All projects are out of daily quota." if quota_hit else "Upload returned no video id."
                _send_json(handler, 502, {"ok": False, "error": msg})
                return True

            warnings = []
            if quota_hit:
                warnings.append(f"Project slot(s) {quota_hit} were out of quota; used project slot {used_slot}.")

            # Custom thumbnail (unmodified bytes). Non-fatal on failure.
            if thumb_bytes:
                try:
                    _set_thumbnail(used_access, video_id, thumb_bytes, thumb_mime)
                except urllib.error.HTTPError as e:
                    det = ""
                    try:
                        det = e.read().decode("utf-8", "replace")[:300]
                    except Exception:
                        pass
                    warnings.append(f"Thumbnail not applied (HTTP {e.code}). The channel may need to be "
                                    f"phone-verified to use custom thumbnails. {det}")
                except Exception as e:
                    warnings.append(f"Thumbnail not applied: {e}")

            playlist_id = None
            if playlist_name:
                try:
                    playlist_id = _find_or_create_playlist(project_root, channel, used_access, playlist_name)
                    if playlist_id:
                        _add_to_playlist(used_access, playlist_id, video_id)
                except Exception as e:  # playlist failure shouldn't void the upload
                    warnings.append(f"Playlist step failed: {e}")
        resp = {"ok": True, "videoId": video_id, "playlistId": playlist_id}
        if warnings:
            resp["warning"] = " | ".join(warnings)
        _send_json(handler, 200, resp)
        return True
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:600]
        except Exception:
            pass
        _send_json(handler, 502, {"ok": False, "error": f"YouTube API error {e.code}: {e.reason}", "detail": detail})
        return True
    except Exception as e:
        _send_json(handler, 500, {"ok": False, "error": str(e)})
        return True


def _send_json(handler: BaseHTTPRequestHandler, code: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


__all__ = ["try_handle_get", "try_handle_post"]
