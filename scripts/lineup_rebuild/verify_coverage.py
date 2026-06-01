"""Final check: which clubs were covered by the assignment files, and is the
blob structurally sound (every club has 11 players, valid formation,
formationId == lastFormationId).

Pass the assignment JSON paths as arguments, e.g.:
    python scripts/lineup_rebuild/verify_coverage.py work/assign_*.json
"""
import sys, os, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixlib as L

paths = []
for arg in sys.argv[1:]:
    paths.extend(glob.glob(arg))

d = L.load_layouts()
ck = L.club_keys(d)
assigned = set()
for fn in paths:
    for a in json.load(open(fn, encoding="utf-8")):
        t = a["team"]
        if t.upper().startswith("TEAM:"): t = t.split(":", 1)[1].strip()
        assigned.add(L.norm(t))

missing = [n for n in ck if L.norm(n) not in assigned]
print("=== COVERAGE ===")
print("club entries:", len(ck), "| distinct assignments:", len(assigned))
print("uncovered clubs:", missing or "NONE")

print("\n=== INTEGRITY ===")
print("total keys:", len(d),
      "| clubs:", sum("/Teams/" in k for k in d),
      "| nations (untouched):", sum("/Nationalities/" in k for k in d))
bad = []
for n, k in ck.items():
    v = d[k]
    if len(v.get("customXi", [])) != 11: bad.append((n, "xi!=11"))
    if v.get("formationId") != v.get("lastFormationId"): bad.append((n, "fid mismatch"))
    if v.get("formationId") not in L.VALID_FORMATIONS: bad.append((n, "bad fid"))
print("structural problems:", bad or "NONE")
