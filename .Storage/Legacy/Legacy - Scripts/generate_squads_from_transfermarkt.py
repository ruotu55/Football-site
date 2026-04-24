#!/usr/bin/env python3
"""
Build squad JSON files under Squad Formation/Teams and Squad Formation/Nationalities
from current Transfermarkt squad data (tmapi-alpha), mirroring Teams Images / Nationality images.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import sys
import ssl
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import aiohttp
import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT  # noqa: E402

# curl / browser UA for Transfermarkt website HTML (leistungsdatendetails, nationalmannschaft).
_CURL_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


def _curl_executable() -> str:
    for name in ("curl", "curl.exe"):
        p = shutil.which(name)
        if p:
            return p
    return "curl"

_RELATIVE_PLAYER_URL_RE = re.compile(
    r"^/([^/]+)/profil/spieler/(\d+)/?$", re.IGNORECASE
)

# leistungsdatendetails footer row (EN/DE); label may be split across tags.
_CLUB_LEISTUNG_TOTAL_LABEL_RE = re.compile(
    r"(?:Total|Gesamt|Insgesamt|Summe)\s*:?",
    re.I,
)
_CLUB_CARDS_CELL_RE = re.compile(
    r"(?:\d+|-|\u2013|—)\s*/\s*(?:\d+|-|\u2013|—)\s*/\s*(?:\d+|-|\u2013|—)",
)

# Squad JSON lives under `.Storage/Squad Formation/`; scripts under `.Storage/Legacy/...`.
_LEGACY_DIR = Path(__file__).resolve().parent.parent
PROJECT = _LEGACY_DIR.parent
TEAMS_IMAGES = PROJECT / "Teams Images"
NATIONALITY_IMAGES = PROJECT / "Nationality images"
OUT_TEAMS = PROJECT / "Squad Formation" / "Teams"
OUT_NAT = PROJECT / "Squad Formation" / "Nationalities"

YOUTH_RE = re.compile(r"\bU(16|17|18|19|20|21|23)\b", re.IGNORECASE)
YOUTH_NT_SUFFIX = re.compile(r"^(.+?)\s+U\d{2}$")

# tmapi / aiohttp may wait indefinitely under WAF or congestion; cap wait per call.
_TM_NATIONAL_CAREER_API_TIMEOUT_S = 25.0


def _stem_team_query(basename: str) -> str:
    name = basename
    if name.lower().endswith(".png"):
        name = name[:-4]
    name = re.sub(r"\.football-logos\.cc$", "", name, flags=re.IGNORECASE)
    name = name.replace("-", " ").strip()
    if not name:
        return basename
    return " ".join(part.capitalize() for part in name.split())


def _display_name_from_filename_stem(stem: str) -> str:
    s = re.sub(r"\.football-logos\.cc$", "", stem, flags=re.IGNORECASE)
    s = s.replace("-", " ").strip()
    if not s:
        return stem
    return " ".join(w.capitalize() for w in s.split())


def _safe_json_filename_stem(official_name: str) -> str:
    s = (official_name or "").strip()
    for ch in '\\/:*?"<>|':
        s = s.replace(ch, "")
    s = s.strip(". \t")
    return s or "unknown"


def _bucket(attrs: dict[str, Any]) -> str:
    pg = (attrs or {}).get("positionGroup") or ""
    cat = ((attrs or {}).get("position") or {}).get("category") or ""
    if pg == "GOALKEEPER" or cat == "Goalkeeper":
        return "goalkeepers"
    if pg == "DEFENDER" or cat == "Defender":
        return "defenders"
    if pg == "MIDFIELDER" or cat == "Midfielder":
        return "midfielders"
    if pg in ("FORWARD", "ATTACKER") or cat in ("Striker", "Forward"):
        return "attackers"
    return "attackers"


def _is_youth_or_reserve(club_name: str) -> bool:
    n = club_name.lower()
    if YOUTH_RE.search(club_name):
        return True
    if re.search(r"\byth\.?\b", club_name, re.IGNORECASE):
        return True
    if "women" in n or "female" in n:
        return True
    if "academy" in n or " ii" in n or n.endswith(" b"):
        return True
    return False


async def _get_club_safe(tmkt: TMKT, cid: int) -> Optional[dict[str, Any]]:
    try:
        r = await tmkt.get_club(cid)
        if r.get("success") and r.get("data"):
            return r["data"]
    except Exception:
        return None
    return None


def _query_match_rank(query: str, official_name: str) -> tuple[int, int]:
    q = query.strip().lower()
    n = (official_name or "").strip().lower()
    if not q or not n:
        return (99, 0)
    if n == q:
        return (0, 0)
    if len(q.split()) >= 2 and n.startswith(q):
        return (1, len(n) - len(q))
    q_tokens = set(q.split())
    n_tokens = set(n.split())
    if len(q.split()) >= 2 and q_tokens <= n_tokens and len(q_tokens) >= 1:
        return (2, len(n))
    if q in n:
        return (3, len(n))
    for t in n_tokens:
        if len(t) >= 4 and (t.startswith(q) or q in t):
            return (4, len(n))
    return (50, len(n))


def _relax_reserve_filter_for_club_label(label: str) -> bool:
    """True for B teams / II / explicit reserve names so resolve_team_id can pick them."""
    n = (label or "").strip().lower()
    if n.endswith(" b") or n.endswith(" ii"):
        return True
    if re.search(r"\b(?:reserves|reserve|u21|u23|u19)\b", n):
        return True
    return False


def club_resolve_queries(name: str, json_stem: str) -> list[str]:
    """Search queries for a club JSON missing transfermarktClubId."""
    out: list[str] = []
    for part in (name, json_stem):
        s = (part or "").strip()
        if s and s not in out:
            out.append(s)
    extra: list[str] = []
    for alt in out:
        if "&" in alt:
            t = re.sub(r"\s*&\s*", " and ", alt)
            if t not in out and t not in extra:
                extra.append(t)
    return out + extra


async def resolve_team_id(
    tmkt: TMKT,
    queries: list[str],
    *,
    want_national: bool,
    relax_reserve_filter: bool = False,
) -> Optional[int]:
    seen: set[int] = set()
    best: Optional[tuple[tuple[int, int], int]] = None
    for q in queries:
        if not q or not q.strip():
            continue
        try:
            rows = await tmkt.team_search(q.strip())
        except Exception:
            continue
        if not rows:
            continue
        batch: list[tuple[int, str]] = []
        for r in rows[:30]:
            cid = int(r["id"])
            if cid in seen:
                continue
            data = await _get_club_safe(tmkt, cid)
            if not data:
                continue
            bd = data.get("baseDetails") or {}
            if bool(bd.get("isNationalTeam")) != want_national:
                continue
            if not relax_reserve_filter and _is_youth_or_reserve(data.get("name") or ""):
                continue
            seen.add(cid)
            batch.append((cid, data.get("name") or ""))
        if not batch:
            continue
        batch.sort(key=lambda item: _query_match_rank(q, item[1]))
        rank_key = _query_match_rank(q, batch[0][1])
        cid_pick = batch[0][0]
        if best is None or rank_key < best[0]:
            best = (rank_key, cid_pick)
        if rank_key[0] <= 2:
            return cid_pick
    return best[1] if best else None


def _queries_for_nationality(stem: str) -> list[str]:
    base = stem.strip()
    alts = [base, base.replace("Ivory Coast", "Côte d'Ivoire")]
    if base == "United Kingdom":
        alts.extend(["England", "Scotland", "Wales", "Northern Ireland"])
    if base == "USA":
        alts.append("United States")
    if base == "United States":
        alts.append("USA")
    out: list[str] = []
    for a in alts:
        if a and a not in out:
            out.append(a)
    return out


async def build_nationality_id_map(
    tmkt: TMKT,
    png_paths: list[Path],
    *,
    concurrency: int = 10,
) -> dict[str, str]:
    sem = asyncio.Semaphore(concurrency)
    m: dict[str, str] = {}

    async def one(png: Path) -> None:
        stem = png.stem
        qlist = _queries_for_nationality(stem)
        async with sem:
            tid = await resolve_team_id(tmkt, qlist, want_national=True)
            if tid is None:
                return
            cdata = await _get_club_safe(tmkt, tid)
            official_country = _strip_youth_nt_display((cdata or {}).get("name") or "")
            if not official_country:
                official_country = stem
            try:
                squad = await tmkt.get_club_squad(tid)
            except Exception:
                return
            if not squad.get("success"):
                return
            ids = (squad.get("data") or {}).get("playerIds") or []
            if not ids:
                return
            try:
                pl = await tmkt.get_player(int(ids[0]))
            except Exception:
                return
            if not pl.get("success"):
                return
            nd = (pl.get("data") or {}).get("nationalityDetails") or {}
            nids = (nd.get("nationalities") or {})
            nid = nids.get("nationalityId")
            if nid is None:
                return
            m[str(nid)] = official_country

    await asyncio.gather(*(one(p) for p in sorted(png_paths)))
    return m


def _aggregate_tm_performance(rows: Any) -> tuple[int, int, int]:
    if not isinstance(rows, list):
        return (0, 0, 0)
    apps = goals = ast = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        gp = row.get("gamesPlayed")
        if gp is None:
            gp = row.get("games")
        apps += int(gp or 0)
        gs = row.get("goalsScored")
        if gs is None:
            gs = row.get("goals")
        goals += int(gs or 0)
        ast += int(row.get("assists") or 0)
    return (apps, goals, ast)


def _looks_like_tm_performance_row(d: dict[str, Any]) -> bool:
    if not d:
        return False
    if any(
        k in d
        for k in (
            "gamesPlayed",
            "games",
            "goalsScored",
            "goals",
            "competitionId",
            "competitionCode",
        )
    ):
        return True
    comp = d.get("competition")
    return isinstance(comp, dict)


def _ceapi_performance_rows(raw: Any) -> list[dict[str, Any]]:
    """Normalize ceapi performance payloads (list, performances, nested data.*)."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    if not isinstance(raw, dict):
        return []
    for key in ("performances", "performance", "items", "stats"):
        p = raw.get(key)
        if isinstance(p, list) and p and isinstance(p[0], dict):
            if _looks_like_tm_performance_row(p[0]):
                return [r for r in p if isinstance(r, dict)]
    for wrap in ("data", "result", "payload"):
        inner = raw.get(wrap)
        if inner is not None and inner is not raw:
            got = _ceapi_performance_rows(inner)
            if got:
                return got
    return []


def _row_competition_id_str(row: dict[str, Any]) -> str:
    v = row.get("competitionId")
    if v is None:
        v = row.get("wettbewerbId")
    if v is None:
        comp = row.get("competition")
        if isinstance(comp, dict):
            v = comp.get("id") or comp.get("competitionId")
    if v is None:
        v = row.get("competitionCode")
    if v is None:
        return ""
    return str(v).strip().upper()


def _row_season_id_maybe_int(row: dict[str, Any]) -> Optional[int]:
    s = row.get("seasonId")
    if s is None:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


async def _season_stats_from_per_competition_filtered(
    tmkt: TMKT,
    pid: int,
    season_id: Optional[int],
    competition_id: str,
) -> tuple[int, int, int]:
    raw: Any = None
    for domain, ref in (
        ("https://www.transfermarkt.com", "https://www.transfermarkt.com"),
        ("https://www.transfermarkt.co.uk", "https://www.transfermarkt.co.uk"),
    ):
        url = f"{domain}/ceapi/player/{pid}/performancepercompetition"
        raw = await _ceapi_curl_get_json(url, ref)
        if raw is not None:
            break
    if raw is None:
        try:
            raw = await tmkt.get_player_stats_per_competition(pid)
        except Exception:
            raw = None
    rows = _ceapi_performance_rows(raw) if raw is not None else []
    comp = competition_id.strip().upper()
    picked: list[dict[str, Any]] = []
    for r in rows:
        if _row_competition_id_str(r) != comp:
            continue
        if season_id is not None:
            rs = _row_season_id_maybe_int(r)
            if rs is not None and rs != season_id:
                continue
        picked.append(r)
    return _aggregate_tm_performance(picked)


def _slug_and_pid_from_relative_url(url: Optional[str]) -> Optional[tuple[str, str]]:
    if not url:
        return None
    m = _RELATIVE_PLAYER_URL_RE.match((url or "").strip())
    if not m:
        return None
    return m.group(1), m.group(2)


def _transfermarkt_cookie_header_value() -> str:
    return (os.environ.get("TRANSFERMARKT_COOKIE") or "").strip()


async def _ceapi_curl_get_json(url: str, referer: str) -> Optional[Any]:
    """GET ceapi JSON with browser UA + optional Cookie (same pattern as transfer history).

    The tmkt client uses aiohttp without cookies; Transfermarkt often responds 405 or HTML
    for /ceapi/player/.../performance unless Cookie matches a normal browser session.
    """
    try:
        ck = _transfermarkt_cookie_header_value()
        curl_cmd: list[str] = [
            _curl_executable(),
            "-sL",
            "-m",
            "25",
            "-A",
            _CURL_UA,
            "-H",
            "Accept: application/json, text/plain, */*",
            "-H",
            f"Referer: {referer}",
            "-H",
            f"Origin: {referer.rstrip('/')}",
        ]
        if ck:
            curl_cmd.extend(["-H", f"Cookie: {ck}"])
        curl_cmd.append(url)
        proc = await asyncio.create_subprocess_exec(
            *curl_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await proc.communicate()
        raw_output = stdout.decode("utf-8", errors="replace").strip()
        if raw_output.startswith("\ufeff"):
            raw_output = raw_output[1:].lstrip()
        if not raw_output.startswith("{") and not raw_output.startswith("["):
            return None
        return json.loads(raw_output)
    except (json.JSONDecodeError, OSError, Exception):
        return None


def _tm_html_blocked(html: str) -> bool:
    if not html:
        return True
    head = html[:8000].lower()
    return "human verification" in head or "captcha-container" in head


def _td_texts_from_tr(tr_html: str) -> list[str]:
    cells: list[str] = []
    for chunk in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr_html, re.I | re.DOTALL):
        t = re.sub(r"<[^>]+>", " ", chunk)
        t = re.sub(r"\s+", " ", t).strip()
        cells.append(t)
    return cells


def _tm_stat_int(cell: str) -> int:
    s = (cell or "").strip().replace("\u2013", "-")
    if s in ("-", "—", ""):
        return 0
    s = s.replace(".", "")
    if s.isdigit():
        return int(s)
    return 0


def _tm_site_compact_fragment(html: str) -> str:
    """Ignore huge 'Detailed stats' section below compact overview tables."""
    for pat in (
        r"(?is)<h2[^>]*>\s*Detailed\s+stats",
        r"(?is)<h2[^>]*>\s*Detaillierte\s+Statistik",
    ):
        m = re.search(pat, html)
        if m:
            return html[: m.start()]
    return html


def _club_find_minutes_col_idx(cells: list[str]) -> Optional[int]:
    for i in range(len(cells) - 1, -1, -1):
        if _cell_looks_like_minutes_column(cells[i]):
            return i
    return None


def _is_goalkeeper_from_player_response(pr: Any) -> bool:
    if not isinstance(pr, dict) or not pr.get("success"):
        return False
    pdata = pr.get("data") or {}
    attrs = pdata.get("attributes") or {}
    pos_name = ((attrs.get("position") or {}).get("name") or "").strip().lower()
    if pos_name == "goalkeeper":
        return True
    if (attrs.get("positionGroup") or "") == "GOALKEEPER":
        return True
    cat = ((attrs.get("position") or {}).get("category") or "")
    return cat == "Goalkeeper"


def _club_find_card_column_index_before_minutes(
    cells: list[str], mi: int
) -> Optional[int]:
    """Rightmost <td> before minutes whose text looks like TM's Y/R/Y card tally (x / x / x)."""
    for i in range(mi - 1, -1, -1):
        t = (cells[i] or "").strip().replace("\u2013", "-").replace("—", "-")
        if _CLUB_CARDS_CELL_RE.search(t):
            return i
    return None


def _club_total_stats_from_leistungs_cells_gk(cells: list[str]) -> Optional[dict[str, Any]]:
    """GK leistungsdatendetails Total: apps, goals, cards, conceded, clean sheets, minutes.

    Column count varies (leading Total / season / comp / club cells). Anchor on the card
    column immediately before conceded + clean + minutes instead of fixed offsets from mi.
    """
    if len(cells) < 6:
        return None
    mi = _club_find_minutes_col_idx(cells)
    if mi is None or mi < 3:
        return None

    card_idx = _club_find_card_column_index_before_minutes(cells, mi)
    if (
        card_idx is not None
        and card_idx >= 2
        and card_idx + 2 < mi
    ):
        apps = _tm_stat_int(cells[card_idx - 2])
        goals = _tm_stat_int(cells[card_idx - 1])
        conceded = _tm_stat_int(cells[card_idx + 1])
        clean = _tm_stat_int(cells[card_idx + 2])
        if apps or conceded or clean:
            return {
                "appearances": apps,
                "goals": goals,
                "assists": 0,
                "goals_conceded": conceded,
                "clean_sheets": clean,
            }

    # Fallback: fixed layout from minutes (works when colspan matches Courtois-style tables).
    if mi >= 5:
        t_cards = (cells[mi - 3] or "").strip().replace("\u2013", "-").replace("—", "-")
        if _CLUB_CARDS_CELL_RE.search(t_cards):
            apps = _tm_stat_int(cells[mi - 5])
            goals = _tm_stat_int(cells[mi - 4])
            conceded = _tm_stat_int(cells[mi - 2])
            clean = _tm_stat_int(cells[mi - 1])
            if apps or conceded or clean:
                return {
                    "appearances": apps,
                    "goals": goals,
                    "assists": 0,
                    "goals_conceded": conceded,
                    "clean_sheets": clean,
                }

    # Loose fallback: same indices without requiring the card regex (some locales / rows).
    if mi >= 5:
        apps = _tm_stat_int(cells[mi - 5])
        goals = _tm_stat_int(cells[mi - 4])
        conceded = _tm_stat_int(cells[mi - 2])
        clean = _tm_stat_int(cells[mi - 1])
        mid = (cells[mi - 3] or "").strip()
        if _cell_looks_like_minutes_column(mid):
            return None
        if apps or conceded or clean:
            if apps > 0 and clean > apps:
                return None
            return {
                "appearances": apps,
                "goals": goals,
                "assists": 0,
                "goals_conceded": conceded,
                "clean_sheets": clean,
            }

    return None


def _club_total_stats_from_leistungs_cells(
    cells: list[str], *, is_goalkeeper: bool = False
) -> Optional[dict[str, Any]]:
    """Parse apps/goals/assists from leistungsdatendetails Total row (handles colspan)."""
    if is_goalkeeper:
        return _club_total_stats_from_leistungs_cells_gk(cells)
    if len(cells) < 4:
        return None
    mi = _club_find_minutes_col_idx(cells)
    if mi is not None and mi >= 4:
        apps = _tm_stat_int(cells[mi - 4])
        goals = _tm_stat_int(cells[mi - 3])
        ast = _tm_stat_int(cells[mi - 2])
        if apps or goals or ast:
            return {"appearances": apps, "goals": goals, "assists": ast}
    card_idx: Optional[int] = None
    for i, c in enumerate(cells):
        t = (c or "").strip().replace("\u2013", "-").replace("—", "-")
        if _CLUB_CARDS_CELL_RE.search(t):
            card_idx = i
            break
    if card_idx is not None and card_idx >= 3:
        apps = _tm_stat_int(cells[card_idx - 3])
        goals = _tm_stat_int(cells[card_idx - 2])
        ast = _tm_stat_int(cells[card_idx - 1])
        if apps or goals or ast:
            return {"appearances": apps, "goals": goals, "assists": ast}
    return None


def _find_club_perf_total_tr(html: str, *, is_goalkeeper: bool = False) -> Optional[str]:
    # Use the full document, not _tm_site_compact_fragment: on leistungsdatendetails
    # the career table sits *below* the "Detailed stats" <h2>.
    best_tr: Optional[str] = None
    best_apps = -1
    for m in re.finditer(r"<tr[^>]*>.*?</tr>", html, re.I | re.DOTALL):
        block = m.group(0)
        plain = re.sub(r"<[^>]+>", " ", block)
        plain = re.sub(r"\s+", " ", plain).strip()
        if not _CLUB_LEISTUNG_TOTAL_LABEL_RE.search(plain):
            continue
        cells = _td_texts_from_tr(block)
        parsed = _club_total_stats_from_leistungs_cells(
            cells, is_goalkeeper=is_goalkeeper
        )
        if not parsed:
            continue
        if parsed["appearances"] >= best_apps:
            best_apps = parsed["appearances"]
            best_tr = block
    return best_tr


def _parse_club_leistungsdaten_total(
    html: str, *, is_goalkeeper: bool = False
) -> Optional[dict[str, Any]]:
    if _tm_html_blocked(html):
        return None
    tr = _find_club_perf_total_tr(html, is_goalkeeper=is_goalkeeper)
    if not tr:
        return None
    cells = _td_texts_from_tr(tr)
    out = _club_total_stats_from_leistungs_cells(cells, is_goalkeeper=is_goalkeeper)
    if not out:
        return None
    row: dict[str, Any] = {
        "appearances": out["appearances"],
        "goals": out["goals"],
        "assists": out["assists"],
    }
    gc = out.get("goals_conceded")
    cs = out.get("clean_sheets")
    if gc is not None:
        row["goals_conceded"] = int(gc)
    if cs is not None:
        row["clean_sheets"] = int(cs)
    return row


def _cell_looks_like_minutes_column(s: str) -> bool:
    t = (s or "").strip()
    if not t:
        return False
    if "'" in t or "\u2019" in t or "\u2032" in t:
        return True
    return bool(re.match(r"^\d{1,3}(\.\d{3})+\s*[\u2019']?$", t))


def _looks_like_nt_numeric_stat_cell(cell: str) -> bool:
    s = (cell or "").strip().replace("\u2013", "-").replace("\xa0", " ")
    if not s:
        return False
    if re.match(r"^total\s*:?$", s, re.I):
        return False
    if s in ("-", "—"):
        return True
    if "'" in s or "\u2019" in s or "\u2032" in s:
        return True
    if re.match(r"^\d+$", s):
        return True
    if re.match(r"^\d{1,3}(\.\d{3})+$", s):
        return True
    return False


def _national_find_minutes_column_index(cells: list[str]) -> Optional[int]:
    for i in range(len(cells) - 1, -1, -1):
        s = (cells[i] or "").strip()
        if not s:
            continue
        if _cell_looks_like_minutes_column(s):
            return i
    return None


def _parse_nationalmannschaft_total_walk_left(
    cells: list[str],
) -> Optional[dict[str, Any]]:
    mins_idx = _national_find_minutes_column_index(cells)
    if mins_idx is None or mins_idx < 1:
        return None
    stats_from_right: list[str] = []
    j = mins_idx - 1
    while j >= 0 and len(stats_from_right) < 6:
        s = (cells[j] or "").strip()
        j -= 1
        if not _looks_like_nt_numeric_stat_cell(s):
            continue
        stats_from_right.append(s)
    if len(stats_from_right) < 6:
        return None
    _red_s, _sy_s, _yel_s, ast_s, goals_s, apps_s = stats_from_right
    return {
        "appearances": _tm_stat_int(apps_s),
        "goals": _tm_stat_int(goals_s),
        "assists": _tm_stat_int(ast_s),
        "goals_conceded": None,
        "clean_sheets": None,
    }


def _parse_nationalmannschaft_total_fallback_cells(
    cells: list[str],
) -> Optional[dict[str, Any]]:
    texts: list[str] = []
    for c in cells:
        if not c:
            continue
        if re.match(r"^total\s*:?$", c.strip(), re.I):
            continue
        texts.append(c.strip())
    if not texts:
        return None
    tail = list(reversed(texts))
    mins_raw = tail[0]
    if not _cell_looks_like_minutes_column(mins_raw) and not re.search(
        r"^\d[\d.]*", mins_raw
    ):
        return None
    if len(tail) < 7:
        return None
    _red_s, _sy_s, _yel_s, ast_s, goals_s, apps_s = tail[1:7]
    return {
        "appearances": _tm_stat_int(apps_s),
        "goals": _tm_stat_int(goals_s),
        "assists": _tm_stat_int(ast_s),
        "goals_conceded": None,
        "clean_sheets": None,
    }


def _parse_nationalmannschaft_total_gk_cells(cells: list[str]) -> Optional[dict[str, Any]]:
    """Senior NT compact Total row with GK columns: apps, goals, cards×3, conceded, clean, minutes."""
    mi = _national_find_minutes_column_index(cells)
    if mi is None or mi < 7:
        return None
    clean = _tm_stat_int(cells[mi - 1])
    conceded = _tm_stat_int(cells[mi - 2])
    apps = _tm_stat_int(cells[mi - 7])
    goals = _tm_stat_int(cells[mi - 6]) if mi >= 6 else 0
    if not (apps or conceded or clean):
        return None
    return {
        "appearances": apps,
        "goals": goals,
        "assists": None,
        "goals_conceded": conceded,
        "clean_sheets": clean,
    }


def _parse_nationalmannschaft_total_cells(
    cells: list[str], *, is_goalkeeper: bool
) -> Optional[dict[str, Any]]:
    if is_goalkeeper:
        return _parse_nationalmannschaft_total_gk_cells(cells)
    out = _parse_nationalmannschaft_total_walk_left(cells)
    if out is not None:
        return out
    return _parse_nationalmannschaft_total_fallback_cells(cells)


def _find_national_perf_total_tr(
    html: str, *, is_goalkeeper: bool = False
) -> Optional[str]:
    fragment = _tm_site_compact_fragment(html)
    candidates: list[str] = []
    for m in re.finditer(r"<tr[^>]*>.*?</tr>", fragment, re.I | re.DOTALL):
        block = m.group(0)
        if not re.search(r"Total\s*:", block, re.I):
            continue
        if re.search(r"\d+\s*/\s*[-\d]+\s*/\s*[-\d]", block):
            continue
        tds = len(re.findall(r"<t[dh][^>]*>", block, re.I))
        if tds >= 6:
            candidates.append(block)
    if not candidates:
        return None
    best_tr: Optional[str] = None
    best_apps = -1
    for block in candidates:
        cells = _td_texts_from_tr(block)
        parsed = _parse_nationalmannschaft_total_cells(
            cells, is_goalkeeper=is_goalkeeper
        )
        if parsed is None:
            continue
        apps = int(parsed.get("appearances") or 0)
        if apps >= best_apps:
            best_apps = apps
            best_tr = block
    return best_tr


def _parse_nationalmannschaft_total(
    html: str, *, is_goalkeeper: bool = False
) -> Optional[dict[str, Any]]:
    if _tm_html_blocked(html):
        return None
    tr = _find_national_perf_total_tr(html, is_goalkeeper=is_goalkeeper)
    if not tr:
        return None
    cells = _td_texts_from_tr(tr)
    return _parse_nationalmannschaft_total_cells(cells, is_goalkeeper=is_goalkeeper)


def _first_senior_nt_verein_id(html: str) -> Optional[str]:
    for m in re.finditer(
        r"<option[^>]+value=\"(\d+)\"[^>]*>(.*?)</option>", html, re.I | re.DOTALL
    ):
        vid = m.group(1).strip()
        label = re.sub(r"<[^>]+>", " ", m.group(2))
        label = re.sub(r"\s+", " ", label).strip()
        if not vid or vid == "0":
            continue
        if re.search(r"\bU(?:16|17|18|19|20|21|22|23)\b", label, re.I):
            continue
        return vid
    return None


async def _fetch_transfermarkt_html_tmkt(
    tmkt: TMKT,
    path_or_url: str,
) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        url = path_or_url
    else:
        p = path_or_url if path_or_url.startswith("/") else f"/{path_or_url}"
        url = f"{tmkt._api.secondary_url.rstrip('/')}{p}"
    base = tmkt._api.secondary_url.rstrip("/")
    html_headers: dict[str, str] = {
        "User-Agent": _CURL_UA,
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "Referer": f"{base}/",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
    }
    ck = _transfermarkt_cookie_header_value()
    if ck:
        html_headers["Cookie"] = ck
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    timeout = aiohttp.ClientTimeout(total=30)
    try:
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=html_headers,
        ) as session:
            async with session.get(url, allow_redirects=True) as resp:
                text = await resp.text()
                if resp.status != 200:
                    return ""
                if _tm_html_blocked(text):
                    return ""
                return text
    except Exception:
        return ""


async def _fetch_transfermarkt_html_curl(url: str) -> str:
    try:
        cmd: list[str] = [
            _curl_executable(),
            "-sL",
            "-m",
            "25",
            "-A",
            _CURL_UA,
            "-H",
            "Accept: text/html,application/xhtml+xml",
            "-H",
            "Accept-Language: en-US,en;q=0.9",
            "-H",
            "Referer: https://www.transfermarkt.co.uk/",
        ]
        ck = _transfermarkt_cookie_header_value()
        if ck:
            cmd.extend(["-H", f"Cookie: {ck}"])
        cmd.append(url)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await proc.communicate()
        return stdout.decode("utf-8", errors="replace")
    except Exception:
        return ""


async def _fetch_tm_html_prefer_session(tmkt: TMKT, path_on_co_uk: str) -> str:
    p = path_on_co_uk if path_on_co_uk.startswith("/") else f"/{path_on_co_uk}"
    uk = f"https://www.transfermarkt.co.uk{p}"
    com = f"https://www.transfermarkt.com{p}"
    # With a browser cookie, curl often succeeds where aiohttp gets an empty/WAF body;
    # same pattern as transfer CEAPI.
    if _transfermarkt_cookie_header_value():
        for url in (uk, com):
            h = await _fetch_transfermarkt_html_curl(url)
            if h and not _tm_html_blocked(h):
                return h
    html = await _fetch_transfermarkt_html_tmkt(tmkt, p)
    if html and not _tm_html_blocked(html):
        return html
    for url in (uk, com):
        h = await _fetch_transfermarkt_html_curl(url)
        if h and not _tm_html_blocked(h):
            return h
    return html if html else ""


def _parse_leistungsdaten_row_for_competition(
    html: str,
    competition_id: str,
    *,
    is_goalkeeper: bool = False,
    season_label_hint: Optional[str] = None,
) -> Optional[tuple[int, int, int]]:
    """Parse one stats row on leistungsdaten for wettbewerb/COMP (same column logic as career totals)."""
    if _tm_html_blocked(html):
        return None
    comp_esc = re.escape(competition_id.strip().upper())
    hint = (season_label_hint or "").strip()

    def _try_tr(tr_html: str) -> Optional[tuple[int, int, int]]:
        if not re.search(
            rf"(?:wettbewerb|wettbewerb_id)/{comp_esc}(?:[\"'/]|$)",
            tr_html,
            re.I,
        ):
            return None
        if hint and hint not in re.sub(r"<[^>]+>", " ", tr_html):
            return None
        cells = _td_texts_from_tr(tr_html)
        if len(cells) < 4:
            return None
        head = " ".join((cells[i] or "").lower() for i in range(min(3, len(cells))))
        if "total" in head and "total" in (cells[0] or "").lower():
            return None
        parsed = _club_total_stats_from_leistungs_cells(
            cells, is_goalkeeper=is_goalkeeper
        )
        if not parsed:
            return None
        apps = int(parsed.get("appearances") or 0)
        goals = int(parsed.get("goals") or 0)
        ast = int(parsed.get("assists") or 0)
        if not (apps or goals or ast):
            return None
        return (apps, goals, ast)

    for blob in (_tm_site_compact_fragment(html), html):
        for m in re.finditer(r"<tr[^>]*>.*?</tr>", blob, re.I | re.DOTALL):
            got = _try_tr(m.group(0))
            if got is not None:
                return got
    if hint:
        for blob in (_tm_site_compact_fragment(html), html):
            for m in re.finditer(r"<tr[^>]*>.*?</tr>", blob, re.I | re.DOTALL):
                tr = m.group(0)
                if not re.search(
                    rf"(?:wettbewerb|wettbewerb_id)/{comp_esc}(?:[\"'/]|$)",
                    tr,
                    re.I,
                ):
                    continue
                cells = _td_texts_from_tr(tr)
                if len(cells) < 4:
                    continue
                parsed = _club_total_stats_from_leistungs_cells(
                    cells, is_goalkeeper=is_goalkeeper
                )
                if not parsed:
                    continue
                apps = int(parsed.get("appearances") or 0)
                goals = int(parsed.get("goals") or 0)
                ast = int(parsed.get("assists") or 0)
                if apps or goals or ast:
                    return (apps, goals, ast)
    return None


async def _season_stats_from_leistungsdaten_html(
    tmkt: TMKT,
    slug: str,
    pid_s: str,
    season_id: Optional[int],
    competition_id: str,
    *,
    is_goalkeeper: bool = False,
    season_label_hint: Optional[str] = None,
) -> Optional[tuple[int, int, int]]:
    """HTML fallback when ceapi performance JSON is blocked or empty (needs Cookie like other TM pages)."""
    comp_u = competition_id.strip().upper()
    paths: list[str] = []
    if season_id is not None:
        paths.append(
            f"/{slug}/leistungsdaten/spieler/{pid_s}/saison_id/{season_id}/wettbewerb_id/{comp_u}"
        )
    paths.append(f"/{slug}/leistungsdaten/spieler/{pid_s}")
    for path in paths:
        html = await _fetch_tm_html_prefer_session(tmkt, path)
        if not html:
            continue
        got = _parse_leistungsdaten_row_for_competition(
            html,
            comp_u,
            is_goalkeeper=is_goalkeeper,
            season_label_hint=season_label_hint,
        )
        if got is not None:
            return got
    return None


async def _national_totals_from_html(
    tmkt: TMKT,
    slug: str,
    pid: str,
    *,
    verein_id: Optional[str] = None,
    is_goalkeeper: bool = False,
) -> Optional[dict[str, Any]]:
    base_path = f"/{slug}/nationalmannschaft/spieler/{pid}"
    if verein_id:
        path = f"{base_path}/verein_id/{verein_id}"
        html = await _fetch_tm_html_prefer_session(tmkt, path)
        parsed = _parse_nationalmannschaft_total(
            html, is_goalkeeper=is_goalkeeper
        )
        if parsed:
            out = dict(parsed)
            out["national_team_club_id"] = verein_id
            return out
        return None

    html0 = await _fetch_tm_html_prefer_session(tmkt, base_path)
    if _tm_html_blocked(html0):
        return None
    vid = _first_senior_nt_verein_id(html0)
    html = html0
    if vid:
        path_scoped = f"{base_path}/verein_id/{vid}"
        html2 = await _fetch_tm_html_prefer_session(tmkt, path_scoped)
        if html2 and not _tm_html_blocked(html2):
            html = html2
    parsed = _parse_nationalmannschaft_total(html, is_goalkeeper=is_goalkeeper)
    if not parsed:
        return None
    parsed = dict(parsed)
    if vid:
        parsed["national_team_club_id"] = vid
    return parsed


def _empty_club_career_totals() -> dict[str, Any]:
    return {
        "appearances": 0,
        "goals": 0,
        "assists": 0,
        "goals_conceded": None,
        "clean_sheets": None,
    }


def _empty_national_career_totals() -> dict[str, Any]:
    return {
        "appearances": 0,
        "goals": 0,
        "assists": None,
        "goals_conceded": None,
        "clean_sheets": None,
        "national_team_club_id": None,
    }


async def _club_career_totals_for_player(
    tmkt: TMKT,
    pid: int,
    relative_url: Optional[str] = None,
    *,
    is_goalkeeper: bool = False,
) -> dict[str, Any]:
    base = _empty_club_career_totals()
    sp = _slug_and_pid_from_relative_url(relative_url)
    if sp:
        slug, pid_s = sp
        path = f"/{slug}/leistungsdatendetails/spieler/{pid_s}"
        html = await _fetch_tm_html_prefer_session(tmkt, path)
        parsed = _parse_club_leistungsdaten_total(
            html, is_goalkeeper=is_goalkeeper
        )
        if parsed:
            base["appearances"] = int(parsed["appearances"])
            base["goals"] = int(parsed["goals"])
            base["assists"] = int(parsed["assists"])
            gc = parsed.get("goals_conceded")
            cs = parsed.get("clean_sheets")
            if gc is not None:
                base["goals_conceded"] = int(gc)
            if cs is not None:
                base["clean_sheets"] = int(cs)
            return base
    try:
        raw = await tmkt.get_player_stats_per_competition(pid)
    except Exception:
        return base
    if not isinstance(raw, dict):
        return base
    perfs = raw.get("performances")
    if not isinstance(perfs, list):
        return base
    apps = goals = ast = 0
    gk_gc = gk_cs = 0
    gk_stats_from_api = False
    for row in perfs:
        if not isinstance(row, dict):
            continue
        apps += int(row.get("gamesPlayed") or 0)
        goals += int(row.get("goalsScored") or 0)
        ast += int(row.get("assists") or 0)
        if is_goalkeeper:
            if row.get("goalsConceded") is not None:
                gk_gc += int(row.get("goalsConceded") or 0)
                gk_stats_from_api = True
            if row.get("cleanSheets") is not None:
                gk_cs += int(row.get("cleanSheets") or 0)
                gk_stats_from_api = True
    base["appearances"] = apps
    base["goals"] = goals
    base["assists"] = ast
    if is_goalkeeper and gk_stats_from_api:
        base["goals_conceded"] = gk_gc
        base["clean_sheets"] = gk_cs
    return base


def _national_senior_totals_from_tmapi(payload: Any) -> dict[str, Any]:
    out = _empty_national_career_totals()
    if not isinstance(payload, dict) or not payload.get("success"):
        return out
    data = payload.get("data") or {}
    hist = data.get("history")
    if not isinstance(hist, list) or not hist:
        return out
    rows = [h for h in hist if isinstance(h, dict)]
    if not rows:
        return out
    recent = [
        h
        for h in rows
        if h.get("careerState")
        in ("RECENT_NATIONAL_PLAYER", "CURRENT_NATIONAL_PLAYER")
    ]
    pick_from = recent if recent else rows
    row = max(pick_from, key=lambda h: int(h.get("gamesPlayed") or 0))
    out["appearances"] = int(row.get("gamesPlayed") or 0)
    out["goals"] = int(row.get("goalsScored") or 0)
    cid = row.get("clubId")
    out["national_team_club_id"] = str(cid) if cid is not None else None
    return out


async def _national_career_totals_for_player(
    tmkt: TMKT,
    pid: int,
    relative_url: Optional[str] = None,
    *,
    is_goalkeeper: bool = False,
) -> dict[str, Any]:
    base = _empty_national_career_totals()
    sp = _slug_and_pid_from_relative_url(relative_url)
    if sp:
        slug, pid_s = sp
        html_tot = await _national_totals_from_html(
            tmkt, slug, pid_s, is_goalkeeper=is_goalkeeper
        )
        if html_tot:
            base["appearances"] = int(html_tot.get("appearances") or 0)
            base["goals"] = int(html_tot.get("goals") or 0)
            ast = html_tot.get("assists")
            base["assists"] = int(ast) if ast is not None else None
            gc = html_tot.get("goals_conceded")
            cs = html_tot.get("clean_sheets")
            if gc is not None:
                base["goals_conceded"] = int(gc)
            if cs is not None:
                base["clean_sheets"] = int(cs)
            cid = html_tot.get("national_team_club_id")
            if cid:
                base["national_team_club_id"] = str(cid)
            return base
    try:
        raw = await asyncio.wait_for(
            tmkt.get_player_stats_national_career(pid),
            timeout=_TM_NATIONAL_CAREER_API_TIMEOUT_S,
        )
    except (asyncio.TimeoutError, Exception):
        return base
    out = _national_senior_totals_from_tmapi(raw)
    if sp and out.get("assists") is None and not is_goalkeeper:
        slug, pid_s = sp
        vid = out.get("national_team_club_id")
        if vid:
            scoped = await _national_totals_from_html(
                tmkt,
                slug,
                pid_s,
                verein_id=str(vid),
                is_goalkeeper=is_goalkeeper,
            )
            if scoped and scoped.get("assists") is not None:
                out["assists"] = int(scoped["assists"])
    return out


async def _season_stats_for_player(
    tmkt: TMKT,
    pid: int,
    season_id: Optional[int],
    stats_cache: dict[str, tuple[int, int, int]],
    *,
    season_competition_id: Optional[str] = None,
    relative_url: Optional[str] = None,
    is_goalkeeper: bool = False,
    season_label_hint: Optional[str] = None,
) -> tuple[int, int, int]:
    # Cache: season id + domestic competition (GB1 vs AZ1 can share the same numeric season id).
    comp_key = (season_competition_id or "").strip().upper() or "*"
    cache_key = f"{pid}:{season_id if season_id is not None else 'latest'}:{comp_key}"
    if cache_key in stats_cache:
        return stats_cache[cache_key]
    raw: Any = None
    for domain, ref in (
        ("https://www.transfermarkt.com", "https://www.transfermarkt.com"),
        ("https://www.transfermarkt.co.uk", "https://www.transfermarkt.co.uk"),
    ):
        q = f"?season={season_id}" if season_id is not None else ""
        url = f"{domain}/ceapi/player/{pid}/performance{q}"
        raw = await _ceapi_curl_get_json(url, ref)
        if raw is not None:
            break
    if raw is None:
        try:
            if season_id is not None:
                raw = await tmkt.get_player_stats(pid, season=season_id)
            else:
                raw = await tmkt.get_player_stats(pid)
        except Exception:
            raw = None
    rows = _ceapi_performance_rows(raw) if raw is not None else []
    sc = (season_competition_id or "").strip().upper()
    if sc:
        filtered = [r for r in rows if _row_competition_id_str(r) == sc]
        if not filtered and rows:
            filtered = [
                r
                for r in rows
                if sc in _row_competition_id_str(r)
                or sc in json.dumps(r, ensure_ascii=False).upper()
            ]
        if filtered:
            agg = _aggregate_tm_performance(filtered)
        else:
            try:
                agg = await _season_stats_from_per_competition_filtered(
                    tmkt, pid, season_id, sc
                )
            except Exception:
                agg = (0, 0, 0)
    else:
        agg = _aggregate_tm_performance(rows)
    if agg == (0, 0, 0) and sc and relative_url:
        sp = _slug_and_pid_from_relative_url(relative_url)
        if sp:
            slug, pid_s = sp
            html_agg = await _season_stats_from_leistungsdaten_html(
                tmkt,
                slug,
                pid_s,
                season_id,
                sc,
                is_goalkeeper=is_goalkeeper,
                season_label_hint=season_label_hint,
            )
            if html_agg is not None:
                agg = html_agg
    stats_cache[cache_key] = agg
    return agg


def _year_from_ceapi_transfer(t: dict[str, Any]) -> str:
    """Join date year from ceapi (prefer ISO dateUnformatted, else DD/MM/YYYY)."""
    iso = (t.get("dateUnformatted") or "").strip()
    if iso and len(iso) >= 4 and iso[0:4].isdigit():
        return iso[0:4]
    date_str = (t.get("date") or "").strip()
    parts = date_str.split("/")
    if len(parts) == 3 and parts[2].strip().isdigit() and len(parts[2].strip()) == 4:
        return parts[2].strip()
    season = (t.get("season") or "").strip()
    if "/" in season:
        left = season.split("/")[0].strip()
        if len(left) == 2 and left.isdigit():
            return "20" + left
        if len(left) == 4 and left.isdigit():
            return left
    return ""


def _joined_club_name_ceapi(t: dict[str, Any]) -> str:
    """ceapi uses nested to/from objects with clubName (not toClubName)."""
    to_block = t.get("to")
    if isinstance(to_block, dict):
        return (to_block.get("clubName") or "").strip()
    return ""


async def _get_transfer_history(pid: int) -> list[dict[str, str]]:
    """Fetch transfer history from Transfermarkt ceapi (Joined club + join year); skip youth teams."""
    endpoints: list[tuple[str, str]] = [
        (
            f"https://www.transfermarkt.com/ceapi/transferHistory/list/{pid}",
            "https://www.transfermarkt.com",
        ),
        (
            f"https://www.transfermarkt.co.uk/ceapi/transferHistory/list/{pid}",
            "https://www.transfermarkt.co.uk",
        ),
    ]
    data: Optional[dict[str, Any]] = None

    try:
        ck = _transfermarkt_cookie_header_value()
        for url, referer in endpoints:
            curl_cmd: list[str] = [
                _curl_executable(),
                "-sL",
                "-m",
                "15",
                "-A",
                _CURL_UA,
                "-H",
                "Accept: application/json",
                "-H",
                f"Referer: {referer}",
            ]
            if ck:
                curl_cmd.extend(["-H", f"Cookie: {ck}"])
            curl_cmd.append(url)
            proc = await asyncio.create_subprocess_exec(
                *curl_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _stderr = await proc.communicate()
            raw_output = stdout.decode("utf-8").strip()
            if raw_output and raw_output.startswith("{"):
                data = json.loads(raw_output)
                break

        if data is None:
            print(
                f"    [Transfer API BLOCKED] Player {pid} returned non-JSON on .com and .co.uk "
                f"(set TRANSFERMARKT_COOKIE from a logged-in browser tab)",
                file=sys.stderr,
            )
            return []

    except Exception as e:
        print(f"    [Transfer API Error] Player {pid}: {e}", file=sys.stderr)
        return []

    transfers = data.get("transfers", [])
    history: list[dict[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()

    # ceapi lists newest first; reverse for chronological order (first senior club joined → latest)
    for t in reversed(transfers):
        if not isinstance(t, dict):
            continue
        to_club = _joined_club_name_ceapi(t)
        if not to_club:
            continue
        if _is_youth_or_reserve(to_club):
            continue
        year = _year_from_ceapi_transfer(t)
        key = (to_club, year)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        history.append({"club": to_club, "year": year})

    return history


@dataclass
class PlayerOut:
    name: str
    position: str
    age: Any
    nationality: str
    club: str
    appearances: int = 0
    goals: int = 0
    assists: int = 0
    transfer_history: list[dict[str, str]] = field(default_factory=list)
    club_career_totals: dict[str, Any] = field(default_factory=dict)
    national_team_career_totals: dict[str, Any] = field(default_factory=dict)


def _strip_youth_nt_display(name: str) -> str:
    m = YOUTH_NT_SUFFIX.match((name or "").strip())
    return m.group(1).strip() if m else (name or "")


async def _nationality_label(
    tmkt: TMKT,
    pdata: dict[str, Any],
    nationality_map: dict[str, str],
    nt_name_cache: dict[str, str],
) -> str:
    nat_ids = ((pdata.get("nationalityDetails") or {}).get("nationalities") or {})
    nid = nat_ids.get("nationalityId")
    if nid is not None and str(nid) in nationality_map:
        return nationality_map[str(nid)]
    for a in pdata.get("clubAssignments") or []:
        if (a or {}).get("type") == "nationalTeam":
            cid = str((a or {}).get("clubId") or "")
            if not cid or cid == "0":
                continue
            if cid not in nt_name_cache:
                cdata = await _get_club_safe(tmkt, int(cid))
                nt_name_cache[cid] = (cdata or {}).get("name") or ""
            if nt_name_cache[cid]:
                return _strip_youth_nt_display(nt_name_cache[cid])
    if nid is not None:
        return f"TM nationality id {nid}"
    return ""


async def _domestic_club_id_for_display(
    tmkt: TMKT, assignments: list[dict[str, Any]]
) -> Optional[str]:
    for a in assignments:
        if (a or {}).get("type") != "current":
            continue
        cid = int((a or {}).get("clubId") or 0)
        if not cid:
            continue
        ctmp = await _get_club_safe(tmkt, cid)
        if ctmp and not (ctmp.get("baseDetails") or {}).get("isNationalTeam"):
            return str(cid)
    for a in assignments:
        if (a or {}).get("type") == "current":
            cid = (a or {}).get("clubId")
            if cid:
                return str(cid)
    return None


async def fetch_squad_payload(
    tmkt: TMKT,
    club_id: int,
    *,
    official_squad_name: str = "",
    nationality_map: dict[str, str],
    club_name_cache: dict[str, str],
    nt_name_cache: dict[str, str],
    player_cache: dict[str, Any],
    stats_cache: dict[str, tuple[int, int, int]],
    transfer_cache: dict[str, list[dict[str, str]]],
    club_career_cache: dict[str, dict[str, Any]],
    national_career_cache: dict[str, dict[str, Any]],
    season_id: Optional[int],
    national_team_squad: bool = False,
    season_competition_id: Optional[str] = None,
    season_label_hint: Optional[str] = None,
) -> dict[str, Any]:
    squad = await tmkt.get_club_squad(club_id)
    if not squad.get("success"):
        raise RuntimeError(squad.get("message", "squad failed"))
    pids = (squad.get("data") or {}).get("playerIds") or []
    out: dict[str, list[PlayerOut]] = {
        "goalkeepers": [],
        "defenders": [],
        "midfielders": [],
        "attackers": [],
    }
    if pids:
        print(
            f"    … {len(pids)} players: fetching profiles + season stats + transfers (parallel)…",
            file=sys.stderr,
            flush=True,
        )
        
        # LOWERED CONCURRENCY FROM 12 to 3 SO CLOUDFLARE DOES NOT BAN YOUR IP
        _io_sem = asyncio.Semaphore(3)

        async def _prefetch_one(pid_int: int) -> None:
            try:
                async with _io_sem:
                    pid_s = str(pid_int)
                    if pid_s not in player_cache:
                        player_cache[pid_s] = await tmkt.get_player(pid_int)
                    pr = player_cache[pid_s]
                    rel_url: Optional[str] = None
                    is_gk = False
                    if isinstance(pr, dict) and pr.get("success"):
                        d = pr.get("data") or {}
                        rel_url = d.get("relativeUrl")
                        is_gk = _is_goalkeeper_from_player_response(pr)
                    await _season_stats_for_player(
                        tmkt,
                        pid_int,
                        season_id,
                        stats_cache,
                        season_competition_id=season_competition_id,
                        relative_url=rel_url,
                        is_goalkeeper=is_gk,
                        season_label_hint=season_label_hint,
                    )
                    if pid_s not in transfer_cache:
                        transfer_cache[pid_s] = await _get_transfer_history(pid_int)
                    if pid_s not in club_career_cache:
                        club_career_cache[pid_s] = await _club_career_totals_for_player(
                            tmkt, pid_int, rel_url, is_goalkeeper=is_gk
                        )
                    if pid_s not in national_career_cache:
                        national_career_cache[pid_s] = (
                            await _national_career_totals_for_player(
                                tmkt, pid_int, rel_url, is_goalkeeper=is_gk
                            )
                        )
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(
                    f"    [Prefetch Error] player {pid_int}: {e}",
                    file=sys.stderr,
                    flush=True,
                )

        await asyncio.gather(*(_prefetch_one(int(x)) for x in pids))
        print("    … building positions & labels…", file=sys.stderr, flush=True)

    n_p = len(pids)
    for idx, pid in enumerate(pids, start=1):
        if idx > 1 and (idx == 2 or idx % 8 == 0 or idx == n_p):
            print(
                f"    … roster {idx}/{n_p}",
                file=sys.stderr,
                flush=True,
            )
        pid_s = str(pid)
        if pid_s not in player_cache:
            player_cache[pid_s] = await tmkt.get_player(int(pid))
        pr = player_cache[pid_s]
        if not pr.get("success"):
            continue
        pdata = pr["data"]
        attrs = pdata.get("attributes") or {}
        pos = (attrs.get("position") or {}).get("name") or ""
        age = (pdata.get("lifeDates") or {}).get("age")
        nat_label = await _nationality_label(
            tmkt, pdata, nationality_map, nt_name_cache
        )
        assignments = pdata.get("clubAssignments") or []
        if national_team_squad:
            current_cid = await _domestic_club_id_for_display(tmkt, assignments)
        else:
            current_cid = None
            for a in assignments:
                if (a or {}).get("type") == "current":
                    current_cid = str((a or {}).get("clubId"))
                    break
        club_label = ""
        if current_cid:
            if (
                official_squad_name
                and not national_team_squad
                and int(current_cid) == club_id
            ):
                club_label = official_squad_name
            else:
                if current_cid not in club_name_cache:
                    cdata = await _get_club_safe(tmkt, int(current_cid))
                    club_name_cache[current_cid] = (
                        (cdata or {}).get("name") or "" if cdata else ""
                    )
                raw_name = club_name_cache.get(current_cid) or ""
                club_label = _strip_youth_nt_display(raw_name) or raw_name
        rel_for_stats: Optional[str] = None
        is_gk_row = False
        if isinstance(pr, dict) and pr.get("success"):
            drow = pr.get("data") or {}
            rel_for_stats = drow.get("relativeUrl")
            is_gk_row = _is_goalkeeper_from_player_response(pr)
        a, g, ast = await _season_stats_for_player(
            tmkt,
            int(pid),
            season_id,
            stats_cache,
            season_competition_id=season_competition_id,
            relative_url=rel_for_stats,
            is_goalkeeper=is_gk_row,
            season_label_hint=season_label_hint,
        )
        cc_tot = club_career_cache.get(pid_s) or _empty_club_career_totals()
        nt_tot = national_career_cache.get(pid_s) or _empty_national_career_totals()
        po = PlayerOut(
            name=pdata.get("name") or "",
            position=pos,
            age=age,
            nationality=nat_label,
            club=club_label,
            appearances=a,
            goals=g,
            assists=ast,
            transfer_history=transfer_cache.get(pid_s, []),
            club_career_totals=dict(cc_tot),
            national_team_career_totals=dict(nt_tot),
        )
        out[_bucket(attrs)].append(po)
    return out


def _serialize_squad(
    *,
    kind: str,
    label: str,
    rel_image: str,
    tm_id: Optional[int],
    season_meta: dict[str, Any],
    squads: dict[str, list[PlayerOut]],
) -> dict[str, Any]:
    def _json_cc(cc: dict[str, Any]) -> dict[str, Any]:
        return {
            "appearances": int(cc.get("appearances") or 0),
            "goals": int(cc.get("goals") or 0),
            "assists": int(cc.get("assists") or 0),
            "goals_conceded": cc.get("goals_conceded"),
            "clean_sheets": cc.get("clean_sheets"),
        }

    def _json_nt(nt: dict[str, Any]) -> dict[str, Any]:
        return {
            "appearances": int(nt.get("appearances") or 0),
            "goals": int(nt.get("goals") or 0),
            "assists": nt.get("assists"),
            "goals_conceded": nt.get("goals_conceded"),
            "clean_sheets": nt.get("clean_sheets"),
        }

    def _pl(p: PlayerOut) -> dict[str, Any]:
        cc = p.club_career_totals or _empty_club_career_totals()
        nt = p.national_team_career_totals or _empty_national_career_totals()
        return {
            "name": p.name,
            "position": p.position,
            "age": p.age,
            "nationality": p.nationality,
            "club": p.club,
            "appearances": p.appearances,
            "goals": p.goals,
            "assists": p.assists,
            "transfer_history": p.transfer_history or [],
            "club_career_totals": _json_cc(cc),
            "national_team_career_totals": _json_nt(nt),
        }

    return {
        "kind": kind,
        "name": label,
        "imagePath": rel_image.replace("\\", "/"),
        "transfermarktClubId": tm_id,
        "source": {
            "provider": "Transfermarkt",
            "apiBase": "https://tmapi-alpha.transfermarkt.technology",
            "season": season_meta,
            "note": (
                "Top-level appearances/goals/assists: current season for this club's domestic league "
                "(source.season.seasonId + competitionId): ceapi performance via curl + cookie, "
                "else leistungsdaten HTML row for wettbewerb/COMP (same cookie). "
                "club_career_totals: leistungsdatendetails HTML (set TRANSFERMARKT_COOKIE if WAF blocks) "
                "else CEAPI sum; goalkeepers also get goals_conceded and clean_sheets from HTML when present. "
                "national_team_career_totals: nationalmannschaft HTML else tmapi caps/goals; "
                "goalkeepers also get conceded/clean sheets from HTML when present."
            ),
        },
        "goalkeepers": [_pl(p) for p in squads["goalkeepers"]],
        "defenders": [_pl(p) for p in squads["defenders"]],
        "midfielders": [_pl(p) for p in squads["midfielders"]],
        "attackers": [_pl(p) for p in squads["attackers"]],
    }


def _coerce_int_season_id(raw: Any) -> Optional[int]:
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw.strip())
    return None


_TM_COMP_CODE_RE = re.compile(r"^[A-Z]{1,4}\d{1,2}[A-Z]?$")


def _domestic_competition_code_from_club(
    cdata: Optional[dict[str, Any]],
) -> Optional[str]:
    """TM competition code for the club's domestic league (e.g. BE1), if present on get_club payload."""
    if not isinstance(cdata, dict):
        return None
    bd = cdata.get("baseDetails") or {}
    # tmapi-alpha often exposes only primaryCompetitionId (e.g. AZ1); other ids stay null.
    pc = bd.get("primaryCompetitionId")
    if pc is not None and str(pc).strip():
        s = str(pc).strip().upper()
        if s and s != "0":
            return s
    for key in (
        "competitionId",
        "domesticCompetitionId",
        "leagueId",
        "preliminaryCompetitionId",
    ):
        raw = bd.get(key)
        if raw is None or raw == "" or raw == 0:
            continue
        s = str(raw).strip().upper()
        if s and s != "0":
            return s
    league = cdata.get("league")
    if isinstance(league, dict):
        for key in ("id", "competitionId", "preliminaryCompetitionId"):
            raw = league.get(key)
            if raw is None:
                continue
            s = str(raw).strip().upper()
            if s and s != "0" and (_TM_COMP_CODE_RE.match(s) or len(s) <= 8):
                return s
    for block_name in ("competition", "domesticCompetition", "domesticLeague"):
        block = cdata.get(block_name)
        if not isinstance(block, dict):
            continue
        raw = block.get("id") or block.get("competitionId")
        if raw is None:
            continue
        s = str(raw).strip().upper()
        if s and s != "0":
            return s
    ac = cdata.get("activeCompetitions")
    if isinstance(ac, list):
        for first in ac:
            if not isinstance(first, dict):
                continue
            raw = first.get("id") or first.get("competitionId")
            if raw is None:
                continue
            s = str(raw).strip().upper()
            if s and s != "0":
                return s
    return None


async def season_context_for_competition(
    tmkt: TMKT,
    competition_id: str,
    *,
    fallback_meta: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], Optional[int]]:
    """Current season id + labels for a TM competition (e.g. BE1, GB1)."""
    comp = (competition_id or "").strip().upper() or "GB1"
    for variant in (comp, comp.lower()):
        try:
            r = await tmkt.get_competition(variant)
        except Exception:
            continue
        if isinstance(r, dict) and r.get("success"):
            s = (r.get("data") or {}).get("currentSeason") or {}
            sid = _coerce_int_season_id(s.get("id"))
            meta: dict[str, Any] = {
                "seasonId": sid,
                "label": s.get("display"),
                "cyclicalName": s.get("cyclicalName"),
                "competitionId": comp,
            }
            return meta, sid
    fb = fallback_meta if isinstance(fallback_meta, dict) else {}
    sid = _coerce_int_season_id(fb.get("seasonId"))
    meta = {
        "seasonId": sid,
        "label": fb.get("label"),
        "cyclicalName": fb.get("cyclicalName") or "2026",
        "competitionId": fb.get("competitionId"),
    }
    return meta, sid


async def season_context_for_club(
    tmkt: TMKT,
    club_id: int,
    *,
    club_data: Optional[dict[str, Any]] = None,
    fallback_meta: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], Optional[int]]:
    """Season context for squad stats: club's domestic league, else GB1, else fallback_meta."""
    cdata = club_data if isinstance(club_data, dict) else await _get_club_safe(tmkt, club_id)
    comp = _domestic_competition_code_from_club(cdata)
    if comp:
        return await season_context_for_competition(
            tmkt, comp, fallback_meta=fallback_meta
        )
    return await season_context_for_competition(tmkt, "GB1", fallback_meta=fallback_meta)


async def _season_hint(tmkt: TMKT) -> dict[str, Any]:
    meta, _ = await season_context_for_competition(
        tmkt,
        "GB1",
        fallback_meta={"seasonId": None, "label": None, "cyclicalName": "2026"},
    )
    return meta


async def run(args: argparse.Namespace) -> int:
    OUT_TEAMS.mkdir(parents=True, exist_ok=True)
    OUT_NAT.mkdir(parents=True, exist_ok=True)

    team_pngs = sorted(TEAMS_IMAGES.rglob("*.png"))

    if args.team:
        team_pngs = [p for p in team_pngs if args.team.lower() in p.stem.lower()]

    club_id_explicit: Optional[int] = getattr(args, "club_id", None)
    if club_id_explicit is not None:
        team_pngs = []

    nat_pngs_all = sorted(NATIONALITY_IMAGES.rglob("*.png"))
    nat_pngs = list(nat_pngs_all)
    if args.only == "teams":
        nat_pngs = []
    elif args.only == "nationalities":
        team_pngs = []

    if club_id_explicit is not None and args.only != "nationalities":
        rel_img = (getattr(args, "club_image_relative", "") or "").strip()
        if not rel_img:
            print(
                "error: --club-image-relative is required with --club-id "
                '(e.g. "Teams Images/France/Ligue 1/Paris Saint-Germain.png")',
                file=sys.stderr,
            )
            return 2

    if args.limit:
        team_pngs = team_pngs[: args.limit]
        nat_pngs = nat_pngs[: args.limit]

    nat_map_path = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict[str, str] = {}
    if nat_map_path.is_file():
        try:
            nationality_map = json.loads(nat_map_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            nationality_map = {}

    player_cache: dict[str, Any] = {}
    stats_cache: dict[str, tuple[int, int, int]] = {}
    club_name_cache: dict[str, str] = {}
    nt_name_cache: dict[str, str] = {}
    transfer_cache: dict[str, list[dict[str, str]]] = {}
    club_career_cache: dict[str, dict[str, Any]] = {}
    national_career_cache: dict[str, dict[str, Any]] = {}

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)
        season_id_hint: Optional[int] = season_meta.get("seasonId")
        if isinstance(season_id_hint, str) and season_id_hint.isdigit():
            season_id_hint = int(season_id_hint)
        elif not isinstance(season_id_hint, int):
            season_id_hint = None
        if args.refresh_nat_map:
            nationality_map = await build_nationality_id_map(
                tmkt, nat_pngs_all, concurrency=max(8, args.concurrency)
            )
            if not args.dry_run:
                nat_map_path.write_text(
                    json.dumps(nationality_map, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
        elif not nationality_map and team_pngs and not args.fast:
            print(
                "Building nationality id map from Nationality images (one-time; ~251 requests)...",
                file=sys.stderr,
            )
            nationality_map = await build_nationality_id_map(
                tmkt, nat_pngs_all, concurrency=max(8, args.concurrency)
            )
            if not args.dry_run:
                nat_map_path.write_text(
                    json.dumps(nationality_map, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
        elif nat_pngs and not team_pngs:
            partial = await build_nationality_id_map(
                tmkt, nat_pngs, concurrency=max(8, args.concurrency)
            )
            nationality_map.update(partial)
            if not args.dry_run:
                nat_map_path.write_text(
                    json.dumps(nationality_map, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )

        sem = asyncio.Semaphore(args.concurrency)

        async def one_nationality(png: Path) -> None:
            try:
                rel = png.relative_to(NATIONALITY_IMAGES)
                stem = png.stem
                qlist = _queries_for_nationality(stem)
                async with sem:
                    tid = await resolve_team_id(tmkt, qlist, want_national=True)
                    if tid is None:
                        payload = _serialize_squad(
                            kind="nationality",
                            label=_display_name_from_filename_stem(stem),
                            rel_image=str(Path("Nationality images") / rel),
                            tm_id=None,
                            season_meta=season_meta,
                            squads={
                                "goalkeepers": [],
                                "defenders": [],
                                "midfielders": [],
                                "attackers": [],
                            },
                        )
                        payload["source"]["error"] = (
                            "National team not found on Transfermarkt search"
                        )
                    else:
                        cdata_nt = await _get_club_safe(tmkt, tid)
                        official_nt = (cdata_nt or {}).get("name") or ""
                        official_nt = (
                            _strip_youth_nt_display(official_nt)
                            or _display_name_from_filename_stem(stem)
                        )
                        squads = await fetch_squad_payload(
                            tmkt,
                            tid,
                            official_squad_name="",
                            nationality_map=nationality_map,
                            club_name_cache=club_name_cache,
                            nt_name_cache=nt_name_cache,
                            player_cache=player_cache,
                            stats_cache=stats_cache,
                            transfer_cache=transfer_cache,
                            club_career_cache=club_career_cache,
                            national_career_cache=national_career_cache,
                            season_id=season_id_hint,
                            national_team_squad=True,
                        )
                        payload = _serialize_squad(
                            kind="nationality",
                            label=official_nt,
                            rel_image=str(Path("Nationality images") / rel),
                            tm_id=tid,
                            season_meta=season_meta,
                            squads=squads,
                        )
                out_path = OUT_NAT / rel.with_suffix(".json")
                out_path.parent.mkdir(parents=True, exist_ok=True)
                if not args.dry_run:
                    out_path.write_text(
                        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                    )
            except Exception as exc:  # noqa: BLE001 — log per-file failures
                print(f"[nationality] {png}: {exc}", file=sys.stderr)

        async def one_club(png: Path) -> None:
            try:
                rel = png.relative_to(TEAMS_IMAGES)
                stem = png.stem
                primary = _stem_team_query(stem + ".png")
                parts = list(rel.parts)
                extra: list[str] = []
                if len(parts) >= 2:
                    leaf = Path(parts[-1]).stem
                    leaf = re.sub(r"\.football-logos\.cc$", "", leaf, flags=re.IGNORECASE)
                    league = parts[-2] if len(parts) >= 2 else ""
                    extra.append(f"{leaf} {league}".strip())
                    extra.append(f"{primary} {parts[0]}".strip())
                queries = [primary] + [e for e in extra if e and e not in (primary,)]
                async with sem:
                    tid = await resolve_team_id(tmkt, queries, want_national=False)
                    if tid is None:
                        payload = _serialize_squad(
                            kind="club",
                            label=_display_name_from_filename_stem(stem),
                            rel_image=str(Path("Teams Images") / rel),
                            tm_id=None,
                            season_meta=season_meta,
                            squads={
                                "goalkeepers": [],
                                "defenders": [],
                                "midfielders": [],
                                "attackers": [],
                            },
                        )
                        payload["source"]["error"] = (
                            "Club not resolved via Transfermarkt search"
                        )
                    else:
                        cdata = await _get_club_safe(tmkt, tid)
                        official_club = (cdata or {}).get("name") or ""
                        official_club = official_club or _display_name_from_filename_stem(
                            stem
                        )
                        season_meta_club, sid_club = await season_context_for_club(
                            tmkt,
                            tid,
                            club_data=cdata,
                            fallback_meta=season_meta,
                        )
                        smc = (
                            season_meta_club
                            if isinstance(season_meta_club, dict)
                            else {}
                        )
                        cv = smc.get("competitionId")
                        comp_stats = (
                            str(cv).strip().upper()
                            if cv is not None and str(cv).strip()
                            else None
                        )
                        lbl = (
                            str(smc.get("label")).strip()
                            if isinstance(smc, dict) and smc.get("label")
                            else None
                        )
                        squads = await fetch_squad_payload(
                            tmkt,
                            tid,
                            official_squad_name=official_club,
                            nationality_map=nationality_map,
                            club_name_cache=club_name_cache,
                            nt_name_cache=nt_name_cache,
                            player_cache=player_cache,
                            stats_cache=stats_cache,
                            transfer_cache=transfer_cache,
                            club_career_cache=club_career_cache,
                            national_career_cache=national_career_cache,
                            season_id=sid_club,
                            national_team_squad=False,
                            season_competition_id=comp_stats,
                            season_label_hint=lbl,
                        )
                        payload = _serialize_squad(
                            kind="club",
                            label=official_club,
                            rel_image=str(Path("Teams Images") / rel),
                            tm_id=tid,
                            season_meta=season_meta_club,
                            squads=squads,
                        )
                out_path = (
                    OUT_TEAMS
                    / rel.parent
                    / f"{_safe_json_filename_stem(payload['name'])}.json"
                )
                legacy_slug_path = OUT_TEAMS / rel.with_suffix(".json")
                out_path.parent.mkdir(parents=True, exist_ok=True)
                if not args.dry_run:
                    out_path.write_text(
                        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                    )
                    if (
                        legacy_slug_path.is_file()
                        and legacy_slug_path.resolve() != out_path.resolve()
                    ):
                        legacy_slug_path.unlink()
            except Exception as exc:  # noqa: BLE001
                print(f"[club] {png}: {exc}", file=sys.stderr)

        async def one_club_by_id(tid: int) -> None:
            """Write one club JSON from a known Transfermarkt id (avoids ambiguous logo filename search)."""
            try:
                image_rel = (getattr(args, "club_image_relative", "") or "").strip().replace(
                    "\\", "/"
                )
                img_p = Path(image_rel)
                teams_root = Path("Teams Images")
                try:
                    teams_sub = img_p.parent.relative_to(teams_root)
                except ValueError:
                    print(
                        f"[club-id {tid}] image path must be under Teams Images/: {image_rel}",
                        file=sys.stderr,
                    )
                    return
                cdata = await _get_club_safe(tmkt, tid)
                official_club = (cdata or {}).get("name") or ""
                if not official_club:
                    print(f"[club-id {tid}] could not load club name from tmapi", file=sys.stderr)
                    return
                season_meta_club, sid_club = await season_context_for_club(
                    tmkt,
                    tid,
                    club_data=cdata,
                    fallback_meta=season_meta,
                )
                smc = season_meta_club if isinstance(season_meta_club, dict) else {}
                cv = smc.get("competitionId")
                comp_stats = (
                    str(cv).strip().upper()
                    if cv is not None and str(cv).strip()
                    else None
                )
                lbl = (
                    str(smc.get("label")).strip()
                    if isinstance(smc, dict) and smc.get("label")
                    else None
                )
                squads = await fetch_squad_payload(
                    tmkt,
                    tid,
                    official_squad_name=official_club,
                    nationality_map=nationality_map,
                    club_name_cache=club_name_cache,
                    nt_name_cache=nt_name_cache,
                    player_cache=player_cache,
                    stats_cache=stats_cache,
                    transfer_cache=transfer_cache,
                    club_career_cache=club_career_cache,
                    national_career_cache=national_career_cache,
                    season_id=sid_club,
                    national_team_squad=False,
                    season_competition_id=comp_stats,
                    season_label_hint=lbl,
                )
                payload = _serialize_squad(
                    kind="club",
                    label=official_club,
                    rel_image=image_rel,
                    tm_id=tid,
                    season_meta=season_meta_club,
                    squads=squads,
                )
                out_path = (
                    OUT_TEAMS
                    / teams_sub
                    / f"{_safe_json_filename_stem(payload['name'])}.json"
                )
                legacy_slug_path = OUT_TEAMS / teams_sub / f"{img_p.stem}.json"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                if not args.dry_run:
                    out_path.write_text(
                        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                    )
                    if (
                        legacy_slug_path.is_file()
                        and legacy_slug_path.resolve() != out_path.resolve()
                    ):
                        legacy_slug_path.unlink()
            except Exception as exc:  # noqa: BLE001
                print(f"[club-id {tid}] {exc}", file=sys.stderr)

        tasks = [asyncio.create_task(one_nationality(p)) for p in nat_pngs]
        tasks += [asyncio.create_task(one_club(p)) for p in team_pngs]
        if club_id_explicit is not None and args.only != "nationalities":
            tasks.append(asyncio.create_task(one_club_by_id(club_id_explicit)))
        for c in asyncio.as_completed(tasks):
            await c

    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Generate squad JSON from Transfermarkt (tmapi).")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write any files (no JSON, no nationality-id map).",
    )
    p.add_argument("--limit", type=int, default=0, help="Max files per category (for testing)")
    p.add_argument("--team", type=str, default="", help="Filter by a specific team name")
    p.add_argument(
        "--only",
        choices=("all", "teams", "nationalities"),
        default="all",
    )
    p.add_argument("--concurrency", type=int, default=4, help="Parallel async tasks")
    p.add_argument(
        "--refresh-nat-map",
        dest="refresh_nat_map",
        action="store_true",
        help="Rebuild _transfermarkt_nationality_id_map.json from all nationality flags.",
    )
    p.add_argument(
        "--fast",
        action="store_true",
        help="Skip automatic nationality-id map build (may leave numeric TM ids if no map file).",
    )
    p.add_argument(
        "--club-id",
        type=int,
        default=None,
        metavar="ID",
        help=(
            "Single Transfermarkt club id (e.g. 583 for Paris Saint-Germain). "
            "Skips scanning Teams Images; requires --club-image-relative. "
            "Use when the logo filename would resolve to the wrong club (e.g. PSG.png → PSG Peine)."
        ),
    )
    p.add_argument(
        "--club-image-relative",
        type=str,
        default="",
        metavar="PATH",
        help=(
            'Value for JSON imagePath, e.g. "Teams Images/France/Ligue 1/Paris Saint-Germain.png". '
            "Required with --club-id."
        ),
    )
    args = p.parse_args()
    if args.dry_run:
        print("Dry run: no files written.", file=sys.stderr)
    rc = asyncio.run(run(args))
    raise SystemExit(rc)


if __name__ == "__main__":
    main()