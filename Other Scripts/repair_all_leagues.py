#!/usr/bin/env python3
"""
Single entry point: full squad repair for tier-1 worldwide + European top-two tiers (big 5 included).

Equivalent to: python3 league_repair_squads.py --all-leagues
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))
sys.argv = [str(_SCRIPT_DIR / "league_repair_squads.py"), "--all-leagues"] + sys.argv[1:]
runpy.run_path(str(_SCRIPT_DIR / "league_repair_squads.py"), run_name="__main__")
