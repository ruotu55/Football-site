"""Apply researched lineup assignments to the shared layouts blob.

Input (env ASSIGN): path to a JSON array of
    [{"team": "<club display name>", "formationId": "4231", "xi": [<11 names>]}]
The 11 names must each appear VERBATIM (diacritics ignored) in that club's
squad JSON; the full player object is copied into customXi so it rehydrates.

Env vars:
    ASSIGN  required - path to the assignments JSON
    DRY=1   validate only, do not write (default writes)
    STAMP   backup suffix; a one-time backup .bak-<STAMP> is made before writing

Only the 3 fields that matter are changed per club: formationId, lastFormationId,
customXi. Slot arrays are normalised to length 11. National-team entries are
never touched (club_keys filters to /Teams/ only).

Usage (PowerShell):
    $env:PYTHONIOENCODING="utf-8"; $env:ASSIGN="...assign.json"; $env:DRY="1"; python scripts/lineup_rebuild/apply.py
    # then, to write:
    $env:DRY="0"; $env:STAMP="20260601-bulk"; python scripts/lineup_rebuild/apply.py
"""
import sys, json, os, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixlib as L

assignments = json.load(open(os.environ["ASSIGN"], encoding="utf-8"))
dry = os.environ.get("DRY", "0") == "1"

d = L.load_layouts()
ck = L.club_keys(d)
ckn = {L.norm(n): k for n, k in ck.items()}

def find_key(team):
    if team in ck: return ck[team]
    n = L.norm(team)
    if n in ckn: return ckn[n]
    cands = [k for nn, k in ckn.items() if n in nn or nn in n]
    return cands[0] if len(cands) == 1 else None

report, to_write = [], []
for a in assignments:
    team = a["team"]; fid = str(a["formationId"]); xi = a["xi"]
    if team.strip().upper().startswith("TEAM:"):
        team = team.split(":", 1)[1].strip()
    errs = []
    key = find_key(team)
    if not key:
        report.append((team, "NO_KEY", [])); continue
    if fid not in L.VALID_FORMATIONS:
        errs.append("bad formation %r" % fid)
    if len(xi) != 11:
        errs.append("xi has %d names" % len(xi))
    roster = L.load_roster(key)
    team_name = roster.get("name", team)
    players = L.roster_players(roster)
    by_name = {p.get("name"): p for p in players}
    by_norm = {}
    for p in players:
        by_norm.setdefault(L.norm(p.get("name")), p)
    resolved = []
    for nm in xi:
        p = by_name.get(nm) or by_norm.get(L.norm(nm))
        if not p:
            errs.append("PLAYER NOT IN ROSTER: %r" % nm)
        else:
            # HARD GUARD: never allow a player who actually belongs to another
            # club (B-team / reserve / loan entries sitting in the squad file,
            # e.g. a 'Sevilla Atlético' player inside Sevilla FC).
            pc = p.get("club")
            if pc and L.norm(pc) != L.norm(team_name):
                errs.append("CROSS-CLUB PLAYER: %r belongs to %r, not %r" % (nm, pc, team_name))
            else:
                resolved.append(p)
    if errs:
        report.append((team, "ERRORS", errs)); continue
    names = [p.get("name") for p in resolved]
    if len(set(names)) != 11:
        report.append((team, "DUP_PLAYERS", names)); continue
    to_write.append((key, fid, resolved))
    report.append((team, "OK -> " + fid, names))

print("=== VALIDATION REPORT ===")
ok = 0
for team, status, info in report:
    print(f"[{status}] {team}")
    if not status.startswith("OK"):
        for x in info: print("     ", x)
    else:
        ok += 1
print(f"--- {ok}/{len(assignments)} teams valid; {len(assignments)-ok} with issues ---")

if dry:
    print("DRY RUN - no write."); sys.exit(0)
if ok != len(assignments):
    print("NOT ALL VALID - writing only the valid teams.")

if to_write:
    stamp = os.environ.get("STAMP", "manual")
    bak = L.LAYOUTS + ".bak-" + stamp
    if not os.path.exists(bak):
        shutil.copy2(L.LAYOUTS, bak)
        print("backup ->", bak)
    for key, fid, resolved in to_write:
        v = d[key]
        v["formationId"] = fid
        v["lastFormationId"] = fid
        v["customXi"] = resolved
        v["slotFlagScales"] = [1] * 11
        v["slotTeamLogoScales"] = [0.8] * 11
        v["slotPhotoIndexEntries"] = [[i, 0] for i in range(11)]
    json.dump(d, open(L.LAYOUTS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"WROTE {len(to_write)} teams to layouts.")
