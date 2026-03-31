#!/usr/bin/env python3
"""
Align Squad Formation/Teams with Transfermarkt's official club list per competition
for the current API season (25/26 / seasonId 2025).

Removes JSON for clubs not in that league's roster; generates JSON for missing clubs.

Application Security Requirement: HTTPS to tmapi only; validate JSON; no shell interpolation.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT

# Reuse generator helpers (same TM resolution and squad serialization)
from generate_squads_from_transfermarkt import (  # noqa: E402
    OUT_TEAMS,
    PROJECT,
    TEAMS_IMAGES,
    _get_club_safe,
    _safe_json_filename_stem,
    _season_hint,
    _serialize_squad,
    fetch_squad_payload,
)

# Transfermarkt competition IDs (first tier / second tier per country)
LEAGUE_COMPETITION: dict[tuple[str, str], str] = {
    ("England", "Premier League"): "GB1",
    ("England", "Championship"): "GB2",
    ("France", "Ligue 1"): "FR1",
    ("France", "Ligue 2"): "FR2",
    ("Germany", "Bundesliga"): "L1",
    ("Germany", "2. Bundesliga"): "L2",
    ("Italy", "Serie A"): "IT1",
    ("Italy", "Serie B"): "IT2",
    ("Spain", "LaLiga"): "ES1",
    ("Spain", "LaLiga2"): "ES2",
}


async def official_club_ids(tmkt: TMKT, competition_id: str) -> set[int]:
    r = await tmkt.get_competition_clubs(competition_id)
    if not r.get("success"):
        raise RuntimeError(r.get("message", "competition clubs failed"))
    ids = (r.get("data") or {}).get("clubIds") or []
    return {int(x) for x in ids}


async def sync_league(
    tmkt: TMKT,
    country: str,
    league: str,
    competition_id: str,
    *,
    nationality_map: dict[str, str],
    club_cache: dict[str, str],
    nt_cache: dict[str, str],
    player_cache: dict[str, Any],
    stats_cache: dict[str, tuple[int, int, int]],
    season_meta: dict[str, Any],
    dry_run: bool,
) -> tuple[int, int]:
    """Returns (removed, added)."""
    print(
        f"  … fetching official club list ({competition_id})",
        file=sys.stderr,
        flush=True,
    )
    try:
        official = await official_club_ids(tmkt, competition_id)
    except Exception as exc:
        print(
            f"  … SKIP: cannot load competition {competition_id} ({exc!s}). "
            "Update competitionId in _tier1_competitions.json if TM changed.",
            file=sys.stderr,
            flush=True,
        )
        return 0, 0
    print(
        f"  … {len(official)} clubs on TM, scanning {country}/{league}",
        file=sys.stderr,
        flush=True,
    )
    league_img = TEAMS_IMAGES / country / league
    league_out = OUT_TEAMS / country / league
    if not dry_run:
        league_out.mkdir(parents=True, exist_ok=True)

    # Index existing JSON by club id
    json_paths_by_cid: dict[int, list[Path]] = {}
    for jp in league_out.glob("*.json"):
        try:
            data = json.loads(jp.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if data.get("kind") != "club":
            continue
        raw = data.get("transfermarktClubId")
        if raw is None:
            continue
        try:
            cid = int(raw)
        except (TypeError, ValueError):
            continue
        json_paths_by_cid.setdefault(cid, []).append(jp)

    removed = added = 0

    # Remove JSON not in official 25/26 list (and duplicates)
    for cid, paths in list(json_paths_by_cid.items()):
        if cid not in official:
            for p in paths:
                if dry_run:
                    print(f"  [dry-run] remove {p.relative_to(OUT_TEAMS)}", file=sys.stderr)
                else:
                    p.unlink()
                removed += 1
        else:
            for p in paths[1:]:
                if dry_run:
                    print(f"  [dry-run] remove duplicate {p}", file=sys.stderr)
                else:
                    p.unlink()
                removed += 1

    surviving: set[int] = set()
    for jp in league_out.glob("*.json"):
        try:
            data = json.loads(jp.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if data.get("kind") != "club":
            continue
        raw = data.get("transfermarktClubId")
        if raw is not None:
            try:
                surviving.add(int(raw))
            except (TypeError, ValueError):
                pass

    missing = official - surviving
    if missing:
        print(
            f"  … {len(missing)} clubs to add "
            "(logos linked only when OfficialName.png exists locally; else missingLogoFile + download_missing_club_logos.py)",
            file=sys.stderr,
            flush=True,
        )

    sid = season_meta.get("seasonId")
    if isinstance(sid, str) and sid.isdigit():
        sid = int(sid)
    elif not isinstance(sid, int):
        sid = None

    n_missing = len(missing)
    for mi, cid in enumerate(sorted(missing), start=1):
        cdata = await _get_club_safe(tmkt, cid)
        if not cdata:
            print(f"  skip add {cid}: get_club failed", file=sys.stderr)
            continue
        official_name = (cdata.get("name") or "").strip() or f"club-{cid}"
        print(
            f"  … squad {mi}/{n_missing}: {official_name}",
            file=sys.stderr,
            flush=True,
        )
        rel_img: Optional[Path] = None
        cand_png = league_img / f"{_safe_json_filename_stem(official_name)}.png"
        if cand_png.is_file():
            rel_img = cand_png.relative_to(TEAMS_IMAGES)
        if rel_img is not None:
            image_path = str(Path("Teams Images") / rel_img)
        else:
            safe_guess = f"{_safe_json_filename_stem(official_name)}.png"
            image_path = str(Path("Teams Images") / country / league / safe_guess)

        try:
            squads = await fetch_squad_payload(
                tmkt,
                cid,
                official_squad_name=official_name,
                nationality_map=nationality_map,
                club_name_cache=club_cache,
                nt_name_cache=nt_cache,
                player_cache=player_cache,
                stats_cache=stats_cache,
                season_id=sid,
                national_team_squad=False,
            )
        except Exception as exc:
            print(f"  skip squad {official_name} ({cid}): {exc}", file=sys.stderr)
            continue

        payload = _serialize_squad(
            kind="club",
            label=official_name,
            rel_image=image_path,
            tm_id=cid,
            season_meta=season_meta,
            squads=squads,
        )
        if rel_img is None:
            payload.setdefault("source", {})["missingLogoFile"] = True

        out_name = f"{_safe_json_filename_stem(official_name)}.json"
        out_path = league_out / out_name
        if dry_run:
            print(f"  [dry-run] write {out_path.relative_to(OUT_TEAMS)}", file=sys.stderr)
        else:
            out_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        added += 1

    return removed, added


async def run(dry_run: bool) -> int:
    nat_path = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict[str, str] = {}
    if nat_path.is_file():
        nationality_map = json.loads(nat_path.read_text(encoding="utf-8"))

    club_cache: dict[str, str] = {}
    nt_cache: dict[str, str] = {}
    player_cache: dict[str, Any] = {}
    stats_cache: dict[str, tuple[int, int, int]] = {}

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)
        total_r = total_a = 0
        for (country, league), comp in sorted(LEAGUE_COMPETITION.items()):
            print(f"{country}/{league} ({comp}) …", file=sys.stderr)
            r, a = await sync_league(
                tmkt,
                country,
                league,
                comp,
                nationality_map=nationality_map,
                club_cache=club_cache,
                nt_cache=nt_cache,
                player_cache=player_cache,
                stats_cache=stats_cache,
                season_meta=season_meta,
                dry_run=dry_run,
            )
            print(f"  removed={r} added={a}", file=sys.stderr)
            total_r += r
            total_a += a
        print(f"Done. Total removed={total_r} added={total_a}", file=sys.stderr)
    return 0


def main() -> None:
    import argparse

    p = argparse.ArgumentParser(description="Sync Squad Formation/Teams to TM 25/26 league lists.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without changing files",
    )
    args = p.parse_args()
    raise SystemExit(asyncio.run(run(args.dry_run)))


if __name__ == "__main__":
    main()
