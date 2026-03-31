#!/usr/bin/env python3
"""
Build squad JSON files under Squad Formation/Teams and Squad Formation/Nationalities
from current Transfermarkt squad data (tmapi-alpha), mirroring Teams Images / Nationality images.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import ssl
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from tmkt import TMKT  # noqa: E402

PROJECT = Path(__file__).resolve().parent.parent
TEAMS_IMAGES = PROJECT / "Teams Images"
NATIONALITY_IMAGES = PROJECT / "Nationality images"
OUT_TEAMS = PROJECT / "Squad Formation" / "Teams"
OUT_NAT = PROJECT / "Squad Formation" / "Nationalities"

YOUTH_RE = re.compile(r"\bU(16|17|18|19|20|21|23)\b", re.IGNORECASE)
YOUTH_NT_SUFFIX = re.compile(r"^(.+?)\s+U\d{2}$")


def _stem_team_query(basename: str) -> str:
    name = basename
    if name.lower().endswith(".png"):
        name = name[:-4]
    name = re.sub(r"\.football-logos\.cc$", "", name, flags=re.IGNORECASE)
    name = name.replace("-", " ").strip()
    if not name:
        return basename
    return " ".join(part.capitalize() for part in name.split())


def _display_name_from_filename_stem(stem: str) -> str:
    s = re.sub(r"\.football-logos\.cc$", "", stem, flags=re.IGNORECASE)
    s = s.replace("-", " ").strip()
    if not s:
        return stem
    return " ".join(w.capitalize() for w in s.split())


def _safe_json_filename_stem(official_name: str) -> str:
    s = (official_name or "").strip()
    for ch in '\\/:*?"<>|':
        s = s.replace(ch, "")
    s = s.strip(". \t")
    return s or "unknown"


def _bucket(attrs: dict[str, Any]) -> str:
    pg = (attrs or {}).get("positionGroup") or ""
    cat = ((attrs or {}).get("position") or {}).get("category") or ""
    if pg == "GOALKEEPER" or cat == "Goalkeeper":
        return "goalkeepers"
    if pg == "DEFENDER" or cat == "Defender":
        return "defenders"
    if pg == "MIDFIELDER" or cat == "Midfielder":
        return "midfielders"
    if pg in ("FORWARD", "ATTACKER") or cat in ("Striker", "Forward"):
        return "attackers"
    return "attackers"


def _is_youth_or_reserve(club_name: str) -> bool:
    n = club_name.lower()
    if YOUTH_RE.search(club_name):
        return True
    if re.search(r"\byth\.?\b", club_name, re.IGNORECASE):
        return True
    if "women" in n or "female" in n:
        return True
    if "academy" in n or " ii" in n or n.endswith(" b"):
        return True
    return False


async def _get_club_safe(tmkt: TMKT, cid: int) -> Optional[dict[str, Any]]:
    try:
        r = await tmkt.get_club(cid)
        if r.get("success") and r.get("data"):
            return r["data"]
    except Exception:
        return None
    return None


def _query_match_rank(query: str, official_name: str) -> tuple[int, int]:
    q = query.strip().lower()
    n = (official_name or "").strip().lower()
    if not q or not n:
        return (99, 0)
    if n == q:
        return (0, 0)
    if len(q.split()) >= 2 and n.startswith(q):
        return (1, len(n) - len(q))
    q_tokens = set(q.split())
    n_tokens = set(n.split())
    if len(q.split()) >= 2 and q_tokens <= n_tokens and len(q_tokens) >= 1:
        return (2, len(n))
    if q in n:
        return (3, len(n))
    for t in n_tokens:
        if len(t) >= 4 and (t.startswith(q) or q in t):
            return (4, len(n))
    return (50, len(n))


async def resolve_team_id(
    tmkt: TMKT, queries: list[str], *, want_national: bool
) -> Optional[int]:
    seen: set[int] = set()
    best: Optional[tuple[tuple[int, int], int]] = None
    for q in queries:
        if not q or not q.strip():
            continue
        try:
            rows = await tmkt.team_search(q.strip())
        except Exception:
            continue
        if not rows:
            continue
        batch: list[tuple[int, str]] = []
        for r in rows[:30]:
            cid = int(r["id"])
            if cid in seen:
                continue
            data = await _get_club_safe(tmkt, cid)
            if not data:
                continue
            bd = data.get("baseDetails") or {}
            if bool(bd.get("isNationalTeam")) != want_national:
                continue
            if _is_youth_or_reserve(data.get("name") or ""):
                continue
            seen.add(cid)
            batch.append((cid, data.get("name") or ""))
        if not batch:
            continue
        batch.sort(key=lambda item: _query_match_rank(q, item[1]))
        rank_key = _query_match_rank(q, batch[0][1])
        cid_pick = batch[0][0]
        if best is None or rank_key < best[0]:
            best = (rank_key, cid_pick)
        if rank_key[0] <= 2:
            return cid_pick
    return best[1] if best else None


def _queries_for_nationality(stem: str) -> list[str]:
    base = stem.strip()
    alts = [base, base.replace("Ivory Coast", "Côte d'Ivoire")]
    if base == "United Kingdom":
        alts.extend(["England", "Scotland", "Wales", "Northern Ireland"])
    if base == "USA":
        alts.append("United States")
    if base == "United States":
        alts.append("USA")
    out: list[str] = []
    for a in alts:
        if a and a not in out:
            out.append(a)
    return out


async def build_nationality_id_map(
    tmkt: TMKT,
    png_paths: list[Path],
    *,
    concurrency: int = 10,
) -> dict[str, str]:
    sem = asyncio.Semaphore(concurrency)
    m: dict[str, str] = {}

    async def one(png: Path) -> None:
        stem = png.stem
        qlist = _queries_for_nationality(stem)
        async with sem:
            tid = await resolve_team_id(tmkt, qlist, want_national=True)
            if tid is None:
                return
            cdata = await _get_club_safe(tmkt, tid)
            official_country = _strip_youth_nt_display((cdata or {}).get("name") or "")
            if not official_country:
                official_country = stem
            try:
                squad = await tmkt.get_club_squad(tid)
            except Exception:
                return
            if not squad.get("success"):
                return
            ids = (squad.get("data") or {}).get("playerIds") or []
            if not ids:
                return
            try:
                pl = await tmkt.get_player(int(ids[0]))
            except Exception:
                return
            if not pl.get("success"):
                return
            nd = (pl.get("data") or {}).get("nationalityDetails") or {}
            nids = (nd.get("nationalities") or {})
            nid = nids.get("nationalityId")
            if nid is None:
                return
            m[str(nid)] = official_country

    await asyncio.gather(*(one(p) for p in sorted(png_paths)))
    return m


def _aggregate_tm_performance(rows: Any) -> tuple[int, int, int]:
    if not isinstance(rows, list):
        return (0, 0, 0)
    apps = goals = ast = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        apps += int(row.get("gamesPlayed") or 0)
        goals += int(row.get("goalsScored") or 0)
        ast += int(row.get("assists") or 0)
    return (apps, goals, ast)


async def _season_stats_for_player(
    tmkt: TMKT,
    pid: int,
    season_id: Optional[int],
    stats_cache: dict[str, tuple[int, int, int]],
) -> tuple[int, int, int]:
    key = str(pid)
    if key in stats_cache:
        return stats_cache[key]
    try:
        if season_id is not None:
            rows = await tmkt.get_player_stats(pid, season=season_id)
        else:
            rows = await tmkt.get_player_stats(pid)
    except Exception:
        stats_cache[key] = (0, 0, 0)
        return stats_cache[key]
    agg = _aggregate_tm_performance(rows)
    stats_cache[key] = agg
    return agg


def _year_from_ceapi_transfer(t: dict[str, Any]) -> str:
    """Join date year from ceapi (prefer ISO dateUnformatted, else DD/MM/YYYY)."""
    iso = (t.get("dateUnformatted") or "").strip()
    if iso and len(iso) >= 4 and iso[0:4].isdigit():
        return iso[0:4]
    date_str = (t.get("date") or "").strip()
    parts = date_str.split("/")
    if len(parts) == 3 and parts[2].strip().isdigit() and len(parts[2].strip()) == 4:
        return parts[2].strip()
    season = (t.get("season") or "").strip()
    if "/" in season:
        left = season.split("/")[0].strip()
        if len(left) == 2 and left.isdigit():
            return "20" + left
        if len(left) == 4 and left.isdigit():
            return left
    return ""


def _joined_club_name_ceapi(t: dict[str, Any]) -> str:
    """ceapi uses nested to/from objects with clubName (not toClubName)."""
    to_block = t.get("to")
    if isinstance(to_block, dict):
        return (to_block.get("clubName") or "").strip()
    return ""


async def _get_transfer_history(pid: int) -> list[dict[str, str]]:
    """Fetch transfer history from Transfermarkt ceapi (Joined club + join year); skip youth teams."""
    url = f"https://www.transfermarkt.com/ceapi/transferHistory/list/{pid}"

    try:
        proc = await asyncio.create_subprocess_exec(
            "curl",
            "-sL",
            "-m",
            "15",
            "-A",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "-H",
            "Accept: application/json",
            "-H",
            "Referer: https://www.transfermarkt.com",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await proc.communicate()
        raw_output = stdout.decode("utf-8").strip()

        if raw_output and raw_output.startswith("{"):
            data = json.loads(raw_output)
        else:
            print(
                f"    [Transfer API BLOCKED] Player {pid} returned non-JSON (Cloudflare or error)",
                file=sys.stderr,
            )
            return []

    except Exception as e:
        print(f"    [Transfer API Error] Player {pid}: {e}", file=sys.stderr)
        return []

    transfers = data.get("transfers", [])
    history: list[dict[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()

    # ceapi lists newest first; reverse for chronological order (first senior club joined → latest)
    for t in reversed(transfers):
        if not isinstance(t, dict):
            continue
        to_club = _joined_club_name_ceapi(t)
        if not to_club:
            continue
        if _is_youth_or_reserve(to_club):
            continue
        year = _year_from_ceapi_transfer(t)
        key = (to_club, year)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        history.append({"club": to_club, "year": year})

    return history


@dataclass
class PlayerOut:
    name: str
    position: str
    age: Any
    nationality: str
    club: str
    appearances: int = 0
    goals: int = 0
    assists: int = 0
    transfer_history: list[dict[str, str]] = None


def _strip_youth_nt_display(name: str) -> str:
    m = YOUTH_NT_SUFFIX.match((name or "").strip())
    return m.group(1).strip() if m else (name or "")


async def _nationality_label(
    tmkt: TMKT,
    pdata: dict[str, Any],
    nationality_map: dict[str, str],
    nt_name_cache: dict[str, str],
) -> str:
    nat_ids = ((pdata.get("nationalityDetails") or {}).get("nationalities") or {})
    nid = nat_ids.get("nationalityId")
    if nid is not None and str(nid) in nationality_map:
        return nationality_map[str(nid)]
    for a in pdata.get("clubAssignments") or []:
        if (a or {}).get("type") == "nationalTeam":
            cid = str((a or {}).get("clubId") or "")
            if not cid or cid == "0":
                continue
            if cid not in nt_name_cache:
                cdata = await _get_club_safe(tmkt, int(cid))
                nt_name_cache[cid] = (cdata or {}).get("name") or ""
            if nt_name_cache[cid]:
                return _strip_youth_nt_display(nt_name_cache[cid])
    if nid is not None:
        return f"TM nationality id {nid}"
    return ""


async def _domestic_club_id_for_display(
    tmkt: TMKT, assignments: list[dict[str, Any]]
) -> Optional[str]:
    for a in assignments:
        if (a or {}).get("type") != "current":
            continue
        cid = int((a or {}).get("clubId") or 0)
        if not cid:
            continue
        ctmp = await _get_club_safe(tmkt, cid)
        if ctmp and not (ctmp.get("baseDetails") or {}).get("isNationalTeam"):
            return str(cid)
    for a in assignments:
        if (a or {}).get("type") == "current":
            cid = (a or {}).get("clubId")
            if cid:
                return str(cid)
    return None


async def fetch_squad_payload(
    tmkt: TMKT,
    club_id: int,
    *,
    official_squad_name: str = "",
    nationality_map: dict[str, str],
    club_name_cache: dict[str, str],
    nt_name_cache: dict[str, str],
    player_cache: dict[str, Any],
    stats_cache: dict[str, tuple[int, int, int]],
    transfer_cache: dict[str, list[dict[str, str]]],
    season_id: Optional[int],
    national_team_squad: bool = False,
) -> dict[str, Any]:
    squad = await tmkt.get_club_squad(club_id)
    if not squad.get("success"):
        raise RuntimeError(squad.get("message", "squad failed"))
    pids = (squad.get("data") or {}).get("playerIds") or []
    out: dict[str, list[PlayerOut]] = {
        "goalkeepers": [],
        "defenders": [],
        "midfielders": [],
        "attackers": [],
    }
    if pids:
        print(
            f"    … {len(pids)} players: fetching profiles + season stats + transfers (parallel)…",
            file=sys.stderr,
            flush=True,
        )
        
        # LOWERED CONCURRENCY FROM 12 to 3 SO CLOUDFLARE DOES NOT BAN YOUR IP
        _io_sem = asyncio.Semaphore(3)

        async def _prefetch_one(pid_int: int) -> None:
            async with _io_sem:
                pid_s = str(pid_int)
                if pid_s not in player_cache:
                    player_cache[pid_s] = await tmkt.get_player(pid_int)
                await _season_stats_for_player(tmkt, pid_int, season_id, stats_cache)
                if pid_s not in transfer_cache:
                    transfer_cache[pid_s] = await _get_transfer_history(pid_int)

        await asyncio.gather(*(_prefetch_one(int(x)) for x in pids))
        print("    … building positions & labels…", file=sys.stderr, flush=True)

    n_p = len(pids)
    for idx, pid in enumerate(pids, start=1):
        if idx > 1 and (idx == 2 or idx % 8 == 0 or idx == n_p):
            print(
                f"    … roster {idx}/{n_p}",
                file=sys.stderr,
                flush=True,
            )
        pid_s = str(pid)
        if pid_s not in player_cache:
            player_cache[pid_s] = await tmkt.get_player(int(pid))
        pr = player_cache[pid_s]
        if not pr.get("success"):
            continue
        pdata = pr["data"]
        attrs = pdata.get("attributes") or {}
        pos = (attrs.get("position") or {}).get("name") or ""
        age = (pdata.get("lifeDates") or {}).get("age")
        nat_label = await _nationality_label(
            tmkt, pdata, nationality_map, nt_name_cache
        )
        assignments = pdata.get("clubAssignments") or []
        if national_team_squad:
            current_cid = await _domestic_club_id_for_display(tmkt, assignments)
        else:
            current_cid = None
            for a in assignments:
                if (a or {}).get("type") == "current":
                    current_cid = str((a or {}).get("clubId"))
                    break
        club_label = ""
        if current_cid:
            if (
                official_squad_name
                and not national_team_squad
                and int(current_cid) == club_id
            ):
                club_label = official_squad_name
            else:
                if current_cid not in club_name_cache:
                    cdata = await _get_club_safe(tmkt, int(current_cid))
                    club_name_cache[current_cid] = (
                        (cdata or {}).get("name") or "" if cdata else ""
                    )
                raw_name = club_name_cache.get(current_cid) or ""
                club_label = _strip_youth_nt_display(raw_name) or raw_name
        a, g, ast = await _season_stats_for_player(
            tmkt, int(pid), season_id, stats_cache
        )
        po = PlayerOut(
            name=pdata.get("name") or "",
            position=pos,
            age=age,
            nationality=nat_label,
            club=club_label,
            appearances=a,
            goals=g,
            assists=ast,
            transfer_history=transfer_cache.get(pid_s, [])
        )
        out[_bucket(attrs)].append(po)
    return out


def _serialize_squad(
    *,
    kind: str,
    label: str,
    rel_image: str,
    tm_id: Optional[int],
    season_meta: dict[str, Any],
    squads: dict[str, list[PlayerOut]],
) -> dict[str, Any]:
    def _pl(p: PlayerOut) -> dict[str, Any]:
        return {
            "name": p.name,
            "position": p.position,
            "age": p.age,
            "nationality": p.nationality,
            "club": p.club,
            "appearances": p.appearances,
            "goals": p.goals,
            "assists": p.assists,
            "transfer_history": p.transfer_history or [],
        }

    return {
        "kind": kind,
        "name": label,
        "imagePath": rel_image.replace("\\", "/"),
        "transfermarktClubId": tm_id,
        "source": {
            "provider": "Transfermarkt",
            "apiBase": "https://tmapi-alpha.transfermarkt.technology",
            "season": season_meta,
            "note": "Squad from tmapi; appearances/goals/assists from ceapi performance, summed across all competitions for the TM seasonId (current season).",
        },
        "goalkeepers": [_pl(p) for p in squads["goalkeepers"]],
        "defenders": [_pl(p) for p in squads["defenders"]],
        "midfielders": [_pl(p) for p in squads["midfielders"]],
        "attackers": [_pl(p) for p in squads["attackers"]],
    }


async def _season_hint(tmkt: TMKT) -> dict[str, Any]:
    try:
        comp = await tmkt.get_competition("GB1")
        if comp.get("success"):
            s = (comp.get("data") or {}).get("currentSeason") or {}
            return {
                "seasonId": s.get("id"),
                "label": s.get("display"),
                "cyclicalName": s.get("cyclicalName"),
            }
    except Exception:
        pass
    return {"seasonId": None, "label": None, "cyclicalName": "2026"}


async def run(args: argparse.Namespace) -> int:
    OUT_TEAMS.mkdir(parents=True, exist_ok=True)
    OUT_NAT.mkdir(parents=True, exist_ok=True)

    team_pngs = sorted(TEAMS_IMAGES.rglob("*.png"))
    
    if args.team:
        team_pngs = [p for p in team_pngs if args.team.lower() in p.stem.lower()]
        
    nat_pngs_all = sorted(NATIONALITY_IMAGES.rglob("*.png"))
    nat_pngs = list(nat_pngs_all)
    if args.only == "teams":
        nat_pngs = []
    elif args.only == "nationalities":
        team_pngs = []

    if args.limit:
        team_pngs = team_pngs[: args.limit]
        nat_pngs = nat_pngs[: args.limit]

    nat_map_path = PROJECT / "Squad Formation" / "_transfermarkt_nationality_id_map.json"
    nationality_map: dict[str, str] = {}
    if nat_map_path.is_file():
        try:
            nationality_map = json.loads(nat_map_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            nationality_map = {}

    player_cache: dict[str, Any] = {}
    stats_cache: dict[str, tuple[int, int, int]] = {}
    club_name_cache: dict[str, str] = {}
    nt_name_cache: dict[str, str] = {}
    transfer_cache: dict[str, list[dict[str, str]]] = {}

    async with TMKT() as tmkt:
        season_meta = await _season_hint(tmkt)
        season_id_hint: Optional[int] = season_meta.get("seasonId")
        if isinstance(season_id_hint, str) and season_id_hint.isdigit():
            season_id_hint = int(season_id_hint)
        elif not isinstance(season_id_hint, int):
            season_id_hint = None
        if args.refresh_nat_map:
            nationality_map = await build_nationality_id_map(
                tmkt, nat_pngs_all, concurrency=max(8, args.concurrency)
            )
            if not args.dry_run:
                nat_map_path.write_text(
                    json.dumps(nationality_map, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
        elif not nationality_map and team_pngs and not args.fast:
            print(
                "Building nationality id map from Nationality images (one-time; ~251 requests)...",
                file=sys.stderr,
            )
            nationality_map = await build_nationality_id_map(
                tmkt, nat_pngs_all, concurrency=max(8, args.concurrency)
            )
            if not args.dry_run:
                nat_map_path.write_text(
                    json.dumps(nationality_map, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
        elif nat_pngs and not team_pngs:
            partial = await build_nationality_id_map(
                tmkt, nat_pngs, concurrency=max(8, args.concurrency)
            )
            nationality_map.update(partial)
            if not args.dry_run:
                nat_map_path.write_text(
                    json.dumps(nationality_map, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )

        sem = asyncio.Semaphore(args.concurrency)

        async def one_nationality(png: Path) -> None:
            try:
                rel = png.relative_to(NATIONALITY_IMAGES)
                stem = png.stem
                qlist = _queries_for_nationality(stem)
                async with sem:
                    tid = await resolve_team_id(tmkt, qlist, want_national=True)
                    if tid is None:
                        payload = _serialize_squad(
                            kind="nationality",
                            label=_display_name_from_filename_stem(stem),
                            rel_image=str(Path("Nationality images") / rel),
                            tm_id=None,
                            season_meta=season_meta,
                            squads={
                                "goalkeepers": [],
                                "defenders": [],
                                "midfielders": [],
                                "attackers": [],
                            },
                        )
                        payload["source"]["error"] = (
                            "National team not found on Transfermarkt search"
                        )
                    else:
                        cdata_nt = await _get_club_safe(tmkt, tid)
                        official_nt = (cdata_nt or {}).get("name") or ""
                        official_nt = (
                            _strip_youth_nt_display(official_nt)
                            or _display_name_from_filename_stem(stem)
                        )
                        squads = await fetch_squad_payload(
                            tmkt,
                            tid,
                            official_squad_name="",
                            nationality_map=nationality_map,
                            club_name_cache=club_name_cache,
                            nt_name_cache=nt_name_cache,
                            player_cache=player_cache,
                            stats_cache=stats_cache,
                            transfer_cache=transfer_cache,
                            season_id=season_id_hint,
                            national_team_squad=True,
                        )
                        payload = _serialize_squad(
                            kind="nationality",
                            label=official_nt,
                            rel_image=str(Path("Nationality images") / rel),
                            tm_id=tid,
                            season_meta=season_meta,
                            squads=squads,
                        )
                out_path = OUT_NAT / rel.with_suffix(".json")
                out_path.parent.mkdir(parents=True, exist_ok=True)
                if not args.dry_run:
                    out_path.write_text(
                        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                    )
            except Exception as exc:  # noqa: BLE001 — log per-file failures
                print(f"[nationality] {png}: {exc}", file=sys.stderr)

        async def one_club(png: Path) -> None:
            try:
                rel = png.relative_to(TEAMS_IMAGES)
                stem = png.stem
                primary = _stem_team_query(stem + ".png")
                parts = list(rel.parts)
                extra: list[str] = []
                if len(parts) >= 2:
                    leaf = Path(parts[-1]).stem
                    leaf = re.sub(r"\.football-logos\.cc$", "", leaf, flags=re.IGNORECASE)
                    league = parts[-2] if len(parts) >= 2 else ""
                    extra.append(f"{leaf} {league}".strip())
                    extra.append(f"{primary} {parts[0]}".strip())
                queries = [primary] + [e for e in extra if e and e not in (primary,)]
                async with sem:
                    tid = await resolve_team_id(tmkt, queries, want_national=False)
                    if tid is None:
                        payload = _serialize_squad(
                            kind="club",
                            label=_display_name_from_filename_stem(stem),
                            rel_image=str(Path("Teams Images") / rel),
                            tm_id=None,
                            season_meta=season_meta,
                            squads={
                                "goalkeepers": [],
                                "defenders": [],
                                "midfielders": [],
                                "attackers": [],
                            },
                        )
                        payload["source"]["error"] = (
                            "Club not resolved via Transfermarkt search"
                        )
                    else:
                        cdata = await _get_club_safe(tmkt, tid)
                        official_club = (cdata or {}).get("name") or ""
                        official_club = official_club or _display_name_from_filename_stem(
                            stem
                        )
                        squads = await fetch_squad_payload(
                            tmkt,
                            tid,
                            official_squad_name=official_club,
                            nationality_map=nationality_map,
                            club_name_cache=club_name_cache,
                            nt_name_cache=nt_name_cache,
                            player_cache=player_cache,
                            stats_cache=stats_cache,
                            transfer_cache=transfer_cache,
                            season_id=season_id_hint,
                            national_team_squad=False,
                        )
                        payload = _serialize_squad(
                            kind="club",
                            label=official_club,
                            rel_image=str(Path("Teams Images") / rel),
                            tm_id=tid,
                            season_meta=season_meta,
                            squads=squads,
                        )
                out_path = (
                    OUT_TEAMS
                    / rel.parent
                    / f"{_safe_json_filename_stem(payload['name'])}.json"
                )
                legacy_slug_path = OUT_TEAMS / rel.with_suffix(".json")
                out_path.parent.mkdir(parents=True, exist_ok=True)
                if not args.dry_run:
                    out_path.write_text(
                        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8",
                    )
                    if (
                        legacy_slug_path.is_file()
                        and legacy_slug_path.resolve() != out_path.resolve()
                    ):
                        legacy_slug_path.unlink()
            except Exception as exc:  # noqa: BLE001
                print(f"[club] {png}: {exc}", file=sys.stderr)

        tasks = [asyncio.create_task(one_nationality(p)) for p in nat_pngs]
        tasks += [asyncio.create_task(one_club(p)) for p in team_pngs]
        for c in asyncio.as_completed(tasks):
            await c

    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Generate squad JSON from Transfermarkt (tmapi).")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write any files (no JSON, no nationality-id map).",
    )
    p.add_argument("--limit", type=int, default=0, help="Max files per category (for testing)")
    p.add_argument("--team", type=str, default="", help="Filter by a specific team name")
    p.add_argument(
        "--only",
        choices=("all", "teams", "nationalities"),
        default="all",
    )
    p.add_argument("--concurrency", type=int, default=4, help="Parallel async tasks")
    p.add_argument(
        "--refresh-nat-map",
        dest="refresh_nat_map",
        action="store_true",
        help="Rebuild _transfermarkt_nationality_id_map.json from all nationality flags.",
    )
    p.add_argument(
        "--fast",
        action="store_true",
        help="Skip automatic nationality-id map build (may leave numeric TM ids if no map file).",
    )
    args = p.parse_args()
    if args.dry_run:
        print("Dry run: no files written.", file=sys.stderr)
    rc = asyncio.run(run(args))
    raise SystemExit(rc)


if __name__ == "__main__":
    main()