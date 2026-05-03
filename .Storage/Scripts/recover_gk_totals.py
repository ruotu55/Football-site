#!/usr/bin/env python3
"""
One-shot script to restore corrupted goalkeeper (and outfield player) career totals
from git history.

Bug: the legacy Transfermarkt squad scraper sets club_career_totals.goals_conceded=0
for goalkeepers, and occasionally regresses clean_sheets by 1-2.

This script compares every JSON file under:
  .Storage/Squad Formation/Teams/
  .Storage/Squad Formation/Nationalities/

against commit 91aa4146 (the last known-good snapshot) and applies a monotonic guard:
- if the historical value is a positive int AND (current is None OR current < historical)
  -> restore the historical value

Fields covered:
  club_career_totals:          appearances, goals, assists, goals_conceded, clean_sheets
  national_team_career_totals: appearances, goals, assists, goals_conceded, clean_sheets

Usage:
  python .Storage/Scripts/recover_gk_totals.py [--dry-run]
"""

import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

# Ensure stdout handles Unicode on Windows terminals that default to narrow code pages
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REFERENCE_COMMIT = "91aa4146"

CAREER_FIELDS = ["appearances", "goals", "assists", "goals_conceded", "clean_sheets"]
CAREER_SECTIONS = ["club_career_totals", "national_team_career_totals"]
POSITION_BUCKETS = ["goalkeepers", "defenders", "midfielders", "attackers"]

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # .Storage/Scripts -> .Storage -> repo root

SEARCH_DIRS = [
    REPO_ROOT / ".Storage" / "Squad Formation" / "Teams",
    REPO_ROOT / ".Storage" / "Squad Formation" / "Nationalities",
]


def git_show(rel_path: str) -> str | None:
    """Return file content at REFERENCE_COMMIT, or None if not present."""
    result = subprocess.run(
        ["git", "show", f"{REFERENCE_COMMIT}:{rel_path}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(REPO_ROOT),
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return result.stdout


def to_rel_path(abs_path: Path) -> str:
    """Convert absolute path to repo-relative POSIX path for git show."""
    rel = abs_path.relative_to(REPO_ROOT)
    # git show expects forward slashes
    return rel.as_posix()


def apply_monotonic(current_val, hist_val):
    """
    Return (new_val, changed: bool).
    Restores historical value when:
      - historical is a positive int (> 0)
      - AND current is None OR current < historical
    """
    if not isinstance(hist_val, int) or hist_val <= 0:
        return current_val, False
    if current_val is None or (isinstance(current_val, (int, float)) and current_val < hist_val):
        return hist_val, True
    return current_val, False


def process_file(json_path: Path, dry_run: bool) -> tuple[int, list[str]]:
    """
    Process one JSON file.
    Returns (fields_restored, [player names that changed]).
    """
    rel_path = to_rel_path(json_path)

    # Load current file
    try:
        with open(json_path, encoding="utf-8") as fh:
            current_data = json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  WARN: could not read {rel_path}: {exc}", file=sys.stderr)
        return 0, []

    # Load historical file
    hist_content = git_show(rel_path)
    if hist_content is None:
        return 0, []

    try:
        hist_data = json.loads(hist_content)
    except json.JSONDecodeError as exc:
        print(f"  WARN: could not parse historical {rel_path}: {exc}", file=sys.stderr)
        return 0, []

    # Build lookup: name -> player dict, across all buckets, from historical data
    hist_players: dict[str, dict] = {}
    for bucket in POSITION_BUCKETS:
        for player in hist_data.get(bucket, []):
            name = player.get("name")
            if name:
                hist_players[name] = player

    total_fields_restored = 0
    changed_players: list[str] = []
    data_changed = False

    for bucket in POSITION_BUCKETS:
        for player in current_data.get(bucket, []):
            name = player.get("name")
            if not name or name not in hist_players:
                continue

            hist_player = hist_players[name]
            player_changed = False
            player_fields_restored = 0

            for section in CAREER_SECTIONS:
                current_section = player.get(section)
                hist_section = hist_player.get(section)
                if not isinstance(current_section, dict) or not isinstance(hist_section, dict):
                    continue

                for field in CAREER_FIELDS:
                    if field not in current_section and field not in hist_section:
                        continue
                    # Only patch if field exists in at least one version
                    current_val = current_section.get(field)
                    hist_val = hist_section.get(field)

                    new_val, changed = apply_monotonic(current_val, hist_val)
                    if changed:
                        if dry_run:
                            print(
                                f"    [{name}] {section}.{field}: {current_val!r} -> {new_val!r}"
                            )
                        else:
                            current_section[field] = new_val
                        player_changed = True
                        player_fields_restored += 1
                        data_changed = True

            if player_changed:
                changed_players.append(name)
                total_fields_restored += player_fields_restored

    if data_changed and not dry_run:
        with open(json_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps(current_data, indent=2, ensure_ascii=False) + "\n")

    return total_fields_restored, changed_players


def main():
    parser = argparse.ArgumentParser(
        description="Restore corrupted GK career totals from git history."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files.",
    )
    args = parser.parse_args()

    dry_run: bool = args.dry_run

    if dry_run:
        print(f"[DRY RUN] Comparing against commit {REFERENCE_COMMIT}\n")
    else:
        print(f"[LIVE RUN] Restoring from commit {REFERENCE_COMMIT}\n")

    json_files: list[Path] = []
    for search_dir in SEARCH_DIRS:
        if search_dir.exists():
            json_files.extend(sorted(search_dir.rglob("*.json")))

    total_inspected = 0
    total_restored_files = 0
    total_restored_fields = 0

    for json_path in json_files:
        total_inspected += 1
        fields_count, changed_players = process_file(json_path, dry_run)

        if changed_players:
            total_restored_files += 1
            total_restored_fields += fields_count
            players_str = ", ".join(changed_players)
            rel = to_rel_path(json_path)
            print(
                f"{'[DRY] would restore' if dry_run else 'restored'} {rel}: "
                f"{fields_count} GK totals ({players_str})"
            )

    print()
    print(f"Summary:")
    print(f"  Files inspected : {total_inspected}")
    print(f"  Files {'would be ' if dry_run else ''}restored: {total_restored_files}")
    print(f"  Fields {'would be ' if dry_run else ''}restored: {total_restored_fields}")


if __name__ == "__main__":
    main()
