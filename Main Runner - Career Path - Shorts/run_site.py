#!/usr/bin/env python3
# Run (no browser, PowerShell):
#   & "C:\Users\Rom\Desktop\‏‏תיקיה חדשה\Football Channel\Main Runner - Career Path - Shorts\run_site.bat" --no-browser
# macOS/Linux:
#   python3 "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Career Path - Shorts/run_site.py"
"""Serve Football Channel repo root; open this runner's index.html."""
from __future__ import annotations

import argparse
import difflib
import errno
import hashlib
import importlib.util
import io
import json
import os
import re
import ssl
import shutil
import socket
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from xml.sax.saxutils import escape as xml_escape

RUNNER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = RUNNER_DIR.parent
PLAYER_VOICE_DIR = PROJECT_ROOT / ".Storage" / "Voices" / "Players Names"
PLAYER_VOICE_ALLOWED_EXTS = (".mp3", ".wav", ".m4a")
FIXED_PLAYER_VOICE = "en-US-AndrewNeural"
QUIZ_TITLE_VOICE_DIR = PROJECT_ROOT / ".Storage" / "Voices" / "Game name"
QUIZ_TITLE_VOICE_FILE_BY_QUIZ_TYPE = {
    "player-by-career": "Guess the football player by career path !!!.mp3",
    "player-by-career-stats": "Guess the football player by career path !!!.mp3",
}
QUIZ_TITLE_PROMPT_BY_QUIZ_TYPE = {
    "player-by-career": "GUESS THE FOOTBALL PLAYER BY CAREER PATH",
    "player-by-career-stats": "GUESS THE FOOTBALL PLAYER BY CAREER PATH",
}
ENDING_VOICE_DIR = PROJECT_ROOT / ".Storage" / "Voices" / "Ending Guess"
ENDING_VOICE_FILE_BY_TYPE = {
    "think-you-know": "Think you know the answer_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
    "how-many": "How many did you get_ let us know in the comments!!! Dont forget to like and subscribe .mp3",
}
ENDING_VOICE_PROMPT_BY_TYPE = {
    "think-you-know": "Think you know the answer? Let us know in the comments! Don't forget to like and subscribe!",
    "how-many": "How many did you get? Let us know in the comments! Don't forget to like and subscribe!",
}
EDGE_TTS_VOICES = (
    FIXED_PLAYER_VOICE,
)
OPENAI_TO_EDGE_VOICE_MAP = {
    "en-us-guyneural": FIXED_PLAYER_VOICE,
    "en-us-andrewneural": FIXED_PLAYER_VOICE,
}
EDGE_TTS_VOICE_BY_LOWER = {voice.casefold(): voice for voice in EDGE_TTS_VOICES}
AZURE_SPEECH_STYLE = "cheerful"
AZURE_SPEECH_KEY_ENV = "AZURE_SPEECH_KEY"
AZURE_SPEECH_REGION_ENV = "AZURE_SPEECH_REGION"
AZURE_SPEECH_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY"
ELEVENLABS_VOICE_ID_ENV = "ELEVENLABS_VOICE_ID"
ELEVENLABS_MODEL_ID_ENV = "ELEVENLABS_MODEL_ID"
ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_ELEVENLABS_API_KEY = "0f5a57c70ec1b1c8f6d5e121dc257d098997632020d4891bb392feb9e0510700"
DEFAULT_ELEVENLABS_VOICE_ID = "yl2ZDV1MzN4HbQJbMihG"
DEFAULT_ELEVENLABS_MODEL_ID = "eleven_v3"
FOOTBALL_LOGOS_AUTOCOMPLETE_URL = "https://football-logos.cc/ac.json"
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_FOOTBALL_LOGOS_AC_LOCK = threading.Lock()
_FOOTBALL_LOGOS_AC_CACHE: list[dict] | None = None


def _try_certifi() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _try_certifi()


def _fetch_text(url: str, *, timeout: float = 35.0) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": HTTP_USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read().decode("utf-8", "replace")


def _safe_path_component(raw: object) -> str:
    t = str(raw or "").strip()
    t = t.replace("/", "").replace("\\", "").replace("..", "")
    for ch in '<>:"|?*':
        t = t.replace(ch, "")
    return t.strip(". ")


def _name_key(s: object) -> str:
    t = unicodedata.normalize("NFKD", str(s or ""))
    translit = {
        "ð": "d",
        "Ð": "d",
        "þ": "th",
        "Þ": "th",
        "ø": "o",
        "Ø": "o",
        "ł": "l",
        "Ł": "l",
        "đ": "d",
        "Đ": "d",
        "ħ": "h",
        "Ħ": "h",
        "æ": "ae",
        "Æ": "ae",
        "œ": "oe",
        "Œ": "oe",
    }
    t = "".join(translit.get(c, c) for c in t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.casefold().replace("-", " ").replace("'", " ")
    return " ".join(t.split())


def _slugify_name(value: str) -> str:
    t = unicodedata.normalize("NFKD", value or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.casefold()
    out_chars: list[str] = []
    for ch in t:
        if ch.isalnum():
            out_chars.append(ch)
        else:
            out_chars.append("-")
    slug = "".join(out_chars)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug


def _load_football_logos_ac_cached() -> list[dict]:
    global _FOOTBALL_LOGOS_AC_CACHE
    with _FOOTBALL_LOGOS_AC_LOCK:
        if _FOOTBALL_LOGOS_AC_CACHE is not None:
            return _FOOTBALL_LOGOS_AC_CACHE
        raw = _fetch_text(FOOTBALL_LOGOS_AUTOCOMPLETE_URL, timeout=45.0)
        parsed = json.loads(raw)
        rows = [x for x in parsed if isinstance(x, dict)] if isinstance(parsed, list) else []
        _FOOTBALL_LOGOS_AC_CACHE = rows
        return _FOOTBALL_LOGOS_AC_CACHE


def _team_name_variants_for_match(value: str) -> set[str]:
    raw = str(value or "").strip()
    base = _name_key(raw)
    out: set[str] = set()

    def _push(v: str) -> None:
        t = " ".join(str(v or "").split()).strip()
        if not t:
            return
        out.add(t)
        compact = t.replace(" ", "")
        if compact:
            out.add(compact)

    def _trim_noise_tokens(v: str) -> str:
        tokens = [x for x in str(v or "").split() if x]
        if not tokens:
            return ""
        prefixes = {
            "fc",
            "cf",
            "afc",
            "ac",
            "sc",
            "fk",
            "if",
            "sv",
            "vfb",
            "cd",
            "ud",
            "rc",
            "real",
            "club",
            "deportivo",
            "athletic",
            "atletico",
            "sporting",
            "team",
        }
        suffixes = {
            "fc",
            "cf",
            "afc",
            "ac",
            "sc",
            "fk",
            "if",
            "sv",
            "club",
            "women",
            "w",
            "sad",
            "national",
            "team",
        }
        while len(tokens) > 1 and tokens[0] in prefixes:
            tokens = tokens[1:]
        while len(tokens) > 1 and tokens[-1] in suffixes:
            tokens = tokens[:-1]
        return " ".join(tokens).strip()

    if base:
        _push(base)
        trimmed = base
        for suffix in (" national team", " women", " w", " fc", " cf", " afc", " sc"):
            if trimmed.endswith(suffix):
                trimmed = trimmed[: -len(suffix)].strip()
        if trimmed:
            _push(trimmed)
        noise_trimmed = _trim_noise_tokens(base)
        if noise_trimmed:
            _push(noise_trimmed)
    slug_like = _slugify_name(raw).replace("-", " ").strip()
    if slug_like:
        _push(_name_key(slug_like))
    return out


def _football_logo_entry_values_for_match(row: dict) -> set[str]:
    values: set[str] = set()
    values |= _team_name_variants_for_match(str(row.get("name") or ""))
    values |= _team_name_variants_for_match(str(row.get("nativeName") or ""))
    for alt in row.get("altNames") if isinstance(row.get("altNames"), list) else []:
        values |= _team_name_variants_for_match(str(alt or ""))
    return values


def _best_name_similarity_score(wanted: set[str], values: set[str]) -> float:
    best = 0.0
    for a in wanted:
        if not a:
            continue
        for b in values:
            if not b:
                continue
            if a == b:
                return 1.0
            ratio = difflib.SequenceMatcher(None, a, b).ratio()
            if ratio > best:
                best = ratio
    return best


def _looks_like_non_team_logo(row: dict) -> bool:
    text = " ".join(
        [
            str(row.get("name") or ""),
            str(row.get("nativeName") or ""),
            str(row.get("categoryName") or ""),
        ]
    )
    k = _name_key(text)
    return any(
        token in k
        for token in (
            "league",
            "liga",
            "cup",
            "federation",
            "association",
            "confederation",
            "tournament",
            "world cup",
            "champions league",
        )
    )


def _score_football_logo_entry(
    row: dict,
    *,
    wanted: set[str],
    country_slug: str,
    country_key: str,
    league_key: str,
) -> int:
    values = _football_logo_entry_values_for_match(row)
    if not values:
        return -10_000
    score = 0

    overlap = wanted & values
    if overlap:
        score += 220

    similarity = _best_name_similarity_score(wanted, values)
    score += int(similarity * 160)

    wanted_compact = {w.replace(" ", "") for w in wanted if w}
    values_compact = {v.replace(" ", "") for v in values if v}
    for w in wanted_compact:
        if not w:
            continue
        if any((w in v or v in w) for v in values_compact):
            score += 30
            break

    category_id = _slugify_name(str(row.get("categoryId") or ""))
    category_name_key = _name_key(str(row.get("categoryName") or ""))
    if country_slug:
        if category_id == country_slug:
            score += 90
        else:
            score -= 25
    if country_key and category_name_key == country_key:
        score += 40

    if league_key:
        row_text_key = _name_key(
            " ".join(
                [
                    str(row.get("name") or ""),
                    str(row.get("nativeName") or ""),
                    " ".join(str(x or "") for x in (row.get("altNames") or []))
                    if isinstance(row.get("altNames"), list)
                    else "",
                ]
            )
        )
        if league_key and league_key in row_text_key:
            score += 20

    if _looks_like_non_team_logo(row) and not overlap and similarity < 0.92:
        score -= 45

    return score


def _resolve_football_logo_entry(
    team_name: str,
    country_hint: str = "",
    league_hint: str = "",
) -> dict | None:
    wanted = _team_name_variants_for_match(team_name)
    if not wanted:
        return None
    country_slug = _slugify_name(country_hint or "")
    country_key = _name_key(country_hint or "")
    league_key = _name_key(league_hint or "")
    rows = _load_football_logos_ac_cached()
    best_row: dict | None = None
    best_score = -10_000
    for row in rows:
        if not isinstance(row, dict):
            continue
        score = _score_football_logo_entry(
            row,
            wanted=wanted,
            country_slug=country_slug,
            country_key=country_key,
            league_key=league_key,
        )
        if score > best_score:
            best_row = row
            best_score = score
    if best_row is None:
        return None
    return best_row if best_score >= 70 else None


def _football_logo_png_candidates(entry: dict, preferred_dim: int = 3000) -> list[str]:
    category_id = str(entry.get("categoryId") or "").strip()
    team_id = str(entry.get("id") or "").strip()
    h = str(entry.get("h") or "").strip()
    if not category_id or not team_id:
        return []

    short_hash = h[:8] if len(h) >= 8 else ""
    dims: list[int] = []
    png_rows = entry.get("png")
    if isinstance(png_rows, list):
        for row in png_rows:
            if not isinstance(row, dict):
                continue
            try:
                d = int(row.get("dimension") or 0)
            except (TypeError, ValueError):
                d = 0
            if d > 0:
                dims.append(d)
    if preferred_dim not in dims:
        dims.insert(0, preferred_dim)
    dims = [d for d in dims if d > 0]
    seen: set[str] = set()
    urls: list[str] = []
    for d in dims:
        for u in (
            f"https://images.football-logos.cc/{category_id}/{d}/{team_id}.{short_hash}.png" if short_hash else "",
            f"https://assets.football-logos.cc/logos/{category_id}/{d}x{d}/{team_id}.{short_hash}.png" if short_hash else "",
        ):
            if not u or u in seen:
                continue
            seen.add(u)
            urls.append(u)
    return urls


def _try_fetch_football_logo_png_3000(
    team_name: str,
    country_hint: str = "",
    league_hint: str = "",
) -> tuple[bytes, dict] | None:
    entry = _resolve_football_logo_entry(
        team_name,
        country_hint=country_hint,
        league_hint=league_hint,
    )
    if not entry:
        return None
    page_url = (
        f"https://football-logos.cc/{urllib.parse.quote(str(entry.get('categoryId') or '').strip())}/"
        f"{urllib.parse.quote(str(entry.get('id') or '').strip())}/"
    )
    headers = {
        "User-Agent": HTTP_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": page_url,
    }
    for url in _football_logo_png_candidates(entry, preferred_dim=3000):
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=35.0, context=SSL_CTX) as r:
                data = r.read()
            if data:
                return data, entry
        except Exception:
            continue
    return None


def _resolve_team_logo_target(body: dict) -> tuple[Path, str]:
    team_name = _safe_path_component(body.get("teamName") or body.get("currentSquadName"))
    if not team_name:
        raise ValueError("Missing team name.")

    image_path_raw = str(body.get("targetRelativePath") or body.get("currentSquadImagePath") or "").strip().replace("\\", "/")
    if image_path_raw and not image_path_raw.startswith("/") and ".." not in image_path_raw:
        rel = Path(image_path_raw)
        target = (PROJECT_ROOT / rel).resolve()
        project_root_resolved = PROJECT_ROOT.resolve()
        if project_root_resolved in target.parents:
            return target, image_path_raw

    country = _safe_path_component(body.get("countryHint"))
    league = _safe_path_component(body.get("leagueHint"))
    if country and league:
        rel = f"Images/Teams/{country}/{league}/{team_name}.png"
        return (PROJECT_ROOT / rel).resolve(), rel

    rel = f"Images/Teams/(1) Other Teams/{team_name}.png"
    return (PROJECT_ROOT / rel).resolve(), rel


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


def _player_voice_paths_for_name(player_name: str) -> list[Path]:
    return [PLAYER_VOICE_DIR / f"{player_name}{ext}" for ext in PLAYER_VOICE_ALLOWED_EXTS]


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


def _normalize_ending_voice_inputs(
    ending_type: str | None,
) -> tuple[str, str, Path]:
    et = str(ending_type or "").strip()
    if et not in ENDING_VOICE_FILE_BY_TYPE:
        raise ValueError("Unsupported ending type.")
    filename = ENDING_VOICE_FILE_BY_TYPE[et]
    prompt = ENDING_VOICE_PROMPT_BY_TYPE.get(et) or filename.removesuffix(".mp3")
    return et, prompt, ENDING_VOICE_DIR / filename


def _project_relative_web_path(path: Path) -> str:
    rel_parts = path.relative_to(PROJECT_ROOT).parts
    return "/" + "/".join(quote(p, safe="") for p in rel_parts)


def _tts_prompt_name(name: str) -> str:
    base = str(name or "").strip()
    if not base:
        return base
    return base if base.endswith("!") else f"{base}!"


def _elevenlabs_api_key() -> str:
    return str(os.environ.get(ELEVENLABS_API_KEY_ENV) or "").strip() or DEFAULT_ELEVENLABS_API_KEY


def _resolve_elevenlabs_voice_id(requested_voice: str) -> str:
    raw = str(requested_voice or "").strip()
    # Accept direct ElevenLabs voice IDs from callers that send one.
    if re.fullmatch(r"[A-Za-z0-9]{20,}", raw):
        return raw
    configured = str(os.environ.get(ELEVENLABS_VOICE_ID_ENV) or "").strip()
    if configured:
        return configured
    return DEFAULT_ELEVENLABS_VOICE_ID


def _elevenlabs_model_id() -> str:
    return str(os.environ.get(ELEVENLABS_MODEL_ID_ENV) or "").strip() or DEFAULT_ELEVENLABS_MODEL_ID


def _elevenlabs_available() -> bool:
    return bool(_elevenlabs_api_key())


def _generate_elevenlabs_speech_mp3(text: str, requested_voice: str, out_path: Path) -> tuple[str, str]:
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


def _edge_tts_command() -> list[str]:
    return [sys.executable, "-m", "edge_tts"]


def _edge_tts_available() -> bool:
    try:
        result = subprocess.run(
            _edge_tts_command() + ["--help"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        if result.returncode == 0:
            return True
    except Exception:  # noqa: BLE001
        pass
    return shutil.which("edge-tts") is not None


def _resolve_edge_voice(requested_voice: str) -> str:
    requested_lower = (requested_voice or "").strip().lower()
    if requested_lower in OPENAI_TO_EDGE_VOICE_MAP:
        mapped = OPENAI_TO_EDGE_VOICE_MAP[requested_lower]
        return EDGE_TTS_VOICE_BY_LOWER.get(mapped.casefold(), FIXED_PLAYER_VOICE)
    if requested_lower in EDGE_TTS_VOICE_BY_LOWER:
        return EDGE_TTS_VOICE_BY_LOWER[requested_lower]
    return FIXED_PLAYER_VOICE


def _azure_speech_config() -> tuple[str, str] | None:
    key = str(os.environ.get(AZURE_SPEECH_KEY_ENV) or "").strip()
    region = str(os.environ.get(AZURE_SPEECH_REGION_ENV) or "").strip()
    if not key or not region:
        return None
    return key, region


def _build_azure_ssml(text: str, voice: str) -> str:
    escaped_text = xml_escape(str(text or ""))
    escaped_voice = xml_escape(str(voice or FIXED_PLAYER_VOICE))
    escaped_style = xml_escape(AZURE_SPEECH_STYLE)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">'
        f'<voice name="{escaped_voice}"><mstts:express-as style="{escaped_style}">'
        f"{escaped_text}</mstts:express-as></voice></speak>"
    )


def _generate_azure_speech_mp3(text: str, voice: str, out_path: Path) -> None:
    cfg = _azure_speech_config()
    if cfg is None:
        raise RuntimeError(
            "Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION "
            "to use Guy + cheerful style."
        )
    key, region = cfg
    endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    ssml = _build_azure_ssml(text, voice)
    req = urllib.request.Request(
        endpoint,
        data=ssml.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": AZURE_SPEECH_OUTPUT_FORMAT,
            "User-Agent": "Football-Channel-Runner",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            audio_bytes = resp.read()
    except urllib.error.HTTPError as exc:
        details = ""
        try:
            details = exc.read().decode("utf-8", "replace").strip()
        except Exception:
            details = ""
        raise RuntimeError(f"Azure TTS request failed ({exc.code}). {details[:250]}".strip()) from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Azure TTS request failed: {exc}") from exc
    if not audio_bytes:
        raise RuntimeError("Azure TTS returned empty audio.")
    out_path.write_bytes(audio_bytes)

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

        PLAYER_VOICE_DIR.mkdir(parents=True, exist_ok=True)
        out_path = PLAYER_VOICE_DIR / f"{player_name}.mp3"
        for old_path in _player_voice_paths_for_name(player_name):
            if old_path == out_path:
                continue
            if old_path.exists():
                old_path.unlink(missing_ok=True)

        provider = "elevenlabs"
        prompt_text = _tts_prompt_name(player_name)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, requested_voice, out_path)
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
                "provider": provider,
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
            requested_voice = str(body.get("voice") or FIXED_PLAYER_VOICE).strip()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        out_path.parent.mkdir(parents=True, exist_ok=True)
        provider = "elevenlabs"
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
                "provider": provider,
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
            )
            voice = str(body.get("voice") or FIXED_PLAYER_VOICE).strip()
            if not voice:
                raise ValueError("Unsupported voice.")
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        out_path.parent.mkdir(parents=True, exist_ok=True)
        provider = "elevenlabs"
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, voice, out_path)
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
                "provider": provider,
            },
        )
        return True

    def _try_delete_ending_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__ending-voice/delete":
            return False
        try:
            body = self._read_json_body()
            _ending_type, _prompt, out_path = _normalize_ending_voice_inputs(
                body.get("endingType"),
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

    def _try_fetch_team_logo(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__team-logo/fetch":
            return False
        try:
            body = self._read_json_body()
            team_name = str(body.get("teamName") or body.get("currentSquadName") or "").strip()
            if not team_name:
                raise ValueError("Missing team name.")
            country_hint = str(body.get("countryHint") or "").strip()
            league_hint = str(body.get("leagueHint") or "").strip()
            target_path, rel_path = _resolve_team_logo_target(body)
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return True

        try:
            fetched = _try_fetch_football_logo_png_3000(
                team_name,
                country_hint=country_hint,
                league_hint=league_hint,
            )
        except Exception:
            fetched = None
        if fetched is None:
            self._send_json(
                404,
                {"ok": False, "error": "Could not fetch logo from football-logos.cc."},
            )
            return True

        image_bytes, entry = fetched
        if not image_bytes:
            self._send_json(
                404,
                {"ok": False, "error": "Downloaded team logo is empty."},
            )
            return True
        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(image_bytes)
        except OSError:
            self._send_json(500, {"ok": False, "error": "Failed to write team logo file."})
            return True

        self._send_json(
            200,
            {
                "ok": True,
                "relativePath": rel_path.replace("\\", "/"),
                "source": "football-logos.cc",
                "matchedName": str(entry.get("name") or ""),
                "categoryId": str(entry.get("categoryId") or ""),
                "teamId": str(entry.get("id") or ""),
                "sha256": hashlib.sha256(image_bytes).hexdigest(),
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
        if self._try_serve_quiz_title_voice_status():
            return
        if self._try_serve_ending_voice_status():
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
        if self._try_generate_quiz_title_voice():
            return
        if self._try_delete_quiz_title_voice():
            return
        if self._try_generate_ending_voice():
            return
        if self._try_delete_ending_voice():
            return
        if self._try_fetch_team_logo():
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
