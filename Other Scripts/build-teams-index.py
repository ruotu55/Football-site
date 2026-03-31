#!/usr/bin/env python3
"""Regenerate data/teams-index.json after adding or moving squad JSON files."""
from __future__ import annotations

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SQUAD = PROJECT_ROOT / "Squad Formation"
OUT = PROJECT_ROOT / "data" / "teams-index.json"


def main() -> None:
    clubs: list[dict] = []
    nats: list[dict] = []

    teams_dir = SQUAD / "Teams"
    if teams_dir.is_dir():
        for p in teams_dir.rglob("*.json"):
            try:
                with open(p, encoding="utf-8") as f:
                    d = json.load(f)
                if d.get("kind") != "club":
                    continue
                rel = p.relative_to(SQUAD.parent).as_posix()
                parts = p.relative_to(teams_dir).parts
                country = parts[0] if parts else ""
                league = parts[1] if len(parts) > 1 else ""
                clubs.append(
                    {
                        "id": rel,
                        "name": d.get("name", p.stem),
                        "country": country,
                        "league": league,
                        # rel already starts with "Squad Formation/…" (from project root)
                        "path": "../" + rel,
                    }
                )
            except (json.JSONDecodeError, OSError):
                continue

    nat_dir = SQUAD / "Nationalities"
    if nat_dir.is_dir():
        for p in nat_dir.rglob("*.json"):
            try:
                with open(p, encoding="utf-8") as f:
                    d = json.load(f)
                if d.get("kind") != "nationality":
                    continue
                rel = p.relative_to(SQUAD.parent).as_posix()
                parts = p.relative_to(nat_dir).parts
                region = parts[0] if parts else ""
                nats.append(
                    {
                        "id": rel,
                        "name": d.get("name", p.stem),
                        "region": region,
                        "path": "../" + rel,
                    }
                )
            except (json.JSONDecodeError, OSError):
                continue

    clubs.sort(key=lambda x: (x["country"], x["league"], x["name"]))
    nats.sort(key=lambda x: (x["region"], x["name"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"clubs": clubs, "nationalities": nats, "generated": True}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(clubs)} clubs, {len(nats)} national teams -> {OUT}")


if __name__ == "__main__":
    main()
