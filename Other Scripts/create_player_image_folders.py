#!/usr/bin/env python3
"""
Create empty per-player folders under Players images/ from Squad Formation JSONs.

Club squads: Players images/Club images/<Country>/<League>/<Club name>/<Player name>/
National teams (optional): Players images/Nationality images/<Continent>/<Country>/<Player name>/

Matches folder names used in Squad Formation/Teams and Teams Images (official TM names).

Application Security Requirement: local JSON only; pathlib; no shell or network.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable

_SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _SCRIPT_DIR.parent.parent

SQUAD_TEAMS = PROJECT_ROOT / "Squad Formation" / "Teams"
SQUAD_NATIONALITIES = PROJECT_ROOT / "Squad Formation" / "Nationalities"
OUT_CLUB = PROJECT_ROOT / "Players images" / "Club images"
OUT_NAT = PROJECT_ROOT / "Players images" / "Nationality images"

POSITION_KEYS = ("goalkeepers", "defenders", "midfielders", "attackers")


def _safe_dir_name(name: str) -> str:
    """Same rules as _safe_json_filename_stem in generate_squads_from_transfermarkt.py."""
    s = (name or "").strip()
    for ch in '\\/:*?"<>|':
        s = s.replace(ch, "")
    s = s.strip(". \t")
    return s or "unknown"


def _iter_player_names(data: dict) -> Iterable[str]:
    for key in POSITION_KEYS:
        block = data.get(key)
        if not isinstance(block, list):
            continue
        for row in block:
            if not isinstance(row, dict):
                continue
            n = row.get("name")
            if isinstance(n, str) and n.strip():
                yield n.strip()


def _ensure_player_dirs(base: Path, names: Iterable[str], dry_run: bool) -> int:
    created = 0
    seen: set[str] = set()
    for name in names:
        safe = _safe_dir_name(name)
        if safe in seen:
            continue
        seen.add(safe)
        dest = base / safe
        if dest.exists():
            continue
        if dry_run:
            print(f"mkdir {dest}")
        else:
            dest.mkdir(parents=True, exist_ok=True)
        created += 1
    return created


def process_club_json(path: Path, dry_run: bool) -> int:
    rel = path.relative_to(SQUAD_TEAMS)
    parts = rel.parts
    if len(parts) < 3:
        return 0
    country, league = parts[0], parts[1]
    club_stem = path.stem

    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return 0

    base = OUT_CLUB / country / league / club_stem
    names = list(_iter_player_names(data))
    return _ensure_player_dirs(base, names, dry_run)


def process_nationality_json(path: Path, dry_run: bool) -> int:
    rel = path.relative_to(SQUAD_NATIONALITIES)
    parts = rel.parts
    if len(parts) < 2:
        return 0
    continent, country_stem = parts[0], path.stem

    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return 0

    base = OUT_NAT / continent / country_stem
    names = list(_iter_player_names(data))
    return _ensure_player_dirs(base, names, dry_run)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Create Players images/... folders for each player in squad JSONs."
    )
    ap.add_argument(
        "--nationalities",
        action="store_true",
        help="Also create folders from Squad Formation/Nationalities (Continent/Country).",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print paths that would be created without creating directories.",
    )
    args = ap.parse_args()

    if not SQUAD_TEAMS.is_dir():
        print(f"Missing squad folder: {SQUAD_TEAMS}", file=sys.stderr)
        return 1

    total = 0
    for json_path in sorted(SQUAD_TEAMS.rglob("*.json")):
        total += process_club_json(json_path, args.dry_run)

    if args.nationalities:
        if not SQUAD_NATIONALITIES.is_dir():
            print(f"Missing: {SQUAD_NATIONALITIES}", file=sys.stderr)
            return 1
        for json_path in sorted(SQUAD_NATIONALITIES.rglob("*.json")):
            total += process_nationality_json(json_path, args.dry_run)

    action = "Would create" if args.dry_run else "Created"
    print(f"{action} {total} new player folder(s).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
