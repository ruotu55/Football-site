#!/usr/bin/env python3
"""
Download flag images for all countries by continent from FlagCDN.
Saves one image per country directly in each continent folder (e.g. Europe/Germany.png).
Uses subprocess + curl; reads country list from CSV.
"""
import csv
import re
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
FLAG_BASE = "https://flagcdn.com/w640/{}.png"
# CSV with name, alpha-2, region, sub-region
CSV_URL = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.csv"


def sanitize_filename(name: str) -> str:
    """Make a safe filename: remove/replace chars invalid in filenames."""
    # Replace characters that are invalid in filenames (Windows + Unix)
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", name)
    return s.strip() or "Unknown"


def region_to_continent(region: str, sub_region: str, intermediate_region: str) -> str | None:
    """Map ISO region to continent folder name. Returns None to skip."""
    if not region:
        return None
    if region == "Americas":
        # South America is in intermediate-region in the CSV, not sub-region
        return "South America" if intermediate_region == "South America" else "North America"
    if region == "Europe":
        return "Europe"
    if region == "Asia":
        return "Asia"
    if region == "Africa":
        return "Africa"
    if region == "Oceania":
        return "Oceania"
    return None


def main():
    # Optional: extra entities per continent (e.g. football teams not in ISO)
    extras = {
        "Europe": [
            ("England", "gb-eng"),
            ("Scotland", "gb-sct"),
            ("Wales", "gb-wls"),
            ("Northern Ireland", "gb-nir"),
        ],
    }

    # Download CSV
    csv_path = BASE_DIR / "countries_iso.csv"
    try:
        subprocess.run(
            ["curl", "-sSfL", "-o", str(csv_path), CSV_URL],
            check=True,
            timeout=15,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"Failed to fetch CSV: {e}")
        return

    # Parse and group by continent
    by_continent: dict[str, list[tuple[str, str]]] = {}
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or "").strip()
            alpha2 = (row.get("alpha-2") or "").strip().lower()
            region = (row.get("region") or "").strip()
            sub_region = (row.get("sub-region") or "").strip()
            intermediate_region = (row.get("intermediate-region") or "").strip()
            if not name or not alpha2:
                continue
            continent = region_to_continent(region, sub_region, intermediate_region)
            if not continent:
                continue
            # Shorten common long names for filename
            display_name = name
            if "Holy See" in name:
                display_name = "Vatican City"
            elif "Russian Federation" in name:
                display_name = "Russia"
            elif "United Kingdom of Great Britain and Northern Ireland" in name:
                display_name = "United Kingdom"
            elif "United States of America" in name:
                display_name = "United States"
            elif "Iran, Islamic Republic of" in name:
                display_name = "Iran"
            elif "Korea, Democratic People's Republic of" in name:
                display_name = "North Korea"
            elif "Korea, Republic of" in name:
                display_name = "South Korea"
            elif "Lao People's Democratic Republic" in name:
                display_name = "Laos"
            elif "Syrian Arab Republic" in name:
                display_name = "Syria"
            elif "Tanzania, United Republic of" in name:
                display_name = "Tanzania"
            elif "Venezuela, Bolivarian Republic of" in name:
                display_name = "Venezuela"
            elif "Bolivia, Plurinational State of" in name:
                display_name = "Bolivia"
            elif "Moldova, Republic of" in name:
                display_name = "Moldova"
            elif "Netherlands, Kingdom of the" in name:
                display_name = "Netherlands"
            elif "Congo, Democratic Republic of the" in name:
                display_name = "Democratic Republic of the Congo"
            elif "Côte d'Ivoire" in name:
                display_name = "Ivory Coast"
            elif "Palestine, State of" in name:
                display_name = "Palestine"
            elif "Taiwan, Province of China" in name:
                display_name = "Taiwan"
            elif "Micronesia, Federated States of" in name:
                display_name = "Micronesia"
            elif "Saint Helena, Ascension and Tristan da Cunha" in name:
                display_name = "Saint Helena"
            elif "Bonaire, Sint Eustatius and Saba" in name:
                display_name = "Caribbean Netherlands"

            by_continent.setdefault(continent, []).append((display_name, alpha2))

    for continent, pairs in extras.items():
        for name, code in pairs:
            if continent not in by_continent:
                by_continent[continent] = []
            by_continent[continent].append((name, code))

    # Download each flag into continent folder
    for continent, countries in sorted(by_continent.items()):
        continent_dir = BASE_DIR / continent
        continent_dir.mkdir(parents=True, exist_ok=True)
        seen = set()
        for name, code in countries:
            fname = sanitize_filename(name) + ".png"
            if fname in seen:
                fname = f"{sanitize_filename(name)}_{code}.png"
            seen.add(fname)
            out_path = continent_dir / fname
            url = FLAG_BASE.format(code)
            try:
                subprocess.run(
                    ["curl", "-sSfL", "-o", str(out_path), url],
                    check=True,
                    timeout=15,
                )
                print(f"OK: {continent}/{fname}")
            except subprocess.CalledProcessError as e:
                print(f"FAIL: {continent}/{fname} - {e}")

    print("Done.")


if __name__ == "__main__":
    main()
