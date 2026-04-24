#!/usr/bin/env python3
# Run (no browser, PowerShell):
#   & "C:\Users\Rom\Desktop\‏‏תיקיה חדשה\Football Channel\Main Runner - Lineups - Shorts\run_site.bat" --no-browser
# macOS/Linux:
#   python3 "C:/Users/Rom/Desktop/‏‏תיקיה חדשה/Football Channel/Main Runner - Lineups - Shorts/run_site.py"
"""Serve Football Channel repo root; open this runner's index.html."""
from __future__ import annotations

import argparse
import csv
import difflib
import errno
import hashlib
import importlib.util
import json
import io
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
RUNNER_VARIANT = "Lineups Shorts"
SUPPORTED_LANGUAGES = ("english", "spanish")
DEFAULT_LANGUAGE = "english"
OTHER_TEAMS_LOGOS_DIR = PROJECT_ROOT / "Images/Teams" / "(1) Other Teams"
# Team name clips: shared across all runners + languages (team names are proper nouns;
# the ElevenLabs language_code controls the accent at generation time).
TEAM_VOICE_DIR_BY_QUIZ_TYPE = {
    "club-by-nat": PROJECT_ROOT / ".Storage" / "Voices" / "Team names",
    "nat-by-club": PROJECT_ROOT / ".Storage" / "Voices" / "Nationality teams names",
}
TEAM_VOICE_ALLOWED_EXTS = (".mp3", ".wav", ".m4a")
FIXED_TEAM_VOICE = "en-US-AndrewNeural"
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
        "nat-by-club": "Guess the football national team name by players' club !!!.mp3",
        "club-by-nat": "Guess the football team name by players' nationality !!!.mp3",
    },
    "spanish": {
        "nat-by-club": "Adivina el equipo nacional por el club de los jugadores !!!.mp3",
        "club-by-nat": "Adivina el equipo por la nacionalidad de los jugadores !!!.mp3",
    },
}
QUIZ_TITLE_PROMPT_BY_QUIZ_TYPE = {
    "english": {
        "nat-by-club": "GUESS THE FOOTBALL NATIONAL TEAM NAME BY PLAYERS' CLUB",
        "club-by-nat": "GUESS THE FOOTBALL TEAM NAME BY PLAYERS NATIONALITY",
    },
    "spanish": {
        "nat-by-club": "ADIVINA EL EQUIPO NACIONAL POR EL CLUB DE LOS JUGADORES",
        "club-by-nat": "ADIVINA EL EQUIPO POR LA NACIONALIDAD DE LOS JUGADORES",
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
EDGE_TTS_VOICES = (
    FIXED_TEAM_VOICE,
)
OPENAI_TO_EDGE_VOICE_MAP = {
    "en-us-guyneural": FIXED_TEAM_VOICE,
    "en-us-andrewneural": FIXED_TEAM_VOICE,
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
PLAYER_IMAGES_INDEX_PATH = PROJECT_ROOT / ".Storage" / "data" / "player-images.json"
PLAYER_IMAGE_OVERRIDES_PATH = PROJECT_ROOT / ".Storage" / "data" / "player-photo-overrides.json"
PLAYERS_IMAGES_CLUB_ROOT = PROJECT_ROOT / "Images/Players" / "Club images"
PLAYERS_IMAGES_NATIONALITY_ROOT = PROJECT_ROOT / "Images/Players" / "Nationality images"
FOOTBALL_LOGOS_AUTOCOMPLETE_URL = "https://football-logos.cc/ac.json"

EAFC26_CSV_URL = (
    "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv"
)
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
FUTGG_CARD_LINK_RE = re.compile(r"/players/\d+-[^/]+/26-(\d+)/", re.IGNORECASE)
FUTGG_PLAYER_ITEM_RE = re.compile(
    r'(https://game-assets\.fut\.gg/cdn-cgi/image/[^"\']+'
    r"/\d{4}/player-item/(26-\d+\.[a-f0-9]+\.webp))",
    re.IGNORECASE,
)
SITEMAP_PLAYER_URL_RE = re.compile(
    r"<loc>(https://www\.365scores\.com/football/player/[^<]+)</loc>",
    re.IGNORECASE,
)
_SPECIAL_CARD_KEYWORDS = (
    "road to",
    "fantasy",
    "birthday",
    "thunderstruck",
    "flashback",
    "showdown",
    "fut birthday",
    "toty",
    "tots",
    "ucl",
    "uel",
    "rttf",
    "captains",
    "knockout",
    "answer the call",
    "festival of football",
    "trophy titans",
    "future stars",
    "radioactive",
    "fc pro",
    "hero",
    "icon",
    "evolution",
)
_EA_ROWS_LOCK = threading.Lock()
_EA_ROWS_CACHE: list[dict[str, str]] | None = None
_SITEMAP_PLAYER_URLS_LOCK = threading.Lock()
_SITEMAP_PLAYER_URLS_CACHE: list[str] | None = None
_PLAYER_IMAGES_INDEX_LOCK = threading.Lock()
_PLAYER_OVERRIDES_LOCK = threading.Lock()
_PLAYER_OVERRIDES_CACHE: dict[str, dict[str, str]] | None = None
_COMPETITOR_SEARCH_LOCK = threading.Lock()
_COMPETITOR_ID_BY_NAME_CACHE: dict[str, int] = {}
_COMPETITOR_SQUAD_LOCK = threading.Lock()
_COMPETITOR_SQUAD_CACHE: dict[int, list[dict]] = {}
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


def _fetch_bytes(url: str, *, timeout: float = 35.0) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": HTTP_USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read()


def _safe_path_component(raw: object) -> str:
    t = str(raw or "").strip()
    t = t.replace("/", "").replace("\\", "").replace("..", "")
    for ch in '<>:"|?*':
        t = t.replace(ch, "")
    return t.strip(". ")


def _name_key(s: object) -> str:
    t = unicodedata.normalize("NFKD", str(s or ""))
    # Normalize letters that NFKD does not split to plain ASCII (e.g. Guðmundsson -> gudmundsson).
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


def _load_ea_rows_cached() -> list[dict[str, str]]:
    global _EA_ROWS_CACHE
    with _EA_ROWS_LOCK:
        if _EA_ROWS_CACHE is not None:
            return _EA_ROWS_CACHE
        raw = _fetch_text(EAFC26_CSV_URL, timeout=60.0)
        rows = list(csv.DictReader(io.StringIO(raw)))
        _EA_ROWS_CACHE = rows
        return rows


def _name_tokens_match(display_name: str, short_name: str, long_name: str) -> bool:
    if not display_name:
        return False
    if display_name == short_name or display_name == long_name:
        return True
    if display_name in long_name:
        return True
    d = display_name.split()
    l = long_name.split()
    s = short_name.replace(".", "").split()
    if not d:
        return False
    if len(d) >= 2 and d[-1] in l:
        # First + family-name present anywhere in legal long name.
        if l and (l[0].startswith(d[0]) or d[0].startswith(l[0])):
            return True
        if len(s) >= 2 and s[-1] == d[-1] and d[0].startswith(s[0]):
            return True
    if len(d) >= 2 and len(l) >= 2 and d[-1] == l[-1]:
        df = d[0]
        lf = l[0]
        if lf.startswith(df) or df.startswith(lf):
            return True
        if s and s[0] and df and s[0][0] == df[0]:
            return True
    return False


def _resolve_player_id(player_name: str, player_club: str, player_nationality: str) -> int | None:
    nk = _name_key(player_name)
    if not nk:
        return None
    club_key = _name_key(player_club)
    nat_key = _name_key(player_nationality)
    rows = _load_ea_rows_cached()
    candidates: list[dict[str, str]] = []
    for row in rows:
        short_name = _name_key(row.get("short_name") or "")
        long_name = _name_key(row.get("long_name") or "")
        if _name_tokens_match(nk, short_name, long_name):
            candidates.append(row)
    if not candidates:
        return None
    if club_key:
        club_matches = [r for r in candidates if _name_key(r.get("club_name") or "") == club_key]
        if club_matches:
            candidates = club_matches
    if nat_key:
        nat_matches = [r for r in candidates if _name_key(r.get("nationality_name") or "") == nat_key]
        if nat_matches:
            candidates = nat_matches
    try:
        return int((candidates[0].get("player_id") or "").strip())
    except ValueError:
        return None


def _resolve_futgg_hub_url(player_id: int) -> str:
    req = urllib.request.Request(
        f"https://www.fut.gg/players/{player_id}/",
        headers={"User-Agent": HTTP_USER_AGENT},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=35.0, context=SSL_CTX) as r:
        final = r.geturl().rstrip("/")
    if not re.match(r"^https://www\.fut\.gg/players/\d+-", final):
        raise RuntimeError("FUT.GG player hub was not found.")
    return final


def _futgg_player_item_urls_from_card_html(html: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for m in FUTGG_PLAYER_ITEM_RE.finditer(html):
        url = m.group(1)
        if "player-item-social" in url or "social-small" in url:
            continue
        if "game-assets.fut.gg" not in url:
            continue
        key = m.group(2)
        if key in seen:
            continue
        seen.add(key)
        out.append(url)
    preferred = [u for u in out if "width=300" in u]
    return preferred if preferred else out


def _is_regular_futgg_card(card_html: str) -> bool:
    title_match = re.search(r"<title>(.*?)</title>", card_html, flags=re.IGNORECASE | re.DOTALL)
    title = (title_match.group(1) if title_match else "").lower()
    return not any(k in title for k in _SPECIAL_CARD_KEYWORDS)


def _try_fetch_futgg_photo(player_name: str, player_club: str, player_nationality: str) -> tuple[bytes, str] | None:
    player_id = _resolve_player_id(player_name, player_club, player_nationality)
    if player_id is None:
        return None
    hub = _resolve_futgg_hub_url(player_id)
    hub_html = _fetch_text(hub + "/")
    item_ids = [int(m.group(1)) for m in FUTGG_CARD_LINK_RE.finditer(hub_html)]
    if not item_ids:
        return None
    seen_ids: set[int] = set()
    card_ids: list[int] = []
    for iid in item_ids:
        if iid in seen_ids:
            continue
        seen_ids.add(iid)
        card_ids.append(iid)
    regular_candidates = sorted(card_ids, reverse=True)
    fallback_candidates = list(regular_candidates)
    for iid in regular_candidates:
        card_html = _fetch_text(f"{hub}/26-{iid}/")
        if not _is_regular_futgg_card(card_html):
            continue
        urls = _futgg_player_item_urls_from_card_html(card_html)
        if not urls:
            continue
        return _fetch_bytes(urls[0]), "fut.gg"
    for iid in fallback_candidates:
        card_html = _fetch_text(f"{hub}/26-{iid}/")
        urls = _futgg_player_item_urls_from_card_html(card_html)
        if not urls:
            continue
        return _fetch_bytes(urls[0]), "fut.gg"
    return None


def _futgg_candidate_image_urls(
    player_name: str,
    player_club: str,
    player_nationality: str,
) -> list[str]:
    player_id = _resolve_player_id(player_name, player_club, player_nationality)
    if player_id is None:
        return []
    hub = _resolve_futgg_hub_url(player_id)
    hub_html = _fetch_text(hub + "/")
    item_ids = [int(m.group(1)) for m in FUTGG_CARD_LINK_RE.finditer(hub_html)]
    if not item_ids:
        return []
    seen_ids: set[int] = set()
    card_ids: list[int] = []
    for iid in item_ids:
        if iid in seen_ids:
            continue
        seen_ids.add(iid)
        card_ids.append(iid)
    ordered_ids = sorted(card_ids, reverse=True)
    regular_urls: list[str] = []
    fallback_urls: list[str] = []
    seen_urls: set[str] = set()
    for iid in ordered_ids:
        card_html = _fetch_text(f"{hub}/26-{iid}/")
        urls = _futgg_player_item_urls_from_card_html(card_html)
        if not urls:
            continue
        bucket = regular_urls if _is_regular_futgg_card(card_html) else fallback_urls
        for url in urls:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            bucket.append(url)
    return regular_urls + fallback_urls


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


def _load_player_photo_overrides() -> dict[str, dict[str, str]]:
    global _PLAYER_OVERRIDES_CACHE
    with _PLAYER_OVERRIDES_LOCK:
        if _PLAYER_OVERRIDES_CACHE is not None:
            return _PLAYER_OVERRIDES_CACHE
        if not PLAYER_IMAGE_OVERRIDES_PATH.is_file():
            _PLAYER_OVERRIDES_CACHE = {}
            return _PLAYER_OVERRIDES_CACHE
        try:
            raw = json.loads(PLAYER_IMAGE_OVERRIDES_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            _PLAYER_OVERRIDES_CACHE = {}
            return _PLAYER_OVERRIDES_CACHE
        by_name = raw.get("byName") if isinstance(raw, dict) else {}
        if not isinstance(by_name, dict):
            _PLAYER_OVERRIDES_CACHE = {}
            return _PLAYER_OVERRIDES_CACHE
        out: dict[str, dict[str, str]] = {}
        for k, v in by_name.items():
            if not isinstance(v, dict):
                continue
            nk = _name_key(k)
            if not nk:
                continue
            item: dict[str, str] = {}
            profile_url = str(v.get("profileUrl") or "").strip()
            image_url = str(v.get("imageUrl") or "").strip()
            athlete_id = str(v.get("athleteId") or "").strip()
            if profile_url:
                item["profileUrl"] = profile_url
            if image_url:
                item["imageUrl"] = image_url
            if athlete_id:
                item["athleteId"] = athlete_id
            if item:
                out[nk] = item
        _PLAYER_OVERRIDES_CACHE = out
        return _PLAYER_OVERRIDES_CACHE


def _image_url_from_athlete_id(athlete_id: str) -> str:
    return (
        "https://imagecache.365scores.com/image/upload/"
        "f_png,w_320,h_320,c_limit,q_auto:eco,dpr_2,d_Athletes:default.png,"
        f"r_max,c_thumb,g_face,z_0.65/Athletes/{athlete_id}"
    )


def _resolve_365_competitor_id(team_name: str) -> int | None:
    nk = _name_key(team_name)
    if not nk:
        return None
    with _COMPETITOR_SEARCH_LOCK:
        if nk in _COMPETITOR_ID_BY_NAME_CACHE:
            return _COMPETITOR_ID_BY_NAME_CACHE[nk]
    query = urllib.parse.quote(team_name.strip())
    url = f"https://webws.365scores.com/web/search/?q={query}&langId=1&sportId=1"
    payload = _fetch_text(url, timeout=30.0)
    data = json.loads(payload)
    competitors = data.get("competitors") if isinstance(data, dict) else []
    if not isinstance(competitors, list):
        competitors = []
    best_id: int | None = None
    for item in competitors:
        if not isinstance(item, dict):
            continue
        if int(item.get("sportId") or 0) != 1:
            continue
        if int(item.get("type") or 0) != 1:
            continue
        names = [
            _name_key(item.get("name") or ""),
            _name_key(item.get("shortName") or ""),
            _name_key(item.get("longName") or ""),
        ]
        if nk in names:
            try:
                best_id = int(item.get("id"))
            except (TypeError, ValueError):
                best_id = None
            if best_id:
                break
    if best_id is None:
        for item in competitors:
            if not isinstance(item, dict):
                continue
            if int(item.get("sportId") or 0) != 1:
                continue
            if int(item.get("type") or 0) != 1:
                continue
            names = " ".join(
                [
                    _name_key(item.get("name") or ""),
                    _name_key(item.get("shortName") or ""),
                    _name_key(item.get("longName") or ""),
                ]
            )
            if nk and nk in names:
                try:
                    best_id = int(item.get("id"))
                except (TypeError, ValueError):
                    best_id = None
                if best_id:
                    break
    with _COMPETITOR_SEARCH_LOCK:
        _COMPETITOR_ID_BY_NAME_CACHE[nk] = best_id or 0
    return best_id


def _load_365_competitor_squad(competitor_id: int) -> list[dict]:
    if competitor_id <= 0:
        return []
    with _COMPETITOR_SQUAD_LOCK:
        if competitor_id in _COMPETITOR_SQUAD_CACHE:
            return _COMPETITOR_SQUAD_CACHE[competitor_id]
    url = f"https://webws.365scores.com/web/squads/?competitors={competitor_id}&sportId=1&langId=1"
    payload = _fetch_text(url, timeout=30.0)
    data = json.loads(payload)
    squads = data.get("squads") if isinstance(data, dict) else []
    athletes: list[dict] = []
    if isinstance(squads, list):
        for s in squads:
            if not isinstance(s, dict):
                continue
            rows = s.get("athletes")
            if isinstance(rows, list):
                athletes.extend(x for x in rows if isinstance(x, dict))
    with _COMPETITOR_SQUAD_LOCK:
        _COMPETITOR_SQUAD_CACHE[competitor_id] = athletes
    return athletes


def _athlete_name_match(player_name: str, athlete_row: dict) -> bool:
    nk = _name_key(player_name)
    if not nk:
        return False
    full = _name_key(athlete_row.get("name") or "")
    short = _name_key(athlete_row.get("shortName") or "")
    if nk == full or nk == short:
        return True
    if full and nk in full:
        return True
    d = nk.split()
    f = full.split()
    s = short.replace(".", "").split()
    if len(d) >= 2 and len(f) >= 2 and d[-1] == f[-1]:
        if f[0].startswith(d[0]) or d[0].startswith(f[0]):
            return True
        if len(s) >= 2 and s[-1] == d[-1] and d[0].startswith(s[0]):
            return True
    return False


def _load_365scores_player_urls() -> list[str]:
    global _SITEMAP_PLAYER_URLS_CACHE
    with _SITEMAP_PLAYER_URLS_LOCK:
        if _SITEMAP_PLAYER_URLS_CACHE is not None:
            return _SITEMAP_PLAYER_URLS_CACHE
        urls: list[str] = []
        for sitemap_url in (
            "https://www.365scores.com/sitemaps/en_football.xml",
            "https://www.365scores.com/sitemaps/en_football_1.xml",
            "https://www.365scores.com/sitemaps/en_football_2.xml",
            "https://www.365scores.com/sitemaps/en_football_3.xml",
        ):
            xml_text = _fetch_text(sitemap_url, timeout=45.0)
            urls.extend(m.group(1) for m in SITEMAP_PLAYER_URL_RE.finditer(xml_text))
        deduped: list[str] = []
        seen: set[str] = set()
        for u in urls:
            if u in seen:
                continue
            seen.add(u)
            deduped.append(u)
        _SITEMAP_PLAYER_URLS_CACHE = deduped
        return deduped


def _try_fetch_365scores_photo(player_name: str, player_club: str = "") -> tuple[bytes, str] | None:
    nk = _name_key(player_name)
    overrides = _load_player_photo_overrides()
    ov = overrides.get(nk)
    if ov:
        image_url = ov.get("imageUrl", "")
        if not image_url:
            athlete_id = ov.get("athleteId", "")
            if not athlete_id:
                m = re.search(r"-(\d+)$", (ov.get("profileUrl") or "").rstrip("/"))
                athlete_id = m.group(1) if m else ""
            if athlete_id:
                image_url = _image_url_from_athlete_id(athlete_id)
        if image_url:
            return _fetch_bytes(image_url), "365scores"

    if player_club.strip():
        competitor_id = _resolve_365_competitor_id(player_club)
        if competitor_id:
            athletes = _load_365_competitor_squad(competitor_id)
            for a in athletes:
                if not _athlete_name_match(player_name, a):
                    continue
                athlete_id = str(a.get("id") or "").strip()
                if athlete_id:
                    return _fetch_bytes(_image_url_from_athlete_id(athlete_id)), "365scores"

    slug = _slugify_name(player_name)
    if not slug:
        return None
    urls = _load_365scores_player_urls()
    exact = [u for u in urls if f"/{slug}-" in u]
    candidates = exact if exact else [u for u in urls if slug in u]
    if not candidates:
        return None
    profile_url = candidates[0]
    m = re.search(r"-(\d+)$", profile_url.rstrip("/"))
    if not m:
        return None
    athlete_id = m.group(1)
    image_url = _image_url_from_athlete_id(athlete_id)
    return _fetch_bytes(image_url), "365scores"


def _365scores_candidate_image_urls(player_name: str, player_club: str = "") -> list[str]:
    nk = _name_key(player_name)
    out: list[str] = []
    seen: set[str] = set()

    def _push(url: str) -> None:
        u = str(url or "").strip()
        if not u or u in seen:
            return
        seen.add(u)
        out.append(u)

    overrides = _load_player_photo_overrides()
    ov = overrides.get(nk)
    if ov:
        image_url = ov.get("imageUrl", "")
        if not image_url:
            athlete_id = ov.get("athleteId", "")
            if not athlete_id:
                m = re.search(r"-(\d+)$", (ov.get("profileUrl") or "").rstrip("/"))
                athlete_id = m.group(1) if m else ""
            if athlete_id:
                image_url = _image_url_from_athlete_id(athlete_id)
        _push(image_url)

    if player_club.strip():
        competitor_id = _resolve_365_competitor_id(player_club)
        if competitor_id:
            athletes = _load_365_competitor_squad(competitor_id)
            for a in athletes:
                if not _athlete_name_match(player_name, a):
                    continue
                athlete_id = str(a.get("id") or "").strip()
                if athlete_id:
                    _push(_image_url_from_athlete_id(athlete_id))

    slug = _slugify_name(player_name)
    if slug:
        urls = _load_365scores_player_urls()
        exact = [u for u in urls if f"/{slug}-" in u]
        candidates = exact if exact else [u for u in urls if slug in u]
        for profile_url in candidates:
            m = re.search(r"-(\d+)$", str(profile_url).rstrip("/"))
            if not m:
                continue
            _push(_image_url_from_athlete_id(m.group(1)))

    return out


def _resolve_player_image_target(body: dict) -> tuple[Path, str, str]:
    player_name = _safe_path_component(body.get("playerName"))
    if not player_name:
        raise ValueError("Missing player name.")
    squad_type = str(body.get("squadType") or "").strip().lower()
    selected_entry = body.get("selectedEntry") if isinstance(body.get("selectedEntry"), dict) else {}
    current_squad_name = _safe_path_component(body.get("currentSquadName"))
    if squad_type == "club":
        country = _safe_path_component(selected_entry.get("country"))
        league = _safe_path_component(selected_entry.get("league"))
        club_name = _safe_path_component(current_squad_name or selected_entry.get("name"))
        if not country or not league or not club_name:
            raise ValueError("Missing club folder context.")
        target_dir = PLAYERS_IMAGES_CLUB_ROOT / country / league / club_name / player_name
        key = f"{country}|{league}|{club_name}|{player_name}"
        return target_dir, "club", key
    region = _safe_path_component(selected_entry.get("region"))
    country = _safe_path_component(selected_entry.get("name") or current_squad_name)
    if not region or not country:
        raise ValueError("Missing nationality folder context.")
    target_dir = PLAYERS_IMAGES_NATIONALITY_ROOT / region / country / player_name
    key = f"{region}|{country}|{player_name}"
    return target_dir, "nationality", key


def _update_player_images_index(index_section: str, index_key: str, rel_path: str) -> None:
    with _PLAYER_IMAGES_INDEX_LOCK:
        if PLAYER_IMAGES_INDEX_PATH.is_file():
            try:
                payload = json.loads(PLAYER_IMAGES_INDEX_PATH.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {}
        else:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        club_map = payload.get("club") if isinstance(payload.get("club"), dict) else {}
        nat_map = payload.get("nationality") if isinstance(payload.get("nationality"), dict) else {}
        payload["club"] = club_map
        payload["nationality"] = nat_map
        target_map = club_map if index_section == "club" else nat_map
        current = target_map.get(index_key)
        if isinstance(current, list):
            entries = [x for x in current if isinstance(x, str) and x.strip()]
        elif isinstance(current, str) and current.strip():
            entries = [current.strip()]
        else:
            entries = []
        if rel_path not in entries:
            entries.insert(0, rel_path)
        target_map[index_key] = entries
        PLAYER_IMAGES_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        PLAYER_IMAGES_INDEX_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def _remove_player_image_from_index(rel_path: str) -> bool:
    rel = str(rel_path or "").strip().replace("\\", "/")
    if not rel:
        return False
    changed = False
    with _PLAYER_IMAGES_INDEX_LOCK:
        if PLAYER_IMAGES_INDEX_PATH.is_file():
            try:
                payload = json.loads(PLAYER_IMAGES_INDEX_PATH.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = {}
        else:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        for section in ("club", "nationality"):
            section_map = payload.get(section)
            if not isinstance(section_map, dict):
                continue
            for key in list(section_map.keys()):
                current = section_map.get(key)
                if isinstance(current, list):
                    cleaned = [x for x in current if isinstance(x, str) and x.strip().replace("\\", "/") != rel]
                    if len(cleaned) != len(current):
                        changed = True
                    if cleaned:
                        section_map[key] = cleaned
                    else:
                        section_map.pop(key, None)
                elif isinstance(current, str):
                    if current.strip().replace("\\", "/") == rel:
                        changed = True
                        section_map.pop(key, None)
        if changed:
            PLAYER_IMAGES_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
            PLAYER_IMAGES_INDEX_PATH.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
    return changed


def _known_photo_hashes_for_target_dir(target_dir: Path) -> set[str]:
    out: set[str] = set()
    if not target_dir.is_dir():
        return out
    try:
        for p in target_dir.iterdir():
            if not p.is_file():
                continue
            try:
                out.add(hashlib.sha256(p.read_bytes()).hexdigest())
            except OSError:
                continue
    except OSError:
        return out
    return out


def _fetch_first_new_photo(urls: list[str], source: str, known_hashes: set[str]) -> tuple[bytes, str] | None:
    for url in urls:
        try:
            image_bytes = _fetch_bytes(url)
        except Exception:
            continue
        if not image_bytes:
            continue
        digest = hashlib.sha256(image_bytes).hexdigest()
        if digest in known_hashes:
            continue
        known_hashes.add(digest)
        return image_bytes, source
    return None


def _next_auto_photo_path(target_dir: Path, source: str) -> Path:
    base = f"Auto - {source}"
    first = target_dir / f"{base}.png"
    if not first.exists():
        return first
    idx = 2
    while True:
        candidate = target_dir / f"{base} - {idx}.png"
        if not candidate.exists():
            return candidate
        idx += 1


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
        # Strip common team/company wrappers so partial names still match (e.g. "FC Ashdod" -> "ashdod").
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

    # Reward common partial cases ("benfica", "porto", "ashdod") without requiring strict equality.
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
    # Guardrail: avoid selecting very weak fuzzy matches.
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
    squad_type = str(body.get("squadType") or "").strip().lower()
    selected_entry = body.get("selectedEntry") if isinstance(body.get("selectedEntry"), dict) else {}
    squad_name = _safe_path_component(body.get("currentSquadName") or selected_entry.get("name"))
    if not squad_name:
        raise ValueError("Missing team name.")

    image_path_raw = str(body.get("currentSquadImagePath") or "").strip().replace("\\", "/")
    if image_path_raw and not image_path_raw.startswith("/") and ".." not in image_path_raw:
        rel = Path(image_path_raw)
        target = (PROJECT_ROOT / rel).resolve()
        project_root_resolved = PROJECT_ROOT.resolve()
        if project_root_resolved in target.parents:
            return target, image_path_raw

    if squad_type == "club":
        country = _safe_path_component(selected_entry.get("country"))
        league = _safe_path_component(selected_entry.get("league"))
        if country and league:
            rel = f"Images/Teams/{country}/{league}/{squad_name}.png"
            return (PROJECT_ROOT / rel).resolve(), rel

    rel = f"Images/Teams/(1) Other Teams/{squad_name}.png"
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


def _normalize_team_voice_inputs(name: str | None, quiz_type: str | None) -> tuple[str, Path]:
    team_name = (name or "").strip()
    q = "club-by-nat" if (quiz_type or "").strip() == "club-by-nat" else "nat-by-club"
    target_dir = TEAM_VOICE_DIR_BY_QUIZ_TYPE[q]
    if not team_name:
        raise ValueError("Missing team name.")
    if not _is_valid_windows_filename_stem(team_name):
        raise ValueError("Team name has unsupported filename characters for Windows.")
    return team_name, target_dir


def _team_voice_paths_for_name(team_name: str, target_dir: Path) -> list[Path]:
    return [target_dir / f"{team_name}{ext}" for ext in TEAM_VOICE_ALLOWED_EXTS]


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
        safe_specific = _safe_path_component(clean_specific)[:140].strip()
        out_name = f"{qt} + {safe_specific}.mp3" if safe_specific else filename
    else:
        prompt = base_prompt
        out_name = filename
    return qt, prompt, QUIZ_TITLE_VOICE_DIR / lang / out_name


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


def _edge_tts_command() -> list[str] | None:
    return [sys.executable, "-m", "edge_tts"]


def _edge_tts_available() -> bool:
    module_cmd = _edge_tts_command()
    try:
        result = subprocess.run(
            module_cmd + ["--help"],
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
        return EDGE_TTS_VOICE_BY_LOWER.get(mapped.casefold(), FIXED_TEAM_VOICE)
    if requested_lower in EDGE_TTS_VOICE_BY_LOWER:
        return EDGE_TTS_VOICE_BY_LOWER[requested_lower]
    return FIXED_TEAM_VOICE


def _azure_speech_config() -> tuple[str, str] | None:
    key = str(os.environ.get(AZURE_SPEECH_KEY_ENV) or "").strip()
    region = str(os.environ.get(AZURE_SPEECH_REGION_ENV) or "").strip()
    if not key or not region:
        return None
    return key, region


def _build_azure_ssml(text: str, voice: str) -> str:
    escaped_text = xml_escape(str(text or ""))
    escaped_voice = xml_escape(str(voice or FIXED_TEAM_VOICE))
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
        with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
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


def _load_runner_json_blob():  # noqa: D401
    path = PROJECT_ROOT / ".Storage" / "Scripts" / "dev_server_runner_blob.py"
    spec = importlib.util.spec_from_file_location("_fc_runner_json_blob", path)
    mod = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Cannot load dev_server_runner_blob.py")
    spec.loader.exec_module(mod)
    return mod


_runner_blob_mod = _load_runner_json_blob()

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
        """True for image URLs so level switches reuse the same <img> src without re-downloading."""
        path = unquote(urlparse(self.path).path).lower()
        return path.endswith(self._CACHEABLE_ASSET_SUFFIXES)

    def end_headers(self) -> None:  # noqa: D401
        # Dev runner: bypass cache for HTML/JS/CSS/JSON so edits and reloads stay fresh.
        # Allow caching for images: renderPitch() rebuilds DOM on each level switch; without
        # cache headers the dev server forces a full re-fetch. projectAssetUrlFresh() adds
        # ?v= per page load so a full refresh still gets new URLs.
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

    def _try_serve_other_teams_logos_json(self) -> bool:
        path = unquote(urlparse(self.path).path)
        if path.rstrip("/") != "/__other-teams-logos.json":
            return False
        names: list[str] = []
        if OTHER_TEAMS_LOGOS_DIR.is_dir():
            for entry in sorted(OTHER_TEAMS_LOGOS_DIR.iterdir()):
                if entry.is_file() and entry.suffix.lower() == ".png":
                    names.append(entry.stem)
        payload = json.dumps(
            {"dir": "Images/Teams/(1) Other Teams", "names": names},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(payload)
        return True

    def _write_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
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

    def _try_serve_team_voice_voices(self) -> bool:
        path = unquote(urlparse(self.path).path).rstrip("/")
        if path != "/__team-voice/voices":
            return False
        provider = "elevenlabs" if _elevenlabs_available() else "none"
        model = _elevenlabs_model_id()
        voices = []
        try:
            voices = [_resolve_elevenlabs_voice_id("")]
        except RuntimeError:
            voices = []
        self._write_json(
            200,
            {
                "ok": True,
                "provider": provider,
                "model": model,
                "voices": voices,
            },
        )
        return True

    def _try_serve_team_voice_status(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__team-voice/status":
            return False
        query = {}
        for part in parsed.query.split("&"):
            if not part:
                continue
            k, _, v = part.partition("=")
            query[unquote(k)] = unquote(v.replace("+", " "))
        try:
            team_name, target_dir = _normalize_team_voice_inputs(
                query.get("name"),
                query.get("quizType"),
            )
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        existing_path = None
        for file_path in _team_voice_paths_for_name(team_name, target_dir):
            if file_path.is_file():
                existing_path = file_path
                break
        self._write_json(
            200,
            {
                "ok": True,
                "exists": bool(existing_path),
                "src": _project_relative_web_path(existing_path) if existing_path else "",
            },
        )
        return True

    def _try_generate_team_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__team-voice/generate":
            return False
        try:
            body = self._read_json_body()
            team_name, target_dir = _normalize_team_voice_inputs(body.get("name"), body.get("quizType"))
            voice = str(body.get("voice") or FIXED_TEAM_VOICE).strip()
            if not voice:
                raise ValueError("Unsupported voice.")
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        language = _normalize_language(body.get("language"))
        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = target_dir / f"{team_name}.mp3"
        for old_path in _team_voice_paths_for_name(team_name, target_dir):
            if old_path == out_path:
                continue
            if old_path.exists():
                old_path.unlink(missing_ok=True)

        provider = "elevenlabs"
        prompt_text = _tts_prompt_name(team_name)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._write_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._write_json(
                502,
                {
                    "ok": False,
                    "error": "ElevenLabs generation failed.",
                },
            )
            return True

        self._write_json(
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

    def _try_delete_team_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__team-voice/delete":
            return False
        try:
            body = self._read_json_body()
            team_name, target_dir = _normalize_team_voice_inputs(body.get("name"), body.get("quizType"))
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        removed = 0
        for file_path in _team_voice_paths_for_name(team_name, target_dir):
            if file_path.exists():
                file_path.unlink(missing_ok=True)
                removed += 1
        self._write_json(200, {"ok": True, "removed": removed})
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
                query.get("language"),
            )
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        self._write_json(
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
                body.get("language"),
            )
            voice = str(body.get("voice") or FIXED_TEAM_VOICE).strip()
            if not voice:
                raise ValueError("Unsupported voice.")
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        language = _normalize_language(body.get("language"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        provider = "elevenlabs"
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._write_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._write_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._write_json(
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
                body.get("language"),
            )
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        removed = 0
        if out_path.exists():
            out_path.unlink(missing_ok=True)
            removed = 1
        self._write_json(200, {"ok": True, "removed": removed})
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
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        self._write_json(
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
            voice = str(body.get("voice") or FIXED_TEAM_VOICE).strip()
            if not voice:
                raise ValueError("Unsupported voice.")
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        language = _normalize_language(body.get("language"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        provider = "elevenlabs"
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._write_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._write_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._write_json(
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
                body.get("language"),
            )
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        removed = 0
        if out_path.exists():
            out_path.unlink(missing_ok=True)
            removed = 1
        self._write_json(200, {"ok": True, "removed": removed})
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
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        self._write_json(200, {"ok": True, "exists": out_path.is_file(),
                               "src": _project_relative_web_path(out_path) if out_path.is_file() else ""})
        return True

    def _try_generate_bundled_voice(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__bundled-voice/generate":
            return False
        try:
            body = self._read_json_body()
            _key, prompt_text, out_path = _normalize_bundled_voice_inputs(body.get("key"), body.get("language"))
            requested_voice = str(body.get("voice") or FIXED_TEAM_VOICE).strip()
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        language = _normalize_language(body.get("language"))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            chosen_voice, model = _generate_elevenlabs_speech_mp3(prompt_text, requested_voice, out_path, language)
        except Exception as exc:  # noqa: BLE001
            self._write_json(502, {"ok": False, "error": str(exc)})
            return True
        if not out_path.exists() or out_path.stat().st_size <= 0:
            self._write_json(502, {"ok": False, "error": "ElevenLabs generation failed."})
            return True
        self._write_json(200, {"ok": True, "src": _project_relative_web_path(out_path),
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
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True
        removed = 0
        if out_path.exists():
            out_path.unlink(missing_ok=True)
            removed = 1
        self._write_json(200, {"ok": True, "removed": removed})
        return True

    def _try_delete_player_photo(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-photo/delete":
            return False
        try:
            body = self._read_json_body()
            rel_path_raw = str(body.get("relPath") or "").strip()
            if not rel_path_raw:
                raise ValueError("Missing photo path.")
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        rel_path = rel_path_raw.replace("\\", "/").lstrip("/")
        project_root_resolved = PROJECT_ROOT.resolve()
        target_path = (PROJECT_ROOT / rel_path).resolve()
        if project_root_resolved not in target_path.parents and target_path != project_root_resolved:
            self._write_json(400, {"ok": False, "error": "Invalid photo path."})
            return True

        removed_file = False
        if target_path.exists() and target_path.is_file():
            try:
                target_path.unlink()
                removed_file = True
            except OSError:
                self._write_json(500, {"ok": False, "error": "Failed to delete photo file."})
                return True

        removed_index = _remove_player_image_from_index(rel_path)
        if not removed_file and not removed_index:
            self._write_json(404, {"ok": False, "error": "Photo not found."})
            return True

        self._write_json(200, {"ok": True, "removedFile": removed_file, "removedIndex": removed_index})
        return True

    def _try_fetch_team_logo(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__team-logo/fetch":
            return False
        try:
            body = self._read_json_body()
            squad_name = str(body.get("currentSquadName") or "").strip()
            if not squad_name:
                raise ValueError("Missing team name.")
            squad_type = str(body.get("squadType") or "").strip().lower()
            selected_entry = body.get("selectedEntry") if isinstance(body.get("selectedEntry"), dict) else {}
            country_hint = ""
            league_hint = ""
            if squad_type == "club":
                country_hint = str(selected_entry.get("country") or "").strip()
                league_hint = str(selected_entry.get("league") or "").strip()
            else:
                country_hint = str(selected_entry.get("name") or "").strip()
            target_path, rel_path = _resolve_team_logo_target(body)
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        try:
            fetched = _try_fetch_football_logo_png_3000(
                squad_name,
                country_hint=country_hint,
                league_hint=league_hint,
            )
        except Exception:
            fetched = None
        if fetched is None:
            self._write_json(
                404,
                {"ok": False, "error": "Could not fetch logo from football-logos.cc."},
            )
            return True

        image_bytes, entry = fetched
        if not image_bytes:
            self._write_json(
                404,
                {"ok": False, "error": "Downloaded team logo is empty."},
            )
            return True
        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(image_bytes)
        except OSError:
            self._write_json(500, {"ok": False, "error": "Failed to write team logo file."})
            return True

        self._write_json(
            200,
            {
                "ok": True,
                "relativePath": rel_path.replace("\\", "/"),
                "source": "football-logos.cc",
                "matchedName": str(entry.get("name") or ""),
                "categoryId": str(entry.get("categoryId") or ""),
                "teamId": str(entry.get("id") or ""),
            },
        )
        return True

    def _try_auto_fetch_player_photo(self) -> bool:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/__player-photo/auto-fetch":
            return False
        try:
            body = self._read_json_body()
            player_name = str(body.get("playerName") or "").strip()
            player_club = str(body.get("playerClub") or "").strip()
            player_nationality = str(body.get("playerNationality") or "").strip()
            preferred_source_raw = str(body.get("preferredSource") or "").strip().lower()
            if not player_name:
                raise ValueError("Missing player name.")
            target_dir, index_section, index_key = _resolve_player_image_target(body)
        except ValueError as exc:
            self._write_json(400, {"ok": False, "error": str(exc)})
            return True

        preferred_source = "365scores" if preferred_source_raw == "365scores" else "fut.gg"
        source_order = [preferred_source, "365scores" if preferred_source == "fut.gg" else "fut.gg"]
        known_hashes = _known_photo_hashes_for_target_dir(target_dir)
        fetched: tuple[bytes, str] | None = None
        for source in source_order:
            try:
                if source == "fut.gg":
                    candidates = _futgg_candidate_image_urls(player_name, player_club, player_nationality)
                else:
                    candidates = _365scores_candidate_image_urls(player_name, player_club)
            except Exception:
                candidates = []
            fetched = _fetch_first_new_photo(candidates, source, known_hashes)
            if fetched is not None:
                break
        if fetched is None:
            self._write_json(
                404,
                {"ok": False, "error": "No new photo found on FUT.GG or 365scores."},
            )
            return True

        image_bytes, source = fetched
        if not image_bytes:
            self._write_json(404, {"ok": False, "error": "Downloaded image is empty."})
            return True

        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = _next_auto_photo_path(target_dir, source)
        try:
            out_path.write_bytes(image_bytes)
        except OSError:
            self._write_json(500, {"ok": False, "error": "Failed to write image file."})
            return True

        rel_path = out_path.relative_to(PROJECT_ROOT).as_posix()
        try:
            _update_player_images_index(index_section, index_key, rel_path)
        except OSError:
            self._write_json(500, {"ok": False, "error": "Failed to update player image index."})
            return True

        self._write_json(
            200,
            {
                "ok": True,
                "source": source,
                "preferredSource": preferred_source,
                "relativePath": rel_path,
                "indexSection": index_section,
                "indexKey": index_key,
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
        if _runner_blob_mod.try_handle_get(self, PROJECT_ROOT):
            return
        if _runner_saved_mod.try_handle_get(self, PROJECT_ROOT):
            return
        if self._try_serve_team_voice_voices():
            return
        if self._try_serve_team_voice_status():
            return
        if self._try_serve_quiz_title_voice_status():
            return
        if self._try_serve_ending_voice_status():
            return
        if self._try_serve_bundled_voice_status():
            return
        if self._try_serve_other_teams_logos_json():
            return
        if self._is_live_reload_endpoint():
            self._send_live_reload_stream()
            return
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Browser navigation/reload can drop sockets mid-response.
            return

    def do_POST(self) -> None:  # noqa: N802
        if _runner_blob_mod.try_handle_post(self, PROJECT_ROOT):
            return
        if _runner_saved_mod.try_handle_post(self, PROJECT_ROOT):
            return
        if self._try_generate_team_voice():
            return
        if self._try_delete_team_voice():
            return
        if self._try_generate_quiz_title_voice():
            return
        if self._try_delete_quiz_title_voice():
            return
        if self._try_generate_ending_voice():
            return
        if self._try_delete_ending_voice():
            return
        if self._try_generate_bundled_voice():
            return
        if self._try_delete_bundled_voice():
            return
        if self._try_fetch_team_logo():
            return
        if self._try_delete_player_photo():
            return
        if self._try_auto_fetch_player_photo():
            return
        self.send_error(404, "Not found")

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
