#!/usr/bin/env python3
"""
Per-league (or tier-1 batch): verify folder + TM roster, drop/re-add clubs, fill missing player stats.

1) League path exists (optional --create).
2) Official Transfermarkt club list vs JSON on disk — remove extras, add missing (sync_league).
3) For each club JSON, if any player lacks appearances/goals/assists keys, re-fetch full squad (TM JSON has no player ids for lighter updates).
4) --tier1-all: tier-1 index only; --all-leagues: tier-1 + European top-two tiers (LEAGUE_COMPETITION), includes big 5 + Championship/Serie B/etc.; --tier1-unpulled: empty leagues only.

Application Security Requirement: HTTPS tmapi only; JSON read/write under project paths; no shell.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT

from generate_squads_from_transfermarkt import (  # noqa: E402
    OUT_TEAMS,
    PROJECT,
    TEAMS_IMAGES,
    _get_club_safe,
    _safe_json_filename_stem,
    _season_hint,
    _serialize_squad,
    fetch_squad_payload,
)
from sync_teams_to_season import LEAGUE_COMPETITION, sync_league  # noqa: E402

_TIER1 = PROJECT / "Squad Formation" / "_tier1_competitions.json"
_NAT = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"

STAT_KEYS = ("appearances", "goals", "assists")
# Stats refresh: retry transient API failures; exit whole process if still failing after this many tries.
_MAX_STATS_FETCH_ATTEMPTS = 10


def _player_missing_stats(p: Any) -> bool:
    if not isinstance(p, dict):
        return True
    for k in STAT_KEYS:
        if k not in p:
            return True
        if p.get(k) is None:
            return True
    return False


def _file_needs_stats(raw: dict[str, Any]) -> bool:
    for bucket in ("goalkeepers", "defenders", "midfielders", "attackers"):
        for pl in raw.get(bucket) or []:
            if _player_missing_stats(pl):
                return True
    return False


def _load_tier1() -> list[dict[str, Any]]:
    if not _TIER1.is_file():
        return []
    try:
        data = json.loads(_TIER1.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return list(data.get("entries") or [])


def _merged_league_entries() -> list[dict[str, Any]]:
    """
    Tier-1 worldwide index plus sync_teams_to_season LEAGUE_COMPETITION entries
    (England PL + Championship, Spain LaLiga + LaLiga2, …), deduped by competition id.

    Big five (GB1, ES1, IT1, L1, FR1) are already in the tier-1 index; this adds second tiers (GB2, ES2, …).
    """
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for e in _load_tier1():
        cid = (e.get("competitionId") or "").strip().upper()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        merged.append(e)
    for (country, league), comp in sorted(LEAGUE_COMPETITION.items()):
        cu = (comp or "").strip().upper()
        if not cu or cu in seen:
            continue
        seen.add(cu)
        merged.append(
            {
                "competitionId": cu,
                "countryName": country,
                "leagueName": league,
            }
        )
    merged.sort(
        key=lambda x: (
            (x.get("countryName") or "").lower(),
            (x.get("leagueName") or "").lower(),
        )
    )
    return merged


def _find_tier1(comp_id: str) -> Optional[dict[str, Any]]:
    cid = comp_id.strip().upper()
    for e in _load_tier1():
        if (e.get("competitionId") or "").strip().upper() == cid:
            return e
    return None


def _count_club_jsons(league_out: Path) -> int:
    n = 0
    if not league_out.is_dir():
        return 0
    for jp in league_out.glob("*.json"):
        try:
            data = json.loads(jp.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if data.get("kind") == "club":
            n += 1
    return n


def _league_unpulled(league_out: Path) -> bool:
    return not league_out.is_dir() or _count_club_jsons(league_out) == 0


async def _refresh_one_club_json(
    tmkt: TMKT,
    jp: Path,
    *,
    nationality_map: dict[str, str],
    club_cache: dict[str, str],
    nt_cache: dict[str, str],
    player_cache: dict[str, Any],
    stats_cache: dict[str, tuple[int, int, int]],
    season_meta: dict[str, Any],
    sid: Optional[int],
    sem: asyncio.Semaphore,
    dry_run: bool,
) -> str:
    try:
        raw = json.loads(jp.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return "skip"
    if raw.get("kind") != "club":
        return "skip"
    cid_raw = raw.get("transfermarktClubId")
    if cid_raw is None:
        return "skip"
    try:
        cid = int(cid_raw)
    except (TypeError, ValueError):
        return "skip"
    rel_img = (raw.get("imagePath") or "").strip().replace("\\", "/")
    async with sem:
        cdata = await _get_club_safe(tmkt, cid)
        official = (cdata or {}).get("name") or raw.get("name") or ""
        official = official.strip() or f"club-{cid}"
        squads = None
        last_exc: Optional[BaseException] = None
        for attempt in range(_MAX_STATS_FETCH_ATTEMPTS):
            try:
                squads = await fetch_squad_payload(
                    tmkt,
                    cid,
                    official_squad_name=official,
                    nationality_map=nationality_map,
                    club_name_cache=club_cache,
                    nt_name_cache=nt_cache,
                    player_cache=player_cache,
                    stats_cache=stats_cache,
                    season_id=sid,
                    national_team_squad=False,
                )
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                nxt = attempt + 1
                if nxt < _MAX_STATS_FETCH_ATTEMPTS:
                    w = min(30, 2 ** min(attempt, 5))
                    print(
                        f"  [stats] {jp.name} attempt {nxt}/{_MAX_STATS_FETCH_ATTEMPTS}: {exc!s} — retry in {w}s…",
                        file=sys.stderr,
                        flush=True,
                    )
                    await asyncio.sleep(w)
        if squads is None:
            print(
                f"  [stats] FAILED after {_MAX_STATS_FETCH_ATTEMPTS} attempts: {jp.name}: {last_exc!s}",
                file=sys.stderr,
                flush=True,
            )
            print(
                "  Stopping (fix network/API or run again later).",
                file=sys.stderr,
                flush=True,
            )
            raise SystemExit(1)
        payload = _serialize_squad(
            kind="club",
            label=official,
            rel_image=rel_img,
            tm_id=cid,
            season_meta=season_meta,
            squads=squads,
        )
        if raw.get("source", {}).get("missingLogoFile"):
            payload.setdefault("source", {})["missingLogoFile"] = True
        if raw.get("source", {}).get("error"):
            payload.setdefault("source", {})["error"] = raw["source"]["error"]
    out_name = f"{_safe_json_filename_stem(official)}.json"
    out_path = jp.parent / out_name
    if dry_run:
        print(f"  [dry-run] stats refresh -> {out_path.relative_to(OUT_TEAMS)}", file=sys.stderr)
        return "ok"
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if out_path.resolve() != jp.resolve():
        jp.unlink(missing_ok=True)
    return "ok"


async def _repair_one_league(
    tmkt: TMKT,
    country: str,
    league: str,
    competition_id: str,
    *,
    nationality_map: dict[str, str],
    club_cache: dict[str, str],
    nt_cache: dict[str, str],
    player_cache: dict[str, Any],
    stats_cache: dict[str, tuple[int, int, int]],
    season_meta: dict[str, Any],
    dry_run: bool,
    create_dir: bool,
    skip_stats_pass: bool,
    force_stats_refresh: bool,
    stats_concurrency: int,
) -> tuple[int, int, int, int]:
    """
    Returns (removed, added, stats_refreshed, stats_skipped).
    """
    league_out = OUT_TEAMS / country / league
    if not league_out.is_dir():
        if create_dir and not dry_run:
            league_out.mkdir(parents=True, exist_ok=True)
            print(f"  created {league_out.relative_to(PROJECT)}", file=sys.stderr, flush=True)
        elif not create_dir:
            print(
                f"  League folder missing: {league_out} (use --create or fix path)",
                file=sys.stderr,
            )
            return 0, 0, 0, 0

    r, a = await sync_league(
        tmkt,
        country,
        league,
        competition_id,
        nationality_map=nationality_map,
        club_cache=club_cache,
        nt_cache=nt_cache,
        player_cache=player_cache,
        stats_cache=stats_cache,
        season_meta=season_meta,
        dry_run=dry_run,
    )
    print(f"  roster: removed={r} added={a}", file=sys.stderr, flush=True)

    if skip_stats_pass:
        return r, a, 0, 0

    sid = season_meta.get("seasonId")
    if isinstance(sid, str) and sid.isdigit():
        sid = int(sid)
    elif not isinstance(sid, int):
        sid = None

    paths = sorted(league_out.glob("*.json"))
    to_refresh: list[Path] = []
    skipped = 0
    for jp in paths:
        try:
            raw = json.loads(jp.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if raw.get("kind") != "club":
            continue
        if force_stats_refresh or _file_needs_stats(raw):
            to_refresh.append(jp)
        else:
            skipped += 1

    if not to_refresh:
        print("  stats: nothing to refresh (all players have stat fields)", file=sys.stderr, flush=True)
        return r, a, 0, skipped

    print(
        f"  stats: refreshing {len(to_refresh)} club file(s) ({skipped} already complete)…",
        file=sys.stderr,
        flush=True,
    )
    sem = asyncio.Semaphore(max(1, stats_concurrency))

    async def _one(p: Path) -> str:
        return await _refresh_one_club_json(
            tmkt,
            p,
            nationality_map=nationality_map,
            club_cache=club_cache,
            nt_cache=nt_cache,
            player_cache=player_cache,
            stats_cache=stats_cache,
            season_meta=season_meta,
            sid=sid,
            sem=sem,
            dry_run=dry_run,
        )

    results = await asyncio.gather(*(_one(p) for p in to_refresh))
    n_ok = sum(1 for x in results if x == "ok")
    n_err = sum(1 for x in results if x == "err")
    print(f"  stats: refreshed≈{n_ok} errors={n_err}", file=sys.stderr, flush=True)
    return r, a, n_ok, skipped


async def run(args: argparse.Namespace) -> int:
    nationality_map: dict[str, str] = {}
    if _NAT.is_file():
        nationality_map = json.loads(_NAT.read_text(encoding="utf-8"))

    country = (args.country or "").strip()
    league = (args.league or "").strip()
    comp = (args.competition_id or "").strip().upper()

    if comp and not country and not league:
        ent = _find_tier1(comp)
        if ent:
            country = (ent.get("countryName") or "").strip()
            league = (ent.get("leagueName") or "").strip()

    if args.list_unpulled:
        entries = _load_tier1()
        n = 0
        for e in entries:
            c = (e.get("countryName") or "").strip()
            lg = (e.get("leagueName") or "").strip()
            co = (e.get("competitionId") or "").strip()
            if not c or not lg or not co:
                continue
            lo = OUT_TEAMS / c / lg
            if _league_unpulled(lo):
                print(f"{co}\t{c}\t{lg}", file=sys.stderr)
                n += 1
        print(f"Total unpulled (no folder or no club JSON): {n}", file=sys.stderr)
        return 0

    if args.tier1_all and args.all_leagues:
        print("Use only one of --tier1-all or --all-leagues.", file=sys.stderr)
        return 2

    if args.all_leagues:
        entries = _merged_league_entries()
        if not entries:
            print(f"Missing or empty {_TIER1} (needed for merged list).", file=sys.stderr)
            return 1
        total_in_index = len(entries)
        offset = max(0, args.offset)
        entries = entries[offset:]
        if args.limit:
            entries = entries[: args.limit]
        if not entries:
            print("No entries to process (check --offset / --limit).", file=sys.stderr)
            return 1
        print(
            f"All leagues: {len(entries)} league(s) "
            f"(slots {offset + 1}–{offset + len(entries)} of {total_in_index}; "
            f"tier-1 + top European 2nd tiers, includes big 5)…",
            file=sys.stderr,
            flush=True,
        )
        async with TMKT() as tmkt:
            season_meta = await _season_hint(tmkt)
            club_cache: dict[str, str] = {}
            nt_cache: dict[str, str] = {}
            player_cache: dict[str, Any] = {}
            stats_cache: dict[str, tuple[int, int, int]] = {}
            for j, e in enumerate(entries):
                i = offset + j + 1
                c = (e.get("countryName") or "").strip()
                lg = (e.get("leagueName") or "").strip()
                co = (e.get("competitionId") or "").strip()
                if not c or not lg or not co:
                    print(f"[{i}/{total_in_index}] skip bad entry: {e!r}", file=sys.stderr)
                    continue
                print(f"[{i}/{total_in_index}] {c} / {lg} ({co})", file=sys.stderr, flush=True)
                await _repair_one_league(
                    tmkt,
                    c,
                    lg,
                    co,
                    nationality_map=nationality_map,
                    club_cache=club_cache,
                    nt_cache=nt_cache,
                    player_cache=player_cache,
                    stats_cache=stats_cache,
                    season_meta=season_meta,
                    dry_run=args.dry_run,
                    create_dir=True,
                    skip_stats_pass=args.skip_stats,
                    force_stats_refresh=args.force_stats_refresh,
                    stats_concurrency=args.stats_concurrency,
                )
        print("Done (all leagues).", file=sys.stderr)
        return 0

    if args.tier1_all:
        entries = _load_tier1()
        if not entries:
            print(f"Missing or empty {_TIER1}", file=sys.stderr)
            return 1
        total_in_index = len(entries)
        offset = max(0, args.offset)
        entries = entries[offset:]
        if args.limit:
            entries = entries[: args.limit]
        if not entries:
            print("No entries to process (check --offset / --limit).", file=sys.stderr)
            return 1
        print(
            f"Tier-1 all: {len(entries)} league(s) "
            f"(index {offset + 1}–{offset + len(entries)} of {total_in_index})…",
            file=sys.stderr,
            flush=True,
        )
        async with TMKT() as tmkt:
            season_meta = await _season_hint(tmkt)
            club_cache: dict[str, str] = {}
            nt_cache: dict[str, str] = {}
            player_cache: dict[str, Any] = {}
            stats_cache: dict[str, tuple[int, int, int]] = {}
            for j, e in enumerate(entries):
                i = offset + j + 1
                c = (e.get("countryName") or "").strip()
                lg = (e.get("leagueName") or "").strip()
                co = (e.get("competitionId") or "").strip()
                if not c or not lg or not co:
                    print(f"[{i}/{total_in_index}] skip bad entry: {e!r}", file=sys.stderr)
                    continue
                print(f"[{i}/{total_in_index}] {c} / {lg} ({co})", file=sys.stderr, flush=True)
                await _repair_one_league(
                    tmkt,
                    c,
                    lg,
                    co,
                    nationality_map=nationality_map,
                    club_cache=club_cache,
                    nt_cache=nt_cache,
                    player_cache=player_cache,
                    stats_cache=stats_cache,
                    season_meta=season_meta,
                    dry_run=args.dry_run,
                    create_dir=True,
                    skip_stats_pass=args.skip_stats,
                    force_stats_refresh=args.force_stats_refresh,
                    stats_concurrency=args.stats_concurrency,
                )
        print("Done (tier1 all).", file=sys.stderr)
        return 0

    if args.tier1_unpulled:
        entries = _load_tier1()
        if not entries:
            print(f"Missing or empty {_TIER1}", file=sys.stderr)
            return 1
        targets: list[tuple[str, str, str]] = []
        for e in entries:
            c = (e.get("countryName") or "").strip()
            lg = (e.get("leagueName") or "").strip()
            co = (e.get("competitionId") or "").strip()
            if not c or not lg or not co:
                continue
            if _league_unpulled(OUT_TEAMS / c / lg):
                targets.append((c, lg, co))
        if not targets:
            print("No unpulled tier-1 leagues (all have at least one club JSON).", file=sys.stderr)
            return 0
        print(f"Processing {len(targets)} unpulled tier-1 league(s)…", file=sys.stderr, flush=True)
        async with TMKT() as tmkt:
            season_meta = await _season_hint(tmkt)
            club_cache: dict[str, str] = {}
            nt_cache: dict[str, str] = {}
            player_cache: dict[str, Any] = {}
            stats_cache: dict[str, tuple[int, int, int]] = {}
            for i, (c, lg, co) in enumerate(targets, start=1):
                print(f"[{i}/{len(targets)}] {c} / {lg} ({co})", file=sys.stderr, flush=True)
                await _repair_one_league(
                    tmkt,
                    c,
                    lg,
                    co,
                    nationality_map=nationality_map,
                    club_cache=club_cache,
                    nt_cache=nt_cache,
                    player_cache=player_cache,
                    stats_cache=stats_cache,
                    season_meta=season_meta,
                    dry_run=args.dry_run,
                    create_dir=True,
                    skip_stats_pass=args.skip_stats,
                    force_stats_refresh=args.force_stats_refresh,
                    stats_concurrency=args.stats_concurrency,
                )
        print("Done (tier1 unpulled batch).", file=sys.stderr)
        return 0

    if not country or not league or not comp:
        print(
            "Need --country, --league, and --competition-id (e.g. NL1), "
            "or only --competition-id if it appears in _tier1_competitions.json",
            file=sys.stderr,
        )
        return 1

    if _find_tier1(comp) is None and not args.allow_unknown_competition:
        print(
            f"competitionId {comp!r} not in {_TIER1.name}; "
            "use --allow-unknown-competition if country/league paths are correct",
            file=sys.stderr,
        )
        return 1

    league_out = OUT_TEAMS / country / league
    print(f"{country} / {league} ({comp})", file=sys.stderr, flush=True)
    print(f"  folder: {league_out.relative_to(PROJECT)}", file=sys.stderr, flush=True)
    if not TEAMS_IMAGES.joinpath(country, league).is_dir():
        print(
            f"  note: no Teams Images/{country}/{league}/ yet (logos optional; sync still runs)",
            file=sys.stderr,
            flush=True,
        )

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)
        club_cache: dict[str, str] = {}
        nt_cache: dict[str, str] = {}
        player_cache: dict[str, Any] = {}
        stats_cache: dict[str, tuple[int, int, int]] = {}
        await _repair_one_league(
            tmkt,
            country,
            league,
            comp,
            nationality_map=nationality_map,
            club_cache=club_cache,
            nt_cache=nt_cache,
            player_cache=player_cache,
            stats_cache=stats_cache,
            season_meta=season_meta,
            dry_run=args.dry_run,
            create_dir=args.create,
            skip_stats_pass=args.skip_stats,
            force_stats_refresh=args.force_stats_refresh,
            stats_concurrency=args.stats_concurrency,
        )

    print("Done.", file=sys.stderr)
    return 0


def main() -> None:
    p = argparse.ArgumentParser(
        description="Repair one league: TM roster sync + fill missing appearances/goals/assists."
    )
    p.add_argument("--country", default="", help="e.g. Netherlands")
    p.add_argument("--league", default="", help="e.g. Eredivisie")
    p.add_argument(
        "--competition-id",
        default="",
        metavar="CODE",
        help="TM competition id (e.g. NL1). If alone, country/league are taken from tier-1 index when possible.",
    )
    p.add_argument(
        "--create",
        action="store_true",
        help="Create Squad Formation/Teams/<country>/<league> if missing",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Roster dry-run from sync_league; stats pass prints only",
    )
    p.add_argument(
        "--skip-stats",
        action="store_true",
        help="Only roster alignment (remove/add clubs), do not refresh stats",
    )
    p.add_argument(
        "--force-stats-refresh",
        action="store_true",
        help="Re-fetch every club in the league for stats (not only files missing stat fields)",
    )
    p.add_argument(
        "--stats-concurrency",
        type=int,
        default=4,
        metavar="N",
        help="Parallel club fetches during stats pass",
    )
    p.add_argument(
        "--allow-unknown-competition",
        action="store_true",
        help="Allow --competition-id not listed in tier-1 JSON (you supply country + league)",
    )
    p.add_argument(
        "--list-unpulled",
        action="store_true",
        help="List tier-1 leagues with no folder or no club JSON (tab: code, country, league)",
    )
    p.add_argument(
        "--tier1-unpulled",
        action="store_true",
        help="Run full repair only for tier-1 leagues with no folder or no club JSON yet",
    )
    p.add_argument(
        "--tier1-all",
        action="store_true",
        help="Tier-1 index only (119 countries); use --all-leagues for tier-1 + European 2nd tiers",
    )
    p.add_argument(
        "--all-leagues",
        action="store_true",
        help="Full run: tier-1 worldwide + big 5 + Championship/Serie B/etc. (merged, deduped). Same as repair_all_leagues.py",
    )
    p.add_argument(
        "--offset",
        type=int,
        default=0,
        metavar="N",
        help="Skip first N entries in the batch list (--all-leagues or --tier1-all)",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        metavar="N",
        help="Max leagues in this run (0 = no cap; use with --all-leagues / --tier1-all)",
    )
    args = p.parse_args()
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
