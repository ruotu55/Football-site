#!/usr/bin/env python3
"""
Download team logos for 2 leagues per country (England, Spain, Italy, France, Germany)
and normalize to General values/Image/image.json spec: 256x256 PNG, transparent background.
Requires: pip install Pillow
"""
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
TEAMS_IMAGES = PROJECT_ROOT / "Teams Images"
IMAGE_SPEC_PATH = PROJECT_ROOT / "General values" / "Image" / "image.json"
GITHUB_API_BASE = "https://api.github.com/repos/luukhopman/football-logos/contents/logos"

# (GitHub API path segment, country folder name, league folder name)
LEAGUES = [
    ("England%20-%20Premier%20League", "England", "Premier League"),
    ("England%20-%20Championship", "England", "Championship"),
    ("Spain%20-%20LaLiga", "Spain", "LaLiga"),
    ("Spain%20-%20LaLiga2", "Spain", "LaLiga2"),
    ("Italy%20-%20Serie%20A", "Italy", "Serie A"),
    ("Italy%20-%20Serie%20B", "Italy", "Serie B"),
    ("France%20-%20Ligue%201", "France", "Ligue 1"),
    ("France%20-%20Ligue%202", "France", "Ligue 2"),
    ("Germany%20-%20Bundesliga", "Germany", "Bundesliga"),
    ("Germany%20-%202.%20Bundesliga", "Germany", "2. Bundesliga"),
]


def load_spec():
    with open(IMAGE_SPEC_PATH, encoding="utf-8") as f:
        return json.load(f)


def fetch_api(path_segment):
    url = f"{GITHUB_API_BASE}/{path_segment}"
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp = f.name
    try:
        subprocess.run(
            ["curl", "-sSfL", "-o", tmp, "-H", "Accept: application/json", url],
            check=True,
            timeout=15,
        )
        with open(tmp, encoding="utf-8") as f:
            return json.load(f)
    except subprocess.CalledProcessError:
        return None
    finally:
        Path(tmp).unlink(missing_ok=True)


def normalize_image(in_path: Path, out_path: Path, spec: dict):
    try:
        from PIL import Image
    except ImportError:
        print("Install Pillow: pip install Pillow")
        raise
    w = spec["size"]["width"]
    h = spec["size"]["height"]
    img = Image.open(in_path)
    img = img.convert("RGBA")
    # Fit logo inside w×h with transparent padding (no distortion)
    img.thumbnail((w, h), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = (w - img.width) // 2
    y = (h - img.height) // 2
    out.paste(img, (x, y), img)
    out.save(out_path, "PNG", optimize=True)


def main():
    spec = load_spec()
    target_w = spec["size"]["width"]
    target_h = spec["size"]["height"]

    for path_segment, country, league in LEAGUES:
        items = fetch_api(path_segment)
        if not items or not isinstance(items, list):
            print(f"Skip (no data): {country}/{league}")
            (TEAMS_IMAGES / country / league).mkdir(parents=True, exist_ok=True)
            continue

        league_dir = TEAMS_IMAGES / country / league
        league_dir.mkdir(parents=True, exist_ok=True)
        count = 0
        for item in items:
            if item.get("type") != "file" or not item.get("download_url"):
                continue
            name = item["name"]
            if not name.lower().endswith((".png", ".jpg", ".jpeg")):
                continue
            base = Path(name).stem + ".png"
            out_path = league_dir / base
            raw_url = item["download_url"]
            # Ensure path is properly encoded for curl (unquote then quote to handle accents)
            parsed = urlparse(raw_url)
            path_encoded = quote(unquote(parsed.path), safe="/")
            url = parsed._replace(path=path_encoded).geturl()
            with tempfile.NamedTemporaryFile(suffix=Path(name).suffix, delete=False) as f:
                tmp = f.name
            try:
                subprocess.run(
                    ["curl", "-sSfL", "-o", tmp, url],
                    check=True,
                    timeout=15,
                )
                normalize_image(Path(tmp), out_path, spec)
                count += 1
                print(f"OK: {country}/{league}/{base}")
            except Exception as e:
                print(f"FAIL: {country}/{league}/{name} - {e}")
            finally:
                Path(tmp).unlink(missing_ok=True)
        if count == 0:
            print(f"No logos: {country}/{league}")
    print("Done.")


if __name__ == "__main__":
    main()
