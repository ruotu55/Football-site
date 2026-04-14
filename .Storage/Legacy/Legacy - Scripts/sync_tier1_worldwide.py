#!/usr/bin/env python3
"""
Sync Squad Formation/Teams for every tier-1 league listed in _tier1_competitions.json
(25/26 club lists + squads via tmapi), same behaviour as sync_teams_to_season per league.

Application Security Requirement: HTTPS tmapi only; validate JSON; no shell.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT

from generate_squads_from_transfermarkt import _season_hint
from sync_teams_to_season import PROJECT, sync_league  # noqa: E402

_DEFAULT_INDEX = PROJECT / "Squad Formation" / "_tier1_competitions.json"


async def run(args: argparse.Namespace) -> int:
    idx_path = Path(args.index)
    if not idx_path.is_file():
        print(f"Missing index: {idx_path}", file=sys.stderr)
        print("Run: python3 Other Scripts/discover_tier1_competitions.py", file=sys.stderr)
        return 1

    data = json.loads(idx_path.read_text(encoding="utf-8"))
    entries: list[dict[str, Any]] = list(data.get("entries") or [])
    comp_filter = (args.competition_id or "").strip().upper()
    if comp_filter:
        entries = [e for e in entries if (e.get("competitionId") or "").strip().upper() == comp_filter]
        if not entries:
            print(f"No index entry with competitionId={comp_filter!r}", file=sys.stderr)
            return 1

    total_after_filter = len(entries)
    offset = max(0, args.offset)
    if offset:
        entries = entries[offset:]
    if args.limit:
        entries = entries[: args.limit]

    if not entries:
        print("No entries to process (check --offset / --limit).", file=sys.stderr)
        return 1

    nat_path = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict[str, str] = {}
    if nat_path.is_file():
        nationality_map = json.loads(nat_path.read_text(encoding="utf-8"))

    club_cache: dict[str, str] = {}
    nt_cache: dict[str, str] = {}
    player_cache: dict[str, Any] = {}
    stats_cache: dict[str, tuple[int, int, int]] = {}

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)
        total_r = total_a = 0
        for j, e in enumerate(entries):
            i = offset + j + 1
            country = (e.get("countryName") or "").strip()
            league = (e.get("leagueName") or "").strip()
            comp = (e.get("competitionId") or "").strip()
            if not country or not league or not comp:
                print(f"[{i}] skip bad entry: {e}", file=sys.stderr)
                continue
            print(
                f"[{i}/{total_after_filter}] {country} / {league} ({comp}) …",
                file=sys.stderr,
                flush=True,
            )
            r, a = await sync_league(
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
            )
            print(f"  removed={r} added={a}", file=sys.stderr, flush=True)
            total_r += r
            total_a += a

    print(f"Done. Total removed={total_r} added={total_a}", file=sys.stderr)
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Sync all tier-1 leagues from _tier1_competitions.json")
    p.add_argument("--index", default=str(_DEFAULT_INDEX), help="Path to tier-1 index JSON")
    p.add_argument(
        "--competition-id",
        default="",
        metavar="CODE",
        help="Sync only this TM competition (e.g. ALB1). Ignores --limit when set.",
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--offset",
        type=int,
        default=0,
        metavar="N",
        help="Skip the first N leagues in the index (after --competition-id). Use to resume or batch.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N leagues after --offset (0 = no cap)",
    )
    args = p.parse_args()
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
