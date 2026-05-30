# -*- coding: utf-8 -*-
"""Raise .swap-modal z-index above the control panel in every runner.

Root cause of "the option window opens but clicks hit the option behind it / it
isn't in front": .swap-modal was z-index:1000 while .control-panel is
z-index:100000 (and .right-panel 99990). Both are position:fixed siblings in the
same (root) stacking context, so the panel rendered on top of every dialog.
Fix: bump .swap-modal above the panel.
"""
import os, re, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NEW_BLOCK = (
    "  /* Must sit ABOVE .control-panel (z-index:100000) and .right-panel\n"
    "     (z-index:99990) so an open dialog covers the quiz-control panel.\n"
    "     Otherwise the panel renders on top of the modal and clicks fall\n"
    "     through to the control option behind the window. */\n"
    "  z-index: 100100;"
)

# match the FIRST z-index declaration in the file (it belongs to .swap-modal,
# which is the first rule). Accept any whitespace / current value.
pat = re.compile(r"^[ \t]*z-index:\s*\d+;", re.MULTILINE)

changed, skipped = [], []
for f in sorted(glob.glob(os.path.join(ROOT, "[1-8]_*", "css", "components", "swap-modal.css"))):
    with open(f, "r", encoding="utf-8") as fh:
        src = fh.read()
    m = pat.search(src)
    if not m:
        skipped.append((f, "no z-index found"))
        continue
    if "z-index: 100100;" in src:
        skipped.append((f, "already fixed"))
        continue
    new = src[:m.start()] + NEW_BLOCK + src[m.end():]
    with open(f, "w", encoding="utf-8") as fh:
        fh.write(new)
    changed.append(f)

for f in changed:
    print("FIXED ", os.path.relpath(f, ROOT))
for f, why in skipped:
    print("SKIP  ", os.path.relpath(f, ROOT), "->", why)
print(f"\n{len(changed)} fixed, {len(skipped)} skipped")
