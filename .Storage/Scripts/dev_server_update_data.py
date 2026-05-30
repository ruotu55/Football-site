"""HTTP handlers for the per-runner Update Data feature (dev server only).

Endpoints (mounted from each runner's run_site.py):
  POST /__update-data/start    body: {"cookie": str, "paths": [str, ...]}
  GET  /__update-data/progress?id=<jobId>

The worker thread imports legacy refresh helpers from
    .Storage/Legacy/Legacy - Scripts/generate_squads_from_transfermarkt.py
without modifying them.
"""
from __future__ import annotations

import json
import os
import secrets
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Sequence
from urllib.parse import parse_qs, urlparse


_TEAMS_SUBPATH = (".Storage", "Squad Formation", "Teams")
_NAT_SUBPATH = (".Storage", "Squad Formation", "Nationalities")
_HISTORY_REL = (".Storage", "update-data-history.json")

import sys as _ud_sys


def _gk_log(msg: str) -> None:
    """stderr log line tagged for the GK scrape diagnostic stream."""
    print(f"[update-data][gk] {msg}", file=_ud_sys.stderr, flush=True)


class InvalidPathError(ValueError):
    """Raised when a client-supplied team JSON path fails validation."""


def _strip_leading_dotdot(path: str) -> str:
    """Drop a single leading '../' if present (frontend's runner-relative form)."""
    s = path.replace("\\", "/")
    if s.startswith("../"):
        s = s[3:]
    return s


def _validate_and_resolve_path(project_root: Path, path: str) -> Path:
    """Resolve a client-supplied path under the project root and verify it lies
    inside Squad Formation/Teams or Squad Formation/Nationalities.

    Raises InvalidPathError if anything is off (traversal, wrong subtree, wrong
    extension, missing file).
    """
    if not isinstance(path, str) or not path.strip():
        raise InvalidPathError("empty path")
    rel = _strip_leading_dotdot(path.strip())
    candidate = (project_root / rel).resolve()

    teams_root = (project_root / Path(*_TEAMS_SUBPATH)).resolve()
    nat_root = (project_root / Path(*_NAT_SUBPATH)).resolve()

    inside = False
    for root in (teams_root, nat_root):
        try:
            candidate.relative_to(root)
            inside = True
            break
        except ValueError:
            continue
    if not inside:
        raise InvalidPathError(f"outside Squad Formation/(Teams|Nationalities): {path}")
    if candidate.suffix.lower() != ".json":
        raise InvalidPathError(f"not a .json file: {path}")
    if not candidate.is_file():
        raise InvalidPathError(f"file does not exist: {path}")
    return candidate


def _apply_career_totals_monotonic_guard(new_payload: dict, old_payload: dict) -> None:
    """Mutate new_payload in place so career totals never regress vs old_payload.

    For every player matched by name across the four position buckets, ensures that
    `club_career_totals` and `national_team_career_totals` fields (`appearances`,
    `goals`, `assists`, `goals_conceded`, `clean_sheets`) never go down. If the new
    value is None or numerically less than the old value, the old value wins.

    The legacy scraper occasionally returns 0/None for goalkeeper goals_conceded and
    clean_sheets when the HTML page is partially blocked or the parser misaligns;
    this guard keeps career stats monotonic without trying to fix the legacy code.
    """
    if not isinstance(new_payload, dict) or not isinstance(old_payload, dict):
        return
    fields = ("appearances", "goals", "assists", "goals_conceded", "clean_sheets")
    totals_keys = ("club_career_totals", "national_team_career_totals")
    for bucket in ("goalkeepers", "defenders", "midfielders", "attackers"):
        new_list = new_payload.get(bucket)
        old_list = old_payload.get(bucket)
        if not isinstance(new_list, list) or not isinstance(old_list, list):
            continue
        old_by_name = {}
        for op in old_list:
            if isinstance(op, dict):
                name = op.get("name")
                if isinstance(name, str):
                    old_by_name[name] = op
        for np in new_list:
            if not isinstance(np, dict):
                continue
            op = old_by_name.get(np.get("name"))
            if not isinstance(op, dict):
                continue
            for tk in totals_keys:
                nt = np.get(tk)
                ot = op.get(tk)
                if not isinstance(nt, dict) or not isinstance(ot, dict):
                    continue
                for f in fields:
                    nv = nt.get(f)
                    ov = ot.get(f)
                    if not isinstance(ov, (int, float)):
                        continue
                    if nv is None or (isinstance(nv, (int, float)) and nv < ov):
                        nt[f] = ov


import re as _re_gk


_GK_HEADER_GC_PATTERNS = [
    r"\bgoals?\s*conceded\b",
    r"\bgegentore?\b",
    r"\bg\.?\s*against\b",
    r"\bgoals?\s*against\b",
    r"\bconceded\s*goals?\b",
    r"^\s*ga\s*$",       # abbreviation
    r"^\s*gc\s*$",
]
_GK_HEADER_CS_PATTERNS = [
    r"\bclean\s*sheets?\b",
    r"\bzu\s*null\b",
    r"\bohne\s*gegentor\b",
    r"\bsh(?:eet|t)s?\s*ohne",
    r"^\s*cs\s*$",
]


def _gk_match_header(text: str, patterns: list[str]) -> bool:
    """Case-insensitive whole-word match against any of the patterns."""
    s = (text or "").strip()
    for pat in patterns:
        if _re_gk.search(pat, s, _re_gk.IGNORECASE):
            return True
    return False


def _gk_parse_int(cell: str) -> int | None:
    """Parse a Transfermarkt-style stat cell like '252', '1.234', '-' into int (or None)."""
    s = (cell or "").strip().replace("–", "-").replace("—", "-")
    if s in ("", "-", "—"):
        return None
    s = s.replace(".", "").replace(",", "")
    if s.isdigit():
        return int(s)
    return None


def _gk_profile_to_details_path(relative_url: str | None, pid: int) -> str:
    """Build a leistungsdatendetails path from profile URL (or pid fallback).

    Handles absolute/relative TM profile URLs and preserves the slug when present.
    """
    pid_s = str(int(pid))
    if isinstance(relative_url, str) and relative_url.strip():
        raw = relative_url.strip()
        parsed = urlparse(raw)
        path = (parsed.path or raw).split("?", 1)[0]
        path = path.strip()
        if "/profil/spieler/" in path:
            base = path.replace("/profil/spieler/", "/leistungsdatendetails/spieler/", 1)
            if not base.startswith("/"):
                base = "/" + base
            return base
        m = _re_gk.search(r"/spieler/(\d+)", path)
        if m:
            return f"/-/leistungsdatendetails/spieler/{m.group(1)}"
    return f"/-/leistungsdatendetails/spieler/{pid_s}"


def _gk_extract_totals_from_per_club_api(payload: object) -> tuple[int | None, int | None]:
    """Extract GK career totals from TMKT get_player_stats_per_club() payload.

    Expected shape (current tmkt package): a dict with `performances` list where
    each row can include `concededGoals` and `cleanSheets`.
    """
    if not isinstance(payload, dict):
        return (None, None)
    rows = payload.get("performances")
    if not isinstance(rows, list) or not rows:
        return (None, None)
    gc_total = 0
    cs_total = 0
    has_gc = False
    has_cs = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        gc_v = row.get("concededGoals")
        cs_v = row.get("cleanSheets")
        if isinstance(gc_v, (int, float)) and gc_v >= 0:
            gc_total += int(gc_v)
            has_gc = True
        if isinstance(cs_v, (int, float)) and cs_v >= 0:
            cs_total += int(cs_v)
            has_cs = True
    return (gc_total if has_gc else None, cs_total if has_cs else None)


def _player_current_season_totals_from_rows(
    rows: object, *, is_goalkeeper: bool
) -> dict[str, int | None]:
    """Aggregate one player's current-season rows across all competitions."""
    out: dict[str, int | None] = {
        "appearances": 0,
        "goals": 0,
        "assists": 0,
    }
    if is_goalkeeper:
        out["goals_conceded"] = None
        out["clean_sheets"] = None
    if not isinstance(rows, list):
        return out

    apps = goals = assists = 0
    gc_total = cs_total = 0
    has_gc = has_cs = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        apps += int(row.get("gamesPlayed") or row.get("appearances") or 0)
        goals += int(row.get("goalsScored") or row.get("goals") or 0)
        assists += int(row.get("assists") or 0)
        if is_goalkeeper:
            gc_raw = row.get("concededGoals")
            if gc_raw is None:
                gc_raw = row.get("goalsConceded")
            cs_raw = row.get("cleanSheets")
            if gc_raw is not None:
                gc_total += int(gc_raw or 0)
                has_gc = True
            if cs_raw is not None:
                cs_total += int(cs_raw or 0)
                has_cs = True
    out["appearances"] = apps
    out["goals"] = goals
    out["assists"] = assists
    if is_goalkeeper:
        out["goals_conceded"] = gc_total if has_gc else None
        out["clean_sheets"] = cs_total if has_cs else None
    return out


def _reorder_player_fields_for_output(player: dict, *, is_goalkeeper: bool) -> dict:
    """Return player dict with stable field order for JSON output."""
    if not isinstance(player, dict):
        return player
    ordered: dict = {}
    key_order = [
        "name",
        "position",
        "age",
        "nationality",
        "club",
        "appearances",
        "goals",
        "assists",
    ]
    if is_goalkeeper:
        key_order.extend(["goals_conceded", "clean_sheets"])
    key_order.extend(
        [
            "transfer_history",
            "club_career_totals",
            "national_team_career_totals",
            "shirt_number",
        ]
    )
    for k in key_order:
        if k in player:
            ordered[k] = player[k]
    # Preserve any unexpected fields at the end.
    for k, v in player.items():
        if k not in ordered:
            ordered[k] = v
    return ordered


def _reorder_all_players_in_payload(payload: dict) -> None:
    """Apply stable per-player field order across all four buckets."""
    for bucket in ("goalkeepers", "defenders", "midfielders", "attackers"):
        players = payload.get(bucket)
        if not isinstance(players, list):
            continue
        is_gk_bucket = bucket == "goalkeepers"
        for idx, pl in enumerate(players):
            if isinstance(pl, dict):
                players[idx] = _reorder_player_fields_for_output(
                    pl, is_goalkeeper=is_gk_bucket
                )


def _players_missing_shirt_numbers(payload: dict) -> list[str]:
    """Return display names of players with no ``shirt_number`` after refresh."""
    missing: list[str] = []
    for bucket in ("goalkeepers", "defenders", "midfielders", "attackers"):
        players = payload.get(bucket)
        if not isinstance(players, list):
            continue
        for pl in players:
            if not isinstance(pl, dict):
                continue
            name = (pl.get("name") or "").strip()
            if name and pl.get("shirt_number") is None:
                missing.append(name)
    return missing


async def _build_club_name_meta(tmkt, fill_module, cid: int, *, sem=None):
    """Fetch a club's squad once and build the player name->(pid, relUrl) map.

    Shared by the current-season, shirt-number, and GK passes so each team hits
    get_club_squad + _build_name_to_meta ONCE per refresh. Returns
    (squad_response, name_meta); ({}, {}) on any failure."""
    import asyncio as _ud_asyncio_local
    try:
        squad = await tmkt.get_club_squad(cid)
    except Exception as exc:  # noqa: BLE001
        _gk_log(f"  name-meta prefetch: get_club_squad({cid}) failed: {type(exc).__name__}: {exc}")
        return {}, {}
    if not isinstance(squad, dict) or not squad.get("success"):
        _gk_log(f"  name-meta prefetch: get_club_squad({cid}) no success")
        return {}, {}
    pids = (squad.get("data") or {}).get("playerIds") or []
    if not pids:
        _gk_log(f"  name-meta prefetch: get_club_squad({cid}) no playerIds")
        return squad, {}
    if sem is None:
        sem = _ud_asyncio_local.Semaphore(4)
    try:
        name_meta = await fill_module._build_name_to_meta(tmkt, pids, sem=sem)
    except Exception as exc:  # noqa: BLE001
        _gk_log(f"  name-meta prefetch: _build_name_to_meta failed: {type(exc).__name__}: {exc}")
        return squad, {}
    _gk_log(f"  name-meta prefetch: {len(name_meta)} entries from {len(pids)} pids (shared)")
    return squad, name_meta


async def _patch_current_season_totals_in_payload(
    payload: dict,
    tmkt,
    fill_module,
    *,
    cid: int,
    season_id: int | None,
    prefetched: tuple | None = None,
) -> None:
    """Patch top-level player season stats to include all competitions.

    Uses TMKT get_player_stats(..., season=season_id) rows and sums them across
    all competitions (league + cups + continental) for each player.

    `prefetched` (squad_response, name_meta) — when supplied by the caller (shared
    with the shirt-fill and GK passes), skips this pass's own get_club_squad +
    _build_name_to_meta.
    """
    if not isinstance(payload, dict):
        return

    import asyncio as _ud_asyncio_local

    if prefetched is not None:
        squad, name_meta = prefetched
        if not isinstance(squad, dict) or not squad.get("success") or not name_meta:
            _gk_log("  current-season patch: empty prefetched squad/name-meta, skip")
            return
        pids = (squad.get("data") or {}).get("playerIds") or []
        if not pids:
            _gk_log("  current-season patch: prefetched squad has no playerIds, skip")
            return
    else:
        try:
            squad = await tmkt.get_club_squad(cid)
        except Exception as exc:  # noqa: BLE001
            _gk_log(f"  current-season patch: get_club_squad({cid}) failed: {type(exc).__name__}: {exc}")
            return
        if not isinstance(squad, dict) or not squad.get("success"):
            _gk_log(f"  current-season patch: get_club_squad({cid}) no success")
            return
        pids = (squad.get("data") or {}).get("playerIds") or []
        if not pids:
            _gk_log(f"  current-season patch: get_club_squad({cid}) returned no playerIds")
            return
        sem = _ud_asyncio_local.Semaphore(4)
        try:
            name_meta = await fill_module._build_name_to_meta(tmkt, pids, sem=sem)
        except Exception as exc:  # noqa: BLE001
            _gk_log(f"  current-season patch: _build_name_to_meta failed: {type(exc).__name__}: {exc}")
            return

    stats_by_pid: dict[int, dict[str, int | None]] = {}

    async def one(pid_raw) -> None:
        pid_int = int(pid_raw)
        rows = None
        try:
            if season_id is not None:
                rows = await tmkt.get_player_stats(pid_int, season=season_id)
            else:
                rows = await tmkt.get_player_stats(pid_int)
        except Exception:  # noqa: BLE001
            try:
                rows = await tmkt.get_player_stats(pid_int)
            except Exception:  # noqa: BLE001
                rows = None
        # Keep full aggregate + GK-specific aggregate; we select by bucket later.
        all_totals = _player_current_season_totals_from_rows(rows, is_goalkeeper=False)
        gk_totals = _player_current_season_totals_from_rows(rows, is_goalkeeper=True)
        merged = dict(all_totals)
        merged["goals_conceded"] = gk_totals.get("goals_conceded")
        merged["clean_sheets"] = gk_totals.get("clean_sheets")
        stats_by_pid[pid_int] = merged

    await _ud_asyncio_local.gather(*(one(pid_raw) for pid_raw in pids))

    buckets = ("goalkeepers", "defenders", "midfielders", "attackers")
    patched = 0
    for bucket in buckets:
        players = payload.get(bucket)
        if not isinstance(players, list):
            continue
        is_gk_bucket = bucket == "goalkeepers"
        for idx, pl in enumerate(players):
            if not isinstance(pl, dict):
                continue
            pname = (pl.get("name") or "").strip()
            if not pname:
                continue
            meta = name_meta.get(pname)
            if not meta:
                low = pname.lower()
                for k, v in name_meta.items():
                    kl = k.lower()
                    if kl == low or low in kl or kl in low:
                        meta = v
                        break
            if not meta:
                continue
            pid_int = int(meta[0])
            st = stats_by_pid.get(pid_int)
            if not isinstance(st, dict):
                continue
            pl["appearances"] = int(st.get("appearances") or 0)
            pl["goals"] = int(st.get("goals") or 0)
            pl["assists"] = int(st.get("assists") or 0)
            if is_gk_bucket:
                pl["goals_conceded"] = (
                    int(st["goals_conceded"])
                    if isinstance(st.get("goals_conceded"), (int, float))
                    else None
                )
                pl["clean_sheets"] = (
                    int(st["clean_sheets"])
                    if isinstance(st.get("clean_sheets"), (int, float))
                    else None
                )
            players[idx] = _reorder_player_fields_for_output(pl, is_goalkeeper=is_gk_bucket)
            patched += 1
    _gk_log(f"  current-season patch: updated season totals for {patched} players")


def _gk_extract_totals_from_html(html: str) -> tuple[int | None, int | None]:
    """Extract (goals_conceded, clean_sheets) from a leistungsdatendetails HTML.

    Tries three strategies and picks the one with the highest goals_conceded:
    - Strategy A: match column headers by text (English/German variants).
    - Strategy B: find every <tr> containing 'Total'/'Gesamt'/'Insgesamt' and parse
      cells positionally using the cards-column anchor (matches \\d+/\\d+/\\d+).
    - Strategy C: rightmost minutes-shaped cell as anchor, scan leftward.
    """
    if not html or _tm_html_blocked_local(html):
        return (None, None)

    # Collect all candidates from every table in the page.
    candidates: list[tuple[int, int]] = []  # (goals_conceded, clean_sheets)

    # Strategy A: header-based across all tables
    for table_match in _re_gk.finditer(r"(?is)<table[^>]*>(.*?)</table>", html):
        table = table_match.group(1)
        gc, cs = _gk_extract_strategy_a(table)
        if gc is not None and gc > 0:
            candidates.append((gc, cs if cs is not None else 0))

    # Strategy B + C: scan all <tr> for Total rows
    total_label_re = _re_gk.compile(r"(?i)\b(?:Total|Gesamt|Insgesamt|Summe)\b")
    cards_re = _re_gk.compile(r"(?:\d+|-|–|—)\s*/\s*(?:\d+|-|–|—)\s*/\s*(?:\d+|-|–|—)")
    minutes_re = _re_gk.compile(r"^\d{1,3}(?:[.,]\d{3})+\s*(?:'|’|′)?$|^\d+\s*(?:'|’|′)$")

    for tr_match in _re_gk.finditer(r"(?is)<tr[^>]*>(.*?)</tr>", html):
        tr_inner = tr_match.group(1)
        plain = _re_gk.sub(r"<[^>]+>", " ", tr_inner)
        plain = _re_gk.sub(r"\s+", " ", plain).strip()
        if not total_label_re.search(plain):
            continue
        cells = _gk_td_texts(tr_inner)
        if len(cells) < 5:
            continue

        # Strategy B: cards-column anchor
        for i in range(len(cells) - 1, -1, -1):
            t = (cells[i] or "").strip().replace("–", "-").replace("—", "-")
            if cards_re.search(t):
                # cells[i] = cards. Try i+1=conceded, i+2=clean.
                if i + 2 < len(cells):
                    gc = _gk_parse_int(cells[i + 1])
                    cs = _gk_parse_int(cells[i + 2])
                    if gc is not None and gc > 0:
                        candidates.append((gc, cs if cs is not None else 0))
                # Also try i+2=conceded, i+3=clean (in case there's an extra column)
                if i + 3 < len(cells):
                    gc2 = _gk_parse_int(cells[i + 2])
                    cs2 = _gk_parse_int(cells[i + 3])
                    if gc2 is not None and gc2 > 0:
                        candidates.append((gc2, cs2 if cs2 is not None else 0))
                break

        # Strategy C: rightmost minutes cell as anchor
        mi = None
        for i in range(len(cells) - 1, -1, -1):
            t = (cells[i] or "").strip()
            if minutes_re.match(t):
                mi = i
                break
        if mi is not None and mi >= 2:
            # Try mi-2=clean, mi-3=conceded (legacy GK layout)
            gc = _gk_parse_int(cells[mi - 3]) if mi >= 3 else None
            cs = _gk_parse_int(cells[mi - 2]) if mi >= 2 else None
            if gc is not None and gc > 0:
                candidates.append((gc, cs if cs is not None else 0))
            # Also try mi-1=clean, mi-2=conceded (alternate layout)
            gc2 = _gk_parse_int(cells[mi - 2]) if mi >= 2 else None
            cs2 = _gk_parse_int(cells[mi - 1]) if mi >= 1 else None
            if gc2 is not None and gc2 > 0:
                candidates.append((gc2, cs2 if cs2 is not None else 0))

    if not candidates:
        return (None, None)
    # Pick the candidate with the highest goals_conceded (career total >> single season).
    best = max(candidates, key=lambda t: t[0])
    return (best[0], best[1] if best[1] > 0 else None)


def _gk_td_texts(tr_inner: str) -> list[str]:
    """Extract clean text from each <td>/<th> cell in a tr's inner HTML."""
    cells: list[str] = []
    for chunk in _re_gk.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", tr_inner):
        t = _re_gk.sub(r"<[^>]+>", " ", chunk)
        t = _re_gk.sub(r"\s+", " ", t).strip()
        cells.append(t)
    return cells


def _gk_extract_strategy_a(table_html: str) -> tuple[int | None, int | None]:
    """Header-text-based extraction within a single <table>."""
    thead_match = _re_gk.search(r"(?is)<thead[^>]*>(.*?)</thead>", table_html)
    header_block = thead_match.group(1) if thead_match else table_html
    gc_col: int | None = None
    cs_col: int | None = None

    for tr_match in _re_gk.finditer(r"(?is)<tr[^>]*>(.*?)</tr>", header_block):
        tr_inner = tr_match.group(1)
        cells = _re_gk.findall(r"(?is)<th[^>]*>(.*?)</th>", tr_inner)
        if not cells:
            continue
        texts: list[str] = []
        for c in cells:
            # Also gather title= attributes from any tag inside, in case headers
            # are icon-only (TM sometimes uses <span title="Goals conceded">).
            titles = _re_gk.findall(r'(?i)\btitle\s*=\s*"([^"]*)"', c)
            txt = _re_gk.sub(r"<[^>]+>", " ", c)
            txt = _re_gk.sub(r"\s+", " ", txt).strip()
            combined = " ".join([txt] + titles).strip()
            texts.append(combined)
        for i, t in enumerate(texts):
            if gc_col is None and _gk_match_header(t, _GK_HEADER_GC_PATTERNS):
                gc_col = i
            if cs_col is None and _gk_match_header(t, _GK_HEADER_CS_PATTERNS):
                cs_col = i

    if gc_col is None and cs_col is None:
        return (None, None)

    # Find Total row (tfoot first, then any tr starting with "Total"/"Gesamt").
    total_tr: str | None = None
    tfoot_match = _re_gk.search(r"(?is)<tfoot[^>]*>(.*?)</tfoot>", table_html)
    if tfoot_match:
        m = _re_gk.search(r"(?is)<tr[^>]*>(.*?)</tr>", tfoot_match.group(1))
        if m:
            total_tr = m.group(1)
    if total_tr is None:
        for tr_match in _re_gk.finditer(r"(?is)<tr[^>]*>(.*?)</tr>", table_html):
            tr_inner = tr_match.group(1)
            first = _re_gk.search(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", tr_inner)
            if not first:
                continue
            ft = _re_gk.sub(r"<[^>]+>", " ", first.group(1))
            ft = _re_gk.sub(r"\s+", " ", ft).strip().lower()
            if ft.startswith("total") or ft.startswith("gesamt") or ft.startswith("insgesamt") or ft.startswith("zusammen"):
                total_tr = tr_inner
                break
    if not total_tr:
        return (None, None)
    td_texts = _gk_td_texts(total_tr)
    gc = _gk_parse_int(td_texts[gc_col]) if gc_col is not None and gc_col < len(td_texts) else None
    cs = _gk_parse_int(td_texts[cs_col]) if cs_col is not None and cs_col < len(td_texts) else None
    return (gc, cs)


def _tm_html_blocked_local(html: str) -> bool:
    """Cheap WAF detection without depending on the legacy module."""
    if not html:
        return True
    head = html[:8000].lower()
    return ("human verification" in head) or ("captcha-container" in head)


async def _refresh_gk_totals_for_player(
    fill_module,
    tmkt,
    *,
    pid: int,
    relative_url: str | None,
) -> tuple[int | None, int | None]:
    """Fetch a goalkeeper's leistungsdatendetails page and extract (goals_conceded, clean_sheets)."""
    # Transfermarkt's detailed-stats HTML moved to web components in many cases
    # (no static <table> in source). Prefer the per-club stats API and keep HTML
    # parsing as a fallback for older pages.
    try:
        per_club = await tmkt.get_player_stats_per_club(int(pid))
    except Exception as exc:  # noqa: BLE001
        _gk_log(f"  pid={pid}: get_player_stats_per_club raised {type(exc).__name__}: {exc}")
        per_club = None
    api_gc, api_cs = _gk_extract_totals_from_per_club_api(per_club)
    _gk_log(f"  pid={pid}: per-club API parsed (goals_conceded, clean_sheets) = ({api_gc}, {api_cs})")
    if api_gc is not None and api_gc > 0:
        return (api_gc, api_cs if api_cs is not None else None)

    path_on_site = _gk_profile_to_details_path(relative_url, pid)
    if not relative_url:
        _gk_log(f"  pid={pid}: no relativeUrl, using pid-fallback path={path_on_site}")
    else:
        _gk_log(f"  pid={pid}: relativeUrl={relative_url!r} -> path={path_on_site}")
    try:
        html = await fill_module._fetch_tm_html_prefer_session(tmkt, path_on_site)
    except Exception as exc:  # noqa: BLE001
        _gk_log(f"  pid={pid}: fetch raised {type(exc).__name__}: {exc}")
        return (None, None)
    html_len = len(html or "")
    blocked = _tm_html_blocked_local(html or "")
    _gk_log(f"  pid={pid}: fetched path={path_on_site} html_len={html_len} blocked={blocked}")
    if blocked or html_len == 0:
        return (None, None)
    gc, cs = _gk_extract_totals_from_html(html)
    _gk_log(f"  pid={pid}: parsed (goals_conceded, clean_sheets) = ({gc}, {cs})")
    if gc is None and cs is None:
        # Dump first 800 chars of the response head for diagnosis
        head = (html[:800] or "").replace("\n", " ").replace("\r", " ")
        _gk_log(f"  pid={pid}: parser returned (None, None). HTML head: {head}")
    return (gc, cs)


async def _patch_gk_career_totals_in_data(
    data: dict,
    fill_module,
    tmkt,
    *,
    label: str,
    player_cache: dict,
    legacy,
    prefetched_name_meta: dict | None = None,
) -> bool:
    """Re-fetch each goalkeeper's career goals_conceded + clean_sheets.

    Mutates ``data`` in place. Returns True when any GK totals changed."""
    gks = data.get("goalkeepers")
    if not isinstance(gks, list) or not gks:
        _gk_log(f"{label}: no goalkeepers, skip")
        return False
    cid_raw = data.get("transfermarktClubId")
    if cid_raw is None:
        _gk_log(f"{label}: no transfermarktClubId, skip GK refresh")
        return False
    try:
        cid = int(cid_raw)
    except (TypeError, ValueError):
        _gk_log(f"{label}: bad transfermarktClubId={cid_raw!r}, skip")
        return False

    _gk_log(f"{label}: starting GK refresh ({len(gks)} goalkeepers, cid={cid})")

    if prefetched_name_meta is not None:
        name_meta = prefetched_name_meta
        if not name_meta:
            _gk_log(f"  empty prefetched name-meta, skip GK refresh for {label}")
            return False
        _gk_log(f"  using shared name_meta with {len(name_meta)} entries")
    else:
        import asyncio as _ud_asyncio_local
        sem = _ud_asyncio_local.Semaphore(2)
        try:
            squad = await tmkt.get_club_squad(cid)
        except Exception as exc:  # noqa: BLE001
            _gk_log(f"  get_club_squad({cid}) raised {type(exc).__name__}: {exc}")
            return False
        if not isinstance(squad, dict) or not squad.get("success"):
            _gk_log(f"  get_club_squad({cid}) did not return success, skip")
            return False
        pids = (squad.get("data") or {}).get("playerIds") or []
        if not pids:
            _gk_log(f"  get_club_squad({cid}) returned no playerIds, skip")
            return False
        try:
            name_meta = await fill_module._build_name_to_meta(tmkt, pids, sem=sem)
        except Exception as exc:  # noqa: BLE001
            _gk_log(f"  _build_name_to_meta raised {type(exc).__name__}: {exc}")
            return False
        _gk_log(f"  built name_meta with {len(name_meta)} entries from {len(pids)} pids")

    changed = False
    for gk in gks:
        if not isinstance(gk, dict):
            continue
        gk_name = (gk.get("name") or "").strip()
        if not gk_name:
            continue
        old_gc = (gk.get("club_career_totals") or {}).get("goals_conceded")
        meta = name_meta.get(gk_name)
        if not meta:
            low = gk_name.lower()
            for k, v in name_meta.items():
                if k.lower() == low or low in k.lower() or k.lower() in low:
                    meta = v
                    _gk_log(f"  '{gk_name}' fuzzy matched '{k}'")
                    break
        if not meta:
            sample = ", ".join(list(name_meta.keys())[:8])
            _gk_log(f"  '{gk_name}': NO MATCH in name_meta. sample names: {sample}")
            continue
        pid_int_local, rel = meta
        _gk_log(f"  '{gk_name}': matched pid={pid_int_local}, rel={rel!r}, current goals_conceded={old_gc}")

        gc, cs = await _refresh_gk_totals_for_player(
            fill_module, tmkt, pid=pid_int_local, relative_url=rel,
        )
        cct = gk.setdefault("club_career_totals", {})
        before_gc = cct.get("goals_conceded")
        before_cs = cct.get("clean_sheets")
        applied = []
        if gc is not None and gc > 0 and cct.get("goals_conceded") != gc:
            cct["goals_conceded"] = gc
            applied.append(f"goals_conceded {before_gc}->{gc}")
            changed = True
        if cs is not None and cs > 0 and cct.get("clean_sheets") != cs:
            cct["clean_sheets"] = cs
            applied.append(f"clean_sheets {before_cs}->{cs}")
            changed = True
        if applied:
            _gk_log(f"    applied: {', '.join(applied)}")
        else:
            _gk_log(f"    no patch applied (gc={gc}, cs={cs})")

    if changed:
        _gk_log(f"{label}: patched GK totals in payload")
    else:
        _gk_log(f"{label}: no GK total changes")
    return changed


async def _patch_gk_career_totals(
    jp: Path,
    fill_module,
    tmkt,
    *,
    player_cache: dict,
    legacy,
    prefetched_name_meta: dict | None = None,
) -> None:
    """Re-fetch each goalkeeper's career goals_conceded + clean_sheets via the
    same proven name->pid mapping the shirt-fill uses.

    `prefetched_name_meta` — when supplied by the caller (shared with the
    current-season pass), skips this pass's own get_club_squad + _build_name_to_meta.
    """
    try:
        data = json.loads(jp.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        _gk_log(f"{jp.name}: bad JSON on read, skip")
        return

    changed = await _patch_gk_career_totals_in_data(
        data,
        fill_module,
        tmkt,
        label=jp.name,
        player_cache=player_cache,
        legacy=legacy,
        prefetched_name_meta=prefetched_name_meta,
    )
    if changed:
        jp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        _gk_log(f"{jp.name}: wrote file with patched GK totals")


class JobAlreadyRunningError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(f"a job is already running: {job_id}")
        self.job_id = job_id


_JOB_LOCK = threading.Lock()
_JOB: dict | None = None


def _reset_job_for_tests() -> None:
    """Clear the singleton — only meant for unit tests."""
    global _JOB
    with _JOB_LOCK:
        _JOB = None


def _register_job(total: int) -> str:
    global _JOB
    with _JOB_LOCK:
        if _JOB is not None and _JOB.get("status") == "running":
            raise JobAlreadyRunningError(_JOB["id"])
        jid = secrets.token_hex(8)
        _JOB = {
            "id": jid,
            "status": "running",
            "total": int(total),
            "done": 0,
            "current": "",
            "ok_count": 0,
            "failed": [],
            "error": "",
        }
        return jid


def _set_current(job_id: str, label: str) -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["current"] = str(label)


def _record_ok(job_id: str) -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["done"] += 1
            _JOB["ok_count"] += 1


def _record_failure(job_id: str, path: str, error: str) -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["done"] += 1
            _JOB["failed"].append({"path": str(path), "error": str(error)})


def _per_team_timeout_s() -> float:
    """Per-team wall-clock cap (seconds). The tmkt (aiohttp) calls have no built-in
    timeout, so one stalled Transfermarkt connection would otherwise hang the whole
    job at 0/N forever. Override with FC_UPDATE_DATA_TEAM_TIMEOUT; <=0 disables."""
    try:
        v = float(os.environ.get("FC_UPDATE_DATA_TEAM_TIMEOUT", "240") or "0")
    except (TypeError, ValueError):
        return 240.0
    return v if v > 0 else 0.0


async def _run_team_guarded(job_id: str, jp, coro, timeout_s: float) -> None:
    """Await one team's refresh `coro` with a wall-clock cap, then record a failure
    on timeout so the job advances (done++) instead of hanging forever.

    Call this AFTER acquiring the concurrency semaphore so the clock times only the
    team's actual work, not time spent queued behind other teams. The inner coro
    records its own ok/failure on normal completion; asyncio.CancelledError is a
    BaseException, so the coro's own `except Exception` never swallows the timeout
    cancellation. A timeout_s <= 0 disables the cap (awaits the coro unguarded)."""
    import asyncio
    if not timeout_s or timeout_s <= 0:
        await coro
        return
    try:
        await asyncio.wait_for(coro, timeout=timeout_s)
    except asyncio.TimeoutError:
        _record_failure(
            job_id,
            str(jp),
            f"timed out after {timeout_s:g}s - Transfermarkt stalled (skipped)",
        )


def _history_key(project_root: Path, json_path: Path) -> str:
    """Return the json_path relative to project_root using forward slashes.

    Matches the form `selectedEntry.path` takes after frontend `collectPaths`
    strips its leading '../', so the PROD validator can look up timestamps by
    the same key the frontend sends.
    """
    try:
        rel = json_path.resolve().relative_to(project_root.resolve())
    except ValueError:
        rel = json_path
    return str(rel).replace("\\", "/")


def _read_history(project_root: Path) -> dict:
    """Load the history file. Returns {"paths": {}} if missing or corrupt."""
    fp = project_root / Path(*_HISTORY_REL)
    if not fp.is_file():
        return {"paths": {}}
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"paths": {}}
    if not isinstance(data, dict) or not isinstance(data.get("paths"), dict):
        return {"paths": {}}
    return data


def _stamp_history(project_root: Path, json_path: Path) -> None:
    """Mark json_path as freshly updated in the shared history file.

    Never raises — stamping failures must not abort the refresh job.
    Local-time ISO with offset (e.g. 2026-05-22T14:32:01+03:00) so the
    PROD validator can compute the local calendar date.
    """
    try:
        fp = project_root / Path(*_HISTORY_REL)
        fp.parent.mkdir(parents=True, exist_ok=True)
        data = _read_history(project_root)
        key = _history_key(project_root, json_path)
        data["paths"][key] = datetime.now().astimezone().isoformat(timespec="seconds")
        tmp = fp.with_suffix(fp.suffix + ".tmp")
        tmp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        os.replace(tmp, fp)
    except Exception as exc:  # noqa: BLE001
        print(
            f"[update-data] _stamp_history failed for {json_path}: "
            f"{type(exc).__name__}: {exc}",
            file=_ud_sys.stderr,
            flush=True,
        )


def _finish(job_id: str, error: str = "") -> None:
    with _JOB_LOCK:
        if _JOB is not None and _JOB["id"] == job_id:
            _JOB["status"] = "error" if error else "done"
            if error:
                _JOB["error"] = str(error)


def _snapshot_job(job_id: str | None) -> dict:
    with _JOB_LOCK:
        if _JOB is None:
            return {"status": "unknown"}
        if job_id is None or _JOB["id"] != job_id:
            return {"status": "unknown"}
        # Shallow copy + deep-copy failed list so callers can't mutate
        return {
            "status": _JOB["status"],
            "total": _JOB["total"],
            "done": _JOB["done"],
            "current": _JOB["current"],
            "ok_count": _JOB["ok_count"],
            "failed": list(_JOB["failed"]),
            "error": _JOB["error"],
        }


_GET_PROGRESS_PATH = "/__update-data/progress"
_GET_HISTORY_PATH = "/__update-data/history"
_POST_START_PATH = "/__update-data/start"
_POST_START_CACHED_PATH = "/__update-data/start-cached"
_MAX_POST_BYTES = 4 * 1024 * 1024
_MAX_PATHS = 500


# ── Persisted last-known cookie ──
#
# The /start endpoint writes the cookie here on each successful job kickoff,
# and /start-cached reads it. If a job finishes with zero successes (likely a
# bad cookie) the worker clears the file so the next click prompts the user
# for a fresh one.
_COOKIE_REL = (".Storage", "update-data-cookie.json")


def _cookie_path(project_root: Path) -> Path:
    return project_root / Path(*_COOKIE_REL)


def _load_saved_cookie(project_root: Path) -> str | None:
    fp = _cookie_path(project_root)
    if not fp.is_file():
        return None
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    cookie = data.get("cookie")
    if isinstance(cookie, str) and cookie.strip():
        return cookie.strip()
    return None


def _save_cookie(project_root: Path, cookie: str) -> None:
    """Persist the cookie atomically. Never raises — saving is best-effort."""
    try:
        fp = _cookie_path(project_root)
        fp.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "cookie": cookie,
            "savedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        tmp = fp.with_suffix(fp.suffix + ".tmp")
        tmp.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        os.replace(tmp, fp)
    except Exception as exc:  # noqa: BLE001
        print(
            f"[update-data] _save_cookie failed: {type(exc).__name__}: {exc}",
            file=_ud_sys.stderr,
            flush=True,
        )


def _clear_saved_cookie(project_root: Path) -> None:
    """Delete the saved cookie file. Best-effort; never raises."""
    try:
        fp = _cookie_path(project_root)
        if fp.is_file():
            fp.unlink()
    except OSError as exc:
        print(
            f"[update-data] _clear_saved_cookie failed: {type(exc).__name__}: {exc}",
            file=_ud_sys.stderr,
            flush=True,
        )


def _start_job_with_cookie(
    project_root: Path, cookie: str, raw_paths: list, max_paths: int = _MAX_PATHS,
) -> tuple[str | None, dict | None, int | None]:
    """Validate paths + register + spawn worker. Returns (jobId, error_payload, http_status).

    Exactly one of jobId or (error_payload, http_status) is non-None.
    """
    if not isinstance(cookie, str) or not cookie.strip():
        return None, {"error": "cookie required"}, 400
    if not isinstance(raw_paths, list) or not raw_paths:
        return None, {"error": "paths must be a non-empty list"}, 400
    if len(raw_paths) > max_paths:
        return None, {"error": f"too many paths (max {max_paths})"}, 400
    seen: set[str] = set()
    unique: list[str] = []
    for p in raw_paths:
        if not isinstance(p, str):
            return None, {"error": "paths must contain only strings"}, 400
        if p not in seen:
            seen.add(p)
            unique.append(p)
    resolved: list[Path] = []
    try:
        for p in unique:
            resolved.append(_validate_and_resolve_path(project_root, p))
    except InvalidPathError as exc:
        return None, {"error": str(exc)}, 400
    try:
        job_id = _register_job(total=len(resolved))
    except JobAlreadyRunningError as exc:
        return None, {"error": "busy", "jobId": exc.job_id}, 409
    runner = _runner_override or _default_runner
    thread = threading.Thread(
        target=runner,
        args=(project_root, cookie.strip(), resolved, job_id),
        daemon=True,
    )
    thread.start()
    return job_id, None, None

# A runner function: (project_root, cookie, resolved_paths, job_id) -> None.
# The default runner spawns a thread that talks to Transfermarkt; tests inject a fake.
_RunnerFn = Callable[[Path, str, Sequence[Path], str], None]
_runner_override: _RunnerFn | None = None


def _set_runner_for_tests(fn: _RunnerFn | None) -> None:
    """Inject a synchronous fake runner. Pass None to restore the default."""
    global _runner_override
    _runner_override = fn


def _send_json(handler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def try_handle_get(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)
    if parsed.path == _GET_PROGRESS_PATH:
        qs = parse_qs(parsed.query)
        job_id = (qs.get("id") or [None])[0]
        _send_json(handler, 200, _snapshot_job(job_id))
        return True
    if parsed.path == _GET_HISTORY_PATH:
        _send_json(handler, 200, _read_history(project_root))
        return True
    return False


def _read_json_body(handler) -> tuple[dict | None, dict | None, int | None]:
    """Parse the POST request body as JSON. Returns (body, error_payload, http_status)."""
    try:
        content_len = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        return None, {"error": "Invalid Content-Length"}, 400
    if content_len > _MAX_POST_BYTES:
        return None, {"error": "Payload too large"}, 413
    try:
        raw = handler.rfile.read(max(content_len, 0))
        body = json.loads(raw.decode("utf-8") if raw else "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, {"error": "Invalid JSON"}, 400
    if not isinstance(body, dict):
        return None, {"error": "Body must be a JSON object"}, 400
    return body, None, None


def try_handle_post(handler, project_root: Path) -> bool:
    parsed = urlparse(handler.path)

    if parsed.path == _POST_START_PATH:
        body, err, status = _read_json_body(handler)
        if err is not None:
            _send_json(handler, status, err)
            return True
        cookie_raw = body.get("cookie")
        job_id, err, status = _start_job_with_cookie(
            project_root, cookie_raw, body.get("paths"),
        )
        if err is not None:
            _send_json(handler, status, err)
            return True
        # Job kicked off — remember the cookie for next time. If it turns out
        # to be bad (zero successes), the worker clears it again.
        if isinstance(cookie_raw, str):
            _save_cookie(project_root, cookie_raw.strip())
        _send_json(handler, 200, {"jobId": job_id})
        return True

    if parsed.path == _POST_START_CACHED_PATH:
        body, err, status = _read_json_body(handler)
        if err is not None:
            _send_json(handler, status, err)
            return True
        paths = body.get("paths")
        if not isinstance(paths, list) or not paths:
            _send_json(handler, 400, {"error": "paths must be a non-empty list"})
            return True
        cookie = _load_saved_cookie(project_root)
        if not cookie:
            _send_json(handler, 404, {"error": "no saved cookie"})
            return True
        job_id, err, status = _start_job_with_cookie(project_root, cookie, paths)
        if err is not None:
            _send_json(handler, status, err)
            return True
        _send_json(handler, 200, {"jobId": job_id, "fromCache": True})
        return True

    return False


def _default_runner(
    project_root: Path,
    cookie: str,
    resolved_paths: Sequence[Path],
    job_id: str,
) -> None:
    """Production runner: one TMKT() session, dispatches club vs nationality per file."""
    import asyncio
    import importlib.util
    import os
    import sys

    legacy_dir = project_root / ".Storage" / "Legacy" / "Legacy - Scripts"
    if not legacy_dir.is_dir():
        _finish(job_id, error=f"legacy scripts folder missing: {legacy_dir}")
        return

    # Make `tmkt` importable (the legacy refreshers do the same).
    if str(legacy_dir) not in sys.path:
        sys.path.insert(0, str(legacy_dir))

    try:
        import certifi  # noqa: F401  (legacy module sets SSL_CERT_FILE on import)
    except ImportError:
        pass

    spec = importlib.util.spec_from_file_location(
        "_fc_generate_squads",
        legacy_dir / "generate_squads_from_transfermarkt.py",
    )
    if spec is None or spec.loader is None:
        _finish(job_id, error="cannot load generate_squads_from_transfermarkt.py")
        return
    legacy = importlib.util.module_from_spec(spec)
    # Register in sys.modules before exec_module so @dataclass decorators inside
    # the legacy module can resolve their own __module__ via sys.modules.get().
    sys.modules[spec.name] = legacy
    try:
        spec.loader.exec_module(legacy)
    except Exception as exc:
        _finish(job_id, error=f"failed loading legacy module: {exc}")
        return

    fill_spec = importlib.util.spec_from_file_location(
        "_fc_fill_shirts",
        legacy_dir / "fill_shirt_numbers_from_transfermarkt.py",
    )
    if fill_spec is None or fill_spec.loader is None:
        _finish(job_id, error="cannot load fill_shirt_numbers_from_transfermarkt.py")
        return
    fill_module = importlib.util.module_from_spec(fill_spec)
    sys.modules[fill_spec.name] = fill_module
    try:
        fill_spec.loader.exec_module(fill_module)
    except Exception as exc:
        _finish(job_id, error=f"failed loading fill module: {exc}")
        return

    try:
        from tmkt import TMKT  # type: ignore
    except Exception as exc:
        _finish(job_id, error=f"failed importing TMKT: {exc}")
        return

    nat_map_path = project_root / ".Storage" / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict = {}
    if nat_map_path.is_file():
        try:
            nationality_map = json.loads(nat_map_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            nationality_map = {}

    prev_cookie = os.environ.get("TRANSFERMARKT_COOKIE")
    os.environ["TRANSFERMARKT_COOKIE"] = cookie
    try:
        asyncio.run(
            _refresh_all_async(
                legacy=legacy,
                fill_module=fill_module,
                tmkt_cls=TMKT,
                nationality_map=nationality_map,
                resolved_paths=resolved_paths,
                job_id=job_id,
                project_root=project_root,
            )
        )
    finally:
        if prev_cookie is None:
            os.environ.pop("TRANSFERMARKT_COOKIE", None)
        else:
            os.environ["TRANSFERMARKT_COOKIE"] = prev_cookie
        # Auto-clear the saved cookie if the entire job failed. A bad cookie
        # produces zero ok and ≥1 failed, so the next Update Data click will
        # fall through to the paste modal for a fresh login.
        try:
            with _JOB_LOCK:
                if _JOB is not None and _JOB.get("id") == job_id:
                    ok = int(_JOB.get("ok_count") or 0)
                    failed = len(_JOB.get("failed") or [])
                    cookie_was_bad = ok == 0 and failed > 0
                else:
                    cookie_was_bad = False
            if cookie_was_bad:
                _clear_saved_cookie(project_root)
        except Exception as exc:  # noqa: BLE001
            print(
                f"[update-data] post-job cookie-cleanup failed: "
                f"{type(exc).__name__}: {exc}",
                file=_ud_sys.stderr,
                flush=True,
            )


async def _refresh_all_async(
    legacy,
    fill_module,
    tmkt_cls,
    nationality_map: dict,
    resolved_paths: Sequence[Path],
    job_id: str,
    project_root: Path,
) -> None:
    import asyncio

    try:
        club_cache: dict = {}
        nt_cache: dict = {}
        player_cache: dict = {}
        stats_cache: dict = {}
        transfer_cache: dict = {}
        club_career_cache: dict = {}
        national_career_cache: dict = {}

        async with tmkt_cls() as tmkt:
            season_meta = await legacy._season_hint(tmkt)
            season_id = season_meta.get("seasonId") if isinstance(season_meta, dict) else None
            if isinstance(season_id, str) and season_id.isdigit():
                season_id = int(season_id)
            elif not isinstance(season_id, int):
                season_id = None

            sem = asyncio.Semaphore(4)

            async def one(jp: Path) -> None:
                try:
                    raw = json.loads(jp.read_text(encoding="utf-8"))
                except json.JSONDecodeError as exc:
                    _record_failure(job_id, str(jp), f"bad JSON: {exc}")
                    return
                kind = raw.get("kind")
                cid_raw = raw.get("transfermarktClubId")
                rel_img = (raw.get("imagePath") or "").strip().replace("\\", "/")
                label = str(raw.get("name") or jp.stem)

                cid: int | None
                try:
                    cid = int(cid_raw) if cid_raw is not None else None
                except (TypeError, ValueError):
                    cid = None

                async with sem:
                    _set_current(job_id, label)

                    async def _do_team_work() -> None:
                        nonlocal cid
                        if cid is None:
                            # Re-resolve the TM id by team name. Some JSONs have
                            # transfermarktClubId=null because they were built from
                            # a fallback when TM search originally failed.
                            try:
                                cid = await legacy.resolve_team_id(
                                    tmkt,
                                    [label],
                                    want_national=(kind == "nationality"),
                                )
                            except Exception as exc:  # noqa: BLE001
                                cid = None
                        if cid is None:
                            _record_failure(
                                job_id,
                                str(jp),
                                "no Transfermarkt match found by name "
                                f"(team {label!r} has no transfermarktClubId in JSON)",
                            )
                            return
                        try:
                            if kind == "club":
                                cdata = await legacy._get_club_safe(tmkt, cid)
                                official = (cdata or {}).get("name") or label
                                official = official.strip() or f"club-{cid}"
                                season_meta_club, sid_club = await legacy.season_context_for_club(
                                    tmkt,
                                    cid,
                                    club_data=cdata,
                                    fallback_meta=season_meta,
                                )
                                smc = season_meta_club if isinstance(season_meta_club, dict) else {}
                                comp_stats = (
                                    str(smc.get("competitionId")).strip().upper()
                                    if smc.get("competitionId")
                                    else None
                                )
                                lbl = (
                                    str(smc.get("label")).strip()
                                    if smc.get("label")
                                    else None
                                )
                                squads = await legacy.fetch_squad_payload(
                                    tmkt,
                                    cid,
                                    official_squad_name=official,
                                    nationality_map=nationality_map,
                                    club_name_cache=club_cache,
                                    nt_name_cache=nt_cache,
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
                                payload = legacy._serialize_squad(
                                    kind="club",
                                    label=official,
                                    rel_image=rel_img,
                                    tm_id=cid,
                                    season_meta=season_meta_club,
                                    squads=squads,
                                )
                            elif kind == "nationality":
                                cdata = await legacy._get_club_safe(tmkt, cid)
                                base = (cdata or {}).get("name") or label
                                try:
                                    official = legacy._strip_youth_nt_display(base.strip())
                                except AttributeError:
                                    official = base.strip()
                                official = official.strip() or f"nt-{cid}"
                                squads = await legacy.fetch_squad_payload(
                                    tmkt,
                                    cid,
                                    official_squad_name="",
                                    nationality_map=nationality_map,
                                    club_name_cache=club_cache,
                                    nt_name_cache=nt_cache,
                                    player_cache=player_cache,
                                    stats_cache=stats_cache,
                                    transfer_cache=transfer_cache,
                                    club_career_cache=club_career_cache,
                                    national_career_cache=national_career_cache,
                                    season_id=season_id,
                                    national_team_squad=True,
                                )
                                payload = legacy._serialize_squad(
                                    kind="nationality",
                                    label=official,
                                    rel_image=rel_img,
                                    tm_id=cid,
                                    season_meta=season_meta,
                                    squads=squads,
                                )
                            else:
                                _record_failure(job_id, str(jp), f"unsupported kind: {kind!r}")
                                return

                            # Career totals are monotonic — never let a re-fetch regress
                            # them. Defends against legacy scraper quirks (zeroed
                            # goals_conceded for GKs, off-by-one clean_sheets, etc).
                            _apply_career_totals_monotonic_guard(payload, raw)
                            # Both the current-season pass and the GK pass need the
                            # club's squad + name->id map. Fetch it ONCE here and share
                            # it so each team hits get_club_squad/_build_name_to_meta a
                            # single time per refresh instead of twice (the slowest
                            # repeated per-team work).
                            try:
                                _shared_squad, _shared_name_meta = await _build_club_name_meta(
                                    tmkt, fill_module, cid
                                )
                            except Exception:  # noqa: BLE001
                                _shared_squad, _shared_name_meta = {}, {}
                            _shared_meta = (_shared_squad, _shared_name_meta)
                            # Top-level season stats should include all competitions
                            # (league + cups + continental), not domestic league only.
                            try:
                                await _patch_current_season_totals_in_payload(
                                    payload,
                                    tmkt,
                                    fill_module,
                                    cid=cid,
                                    season_id=sid_club,
                                    prefetched=_shared_meta,
                                )
                            except Exception as season_patch_exc:  # noqa: BLE001
                                import sys as _sys
                                print(
                                    f"[update-data] current-season patch failed for {jp.name}: "
                                    f"{type(season_patch_exc).__name__}: {season_patch_exc}",
                                    file=_sys.stderr,
                                    flush=True,
                                )

                            season_label = ""
                            try:
                                season_label = (
                                    (payload.get("source") or {})
                                    .get("season", {})
                                    .get("label")
                                    or ""
                                )
                            except Exception:  # noqa: BLE001
                                season_label = ""

                            # Shirt numbers: tmapi squad list first, rueckennummern HTML fallback.
                            shirt_missing_map = 0
                            shirt_missing_row = 0
                            try:
                                _shirt_updated, shirt_missing_map, shirt_missing_row = (
                                    await fill_module.fill_squad_data(
                                        payload,
                                        tmkt,
                                        season_label=season_label,
                                        concurrency=2,
                                        quiet=True,
                                        prefetched_squad=(
                                            _shared_squad
                                            if isinstance(_shared_squad, dict)
                                            and _shared_squad.get("success")
                                            else None
                                        ),
                                        prefetched_name_meta=(
                                            _shared_name_meta if _shared_name_meta else None
                                        ),
                                    )
                                )
                            except Exception as shirt_exc:  # noqa: BLE001
                                import sys as _sys
                                print(
                                    f"[update-data] shirt-fill failed for {jp.name}: "
                                    f"{type(shirt_exc).__name__}: {shirt_exc}",
                                    file=_sys.stderr,
                                    flush=True,
                                )
                                _record_failure(
                                    job_id,
                                    str(jp),
                                    f"shirt numbers: {type(shirt_exc).__name__}: {shirt_exc}",
                                )
                                return

                            missing_shirts = _players_missing_shirt_numbers(payload)
                            if missing_shirts or shirt_missing_map or shirt_missing_row:
                                sample = ", ".join(missing_shirts[:6])
                                extra = ""
                                if len(missing_shirts) > 6:
                                    extra = f" (+{len(missing_shirts) - 6} more)"
                                _record_failure(
                                    job_id,
                                    str(jp),
                                    "incomplete shirt_number data for "
                                    f"{len(missing_shirts)} player(s)"
                                    f"{f': {sample}{extra}' if sample else ''}",
                                )
                                return

                            # Fix goalkeeper club_career_totals before the single write.
                            try:
                                await _patch_gk_career_totals_in_data(
                                    payload,
                                    fill_module,
                                    tmkt,
                                    label=jp.name,
                                    player_cache=player_cache,
                                    legacy=legacy,
                                    prefetched_name_meta=_shared_name_meta,
                                )
                            except Exception as gk_exc:  # noqa: BLE001
                                import sys as _sys
                                print(
                                    f"[update-data] gk-totals refresh failed for {jp.name}: "
                                    f"{type(gk_exc).__name__}: {gk_exc}",
                                    file=_sys.stderr,
                                    flush=True,
                                )

                            _reorder_all_players_in_payload(payload)
                            jp.write_text(
                                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                                encoding="utf-8",
                            )
                            _stamp_history(project_root, jp)
                            _record_ok(job_id)
                        except Exception as exc:  # noqa: BLE001
                            _record_failure(job_id, str(jp), f"{type(exc).__name__}: {exc}")
                    await _run_team_guarded(job_id, jp, _do_team_work(), _per_team_timeout_s())

            await asyncio.gather(*(one(p) for p in resolved_paths))
        _finish(job_id)
    except Exception as exc:  # noqa: BLE001
        _finish(job_id, error=f"{type(exc).__name__}: {exc}")


__all__ = [
    "InvalidPathError",
    "JobAlreadyRunningError",
    "_validate_and_resolve_path",
    "_apply_career_totals_monotonic_guard",
    "_players_missing_shirt_numbers",
    "_reorder_all_players_in_payload",
    "_register_job",
    "_set_current",
    "_record_ok",
    "_record_failure",
    "_per_team_timeout_s",
    "_run_team_guarded",
    "_finish",
    "_snapshot_job",
    "_reset_job_for_tests",
    "_read_history",
    "_stamp_history",
    "_history_key",
    "_load_saved_cookie",
    "_save_cookie",
    "_clear_saved_cookie",
    "try_handle_get",
    "try_handle_post",
    "_set_runner_for_tests",
    "_gk_extract_totals_from_html",
    "_refresh_gk_totals_for_player",
    "_patch_gk_career_totals",
]
