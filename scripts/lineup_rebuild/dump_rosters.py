"""Dump per-club roster text files that the research agents read.

Writes one <work>/teams/<Club>.txt per club (name | position | appearances |
shirt | age) plus <work>/groups.json (clubs grouped by Country/League, used to
plan the agent batches).

Usage (PowerShell):
    $env:PYTHONIOENCODING="utf-8"; python scripts/lineup_rebuild/dump_rosters.py
Optional: set FILTER to a substring of the layout key to dump only some clubs,
e.g. FILTER="England/Premier League/".  NOTE: never put a leading "/" in FILTER
on Git-Bash/MSYS — it mangles it into a Windows path. Pass it via the env var.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixlib as L

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")
TEAMS = os.path.join(WORK, "teams")
os.makedirs(TEAMS, exist_ok=True)

d = L.load_layouts()
ck = L.club_keys(d)
filt = os.environ.get("FILTER", "")

written, missing, groups = 0, [], {}
for name, key in ck.items():
    if filt and filt not in key:
        continue
    p = L.roster_path_from_key(key)
    if not os.path.exists(p):
        missing.append(name)
        continue
    roster = json.load(open(p, encoding="utf-8"))
    team_name = roster.get("name", name)
    lines = [f"TEAM: {name}",
             f"Current saved formation: {d[key].get('formationId')}",
             "ROSTER (name | position | appearances | shirt | age):"]
    excluded = []
    for pl in L.roster_players(roster):
        # EXCLUDE players who actually belong to another club (B-team / reserve /
        # loan entries that pollute the squad file). Agents must never pick them.
        pc = pl.get("club")
        if pc and L.norm(pc) != L.norm(team_name):
            excluded.append(f"{pl.get('name')} ({pc})")
            continue
        lines.append(f"  {pl.get('name')} | {pl.get('position')} | apps={pl.get('appearances')} | #{pl.get('shirt_number')} | age={pl.get('age')}")
    if excluded:
        sys.stderr.write(f"  [{name}] excluded {len(excluded)} non-{team_name} player(s): {excluded}\n")
    open(os.path.join(TEAMS, name.replace("/", "_") + ".txt"), "w", encoding="utf-8").write("\n".join(lines))
    written += 1
    grp = key.split("/Teams/")[1].rsplit("/", 1)[0]
    groups.setdefault(grp, []).append(name)

json.dump(groups, open(os.path.join(WORK, "groups.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
sys.stderr.write(f"wrote {written} roster files to {TEAMS}\n")
sys.stderr.write(f"MISSING roster JSON (skip these): {missing}\n")
print("=== LEAGUE GROUPS (for batching) ===")
for g in sorted(groups):
    print(f"{g} ({len(groups[g])}): {', '.join(sorted(groups[g]))}")
