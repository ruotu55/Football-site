#!/usr/bin/env python3
"""
Download second-division league logos from football-logos.cc (ZIP packs),
extract PNGs and normalize to General values/Image/image.json spec.
Requires: pip install Pillow
"""
import json
import os
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
TEAMS_IMAGES = PROJECT_ROOT / "Teams Images"
IMAGE_SPEC_PATH = PROJECT_ROOT / "General values" / "Image" / "image.json"

# (ZIP URL, country folder, league folder)
SECOND_DIVISION_ZIPS = [
    (
        "https://assets.football-logos.cc/collections/england-efl-championship-2025-2026.football-logos.cc.zip",
        "England",
        "Championship",
    ),
    (
        "https://assets.football-logos.cc/collections/spain-la-liga-2-2025-2026.football-logos.cc.zip",
        "Spain",
        "LaLiga2",
    ),
    (
        "https://assets.football-logos.cc/collections/italy-serie-b-2025-2026.football-logos.cc.zip",
        "Italy",
        "Serie B",
    ),
    (
        "https://assets.football-logos.cc/collections/france-ligue-2-2025-2026.football-logos.cc.zip",
        "France",
        "Ligue 2",
    ),
    (
        "https://assets.football-logos.cc/collections/germany-2-bundesliga-2025-2026.football-logos.cc.zip",
        "Germany",
        "2. Bundesliga",
    ),
]


def load_spec():
    with open(IMAGE_SPEC_PATH, encoding="utf-8") as f:
        return json.load(f)


def normalize_image(in_path: Path, out_path: Path, spec: dict):
    from PIL import Image

    w = spec["size"]["width"]
    h = spec["size"]["height"]
    img = Image.open(in_path)
    img = img.convert("RGBA")
    img.thumbnail((w, h), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = (w - img.width) // 2
    y = (h - img.height) // 2
    out.paste(img, (x, y), img)
    out.save(out_path, "PNG", optimize=True)


def sanitize_filename(name: str) -> str:
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", name)
    return s.strip() or "logo"


def main():
    spec = load_spec()
    league_dir = None

    for zip_url, country, league in SECOND_DIVISION_ZIPS:
        league_dir = TEAMS_IMAGES / country / league
        league_dir.mkdir(parents=True, exist_ok=True)

        fd, zip_path_str = tempfile.mkstemp(suffix=".zip")
        zip_path = Path(zip_path_str)
        try:
            os.close(fd)
        except Exception:
            pass
        try:
            subprocess.run(
                ["curl", "-sSfL", "-o", str(zip_path), zip_url],
                check=True,
                timeout=120,
            )
        except subprocess.CalledProcessError as e:
            print(f"FAIL download {country}/{league}: {e}")
            continue

        count = 0
        seen_stems = set()
        try:
            with zipfile.ZipFile(zip_path, "r") as z:
                # Collect all PNG entries; prefer path containing "256" for size
                entries = [e for e in z.infolist() if not e.is_dir() and e.filename.lower().endswith(".png")]
                entries.sort(key=lambda e: (0 if "256" in e.filename else 1, e.filename))
                for info in entries:
                    name = Path(info.filename).name
                    stem = Path(name).stem
                    if stem in seen_stems:
                        continue
                    seen_stems.add(stem)
                    data = z.read(info)
                    fd2, tmp_path_str = tempfile.mkstemp(suffix=".png")
                    tmp = Path(tmp_path_str)
                    try:
                        os.close(fd2)
                        tmp.write_bytes(data)
                        base = sanitize_filename(stem) + ".png"
                        out_path = league_dir / base
                        normalize_image(tmp, out_path, spec)
                        count += 1
                        print(f"OK: {country}/{league}/{base}")
                    finally:
                        tmp.unlink(missing_ok=True)
        except Exception as e:
            print(f"FAIL extract {country}/{league}: {e}")
        finally:
            zip_path.unlink(missing_ok=True)

        print(f"  -> {count} logos: {country}/{league}")

    print("Done.")


if __name__ == "__main__":
    main()
