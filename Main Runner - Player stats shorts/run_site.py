#!/usr/bin/env python3
# Run (no browser, PowerShell):
#   & "C:\Users\Rom\Desktop\‏‏תיקיה חדשה\Football Channel\Main Runner - Career Path - Shorts\run_site.bat" --no-browser
# macOS/Linux:
#   python3 "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Career Path - Shorts/run_site.py"
"""Serve Football Channel repo root; open this runner's index.html."""
from __future__ import annotations

import argparse
import errno
import importlib.util
import io
import ipaddress
import json
import os
import re
import socket
import ssl
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

def _load_runner_saved_scripts():  # noqa: D401
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_saved_scripts.py"
    spec = importlib.util.spec_from_file_location("_fc_runner_saved_scripts", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_saved_scripts.py")
    spec.loader.exec_module(mod)
    return mod


_runner_saved_mod = _load_runner_saved_scripts()

_RUNNER_PARTS = RUNNER_DIR.relative_to(PROJECT_ROOT).parts
RUNNER_WEB_PREFIX = "/" + "/".join(quote(p, safe="") for p in _RUNNER_PARTS)
DEFAULT_PORT = 8887
CAREER_SIZE_FAVORITES_FILE = RUNNER_DIR / "storage" / "career-size-favorites.json"
RUNNER_VARIANT = "Player Stats Shorts"
SUPPORTED_LANGUAGES = ("english", "spanish")
DEFAULT_LANGUAGE = "english"
ENDING_VOICE_DIR = PROJECT_ROOT / ".Storage" / "Voices" / "Ending Guess"
ENDING_VOICE_FILE_BY_TYPE = {
    "english": {
        "think-you-know": "Think you know the answer_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
        "how-many": "How many did you get_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
    },
    "spanish": {
        "think-you-know": "Crees saber la respuesta_ dinoslo en los comentarios!!! No olvides dar like y suscribirte .mp3",
        "how-many": "Cuantas acertaste_ dinoslo en los comentarios!!! No olvides dar like y suscribirte .mp3",
    },
}
ENDING_VOICE_PROMPT_BY_TYPE = {
    "english": {
        "think-you-know": "Think you know the answer? Let us know in the comments! Don't forget to like and subscribe!",
        "how-many": "How many did you get? Let us know in the comments! Don't forget to like and subscribe!",
    },
    "spanish": {
        "think-you-know": "¿Crees saber la respuesta? ¡Dínoslo en los comentarios! ¡No olvides dar like y suscribirte!",
        "how-many": "¿Cuántas acertaste? ¡Dínoslo en los comentarios! ¡No olvides dar like y suscribirte!",
    },
}
QUIZ_TITLE_VOICE_DIR = PROJECT_ROOT / ".Storage" / "Voices" / "Game name" / RUNNER_VARIANT
QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE = {
    "english": {
        "player-by-career-stats": "Guess the player by career stats !!!.mp3",
        "player-by-career": "Guess the football player by career path !!!.mp3",
    },
    "spanish": {
        "player-by-career-stats": "Adivina al jugador por estadisticas de carrera !!!.mp3",
        "player-by-career": "Adivina al jugador por trayectoria !!!.mp3",
    },
}
QUIZ_TITLE_PROMPT_BY_QUIZ_TYPE = {
    "english": {
        "player-by-career-stats": "Hey everyone, let's start. ... GUESS THE PLAYER BY CAREER STATS!!",
        "player-by-career": "Hey everyone, let's start. ... GUESS THE FOOTBALL PLAYER BY CAREER PATH!!",
    },
    "spanish": {
        "player-by-career-stats": "Hola a todos, empecemos. ... ¡¡ADIVINA AL JUGADOR POR ESTADÍSTICAS DE CARRERA!!",
        "player-by-career": "Hola a todos, empecemos. ... ¡¡ADIVINA AL JUGADOR POR TRAYECTORIA!!",
    },
}


def _normalize_language(lang) -> str:
    value = str(lang or "").strip().lower()
    return value if value in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


BUNDLED_VOICE_CONFIG = {
    "welcome": {"dir": PROJECT_ROOT / ".Storage" / "Voices" / "Welcome",
                "filename": "Welcome to the football lab, lets start!!!.mp3",
                "prompts": {"english": "Welcome to the football lab, let's start!",
                            "spanish": "¡Bienvenidos al laboratorio de fútbol, empecemos!"}},
    "warm-up": {"dir": PROJECT_ROOT / ".Storage" / "Voices" / "Levels",
                "filename": "Worm up round dont mess this one .mp3",
                "prompts": {"english": "Warm up round — don't mess this one!",
                            "spanish": "Ronda de calentamiento — ¡no la arruines!"}},
    "serious": {"dir": PROJECT_ROOT / ".Storage" / "Voices" / "Levels",
                "filename": "OK now it's getting serious.mp3",
                "prompts": {"english": "OK now it's getting serious.",
                            "spanish": "Bien, ahora se pone serio."}},
    "nerds":   {"dir": PROJECT_ROOT / ".Storage" / "Voices" / "Levels",
                "filename": "Only true football nerd know this!!!.mp3",
                "prompts": {"english": "Only true football nerds know this!",
                            "spanish": "¡Solo los verdaderos fanáticos del fútbol saben esto!"}},
    "genius":  {"dir": PROJECT_ROOT / ".Storage" / "Voices" / "Levels",
                "filename": "If you get this you are basically a genius!!!.mp3",
                "prompts": {"english": "If you get this you are basically a genius!",
                            "spanish": "¡Si aciertas esto eres básicamente un genio!"}},
}


def _normalize_bundled_voice_inputs(key, language) -> tuple[str, str, Path]:
    k = str(key or "").strip()
    if k not in BUNDLED_VOICE_CONFIG:
        raise ValueError("Unsupported bundled voice key.")
    lang = _normalize_language(language)
    cfg = BUNDLED_VOICE_CONFIG[k]
    out_path = cfg["dir"] / lang / cfg["filename"]
    prompt = cfg["prompts"].get(lang) or cfg["prompts"]["english"]
    return k, prompt, out_path


PLAYER_VOICE_DIR = PROJECT_ROOT / ".Storage" / "Voices" / "Players Names"
PLAYER_VOICE_ALLOWED_EXTS = (".mp3", ".wav", ".m4a")
FIXED_PLAYER_VOICE = "en-US-AndrewNeural"
ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY"
ELEVENLABS_VOICE_ID_ENV = "ELEVENLABS_VOICE_ID"
ELEVENLABS_MODEL_ID_ENV = "ELEVENLABS_MODEL_ID"
ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_ELEVENLABS_API_KEY = "0f5a57c70ec1b1c8f6d5e121dc257d098997632020d4891bb392feb9e0510700"
DEFAULT_ELEVENLABS_VOICE_ID = "yl2ZDV1MzN4HbQJbMihG"
DEFAULT_ELEVENLABS_MODEL_ID = "eleven_v3"
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _try_certifi() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _try_certifi()


def _is_valid_windows_filename_stem(stem: str) -> bool:
    if not stem:
        return False
    if stem.endswith(" ") or stem.endswith("."):
        return False
    banned = '<>:"/\\|?*'
    for ch in stem:
        if ord(ch) < 32 or ch in banned:
            return False
    return True


def _normalize_player_voice_name(name: str | None) -> str:
    player_name = (name or "").strip()
    if not player_name:
        raise ValueError("Missing player name.")
    if not _is_valid_windows_filename_stem(player_name):
        raise ValueError("Player name has unsupported filename characters for Windows.")
    return player_name


def _safe_path_component(raw) -> str:
    """Strip any characters that aren't safe for a Windows filename component."""
    s = str(raw or "")
    return re.sub(r'[<>:"/\\|?*]', "_", s).strip()


_MAX_READY_PHOTO_DOWNLOAD_BYTES = 15 * 1024 * 1024


def _ready_photo_bytes_look_like_image(data: bytes) -> bool:
    """True if bytes look like a raster image (not HTML / tiny error body)."""
    if len(data) < 80:
        return False
    low = data[:600].lower()
    if low.strip().startswith(b"<!doctype") or low.strip().startswith(b"<html"):
        return False
    if b"<html" in low or b"<body" in low:
        return False
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return True
    if data[:3] == b"\xff\xd8\xff":
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if len(data) > 32 and b"ftypavif" in data[:40]:
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    return False


def _hostname_is_blocked_for_ready_photo_fetch(host: str) -> bool:
    h = (host or "").strip().lower().rstrip(".")
    if not h:
        return True
    blocked_names = {
        "localhost",
        "metadata.google.internal",
        "0.0.0.0",
        "127.0.0.1",
        "::1",
        "169.254.169.254",
    }
    if h in blocked_names or h.endswith(".localhost") or h.endswith(".local"):
        return True
    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        return False
    if ip.version == 6 and getattr(ip, "ipv4_mapped", None) is not None:
        m = ip.ipv4_mapped
        if m.is_private or m.is_loopback or m.is_link_local:
            return True
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
    )


def _normalize_external_image_url(raw: object) -> str:
    u = str(raw or "").strip()
    if not u:
        raise ValueError("Missing image URL.")
    p = urlparse(u)
    if p.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    host = (p.hostname or "").strip()
    if not host:
        raise ValueError("Invalid URL.")
    if _hostname_is_blocked_for_ready_photo_fetch(host):
        raise ValueError("That host is not allowed.")
    return u


def _fetch_external_image_request_headers(url: str) -> dict[str, str]:
    """Build request headers; UEFA CDNs often reject or stall ``Referer: https://img.uefa.com/``."""
    p = urlparse(url)
    origin = f"{p.scheme}://{p.netloc}/"
    host = (p.hostname or "").lower()
    headers: dict[str, str] = {
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8",
    }
    if host.endswith("uefa.com"):
        headers["Referer"] = "https://www.uefa.com/"
        headers["Origin"] = "https://www.uefa.com"
    else:
        headers["Referer"] = origin
    return headers


def _fetch_external_image_bytes(url: str) -> bytes:
    headers = _fetch_external_image_request_headers(url)
    req = urllib.request.Request(url, headers=headers, method="GET")
    parts: list[bytes] = []
    total = 0
    with urllib.request.urlopen(req, timeout=75.0, context=SSL_CTX) as r:
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_READY_PHOTO_DOWNLOAD_BYTES:
                raise ValueError(
                    f"Image exceeds {_MAX_READY_PHOTO_DOWNLOAD_BYTES // (1024 * 1024)} MB.",
                )
            parts.append(chunk)
    return b"".join(parts)


def _ready_photo_subdir(player_name: str, club_name: str | None) -> str:
    """Folder under Ready photos: ``{player}_{club}`` (sanitized for Windows paths)."""
    p = _safe_path_component(player_name)
    if not p:
        raise ValueError("Invalid player name for Ready photo folder.")
    c = _safe_path_component(club_name) or "Unknown"
    return f"{p}_{c}"


def _next_ready_photo_save_stem(folder: Path, base_stem: str) -> str:
    """First save uses ``base_stem``; further saves use ``base_stem + \" 2\"``, ``\" 3\"``, …"""
    stem = base_stem.strip()
    if not stem:
        raise ValueError("Empty player name stem for Ready photo save.")
    if not folder.is_dir():
        return stem
    max_n = 0
    seen_base = False
    prefix = f"{stem} "
    for p in folder.iterdir():
        if not p.is_file():
            continue
        name = p.name.lower()
        if not (name.endswith(".png") or name.endswith(".webp")):
            continue
        s = p.stem
        if s == stem:
            seen_base = True
            max_n = max(max_n, 1)
        elif s.startswith(prefix):
            tail = s[len(prefix) :].strip()
            if tail.isdigit():
                max_n = max(max_n, int(tail))
    if not seen_base and max_n == 0:
        return stem
    return f"{stem} {max_n + 1}"


def _ready_photo_stem_to_variant_index(base_stem: str, file_stem: str) -> int:
    b = base_stem.strip()
    if not b or file_stem == b:
        return 1
    prefix = f"{b} "
    if file_stem.startswith(prefix):
        tail = file_stem[len(prefix) :].strip()
        if tail.isdigit():
            return int(tail)
    return 1


def _portrait_bytes_to_png_bytes(raw: bytes) -> bytes | None:
    """Decode arbitrary raster bytes (WebP/JPEG/PNG/…) to PNG via Pillow when available."""
    try:
        from io import BytesIO

        from PIL import Image  # type: ignore

        im = Image.open(BytesIO(raw))
        im = im.convert("RGBA")
        buf = BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return None


def _save_ready_photo_bytes_to_repo(
    player_name: str,
    club_name: str | None,
    raw_bytes: bytes,
) -> tuple[str, str, str, int]:
    """Write Ready photos file; returns (relative_path, format, file_stem, variant_index)."""
    if not _ready_photo_bytes_look_like_image(raw_bytes):
        raise ValueError(
            "Download did not look like an image (HTML error page, empty body, or unknown format).",
        )
    base_dir = PROJECT_ROOT / "Images" / "Players No Background" / "Ready photos"
    sub = _ready_photo_subdir(player_name, club_name)
    folder = base_dir / sub
    base_stem = player_name.strip()
    file_stem = _next_ready_photo_save_stem(folder, base_stem)
    png_path = folder / f"{file_stem}.png"
    webp_path = folder / f"{file_stem}.webp"
    png_bytes = _portrait_bytes_to_png_bytes(raw_bytes)
    png_path.parent.mkdir(parents=True, exist_ok=True)
    variant_index = _ready_photo_stem_to_variant_index(base_stem, file_stem)
    if png_bytes:
        png_path.write_bytes(png_bytes)
        webp_path.unlink(missing_ok=True)
        rel = f"Images/Players No Background/Ready photos/{sub}/{file_stem}.png"
        return rel, "png", file_stem, variant_index
    is_riff_webp = (
        len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP"
    )
    if is_riff_webp:
        webp_path.write_bytes(raw_bytes)
        png_path.unlink(missing_ok=True)
        rel = f"Images/Players No Background/Ready photos/{sub}/{file_stem}.webp"
        return rel, "webp", file_stem, variant_index
    raise ValueError(
        "Could not convert image to PNG. Install Pillow (pip install Pillow) or use JPEG/PNG/WebP.",
    )


def _player_voice_paths_for_name(player_name: str, language: str | None = None) -> list[Path]:
    del language
    return [PLAYER_VOICE_DIR / f"{player_name}{ext}" for ext in PLAYER_VOICE_ALLOWED_EXTS]


def _tts_prompt_name(name: str) -> str:
    base = str(name or "").strip()
    if not base:
        return base
    return base if base.endswith("!") else f"{base}!"


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


def _elevenlabs_language_code(language: str | None) -> str:
    lang = _normalize_language(language)
    return {"english": "en", "spanish": "es"}.get(lang, "en")


def _generate_elevenlabs_speech_mp3(
    text: str,
    requested_voice: str,
    out_path: Path,
    language: str | None = None,
) -> tuple[str, str]:
    api_key = _elevenlabs_api_key()
    if not api_key:
        raise RuntimeError(
            "ElevenLabs is not configured. Set ELEVENLABS_API_KEY (and ELEVENLABS_VOICE_ID) environment variables."
        )
    voice_id = _resolve_elevenlabs_voice_id(requested_voice)
    model_id = _elevenlabs_model_id()
    endpoint = (
        "https://api.elevenlabs.io/v1/text-to-speech/"
        f"{quote(voice_id, safe='')}?output_format={ELEVENLABS_OUTPUT_FORMAT}"
    )
    payload = {
        "text": str(text or ""),
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.4,
            "similarity_boost": 0.8,
        },
    }
    if language is not None:
        payload["language_code"] = _elevenlabs_language_code(language)
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "User-Agent": "Football-Channel-Runner",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
            audio_bytes = resp.read()
    except urllib.error.HTTPError as exc:
        details = ""
        try:
            details = exc.read().decode("utf-8", "replace").strip()
        except Exception:
            details = ""
        raise RuntimeError(f"ElevenLabs request failed ({exc.code}). {details[:300]}".strip()) from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"ElevenLabs request failed: {exc}") from exc
    if not audio_bytes:
        raise RuntimeError("ElevenLabs returned empty audio.")
    out_path.write_bytes(audio_bytes)
    return voice_id, model_id


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


def _normalize_ending_voice_inputs(
    ending_type: str | None,
    language: str | None = None,
) -> tuple[str, str, Path]:
    et = str(ending_type or "").strip()
    lang = _normalize_language(language)
    file_map = ENDING_VOICE_FILE_BY_TYPE[lang]
    prompt_map = ENDING_VOICE_PROMPT_BY_TYPE[lang]
    if et not in file_map:
        raise ValueError("Unsupported ending type.")
    filename = file_map[et]
    prompt = prompt_map.get(et) or filename.removesuffix(".mp3")
    return et, prompt, ENDING_VOICE_DIR / lang / filename


def _normalize_quiz_title_voice_inputs(
    quiz_type: str | None,
    specific_title: str | None = None,
    language: str | None = None,
) -> tuple[str, str, Path]:
    qt = str(quiz_type or "").strip()
    lang = _normalize_language(language)
    file_map = QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE[lang]
    prompt_map = QUIZ_TITLE_PROMPT_BY_QUIZ_TYPE[lang]
    if qt not in file_map:
        raise ValueError("Unsupported quiz type.")
    filename = file_map[qt]
    base_prompt = prompt_map.get(qt) or filename.removesuffix(".mp3")
    clean_specific = re.sub(r"^\+\s*", "", str(specific_title or "").strip())
    if clean_specific:
        prompt = f"{base_prompt} {clean_specific}".strip()
        safe_specific = _safe_path_component(clean_specific)[:140].strip() if "_safe_path_component" in globals() else clean_specific[:140]
        out_name = f"{qt} + {safe_specific}.mp3" if safe_specific else filename
    else:
        prompt = base_prompt
        out_name = filename
    return qt, prompt, QUIZ_TITLE_VOICE_DIR / lang / out_name


def _project_relative_web_path(path: Path) -> str:
    rel_parts = path.relative_to(PROJECT_ROOT).parts
    return "/" + "/".join(quote(p, safe="") for p in rel_parts)


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
        content_len = int(self.headers.get("Content-Length", "0"))
        if content_len > 2_000_000:
            raise ValueError("Payload too large")
        raw = self.rfile.read(max(content_len, 0))
        return json.loads(raw.decode("utf-8") if raw else "{}")

    def _try_serve_player_voice_status(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-voice/status":
            return False
        query = {}
        for part in parsed.query.split("&"):
            if not part:
                continue
            k, _, v = part.partition("=")
            query[unquote(k)] = unquote(v.replace("+", " "))
        try:
            player_name = _normalize_player_voice_name(query.get("name"))
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        existing_path = None
        for file_path in _player_voice_paths_for_name(player_name):
            if file_path.is_file():
                existing_path = file_path
                break
        self._send_json(
            200,
            {
                "ok": True,
                "exists": bool(existing_path),
                "src": _project_relative_web_path(existing_path) if existing_path else "",
            },
        )
        return True

    def _try_generate_player_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-voice/generate":
            return False
        try:
            body = self._read_json_body()
            player_name = _normalize_player_voice_name(body.get("name"))
            requested_voice = str(body.get("voice") or FIXED_PLAYER_VOICE).strip()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        language = _normalize_language(body.get("language"))
        PLAYER_VOICE_DIR.mkdir(parents=True, exist_ok=True)
        out_path = PLAYER_VOICE_DIR / f"{player_name}.mp3"
        for old_path in _player_voice_paths_for_name(player_name):
            if old_path == out_path:
                continue
            if old_path.exists():
                old_path.unlink(missing_ok=True)

        prompt_text = _tts_prompt_name(player_name)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, requested_voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._send_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._send_json(
                502,
                {
                    "ok": False,
                    "error": "ElevenLabs generation failed.",
                },
            )
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

    def _try_delete_player_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-voice/delete":
            return False
        try:
            body = self._read_json_body()
            player_name = _normalize_player_voice_name(body.get("name"))
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        removed = 0
        for file_path in _player_voice_paths_for_name(player_name):
            if file_path.exists():
                file_path.unlink(missing_ok=True)
                removed += 1
        self._send_json(200, {"ok": True, "removed": removed})
        return True

    def _try_serve_ending_voice_status(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__ending-voice/status":
            return False
        query = {}
        for part in parsed.query.split("&"):
            if not part:
                continue
            k, _, v = part.partition("=")
            query[unquote(k)] = unquote(v.replace("+", " "))
        try:
            _ending_type, _prompt, out_path = _normalize_ending_voice_inputs(
                query.get("endingType"),
                query.get("language"),
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

    def _try_generate_ending_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__ending-voice/generate":
            return False
        try:
            body = self._read_json_body()
            _ending_type, prompt_text, out_path = _normalize_ending_voice_inputs(
                body.get("endingType"),
                body.get("language"),
            )
            voice = str(body.get("voice") or FIXED_PLAYER_VOICE).strip()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        language = _normalize_language(body.get("language"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._send_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._send_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._send_json(200, {"ok": True, "src": _project_relative_web_path(out_path), "voice": chosen_voice, "model": model, "provider": "elevenlabs"})
        return True

    def _try_delete_ending_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__ending-voice/delete":
            return False
        try:
            body = self._read_json_body()
            _ending_type, _prompt, out_path = _normalize_ending_voice_inputs(
                body.get("endingType"),
                body.get("language"),
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
            _qt, _prompt, out_path = _normalize_quiz_title_voice_inputs(
                query.get("quizType"), query.get("specificTitle"), query.get("language"),
            )
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        self._send_json(200, {"ok": True, "exists": out_path.is_file(), "src": _project_relative_web_path(out_path) if out_path.is_file() else ""})
        return True

    def _try_generate_quiz_title_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__quiz-title-voice/generate":
            return False
        try:
            body = self._read_json_body()
            _qt, prompt_text, out_path = _normalize_quiz_title_voice_inputs(
                body.get("quizType"), body.get("specificTitle"), body.get("language"),
            )
            requested_voice = str(body.get("voice") or FIXED_PLAYER_VOICE).strip()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        language = _normalize_language(body.get("language"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, requested_voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._send_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._send_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._send_json(200, {"ok": True, "src": _project_relative_web_path(out_path), "voice": chosen_voice, "model": model, "provider": "elevenlabs"})
        return True

    def _try_delete_quiz_title_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__quiz-title-voice/delete":
            return False
        try:
            body = self._read_json_body()
            _qt, _prompt, out_path = _normalize_quiz_title_voice_inputs(
                body.get("quizType"), body.get("specificTitle"), body.get("language"),
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

    def _try_serve_bundled_voice_status(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__bundled-voice/status":
            return False
        query = {}
        for part in parsed.query.split("&"):
            if not part: continue
            k, _, v = part.partition("=")
            query[unquote(k)] = unquote(v.replace("+", " "))
        try:
            _key, _prompt, out_path = _normalize_bundled_voice_inputs(query.get("key"), query.get("language"))
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        self._send_json(200, {"ok": True, "exists": out_path.is_file(),
                              "src": _project_relative_web_path(out_path) if out_path.is_file() else ""})
        return True

    def _try_generate_bundled_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__bundled-voice/generate":
            return False
        try:
            body = self._read_json_body()
            _key, prompt_text, out_path = _normalize_bundled_voice_inputs(body.get("key"), body.get("language"))
            requested_voice = str(body.get("voice") or FIXED_PLAYER_VOICE).strip()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        language = _normalize_language(body.get("language"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, requested_voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._send_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._send_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._send_json(200, {"ok": True, "src": _project_relative_web_path(out_path),
                              "voice": chosen_voice, "model": model, "provider": "elevenlabs"})
        return True

    def _try_delete_bundled_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__bundled-voice/delete":
            return False
        try:
            body = self._read_json_body()
            _key, _prompt, out_path = _normalize_bundled_voice_inputs(body.get("key"), body.get("language"))
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True
        removed = 0
        if out_path.exists():
            out_path.unlink(missing_ok=True)
            removed = 1
        self._send_json(200, {"ok": True, "removed": removed})
        return True

    def _try_ready_photo_from_url(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__ready-photo/from-url":
            return False
        try:
            body = self._read_json_body()
            player_name = _normalize_player_voice_name(body.get("playerName"))
            club_name = str(body.get("clubName") or "").strip()
            raw_url = body.get("imageUrl") or body.get("url")
            image_url = _normalize_external_image_url(raw_url)
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        try:
            print(
                f"[Ready photo] GET {image_url!r} for {player_name!r} club={club_name!r}",
                flush=True,
            )
            raw_bytes = _fetch_external_image_bytes(image_url)
        except urllib.error.HTTPError as exc:
            self._send_json(
                502,
                {
                    "ok": False,
                    "error": f"Image URL returned HTTP {exc.code}.",
                },
            )
            return True
        except (urllib.error.URLError, OSError, ValueError) as exc:
            self._send_json(
                502,
                {
                    "ok": False,
                    "error": f"Could not download image ({type(exc).__name__}: {exc}).",
                },
            )
            return True
        except Exception as exc:  # noqa: BLE001
            self._send_json(
                502,
                {
                    "ok": False,
                    "error": f"Download failed ({type(exc).__name__}: {exc}).",
                },
            )
            return True

        try:
            rel, fmt, file_stem, variant_index = _save_ready_photo_bytes_to_repo(
                player_name, club_name, raw_bytes
            )
        except ValueError as exc:
            self._send_json(502, {"ok": False, "error": str(exc)})
            return True
        except OSError as exc:
            self._send_json(
                500,
                {"ok": False, "error": f"Could not save photo into Ready photos: {exc}"},
            )
            return True

        self._send_json(
            200,
            {
                "ok": True,
                "relativePath": rel.replace("\\", "/"),
                "format": fmt,
                "fileStem": file_stem,
                "variantIndex": variant_index,
                "pillowNote": (
                    "WebP was saved (PNG preferred). Install Pillow (pip install Pillow) for automatic PNG conversion."
                    if fmt == "webp"
                    else ""
                ),
            },
        )
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
        if self._try_serve_player_voice_status():
            return
        if self._try_serve_ending_voice_status():
            return
        if self._try_serve_quiz_title_voice_status():
            return
        if self._try_serve_bundled_voice_status():
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
        if self._try_generate_player_voice():
            return
        if self._try_delete_player_voice():
            return
        if self._try_generate_ending_voice():
            return
        if self._try_delete_ending_voice():
            return
        if self._try_generate_quiz_title_voice():
            return
        if self._try_delete_quiz_title_voice():
            return
        if self._try_generate_bundled_voice():
            return
        if self._try_delete_bundled_voice():
            return
        if self._try_ready_photo_from_url():
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
