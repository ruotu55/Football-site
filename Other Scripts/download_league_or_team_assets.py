#!/usr/bin/env python3
"""
Download club crests (Transfermarkt) and Fut.gg FC26 player faces for one league or one club.

Uses squad JSONs under Squad Formation/Teams. After downloads, run build-player-images-index.py
(or pass --rebuild-index) so the web app sees new player files.

Application Security Requirement: subprocess with argv lists only (no shell); delegates to
existing HTTPS-scoped download scripts.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT = _SCRIPT_DIR.parent.parent
_SQUAD_TEAMS = _PROJECT / "Squad Formation" / "Teams"


def discover_leagues() -> list[tuple[str, str]]:
    """(country folder, league folder) pairs that contain at least one *.json."""
    out: list[tuple[str, str]] = []
    if not _SQUAD_TEAMS.is_dir():
        return out
    for country in sorted(_SQUAD_TEAMS.iterdir()):
        if not country.is_dir():
            continue
        for league in sorted(country.iterdir()):
            if not league.is_dir():
                continue
            if any(league.glob("*.json")):
                out.append((country.name, league.name))
    return out


def list_club_stems(country: str, league: str) -> list[str]:
    d = _SQUAD_TEAMS / country / league
    if not d.is_dir():
        return []
    return sorted(p.stem for p in d.glob("*.json"))


def _interactive_pick_league() -> str:
    leagues = discover_leagues()
    if not leagues:
        print("No leagues found under Squad Formation/Teams.", file=sys.stderr)
        raise SystemExit(1)
    print("\nLeagues (Country / League):")
    for i, (c, l) in enumerate(leagues, 1):
        print(f"  [{i}] {c} / {l}")
    print("  [0] Type a path manually (e.g. England/Premier League)")
    raw = input("\nPick a number: ").strip()
    if raw == "0":
        path = input("Path under Squad Formation/Teams/ (Country/League): ").strip()
        path = path.replace("\\", "/").strip("/")
        if not path or not (_SQUAD_TEAMS / path).is_dir():
            print(f"Not found: {_SQUAD_TEAMS / path}", file=sys.stderr)
            raise SystemExit(1)
        return path
    try:
        n = int(raw)
        assert 1 <= n <= len(leagues)
    except (ValueError, AssertionError):
        print("Invalid selection.", file=sys.stderr)
        raise SystemExit(1)
    c, l = leagues[n - 1]
    return f"{c}/{l}"


def _split_league_path(only_under: str) -> tuple[str, str]:
    parts = only_under.strip().replace("\\", "/").strip("/").split("/")
    if len(parts) < 2:
        print("League path must be Country/League (two or more segments).", file=sys.stderr)
        raise SystemExit(1)
    return parts[0], parts[1]


def _interactive_pick_team(only_under: str) -> str:
    country, league = _split_league_path(only_under)
    clubs = list_club_stems(country, league)
    if not clubs:
        print(f"No club JSON files in {only_under}", file=sys.stderr)
        raise SystemExit(1)
    print(f"\nTeams in {only_under}:")
    for i, name in enumerate(clubs, 1):
        print(f"  [{i}] {name}")
    raw = input("\nPick a team number (or Enter to download the whole league): ").strip()
    if not raw:
        return ""
    try:
        n = int(raw)
        assert 1 <= n <= len(clubs)
    except (ValueError, AssertionError):
        print("Invalid selection.", file=sys.stderr)
        raise SystemExit(1)
    return clubs[n - 1]


def run_pipeline(
    only_under: str,
    club_stem: str,
    *,
    dry_run: bool,
    logo_delay: float,
    player_delay: float,
    futgg_csv: str,
    skip_logos: bool,
    skip_players: bool,
    skip_if_has_image: bool,
    ea_league_name: str,
    rebuild_index: bool,
    limit_players: int,
) -> int:
    logo_script = _SCRIPT_DIR / "download_missing_club_logos.py"
    futgg_script = _SCRIPT_DIR / "download_futgg_premier_league_player_photos.py"
    index_script = _SCRIPT_DIR / "build-player-images-index.py"

    if not only_under.strip():
        print("--league or --team (or --interactive) is required.", file=sys.stderr)
        return 1

    only_under = only_under.strip().replace("\\", "/").strip("/")
    rc = 0

    if not skip_logos:
        cmd = [sys.executable, str(logo_script), "--delay", str(logo_delay)]
        cmd += ["--only-under", only_under]
        if club_stem:
            cmd += ["--club", club_stem]
        if dry_run:
            cmd.append("--dry-run")
        print("\n=== Club crests (Transfermarkt CDN) ===\n", file=sys.stderr)
        r = subprocess.run(cmd, cwd=str(_PROJECT))
        if r.returncode != 0:
            rc = r.returncode

    if not skip_players:
        cmd = [
            sys.executable,
            str(futgg_script),
            "--only-under",
            only_under,
            "--delay",
            str(player_delay),
            "--csv",
            futgg_csv,
        ]
        if club_stem:
            cmd += ["--club", club_stem]
        if ea_league_name:
            cmd += ["--ea-league-name", ea_league_name]
        if skip_if_has_image:
            cmd.append("--skip-if-has-image")
        if limit_players > 0:
            cmd += ["--limit-players", str(limit_players)]
        if dry_run:
            cmd.append("--dry-run")
        print("\n=== Player faces (Fut.gg / EA CSV) ===\n", file=sys.stderr)
        r = subprocess.run(cmd, cwd=str(_PROJECT))
        if r.returncode != 0 and rc == 0:
            rc = r.returncode

    if rebuild_index and not dry_run:
        print("\n=== Rebuild data/player-images.json ===\n", file=sys.stderr)
        r = subprocess.run([sys.executable, str(index_script)], cwd=str(_PROJECT))
        if r.returncode != 0 and rc == 0:
            rc = r.returncode

    return rc


def main() -> int:
    ap = argparse.ArgumentParser(
        description=(
            "Download team crests + Fut.gg player images for a league or one club "
            "(paths are under Squad Formation/Teams)."
        )
    )
    ap.add_argument(
        "--league",
        metavar="Country/League",
        default="",
        help='League folder, e.g. "England/Premier League" (all teams in that league).',
    )
    ap.add_argument(
        "--team",
        metavar="Country/League/ClubName",
        default="",
        help='Single club: last segment is the JSON stem, e.g. "England/Premier League/Arsenal FC".',
    )
    ap.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Pick league (and optionally one team) from numbered lists.",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--logo-delay",
        type=float,
        default=0.12,
        help="Delay between crest downloads (default 0.12).",
    )
    ap.add_argument(
        "--player-delay",
        type=float,
        default=0.35,
        help="Delay between Fut.gg requests (default 0.35).",
    )
    ap.add_argument(
        "--csv",
        default="",
        help="EA players.csv URL or path (passed to download_futgg_premier_league_player_photos.py).",
    )
    ap.add_argument(
        "--ea-league-name",
        default="",
        help="Override EA CSV league_name when the folder name does not match.",
    )
    ap.add_argument(
        "--skip-logos",
        action="store_true",
        help="Only run player download.",
    )
    ap.add_argument(
        "--skip-players",
        action="store_true",
        help="Only run crest download.",
    )
    ap.add_argument(
        "--skip-if-has-image",
        action="store_true",
        help="Skip players who already have a .webp in their folder.",
    )
    ap.add_argument(
        "--rebuild-index",
        action="store_true",
        help="Run build-player-images-index.py after (skipped with --dry-run).",
    )
    ap.add_argument(
        "--limit-players",
        type=int,
        default=0,
        help="Stop after N successful player lookups (0 = no limit).",
    )
    args = ap.parse_args()

    if args.skip_logos and args.skip_players:
        print("Cannot use both --skip-logos and --skip-players.", file=sys.stderr)
        return 1

    only_under = ""
    club_stem = ""

    if args.interactive:
        only_under = _interactive_pick_league()
        club_stem = _interactive_pick_team(only_under)
    elif args.team.strip():
        parts = args.team.strip().replace("\\", "/").strip("/").split("/")
        if len(parts) < 3:
            print(
                "--team must be Country/League/ClubStem with at least three segments.",
                file=sys.stderr,
            )
            return 1
        club_stem = parts[-1]
        only_under = "/".join(parts[:-1])
    elif args.league.strip():
        only_under = args.league.strip().replace("\\", "/").strip("/")
    else:
        print("Specify --league, --team, or --interactive.", file=sys.stderr)
        return 1

    if not (_SQUAD_TEAMS / only_under).is_dir():
        print(f"League path not found: {_SQUAD_TEAMS / only_under}", file=sys.stderr)
        return 1
    if club_stem and not (_SQUAD_TEAMS / only_under / f"{club_stem}.json").is_file():
        print(
            f"Club JSON not found: {_SQUAD_TEAMS / only_under / (club_stem + '.json')}",
            file=sys.stderr,
        )
        return 1

    fut_csv = args.csv.strip() or (
        "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/"
        "main/data/players.csv"
    )

    return run_pipeline(
        only_under,
        club_stem,
        dry_run=args.dry_run,
        logo_delay=args.logo_delay,
        player_delay=args.player_delay,
        futgg_csv=fut_csv,
        skip_logos=args.skip_logos,
        skip_players=args.skip_players,
        skip_if_has_image=args.skip_if_has_image,
        ea_league_name=args.ea_league_name,
        rebuild_index=args.rebuild_index,
        limit_players=args.limit_players,
    )


if __name__ == "__main__":
    raise SystemExit(main())
