#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Insert/refresh the runner #9 "World Cup" recording-status block (episode 1)
so it shows in the Saved queue + calendar. Embeds the full MCQ script (no teams
list). Backs up recording-status.json first.
"""
import json
import os
import shutil
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS = os.path.join(ROOT, ".Storage", "storage", "recording-status.json")
SAVE = os.path.join(ROOT, ".Storage", "storage", "saved-scripts", "football_quiz_mcq_regular.json")
KEY = "9|long|1"

script = json.load(open(SAVE, encoding="utf-8"))["scripts"][0]

backup = STATUS + ".bak-r9mcq-" + time.strftime("%Y%m%d-%H%M%S")
shutil.copy2(STATUS, backup)
print("backup:", backup)

data = json.load(open(STATUS, encoding="utf-8"))
blocks = data.setdefault("blocks", {})
prev = blocks.get(KEY) or {}
blocks[KEY] = {
    "name": "World Cup",
    "teamsImportText": "",          # MCQ has no teams list; script is the source
    "script": script,
    "recorded": prev.get("recorded") if isinstance(prev.get("recorded"), dict) else {"english": None, "spanish": None},
    "video": prev.get("video"),
    "youtube": prev.get("youtube"),
    "updatedAt": int(time.time() * 1000),
}

with open(STATUS, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=0)

print("Wrote block %s (name=World Cup, %d levels). Total blocks: %d"
      % (KEY, len(script["levels"]), len(blocks)))
