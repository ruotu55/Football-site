"""Regenerate data/other-teams-logos.json from PNGs in Teams Images/(1) Other Teams.

When you open the site with Main Runner `run_site.py`, the swap-logo list is read live from the
folder (`/__other-teams-logos.json`). This file is only needed as a fallback for other static hosts
or if that endpoint is unavailable.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Teams Images" / "(1) Other Teams"
OUT = ROOT / "data" / "other-teams-logos.json"


def main() -> None:
    names: list[str] = []
    if SRC.is_dir():
        for p in sorted(SRC.iterdir()):
            if p.suffix.lower() == ".png":
                names.append(p.stem)
    data = {"dir": "Teams Images/(1) Other Teams", "names": names}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(names)} entries to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
