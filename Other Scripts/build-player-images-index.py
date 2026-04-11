#!/usr/bin/env python3
"""Build data/player-images.json: all image files per player folder (sorted by name)."""
from __future__ import annotations

import json
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
# Repo root contains `Players images/` and `data/` (script lives in `Other Scripts/` at repo root).
ROOT = _SCRIPT_DIR.parent
if not (ROOT / "Players images" / "Club images").is_dir():
    ROOT = _SCRIPT_DIR.parent.parent
OUT = ROOT / "data" / "player-images.json"

CLUB_BASE = ROOT / "Players images" / "Club images"
NAT_BASE = ROOT / "Players images" / "Nationality images"

IMAGE_EXTS = {".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"}


def _all_images(rel_dir: Path) -> list[str]:
    if not rel_dir.is_dir():
        return []
    files = sorted(
        f
        for f in rel_dir.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS
    )
    return [f.relative_to(ROOT).as_posix() for f in files]


def _scan_club() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if not CLUB_BASE.is_dir():
        return out
    for player_dir in CLUB_BASE.rglob("*"):
        if not player_dir.is_dir():
            continue
        if not any(player_dir.iterdir()):
            continue
        try:
            rel_parts = player_dir.relative_to(CLUB_BASE).parts
        except ValueError:
            continue
        if len(rel_parts) < 4:
            continue
        country, league, club, player = rel_parts[0], rel_parts[1], rel_parts[2], rel_parts[3]
        key = f"{country}|{league}|{club}|{player}"
        imgs = _all_images(player_dir)
        if imgs:
            out[key] = imgs
    return out


def _scan_nat() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if not NAT_BASE.is_dir():
        return out
    for player_dir in NAT_BASE.rglob("*"):
        if not player_dir.is_dir():
            continue
        if not any(player_dir.iterdir()):
            continue
        try:
            rel_parts = player_dir.relative_to(NAT_BASE).parts
        except ValueError:
            continue
        if len(rel_parts) < 3:
            continue
        continent, country, player = rel_parts[0], rel_parts[1], rel_parts[2]
        key = f"{continent}|{country}|{player}"
        imgs = _all_images(player_dir)
        if imgs:
            out[key] = imgs
    return out


def main() -> None:
    payload = {"club": _scan_club(), "nationality": _scan_nat(), "generated": True}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=0)
        f.write("\n")
    print(f"Wrote {len(payload['club'])} club + {len(payload['nationality'])} nat keys -> {OUT}")


if __name__ == "__main__":
    main()
