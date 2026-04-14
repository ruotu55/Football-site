#!/usr/bin/env python3
"""
Download high-quality flag images for European countries from FlagCDN (free, Wikipedia-based).
Saves one flag per country folder under Europe/.
Uses subprocess + curl to avoid SSL context issues on some systems.
"""
from pathlib import Path
import subprocess

# European countries: folder_name -> ISO 3166-1 alpha-2 code (for flagcdn.com)
# Includes UEFA-style entities (England, Scotland, Wales) for football.
EUROPE_COUNTRIES = {
    "Albania": "al",
    "Andorra": "ad",
    "Armenia": "am",
    "Austria": "at",
    "Azerbaijan": "az",
    "Belarus": "by",
    "Belgium": "be",
    "Bosnia and Herzegovina": "ba",
    "Bulgaria": "bg",
    "Croatia": "hr",
    "Cyprus": "cy",
    "Czech Republic": "cz",
    "Denmark": "dk",
    "England": "gb-eng",
    "Estonia": "ee",
    "Finland": "fi",
    "France": "fr",
    "Georgia": "ge",
    "Germany": "de",
    "Greece": "gr",
    "Hungary": "hu",
    "Iceland": "is",
    "Ireland": "ie",
    "Italy": "it",
    "Kazakhstan": "kz",
    "Kosovo": "xk",
    "Latvia": "lv",
    "Liechtenstein": "li",
    "Lithuania": "lt",
    "Luxembourg": "lu",
    "Malta": "mt",
    "Moldova": "md",
    "Monaco": "mc",
    "Montenegro": "me",
    "Netherlands": "nl",
    "North Macedonia": "mk",
    "Northern Ireland": "gb-nir",
    "Norway": "no",
    "Poland": "pl",
    "Portugal": "pt",
    "Romania": "ro",
    "Russia": "ru",
    "San Marino": "sm",
    "Scotland": "gb-sct",
    "Serbia": "rs",
    "Slovakia": "sk",
    "Slovenia": "si",
    "Spain": "es",
    "Sweden": "se",
    "Switzerland": "ch",
    "Turkey": "tr",
    "Ukraine": "ua",
    "United Kingdom": "gb",
    "Vatican City": "va",
    "Wales": "gb-wls",
}

BASE_DIR = Path(__file__).resolve().parent
EUROPE_DIR = BASE_DIR / "Europe"
# Use 640px width for good quality; flagcdn format: w640/code.png
FLAG_BASE = "https://flagcdn.com/w640/{}.png"


def main():
    EUROPE_DIR.mkdir(parents=True, exist_ok=True)

    for country, code in EUROPE_COUNTRIES.items():
        folder = EUROPE_DIR / country
        folder.mkdir(parents=True, exist_ok=True)
        out_path = folder / "flag.png"
        url = FLAG_BASE.format(code)
        try:
            # Use curl to respect system CA bundle and avoid SSL issues
            subprocess.run(
                ["curl", "-sSfL", "-o", str(out_path), url],
                check=True,
                timeout=15,
            )
            print(f"OK: {country}")
        except subprocess.CalledProcessError as e:
            print(f"FAIL: {country} - {e}")
        except FileNotFoundError:
            print("FAIL: curl not found. Install curl or use another method.")
            break

    print("Done.")


if __name__ == "__main__":
    main()
