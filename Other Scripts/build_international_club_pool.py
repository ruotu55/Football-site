"""
Scan Squad Formation/Teams club JSONs and build a pool of every player with a
nationality string, grouped by that nationality (must match national squad `name`
in the app). Used by Lineups “Search all players” when editing a national XI.

Deduplicates by (name, nationality); keeps the richer duplicate (more NT caps, then
more season apps, then more club career apps).

Output: data/international-club-pool-by-nationality.json

Re-run after squad data updates.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEAMS_DIR = REPO_ROOT / "Squad Formation" / "Teams"
OUT_PATH = REPO_ROOT / "data" / "international-club-pool-by-nationality.json"

ROLE_KEYS = ("goalkeepers", "defenders", "midfielders", "attackers")


def _int_caps(p: dict) -> int:
    nt = p.get("national_team_career_totals") or {}
    try:
        v = nt.get("appearances")
        if v is None:
            return 0
        return int(v)
    except (TypeError, ValueError):
        return 0


def _slim_player(p: dict) -> dict:
    nt = p.get("national_team_career_totals") or {}
    return {
        "name": p.get("name"),
        "position": p.get("position"),
        "nationality": p.get("nationality"),
        "club": p.get("club"),
        "appearances": p.get("appearances"),
        "goals": p.get("goals"),
        "assists": p.get("assists"),
        "national_team_career_totals": {k: v for k, v in nt.items() if v is not None},
    }


def _better_candidate(a: dict, b: dict) -> bool:
    """True if a should replace b."""
    ca, cb = _int_caps(a), _int_caps(b)
    if ca != cb:
        return ca > cb
    sa = int(a.get("appearances") or 0)
    sb = int(b.get("appearances") or 0)
    if sa != sb:
        return sa > sb
    ca_tot = (a.get("club_career_totals") or {}).get("appearances") or 0
    cb_tot = (b.get("club_career_totals") or {}).get("appearances") or 0
    try:
        return int(ca_tot) > int(cb_tot)
    except (TypeError, ValueError):
        return False


def main() -> int:
    if not TEAMS_DIR.is_dir():
        print(f"Missing teams dir: {TEAMS_DIR}", file=sys.stderr)
        return 1

    # nationality -> (name_lower, nat) -> raw player dict (best so far)
    best: dict[str, dict[tuple[str, str], dict]] = defaultdict(dict)

    files = sorted(TEAMS_DIR.rglob("*.json"))
    errors = 0
    for path in files:
        try:
            raw = path.read_text(encoding="utf-8-sig")
            data = json.loads(raw)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
            errors += 1
            print(f"Skip {path.relative_to(REPO_ROOT)}: {e}", file=sys.stderr)
            continue

        kind = data.get("kind")
        if kind == "nationality":
            continue
        if kind not in (None, "club"):
            continue

        for role in ROLE_KEYS:
            for p in data.get(role) or []:
                if not isinstance(p, dict):
                    continue
                name = p.get("name")
                nat = p.get("nationality")
                if not name or not isinstance(name, str):
                    continue
                if not nat or not isinstance(nat, str):
                    continue
                nat_k = nat.strip()
                name_k = name.strip()
                if not nat_k or not name_k:
                    continue

                key = (name_k.lower(), nat_k)
                prev = best[nat_k].get(key)
                if prev is None or _better_candidate(p, prev):
                    best[nat_k][key] = p

    by_nationality: dict[str, list] = {}
    for nat_k, players_map in best.items():
        rows = [_slim_player(p) for p in players_map.values()]
        rows.sort(key=lambda r: (r.get("name") or "").lower())
        by_nationality[nat_k] = rows

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 2,
        "source": "Squad Formation/Teams club JSONs; all players with nationality set",
        "byNationality": by_nationality,
    }
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    n_nat = len(by_nationality)
    n_players = sum(len(v) for v in by_nationality.values())
    print(f"Wrote {OUT_PATH.relative_to(REPO_ROOT)} — {n_nat} nationalities, {n_players} players (errors: {errors})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
