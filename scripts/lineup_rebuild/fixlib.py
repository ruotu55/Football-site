"""Shared helpers for rebuilding runner-1 club saved-team lineups.

Repo-relative: REPO is derived from this file's location
(<REPO>/scripts/lineup_rebuild/fixlib.py), so the scripts work no matter
where they are invoked from.
"""
import json, os, unicodedata, re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))  # .../scripts/lineup_rebuild -> repo root
LAYOUTS = os.path.join(REPO, ".Storage", "storage", "runner-blobs",
                       "lineups_runner_team_layouts_shared.json")

VALID_FORMATIONS = {"3421","343","352","4141","433","4231","442","451","41212","4321","532","523"}

# Slot orderings per formation, index 0..10. Index i of customXi renders at
# formation.slots[i] (see js/formations.js + pitch-render.js). customXi is
# POSITIONAL: any player can go in any slot; the position label below is only
# the canonical role used in the research brief, not enforced.
SLOTS = {
 "3421":["gk","Centre-Back","Centre-Back","Centre-Back","Left-Back","Right-Back","Central Midfield","Central Midfield","Attacking Midfield","Attacking Midfield","Centre-Forward"],
 "343":["gk","Centre-Back","Centre-Back","Centre-Back","Left-Back","Right-Back","Central Midfield","Central Midfield","Left Winger","Centre-Forward","Right Winger"],
 "352":["gk","Centre-Back","Centre-Back","Centre-Back","Left-Back","Right-Back","Defensive Midfield","Defensive Midfield","Attacking Midfield","Centre-Forward","Centre-Forward"],
 "4141":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Defensive Midfield","Right Winger","Central Midfield","Central Midfield","Left Winger","Centre-Forward"],
 "433":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Central Midfield","Central Midfield","Central Midfield","Right Winger","Centre-Forward","Left Winger"],
 "4231":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Defensive Midfield","Defensive Midfield","Left Midfield","Attacking Midfield","Right Midfield","Centre-Forward"],
 "442":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Right Midfield","Central Midfield","Central Midfield","Left Midfield","Centre-Forward","Centre-Forward"],
 "451":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Attacking Midfield","Central Midfield","Central Midfield","Central Midfield","Attacking Midfield","Centre-Forward"],
 "41212":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Defensive Midfield","Central Midfield","Central Midfield","Attacking Midfield","Centre-Forward","Centre-Forward"],
 "4321":["gk","Right-Back","Centre-Back","Centre-Back","Left-Back","Central Midfield","Central Midfield","Central Midfield","Attacking Midfield","Attacking Midfield","Centre-Forward"],
 "532":["gk","Right-Back","Centre-Back","Centre-Back","Centre-Back","Left-Back","Central Midfield","Central Midfield","Central Midfield","Centre-Forward","Centre-Forward"],
 "523":["gk","Right-Back","Centre-Back","Centre-Back","Centre-Back","Left-Back","Central Midfield","Central Midfield","Right Winger","Centre-Forward","Left Winger"],
}

def norm(s):
    """Diacritic-fold + lowercase + strip punctuation for tolerant name matching."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s

def load_layouts():
    return json.load(open(LAYOUTS, encoding="utf-8"))

def club_keys(d):
    """Map display name -> layout key, clubs only (skips /Nationalities/ = runner 2)."""
    return {os.path.basename(k)[:-5]: k for k in d if "/Teams/" in k}

def roster_path_from_key(key):
    rel = key.replace("../", "")  # ../.Storage/... -> .Storage/...
    return os.path.join(REPO, rel)

def load_roster(key):
    return json.load(open(roster_path_from_key(key), encoding="utf-8"))

def roster_players(roster):
    out = []
    for grp in ["goalkeepers", "defenders", "midfielders", "attackers"]:
        for pl in roster.get(grp, []):
            out.append(pl)
    return out
