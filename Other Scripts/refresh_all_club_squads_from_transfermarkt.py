#!/usr/bin/env python3
"""
Rewrite every Squad Formation/Teams club JSON from Transfermarkt (squads + season apps/goals/assists).

Use after changing fetch_squad_payload / PlayerOut shape so existing files pick up new fields
without re-running logo-based generation.

Full-folder mode (no --only-path) walks Teams/<Country>/<League>/*.json in alphabetical
country → league → club order, and by default finishes all clubs in one league before
starting the next (see --parallel-leagues). Only individual files are skipped when JSON
is invalid or kind != club — entire leagues are never skipped.

Application Security Requirement: HTTPS tmapi only; validate JSON; paths under project only.
"""

from __future__ import annotations

import argparse
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

from generate_squads_from_transfermarkt import (  # noqa: E402
    OUT_TEAMS,
    PROJECT,
    _get_club_safe,
    _relax_reserve_filter_for_club_label,
    _safe_json_filename_stem,
    _season_hint,
    _serialize_squad,
    club_resolve_queries,
    fetch_squad_payload,
    resolve_team_id,
    season_context_for_club,
)

_NAT = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"


def _teams_path_labels(jp: Path) -> tuple[str, str]:
    """Country and league folder names from a path under Squad Formation/Teams."""
    try:
        rel = jp.resolve().relative_to(OUT_TEAMS.resolve())
        parts = rel.parts
        country = parts[0] if len(parts) >= 1 else ""
        league = parts[1] if len(parts) >= 2 else ""
        return country, league
    except ValueError:
        return "", ""


def _ordered_club_json_paths(out_teams: Path) -> list[Path]:
    """All club JSON files: Teams/<Country>/<League>/*.json in stable order, then stray paths."""
    ordered: list[Path] = []
    seen: set[Path] = set()
    if not out_teams.is_dir():
        return ordered
    for country in sorted(out_teams.iterdir(), key=lambda p: p.name.lower()):
        if not country.is_dir():
            continue
        for league in sorted(country.iterdir(), key=lambda p: p.name.lower()):
            if not league.is_dir():
                continue
            for jp in sorted(league.glob("*.json"), key=lambda p: p.name.lower()):
                ordered.append(jp)
                seen.add(jp.resolve())
    for jp in sorted(out_teams.rglob("*.json"), key=lambda p: str(p).lower()):
        if jp.resolve() not in seen:
            ordered.append(jp)
    return ordered


def _batch_paths_by_league(paths: list[Path]) -> list[list[Path]]:
    """Split a path list (already ordered) into contiguous (country, league) groups."""
    batches: list[list[Path]] = []
    cur: list[Path] = []
    prev_key: Optional[tuple[str, str]] = None
    for jp in paths:
        key = _teams_path_labels(jp)
        if not cur or key == prev_key:
            cur.append(jp)
        else:
            batches.append(cur)
            cur = [jp]
        prev_key = key
    if cur:
        batches.append(cur)
    return batches


async def run(args: argparse.Namespace) -> int:
    only = (args.only_path or "").strip()
    if only:
        single = Path(only)
        if not single.is_absolute():
            single = (PROJECT / single).resolve()
        else:
            single = single.resolve()
        try:
            single.relative_to(OUT_TEAMS.resolve())
        except ValueError:
            print(f"Refusing --only-path outside {OUT_TEAMS}: {single}", file=sys.stderr)
            return 2
        if not single.is_file():
            print(f"Not a file: {single}", file=sys.stderr)
            return 2
        paths = [single]
    else:
        paths = _ordered_club_json_paths(OUT_TEAMS)
        if args.limit:
            paths = paths[: args.limit]
        print(
            f"Queued {len(paths)} JSON file(s) under Teams (ordered by country → league → club).",
            file=sys.stderr,
            flush=True,
        )

    nationality_map: dict[str, str] = {}
    if _NAT.is_file():
        nationality_map = json.loads(_NAT.read_text(encoding="utf-8"))

    club_cache: dict[str, str] = {}
    nt_cache: dict[str, str] = {}
    player_cache: dict[str, Any] = {}
    stats_cache: dict[str, tuple[int, int, int]] = {}
    transfer_cache: dict[str, list[dict[str, str]]] = {}
    club_career_cache: dict[str, dict[str, Any]] = {}
    national_career_cache: dict[str, dict[str, Any]] = {}

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)

        sem = asyncio.Semaphore(max(1, args.concurrency))

        async def one(jp: Path) -> str:
            country, league = _teams_path_labels(jp)
            loc = f"{country} | {league}" if league else country or "?"
            try:
                raw = json.loads(jp.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print(
                    f"skip (bad JSON): {loc} | file={jp.name}",
                    file=sys.stderr,
                    flush=True,
                )
                return "skip"
            if raw.get("kind") != "club":
                print(
                    f"skip (not kind=club): {loc} | file={jp.name}",
                    file=sys.stderr,
                    flush=True,
                )
                return "skip"
            cid_raw = raw.get("transfermarktClubId")
            cid: Optional[int] = None
            if cid_raw is not None:
                try:
                    cid = int(cid_raw)
                except (TypeError, ValueError):
                    cid = None
            rel_img = (raw.get("imagePath") or "").strip().replace("\\", "/")
            async with sem:
                if cid is None:
                    label = str(raw.get("name") or jp.stem)
                    qlist = club_resolve_queries(str(raw.get("name") or ""), jp.stem)
                    relax = _relax_reserve_filter_for_club_label(label)
                    cid = await resolve_team_id(
                        tmkt,
                        qlist,
                        want_national=False,
                        relax_reserve_filter=relax,
                    )
                    if cid is None:
                        print(
                            f"skip (unresolved id): {loc} | club={label} | file={jp.name}",
                            file=sys.stderr,
                            flush=True,
                        )
                        return "skip"
                    print(
                        f"resolved transfermarktClubId={cid}: {loc} | club={label}",
                        file=sys.stderr,
                        flush=True,
                    )
                cdata = await _get_club_safe(tmkt, cid)
                official = (cdata or {}).get("name") or raw.get("name") or ""
                official = official.strip() or f"club-{cid}"
                season_meta_club, sid_club = await season_context_for_club(
                    tmkt,
                    cid,
                    club_data=cdata,
                    fallback_meta=season_meta,
                )
                try:
                    smc = season_meta_club if isinstance(season_meta_club, dict) else {}
                    cv = smc.get("competitionId")
                    comp_stats = (
                        str(cv).strip().upper()
                        if cv is not None and str(cv).strip()
                        else None
                    )
                    lbl = (
                        str(smc.get("label")).strip()
                        if isinstance(smc, dict) and smc.get("label")
                        else None
                    )
                    squads = await fetch_squad_payload(
                        tmkt,
                        cid,
                        official_squad_name=official,
                        nationality_map=nationality_map,
                        club_name_cache=club_cache,
                        nt_name_cache=nt_cache,
                        player_cache=player_cache,
                        stats_cache=stats_cache,
                        transfer_cache=transfer_cache,
                        club_career_cache=club_career_cache,
                        national_career_cache=national_career_cache,
                        season_id=sid_club,
                        national_team_squad=False,
                        season_competition_id=comp_stats,
                        season_label_hint=lbl,
                    )
                except Exception as exc:
                    print(
                        f"[err] {loc} | club={official}: {exc}",
                        file=sys.stderr,
                        flush=True,
                    )
                    return "skip"
                payload = _serialize_squad(
                    kind="club",
                    label=official,
                    rel_image=rel_img,
                    tm_id=cid,
                    season_meta=season_meta_club,
                    squads=squads,
                )
                if raw.get("source", {}).get("missingLogoFile"):
                    payload.setdefault("source", {})["missingLogoFile"] = True
            out_name = f"{_safe_json_filename_stem(official)}.json"
            out_path = jp.parent / out_name
            if args.dry_run:
                print(
                    f"[dry-run] {loc} | club={official} -> {out_path.relative_to(PROJECT)}",
                    file=sys.stderr,
                    flush=True,
                )
            else:
                out_path.write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                if out_path.resolve() != jp.resolve():
                    jp.unlink(missing_ok=True)
                print(
                    f"ok {loc} | club={official}",
                    file=sys.stderr,
                    flush=True,
                )
            return "ok"

        results: list[str] = []
        if (
            args.sequential_leagues
            and len(paths) > 1
            and not only
        ):
            batches = _batch_paths_by_league(paths)
            print(
                f"Processing {len(batches)} league folder(s) sequentially "
                f"(use --parallel-leagues for one global pool).",
                file=sys.stderr,
                flush=True,
            )
            for bi, batch in enumerate(batches, start=1):
                c0, l0 = _teams_path_labels(batch[0])
                loc0 = f"{c0} | {l0}" if l0 else c0 or "?"
                print(
                    f"=== League {bi}/{len(batches)}: {loc0} ({len(batch)} file(s)) ===",
                    file=sys.stderr,
                    flush=True,
                )
                results.extend(await asyncio.gather(*(one(p) for p in batch)))
        else:
            results = await asyncio.gather(*(one(p) for p in paths))
        n_ok = sum(1 for r in results if r == "ok")
        n_skip = sum(1 for r in results if r == "skip")

    print(f"Done. refreshed={n_ok} skipped={n_skip}", file=sys.stderr)
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Refresh all club squad JSON from Transfermarkt.")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--limit", type=int, default=0, help="Max JSON files (testing; ignored if --only-path)")
    p.add_argument(
        "--only-path",
        type=str,
        default="",
        help="Refresh a single club JSON under Squad Formation/Teams (project-relative or absolute).",
    )
    p.add_argument("--concurrency", type=int, default=4, help="Parallel club fetches")
    p.set_defaults(sequential_leagues=True)
    p.add_argument(
        "--parallel-leagues",
        dest="sequential_leagues",
        action="store_false",
        help=(
            "Run all clubs in one asyncio pool (faster). "
            "Default: complete each country/league folder before moving to the next."
        ),
    )
    args = p.parse_args()
    try:
        rc = asyncio.run(run(args))
    except KeyboardInterrupt:
        print(
            "\nInterrupted (Ctrl+C). Partial writes are kept; run again to continue "
            "from the start of the queue.",
            file=sys.stderr,
            flush=True,
        )
        rc = 130
    raise SystemExit(rc)


if __name__ == "__main__":
    main()
