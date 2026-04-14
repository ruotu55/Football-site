#!/usr/bin/env python3
"""
Rename Teams Images/*.png to match official club names from Squad Formation/Teams JSON,
update imagePath in each JSON, and remove logo files not referenced by the current squad list.

Application Security Requirement: filesystem-only; no network; validate JSON before writes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT = _SCRIPT_DIR.parent.parent
_TEAMS_IMAGES = _PROJECT / "Teams Images"
_SQUAD_TEAMS = _PROJECT / "Squad Formation" / "Teams"


def _safe_stem(official_name: str) -> str:
    s = (official_name or "").strip()
    for ch in '\\/:*?"<>|':
        s = s.replace(ch, "")
    return s.strip(". \t") or "unknown"


def _load_club_entries() -> list[dict]:
    out: list[dict] = []
    for jf in sorted(_SQUAD_TEAMS.rglob("*.json")):
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if data.get("kind") != "club":
            continue
        rel = jf.relative_to(_SQUAD_TEAMS)
        if len(rel.parts) < 3:
            continue
        country, league = rel.parts[0], rel.parts[1]
        name = (data.get("name") or "").strip()
        if not name:
            continue
        stem = _safe_stem(name)
        canon_name = f"{stem}.png"
        canon_abs = _TEAMS_IMAGES / country / league / canon_name
        canon_rel = f"Teams Images/{country}/{league}/{canon_name}"
        img_rel = (data.get("imagePath") or "").strip().replace("\\", "/")
        cur_abs = (_PROJECT / img_rel) if img_rel else None
        out.append(
            {
                "json_path": jf,
                "country": country,
                "league": league,
                "name": name,
                "canon_abs": canon_abs,
                "canon_rel": canon_rel,
                "cur_abs": cur_abs,
            }
        )
    return out


def run(dry_run: bool) -> int:
    entries = _load_club_entries()
    if not entries:
        print("No club squad JSON found.", file=sys.stderr)
        return 1

    renamed = 0
    updated_json = 0
    removed_orphans = 0

    # 1) Rename/move current logo file to canonical filename when needed
    for e in entries:
        canon_abs: Path = e["canon_abs"]
        cur: Optional[Path] = e["cur_abs"]
        if cur is None or not cur.is_file():
            print(f"  [missing file] {e['name']}: {cur}", file=sys.stderr)
            continue
        try:
            cur_res = cur.resolve()
            canon_res = canon_abs.resolve()
        except OSError:
            continue
        if cur_res == canon_res:
            continue
        if canon_abs.exists() and cur_res != canon_res:
            # Target exists — prefer keeping canonical path; remove duplicate source if same size
            if cur_res.stat().st_size == canon_res.stat().st_size:
                if dry_run:
                    print(f"  [dry-run] unlink duplicate {cur}", file=sys.stderr)
                else:
                    cur.unlink()
                renamed += 1
            else:
                print(
                    f"  [conflict] {e['name']}: {cur.name} vs {canon_abs.name} (different size)",
                    file=sys.stderr,
                )
            continue
        if dry_run:
            print(f"  [dry-run] rename {cur.name} -> {canon_abs.name}", file=sys.stderr)
        else:
            canon_abs.parent.mkdir(parents=True, exist_ok=True)
            cur.rename(canon_abs)
        renamed += 1

    # 2) Update imagePath in every JSON to canonical relative path
    for e in entries:
        jf = e["json_path"]
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if data.get("imagePath") == e["canon_rel"]:
            continue
        data["imagePath"] = e["canon_rel"]
        if dry_run:
            print(f"  [dry-run] update imagePath {jf.name}", file=sys.stderr)
        else:
            jf.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        updated_json += 1

    # 3) Remove PNGs not in the official list AND not a current imagePath (rename source)
    league_keys: set[tuple[str, str]] = {(e["country"], e["league"]) for e in entries}
    expected_by_league: dict[tuple[str, str], set[str]] = {}
    for e in entries:
        k = (e["country"], e["league"])
        expected_by_league.setdefault(k, set()).add(e["canon_abs"].name)

    referenced_in_folder: dict[Path, set[str]] = {}
    for e in entries:
        cur = e["cur_abs"]
        if cur and cur.is_file():
            referenced_in_folder.setdefault(cur.parent, set()).add(cur.name)

    for country, league in sorted(league_keys):
        folder = _TEAMS_IMAGES / country / league
        if not folder.is_dir():
            continue
        expected = expected_by_league.get((country, league), set())
        refs = referenced_in_folder.get(folder, set())
        for png in list(folder.glob("*.png")):
            if png.name in expected:
                continue
            if png.name in refs:
                continue
            if dry_run:
                print(f"  [dry-run] remove orphan {png.relative_to(_PROJECT)}", file=sys.stderr)
            else:
                png.unlink()
            removed_orphans += 1

    print(
        f"Done. renamed_moves={renamed} json_updated={updated_json} orphans_removed={removed_orphans}",
        file=sys.stderr,
    )
    return 0


def main() -> None:
    p = argparse.ArgumentParser(
        description="Align Teams Images PNG names with Squad Formation/Teams official names."
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    raise SystemExit(run(args.dry_run))


if __name__ == "__main__":
    main()
