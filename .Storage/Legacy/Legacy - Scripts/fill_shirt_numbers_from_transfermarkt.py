#!/usr/bin/env python3
"""
Fill `shirt_number` on each player in a Squad Formation JSON file from Transfermarkt's
squad-number history page (rueckennummern), for one season row (default: JSON's
source.season.label, e.g. 25/26).

Uses the same stack as generate_squads_from_transfermarkt.py: tmapi (TMKT) for roster
player IDs + profile URLs, HTTPS HTML with browser UA and optional TRANSFERMARKT_COOKIE.

Directory mode processes several club JSON files at once (``--parallel-teams``) while
capping total concurrent requests with ``--max-in-flight`` so runs are faster without
opening hundreds of connections to Transfermarkt at once.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import ssl
import sys
from pathlib import Path
from typing import Any, Optional

import aiohttp
import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT  # noqa: E402

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


def _transfermarkt_cookie_header_value() -> str:
    return (os.environ.get("TRANSFERMARKT_COOKIE") or "").strip()


def _tm_html_blocked(html: str) -> bool:
    if not html:
        return True
    head = html[:8000].lower()
    return "human verification" in head or "captcha-container" in head


def _td_texts_from_tr(tr_inner: str) -> list[str]:
    cells: list[str] = []
    for chunk in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr_inner, re.I | re.DOTALL):
        t = re.sub(r"<[^>]+>", " ", chunk)
        t = re.sub(r"\s+", " ", t).strip()
        cells.append(t)
    return cells


async def _fetch_transfermarkt_html_tmkt(tmkt: TMKT, path: str) -> str:
    p = path if path.startswith("/") else f"/{path}"
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
            connector=connector, timeout=timeout, headers=html_headers
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


async def _fetch_tm_html_prefer_session(tmkt: TMKT, path_on_site: str) -> str:
    p = path_on_site if path_on_site.startswith("/") else f"/{path_on_site}"
    for domain in ("https://www.transfermarkt.co.uk", "https://www.transfermarkt.com"):
        url = f"{domain}{p}"
        if _transfermarkt_cookie_header_value():
            h = await _fetch_transfermarkt_html_curl(url)
            if h and not _tm_html_blocked(h):
                return h
    html = await _fetch_transfermarkt_html_tmkt(tmkt, p)
    if html and not _tm_html_blocked(html):
        return html
    for domain in ("https://www.transfermarkt.co.uk", "https://www.transfermarkt.com"):
        h = await _fetch_transfermarkt_html_curl(f"{domain}{p}")
        if h and not _tm_html_blocked(h):
            return h
    return html if html else ""


def _profile_to_shirt_path(relative_profile_url: str) -> Optional[str]:
    u = (relative_profile_url or "").strip()
    if "/profil/spieler/" not in u:
        return None
    return u.replace("/profil/spieler/", "/rueckennummern/spieler/", 1)


def _split_club_vs_national_html(html: str) -> tuple[str, str]:
    markers = (
        "Squad number history in the national team",
        "Rückennummern in der Nationalmannschaft",
    )
    for mk in markers:
        i = html.find(mk)
        if i != -1:
            return html[:i], html[i:]
    return html, ""


def _find_shirt_items_table(html_fragment: str) -> Optional[str]:
    """Locate the club shirt-history ``items`` table; TM uses EN/DE/FR/ES/IT headers."""
    season_hdr = r"(?:Season|Saison|Spielzeit|Temporada|Stagione|Epoca|Época)"
    jersey_hdr = (
        r"(?:Jersey\s+number|Rückennummer|Back\s+number|Trikotnummer|"
        r"Numéro|Numero|N\.\s*°|Shirt|Maillot|Camiseta|Maglia|Dorsal)"
    )
    tables = list(
        re.finditer(
            r'(?is)<table[^>]*class="[^"]*\bitems\b[^"]*"[^>]*>.*?</table>',
            html_fragment,
        )
    )
    for m in tables:
        block = m.group(0)
        if re.search(season_hdr, block, re.I) and re.search(jersey_hdr, block, re.I):
            return block
    # Some locales still use ``items`` but abbreviate headers; require a season-like cell.
    for m in tables:
        block = m.group(0)
        if re.search(r"\b\d{2}/\d{2}\b", block) and re.search(
            r"(?:Jersey|Numéro|Numero|Shirt|Maillot|Trikot|Rücken)", block, re.I
        ):
            return block
    return None


def _norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _club_label_word_overlap(a: str, b: str) -> bool:
    """Match short JSON names (e.g. ``ASO Chlef``) to long TM club strings (official name)."""
    def tokens(s: str) -> set[str]:
        return {
            w
            for w in re.findall(r"[a-z0-9à-ÿ]+", (s or "").lower(), flags=re.I)
            if len(w) >= 4
        }

    wa, wb = tokens(a), tokens(b)
    if wa & wb:
        return True
    na, nb = _norm_name(a), _norm_name(b)
    for w in wa:
        if len(w) >= 5 and w in nb:
            return True
    for w in wb:
        if len(w) >= 5 and w in na:
            return True
    return False


def _row_club_text_for_match(cells: list[str]) -> str:
    """Build club label from a shirt-history row.

    Transfermarkt often splits **Club** across two ``td`` cells (crest image with
    empty text, then the linked club name). ``cells`` then looks like
    ``['25/26', '', 'Tottenham Hotspur', '7']``. The jersey number is almost always
    the last cell, so we join non-empty middle cells for matching.
    """
    if len(cells) < 2:
        return ""
    if len(cells) >= 3:
        parts = [c.strip() for c in cells[1:-1] if c.strip()]
        if parts:
            return " ".join(parts)
    return (cells[1] or "").strip()


def _club_labels_match(squad_file_name: str, row_club_cell: str) -> bool:
    a = (squad_file_name or "").strip()
    b = (row_club_cell or "").strip()
    if not a or not b:
        return False
    na, nb = _norm_name(a), _norm_name(b)
    if na == nb:
        return True
    if na in nb or nb in na:
        return True

    def _core(x: str) -> str:
        for suf in ("fc", "cf", "sc", "afc", "ac", "bc"):
            if x.endswith(suf) and len(x) > len(suf) + 2:
                return x[: -len(suf)]
        return x

    if _core(na) == _core(nb) or _core(na) in _core(nb) or _core(nb) in _core(na):
        return True
    return _club_label_word_overlap(a, b)


def _parse_int_jersey(cell: str) -> Optional[int]:
    s = (cell or "").strip().replace("\u2013", "-")
    if not s or s in ("-", "—"):
        return None
    if s.isdigit():
        return int(s)
    return None


def _jersey_from_row_cells(cells: list[str]) -> Optional[int]:
    if not cells:
        return None
    for c in reversed(cells):
        j = _parse_int_jersey(c)
        if j is not None:
            return j
    return None


def _season_labels_for_matching(primary: str, data: dict[str, Any]) -> list[str]:
    """TM shirt-history tables use ``25/26`` in the Season column; some squad JSON files
    store only ``cyclicalName`` / a 4-digit year in ``source.season.label`` (e.g. ``2026``).
    Build a small ordered list of labels to try against the table.
    """
    out: list[str] = []

    def add(s: str) -> None:
        t = (s or "").strip()
        if t and t not in out:
            out.append(t)

    add(primary)
    src = data.get("source") if isinstance(data.get("source"), dict) else {}
    sea = src.get("season") if isinstance(src.get("season"), dict) else {}
    sid_raw = sea.get("seasonId")
    sid: Optional[int] = None
    if isinstance(sid_raw, int):
        sid = sid_raw
    elif isinstance(sid_raw, str) and sid_raw.strip().isdigit():
        sid = int(sid_raw.strip())
    if sid is not None and 1990 <= sid <= 2100:
        yy = sid % 100
        nyy = (sid + 1) % 100
        add(f"{yy:02d}/{nyy:02d}")
        # TM sometimes prints full calendar years in the Season column (e.g. Algeria).
        add(f"{sid}/{sid + 1}")
        add(f"{sid}-{sid + 1}")
    cycl = sea.get("cyclicalName")
    if isinstance(cycl, str) and re.match(r"^\d{4}$", cycl.strip()):
        add(cycl.strip())
    return out


def parse_shirt_number_for_season(
    html: str,
    *,
    season_labels: list[str],
    squad_name: str,
    national_team: bool,
) -> Optional[int]:
    if _tm_html_blocked(html):
        return None
    club_part, nat_part = _split_club_vs_national_html(html)
    fragment = nat_part if national_team else club_part
    if national_team and not fragment.strip():
        fragment = html
    table = _find_shirt_items_table(fragment)
    if not table:
        return None
    aliases = [s.strip() for s in season_labels if (s or "").strip()]
    if not aliases:
        return None
    alias_set = set(aliases)
    hits: list[int] = []
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", table, re.I | re.DOTALL):
        inner = m.group(1)
        cells = _td_texts_from_tr(inner)
        if len(cells) < 2:
            continue
        if re.match(r"^season$", cells[0].strip(), re.I):
            continue
        if cells[0].strip() not in alias_set:
            continue
        club_blob = _row_club_text_for_match(cells)
        if not _club_labels_match(squad_name, club_blob):
            continue
        j = _jersey_from_row_cells(cells)
        if j is not None:
            hits.append(j)
    if hits:
        return hits[0]
    # Same season but club filter failed: one row only (e.g. name quirks)
    loose: list[int] = []
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", table, re.I | re.DOTALL):
        cells = _td_texts_from_tr(m.group(1))
        if len(cells) < 2 or re.match(r"^season$", cells[0].strip(), re.I):
            continue
        if cells[0].strip() not in alias_set:
            continue
        j = _jersey_from_row_cells(cells)
        if j is not None:
            loose.append(j)
    if len(loose) == 1:
        return loose[0]
    return None


BUCKETS = ("goalkeepers", "defenders", "midfielders", "attackers")


async def _build_name_to_meta(
    tmkt: TMKT, pids: list[Any], *, sem: asyncio.Semaphore
) -> dict[str, tuple[int, str]]:
    """Official display name -> (player_id, relative profile URL)."""
    out: dict[str, tuple[int, str]] = {}

    async def one(pid_raw: Any) -> None:
        pid = int(pid_raw)
        async with sem:
            try:
                pr = await tmkt.get_player(pid)
            except Exception:
                return
        if not isinstance(pr, dict) or not pr.get("success"):
            return
        d = pr.get("data") or {}
        name = (d.get("name") or "").strip()
        rel = (d.get("relativeUrl") or "").strip()
        if name:
            out[name] = (pid, rel)

    await asyncio.gather(*(one(x) for x in pids))
    return out


async def fill_file(
    path: Path,
    tmkt: TMKT,
    *,
    season_label: str,
    dry_run: bool,
    concurrency: int,
    quiet: bool = False,
    io_sem: Optional[asyncio.Semaphore] = None,
) -> int:
    """When ``io_sem`` is set (directory batch mode), all network calls share that limit
    across teams; ``concurrency`` is ignored for sizing. Otherwise a local semaphore of
    ``concurrency`` is used (single-file mode).
    """
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    cid = data.get("transfermarktClubId")
    if cid is None:
        print("error: JSON missing transfermarktClubId", file=sys.stderr, flush=True)
        return 2
    kind = (data.get("kind") or "club").strip().lower()
    national_team = kind == "nationality"
    squad_name = (data.get("name") or "").strip()
    if not squad_name:
        print("error: JSON missing top-level name", file=sys.stderr, flush=True)
        return 2

    season_labels = _season_labels_for_matching(season_label, data)
    season_try_hint = ", ".join(season_labels)

    sem = io_sem if io_sem is not None else asyncio.Semaphore(max(1, concurrency))
    try:
        async with sem:
            squad = await tmkt.get_club_squad(int(cid))
    except Exception as e:
        print(f"error: get_club_squad({cid}): {e}", file=sys.stderr, flush=True)
        return 2
    if not isinstance(squad, dict) or not squad.get("success"):
        print(
            "error: club/national squad API did not return success",
            file=sys.stderr,
            flush=True,
        )
        return 2
    pids = (squad.get("data") or {}).get("playerIds") or []
    if not pids:
        print("error: empty playerIds from squad API", file=sys.stderr, flush=True)
        return 2

    name_meta = await _build_name_to_meta(tmkt, pids, sem=sem)

    shirt_cache: dict[int, Optional[int]] = {}

    async def shirt_for_pid(pid: int, rel: str) -> Optional[int]:
        if pid in shirt_cache:
            return shirt_cache[pid]
        path_shirt = _profile_to_shirt_path(rel)
        if not path_shirt:
            shirt_cache[pid] = None
            return None
        async with sem:
            html = await _fetch_tm_html_prefer_session(tmkt, path_shirt)
        num = parse_shirt_number_for_season(
            html,
            season_labels=season_labels,
            squad_name=squad_name,
            national_team=national_team,
        )
        shirt_cache[pid] = num
        return num

    updated = 0

    async def process_player(pl: dict[str, Any]) -> tuple[bool, str, str]:
        """Returns (changed, kind, message) where kind is ok|no_map|no_shirt."""
        pname = (pl.get("name") or "").strip()
        meta = name_meta.get(pname)
        if not meta:
            return False, "no_map", f"no API roster match for name={pname!r}"
        pid, rel = meta
        n = await shirt_for_pid(pid, rel)
        if n is None:
            return False, "no_shirt", (
                f"no shirt row (seasons tried: {season_try_hint!r}) for {pname!r} "
                f"(pid={pid})"
            )
        if pl.get("shirt_number") != n:
            pl["shirt_number"] = n
            return True, "ok", f"{pname}: shirt_number={n}"
        return False, "ok", f"{pname}: unchanged ({n})"

    tasks: list[Any] = []
    for b in BUCKETS:
        for pl in data.get(b) or []:
            if isinstance(pl, dict):
                tasks.append(process_player(pl))

    results = await asyncio.gather(*tasks)
    missing_map = sum(1 for _c, k, _m in results if k == "no_map")
    missing_shirt = sum(1 for _c, k, _m in results if k == "no_shirt")
    for changed, _k, msg in results:
        if changed:
            updated += 1
        if not quiet:
            print(msg, flush=True)

    summary = (
        f"Summary [{path}]: players touched={updated}, "
        f"unmatched names={missing_map}, missing shirt row={missing_shirt}, "
        f"dry_run={dry_run}"
    )
    print(summary, file=sys.stderr, flush=True)

    if not dry_run and updated > 0:
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {path}", file=sys.stderr, flush=True)
    elif dry_run:
        print("Dry run: file not modified.", file=sys.stderr, flush=True)
    else:
        print("No changes to write.", file=sys.stderr, flush=True)

    return 0


def _collect_squad_json_files(root: Path) -> list[Path]:
    """All *.json under root that look like club/nationality squad files."""
    out: list[Path] = []
    for path in sorted(root.rglob("*.json")):
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if data.get("transfermarktClubId") is None:
            continue
        if not any(isinstance(data.get(b), list) for b in BUCKETS):
            continue
        out.append(path)
    return out


async def fill_directory(
    root: Path,
    *,
    season_override: str,
    dry_run: bool,
    concurrency: int,
    quiet: bool,
    continue_on_error: bool,
    parallel_teams: int,
    max_in_flight: int,
    from_index: Optional[int],
    to_index: Optional[int],
) -> int:
    paths_all = _collect_squad_json_files(root)
    if not paths_all:
        print(f"error: no squad JSON files under {root}", file=sys.stderr, flush=True)
        return 2
    n_all = len(paths_all)
    lo = 1 if from_index is None else int(from_index)
    hi = n_all if to_index is None else int(to_index)
    if lo < 1 or hi > n_all or lo > hi:
        print(
            f"error: invalid --from-index/--to-index (have {n_all} files): "
            f"need 1 <= from <= to <= {n_all}, got from={lo} to={hi}",
            file=sys.stderr,
            flush=True,
        )
        return 2
    work_items: list[tuple[Path, int]] = [
        (p, lo + i) for i, p in enumerate(paths_all[lo - 1 : hi])
    ]
    pt = max(1, int(parallel_teams))
    cap = max(1, int(max_in_flight))
    print(
        f"Found {n_all} squad files under {root}; "
        f"processing indices {lo}-{hi} ({len(work_items)} files) "
        f"(parallel_teams={pt}, max_in_flight={cap})",
        file=sys.stderr,
        flush=True,
    )
    worst = 0
    io_sem = asyncio.Semaphore(cap)
    team_sem = asyncio.Semaphore(pt)
    log_lock = asyncio.Lock()

    async with TMKT() as tmkt:

        async def run_one(item: tuple[Path, int]) -> int:
            path, idx1 = item
            async with team_sem:
                async with log_lock:
                    print(
                        f"\n--- [{idx1}/{n_all}] start {path} ---",
                        file=sys.stderr,
                        flush=True,
                    )
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError) as e:
                    print(
                        f"error: read JSON {path}: {e}",
                        file=sys.stderr,
                        flush=True,
                    )
                    return 2
                season = (season_override or "").strip() or _default_season_from_json(
                    data
                )
                try:
                    return await fill_file(
                        path,
                        tmkt,
                        season_label=season,
                        dry_run=dry_run,
                        concurrency=concurrency,
                        quiet=quiet,
                        io_sem=io_sem,
                    )
                except Exception as e:
                    print(
                        f"error: {path}: {e}",
                        file=sys.stderr,
                        flush=True,
                    )
                    return 2

        results = await asyncio.gather(
            *(run_one(it) for it in work_items),
            return_exceptions=True,
        )
        for (path, _idx1), r in zip(work_items, results):
            if isinstance(r, Exception):
                print(
                    f"error: task failed {path}: {r}",
                    file=sys.stderr,
                    flush=True,
                )
                worst = max(worst, 2)
                if not continue_on_error:
                    return worst
                continue
            worst = max(worst, int(r))
            if int(r) != 0 and not continue_on_error:
                return worst
    return worst


def _default_season_from_json(data: dict[str, Any]) -> str:
    src = data.get("source") or {}
    if isinstance(src, dict):
        sea = src.get("season") or {}
        if isinstance(sea, dict):
            lab = (sea.get("label") or "").strip()
            if lab:
                return lab
    return "25/26"


def _configure_stdio_utf8() -> None:
    """Avoid UnicodeEncodeError on Windows consoles when printing player names."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def main() -> int:
    _configure_stdio_utf8()
    ap = argparse.ArgumentParser(
        description="Add shirt_number from Transfermarkt rueckennummern for one season."
    )
    ap.add_argument(
        "json_path",
        type=Path,
        help="Squad JSON file, or a folder (e.g. Squad Formation/Teams) to process all squads recursively.",
    )
    ap.add_argument(
        "--season",
        default="",
        help='Season label as on TM (e.g. "25/26"). Default: JSON source.season.label (per file in batch).',
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without writing the JSON file.",
    )
    ap.add_argument(
        "--concurrency",
        type=int,
        default=8,
        help="Single JSON file only: max parallel get_player + HTML fetches (default 8).",
    )
    ap.add_argument(
        "--parallel-teams",
        type=int,
        default=5,
        help="Directory only: how many squad JSON files to process at the same time (default 5).",
    )
    ap.add_argument(
        "--max-in-flight",
        type=int,
        default=24,
        help="Directory only: global cap on concurrent TM API + HTML requests across all teams (default 24).",
    )
    ap.add_argument(
        "--quiet",
        action="store_true",
        help="Batch mode: do not print each player line, only stderr summaries.",
    )
    ap.add_argument(
        "--stop-on-error",
        action="store_true",
        help="With a directory: stop at the first file that fails instead of continuing.",
    )
    ap.add_argument(
        "--from-index",
        type=int,
        default=None,
        metavar="N",
        help="Directory only: 1-based start index in the sorted full file list (default: 1).",
    )
    ap.add_argument(
        "--to-index",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Directory only: 1-based end index inclusive in the sorted full file list "
            "(default: last file)."
        ),
    )
    args = ap.parse_args()
    p = args.json_path.resolve()
    if args.from_index is not None or args.to_index is not None:
        if not p.is_dir():
            print(
                "error: --from-index / --to-index are only valid when json_path is a folder",
                file=sys.stderr,
                flush=True,
            )
            return 2
    if p.is_dir():
        return asyncio.run(
            fill_directory(
                p,
                season_override=(args.season or "").strip(),
                dry_run=bool(args.dry_run),
                concurrency=int(args.concurrency),
                quiet=bool(args.quiet),
                continue_on_error=not bool(args.stop_on_error),
                parallel_teams=int(args.parallel_teams),
                max_in_flight=int(args.max_in_flight),
                from_index=args.from_index,
                to_index=args.to_index,
            )
        )
    if not p.is_file():
        print(f"error: not a file or directory: {p}", file=sys.stderr, flush=True)
        return 2
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON: {e}", file=sys.stderr, flush=True)
        return 2
    season = (args.season or "").strip() or _default_season_from_json(data)

    async def _one() -> int:
        async with TMKT() as tmkt:
            return await fill_file(
                p,
                tmkt,
                season_label=season,
                dry_run=bool(args.dry_run),
                concurrency=int(args.concurrency),
                quiet=bool(args.quiet),
            )

    return asyncio.run(_one())


if __name__ == "__main__":
    raise SystemExit(main())
