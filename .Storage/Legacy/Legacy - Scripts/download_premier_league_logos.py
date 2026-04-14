#!/usr/bin/env python3
"""
Download Premier League team logos into Teams Images/England/Premier League/.
Uses same approach as download_world_flags: GitHub API to list files, curl to download.
Logos from https://github.com/luukhopman/football-logos (CC-style, free use).
"""
import json
import subprocess
import tempfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
TEAMS_IMAGES = BASE_DIR.parent / "Teams Images"
PREMIER_LEAGUE_DIR = TEAMS_IMAGES / "England" / "Premier League"
GITHUB_API_URL = "https://api.github.com/repos/luukhopman/football-logos/contents/logos/England%20-%20Premier%20League"


def main():
    PREMIER_LEAGUE_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp = f.name
    try:
        subprocess.run(
            ["curl", "-sSfL", "-o", tmp, "-H", "Accept: application/json", GITHUB_API_URL],
            check=True,
            timeout=15,
        )
        with open(tmp, encoding="utf-8") as f:
            items = json.load(f)
    finally:
        Path(tmp).unlink(missing_ok=True)

    for item in items:
        if item.get("type") != "file" or not item.get("download_url"):
            continue
        name = item["name"]
        if not name.lower().endswith((".png", ".jpg", ".jpeg", ".svg")):
            continue
        url = item["download_url"]
        out_path = PREMIER_LEAGUE_DIR / name
        try:
            subprocess.run(
                ["curl", "-sSfL", "-o", str(out_path), url],
                check=True,
                timeout=15,
            )
            print(f"OK: England/Premier League/{name}")
        except subprocess.CalledProcessError as e:
            print(f"FAIL: {name} - {e}")

    print("Done.")


if __name__ == "__main__":
    main()
