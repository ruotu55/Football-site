#!/usr/bin/env python3
"""
Rewrite every Squad Formation/Nationalities/*.json from Transfermarkt: squads + season
appearances / goals / assists (same pipeline as clubs, with national_team_squad=True).

Application Security Requirement: HTTPS tmapi only; JSON read/write under project paths; no shell.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT

from generate_squads_from_transfermarkt import (  # noqa: E402
    OUT_NAT,
    PROJECT,
    _get_club_safe,
    _safe_json_filename_stem,
    _season_hint,
    _serialize_squad,
    _strip_youth_nt_display,
    fetch_squad_payload,
)

_NAT_MAP = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
_MAX_FETCH_ATTEMPTS = 10


async def run(args: argparse.Namespace) -> int:
    paths = sorted(OUT_NAT.rglob("*.json"))
    if args.limit:
        paths = paths[: args.limit]

    nationality_map: dict[str, str] = {}
    if _NAT_MAP.is_file():
        nationality_map = json.loads(_NAT_MAP.read_text(encoding="utf-8"))

    club_cache: dict[str, str] = {}
    nt_cache: dict[str, str] = {}
    player_cache: dict[str, Any] = {}
    stats_cache: dict[str, tuple[int, int, int]] = {}

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)
        sid = season_meta.get("seasonId")
        if isinstance(sid, str) and sid.isdigit():
            sid = int(sid)
        elif not isinstance(sid, int):
            sid = None

        sem = asyncio.Semaphore(max(1, args.concurrency))

        async def one(jp: Path) -> str:
            try:
                raw = json.loads(jp.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return "skip"
            if raw.get("kind") != "nationality":
                return "skip"
            cid_raw = raw.get("transfermarktClubId")
            if cid_raw is None:
                print(f"skip (no id): {jp}", file=sys.stderr)
                return "skip"
            try:
                cid = int(cid_raw)
            except (TypeError, ValueError):
                return "skip"
            rel_img = (raw.get("imagePath") or "").strip().replace("\\", "/")
            async with sem:
                cdata = await _get_club_safe(tmkt, cid)
                base = (cdata or {}).get("name") or raw.get("name") or ""
                official = _strip_youth_nt_display(base.strip()) or raw.get("name") or f"nt-{cid}"
                official = official.strip() or f"nt-{cid}"
                squads = None
                last_exc: BaseException | None = None
                for attempt in range(_MAX_FETCH_ATTEMPTS):
                    try:
                        squads = await fetch_squad_payload(
                            tmkt,
                            cid,
                            official_squad_name="",
                            nationality_map=nationality_map,
                            club_name_cache=club_cache,
                            nt_name_cache=nt_cache,
                            player_cache=player_cache,
                            stats_cache=stats_cache,
                            season_id=sid,
                            national_team_squad=True,
                        )
                        last_exc = None
                        break
                    except Exception as exc:
                        last_exc = exc
                        nxt = attempt + 1
                        if nxt < _MAX_FETCH_ATTEMPTS:
                            w = min(30, 2 ** min(attempt, 5))
                            print(
                                f"  [nationality] {jp.name} attempt {nxt}/{_MAX_FETCH_ATTEMPTS}: "
                                f"{exc!s} — retry in {w}s…",
                                file=sys.stderr,
                                flush=True,
                            )
                            await asyncio.sleep(w)
                if squads is None:
                    print(
                        f"  [nationality] FAILED after {_MAX_FETCH_ATTEMPTS} attempts: "
                        f"{jp.name}: {last_exc!s}",
                        file=sys.stderr,
                        flush=True,
                    )
                    print("  Stopping.", file=sys.stderr, flush=True)
                    raise SystemExit(1)
                payload = _serialize_squad(
                    kind="nationality",
                    label=official,
                    rel_image=rel_img,
                    tm_id=cid,
                    season_meta=season_meta,
                    squads=squads,
                )
                if raw.get("source", {}).get("error"):
                    payload.setdefault("source", {})["error"] = raw["source"]["error"]
            out_name = f"{_safe_json_filename_stem(official)}.json"
            out_path = jp.parent / out_name
            if args.dry_run:
                print(f"[dry-run] {out_path}", file=sys.stderr)
            else:
                out_path.write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                if out_path.resolve() != jp.resolve():
                    jp.unlink(missing_ok=True)
            return "ok"

        results = await asyncio.gather(*(one(p) for p in paths))
        n_ok = sum(1 for r in results if r == "ok")
        n_skip = sum(1 for r in results if r == "skip")

    print(f"Done. refreshed={n_ok} skipped={n_skip}", file=sys.stderr)
    return 0


def main() -> None:
    p = argparse.ArgumentParser(
        description="Refresh all nationality squad JSON from Transfermarkt (apps/goals/assists)."
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--limit", type=int, default=0, help="Max JSON files (testing)")
    p.add_argument("--concurrency", type=int, default=4, help="Parallel national-team fetches")
    args = p.parse_args()
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
