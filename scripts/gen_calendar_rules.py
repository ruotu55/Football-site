# -*- coding: utf-8 -*-
"""Generate CALENDAR_RULES.md into each Main Runner (Regular + Shorts) folder.

Rules sourced from the user's instructions on 2026-05-29 / 2026-05-30 about how
to fill calendar items (video blocks). One file per runner variant, tailored to
team-based vs player-based quizzes and to Regular vs Shorts.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# entity kind: "club", "national", "player"
RUNNERS = [
    ("1_Guess The Football Team Name - Main Runner - Regular",  "club",     "regular", "Guess the football club by its name"),
    ("1_Guess The Football Team Name - Main Runner - Shorts",   "club",     "shorts",  "Guess the football club by its name"),
    ("2_Guess The Football National Team - Main Runner - Regular","national","regular", "Guess the national team"),
    ("2_Guess The Football National Team - Main Runner - Shorts", "national","shorts",  "Guess the national team"),
    ("3_Guess The Player By Carrer Path - Main Runner - Regular","player",   "regular", "Guess the player by his career path (clubs he played for)"),
    ("3_Guess The Player By Carrer Path - Main Runner - Shorts", "player",   "shorts",  "Guess the player by his career path (clubs he played for)"),
    ("4_Guess The Player By Carrer Stats - Regular",            "player",   "regular", "Guess the player by his career stats"),
    ("4_Guess The Player By Carrer Stats - Shorts",             "player",   "shorts",  "Guess the player by his career stats"),
    ("5_Guess The Player By Club_Position_Country_Age - Regular","player",  "regular", "Guess the player by club / position / country / age"),
    ("5_Guess The Player By Club_Position_Country_Age - Shorts", "player",  "shorts",  "Guess the player by club / position / country / age"),
    ("6_Guess The Fake Informaiton - Regular",                  "player",   "regular", "Guess the fake piece of information about the player"),
    ("6_Guess The Fake Informaiton - Shorts",                   "player",   "shorts",  "Guess the fake piece of information about the player"),
    ("7_Guess The Football Team Logo Name - Main Runner - Regular","club",  "regular", "Guess the club by its logo"),
    ("7_Guess The Football Team Logo Name - Main Runner - Shorts", "club",  "shorts",  "Guess the club by its logo"),
    ("8_Guess The Football Player Name - Main Runner - Regular","player",   "regular", "Guess the football player by name"),
    ("8_Guess The Football Player Name - Main Runner - Shorts", "player",   "shorts",  "Guess the football player by name"),
]

def entity_word(kind):
    return {"club": "club", "national": "national team", "player": "player"}[kind]

def adjacency_rule(kind):
    if kind == "player":
        return (
            "- **Never two players from the same CLUB back-to-back.** This is a hard rule "
            "the user repeated: *\"don't put 2 players from the same team one after another\"* "
            "and *\"i told you this is a rule that cannot happen!!!\"*\n"
            "- **Never two players from the same COUNTRY back-to-back** either "
            "(*\"also not from the same country\"*).\n"
            "- The adjacency rule may relax slightly in the hardest tail levels if the pool is "
            "exhausted, but aim for **0 same-club and 0 same-country adjacency** everywhere."
        )
    if kind == "club":
        return (
            "- **Never two clubs from the same COUNTRY back-to-back** in a mixed video "
            "(*\"players from the same team or country can't be one after another\"*).\n"
            "- In **competition** blocks (a single league, e.g. La Liga) every club is from the "
            "same country, so this adjacency rule does not apply there — it only governs the "
            "**mixed** videos.\n"
            "- The rule may relax in the hardest tail levels if the pool is exhausted, but aim for "
            "**0 same-country adjacency** in mixed videos."
        )
    # national
    return (
        "- Each item is a whole **national team (= one country)**, so \"same country back-to-back\" "
        "can't happen by definition.\n"
        "- Instead, **spread the confederations / regions** — don't stack a long run of "
        "all-European or all-African teams together. Alternate so the video feels varied.\n"
        "- In **competition** blocks (World Cup, Euro) you simply use that tournament's teams, so "
        "this spacing is whatever the tournament gives you."
    )

def fame_rule(kind):
    if kind == "player":
        return (
            "- **95% of the players must be globally known** — known in European AND worldwide "
            "football (*\"Make sure 95% all the players in player quizzes are known in european "
            "football and world wide football\"*).\n"
            "- **No obscure South Americans.** *\"don't include players from brazil or argentina "
            "where they are unknown by 90% of the people.\"*\n"
            "- **World-famous players are welcome even if they never played in Europe** — e.g. "
            "Messi or Ronaldo. *\"find more players like this to make it more\"* recognisable."
        )
    return (
        "- Use **well-known teams only** in mixed videos. The mixed videos are built from the "
        "user's canonical well-known-teams list (`.Storage/storage/well-known-teams.json`).\n"
        "- Don't drop in obscure clubs/teams that 90% of viewers wouldn't recognise."
    )

def size_rule(kind, variant):
    if variant == "shorts":
        return (
            "- **Shorts are short by design.** Aim for **~5 levels** (existing shorts range about "
            "7–13). They are NOT competition videos — every short is a **mixed** clip.\n"
            "- Build each short from the **easiest tiers** of its matching Regular video: take the "
            "Tier-1 openers first and keep the easy→med→hard order.\n"
            "- All the adjacency + fame rules below still apply, just over fewer levels."
        )
    ekind = "players" if kind == "player" else "teams"
    return (
        f"- **Every mixed video must have at least 35 levels** (*\"each mixed video — that is "
        f"not a competition and just random {ekind} — needs to be at least 35 levels\"*). "
        f"Target ~35–50.\n"
        "- **Competition** videos (leagues / World Cup / Euro) use that competition's full set of "
        f"{ekind} — size is whatever the competition has (e.g. Euro = 24, World Cup = 48).\n"
        "- **Don't create NEW competition videos** unless explicitly asked. Edit/extend the "
        "existing competition blocks and the mixed blocks only."
    )

TEMPLATE = """# How to Build a Calendar Item for this Runner

**Runner:** {title}
**Variant:** {variant_caps}
**Quiz:** {quiz}

A "calendar item" = one video's worth of content (a block of {plural}) that you
build in the Calendar / recording-queue and import into this runner. This file
records the rules the channel owner set for filling these blocks. Follow them
every time you add or edit a block here.

> These rules come from the owner's instructions (2026-05-29 / 2026-05-30). The
> canonical short version he gave: *"mixed videos get rules: (1) arrange
> most-known→least-known (easy/med/hard), (2) no same country/team adjacent
> (relaxes in harder levels), (3) 95% globally-known players, no obscure South
> Americans, world-famous (Messi/Ronaldo) welcome even outside Europe,
> (4) mixed videos ≥35 levels."*

---

## Two kinds of blocks

1. **Competition blocks** — a real competition (a league, World Cup, Euro,
   Champions League, etc.). Use that competition's actual {plural}.
2. **Mixed blocks** — random well-known {plural}, no competition theme. Most of
   the rules below are about these.

**Do not invent new competition videos** — keep the existing competitions as
they are; only add/edit **mixed** videos unless the owner asks otherwise.

---

## The rules

### 1. Difficulty order: easy → medium → hard
- Arrange the {plural} **most-known first, least-known last**
  (*"arrange the teams by the most known to less known — easy - med - hard"*).
- Within the video the difficulty climbs smoothly from Tier 1 (most famous) down
  through the harder tiers. Spread your tiers evenly so the gradient is smooth.

### 2. No same {adj_label} back-to-back
{adjacency}

### 3. Fame / who is allowed in mixed videos
{fame}

### 4. Size
{size}

### 5. Don't repeat across blocks of the same quiz type
- Different videos in THIS runner should **not share a lot of the same {plural}**
  (*"block 9 and 10 should not have the same teams"*).
- A given {single} should appear in **at most 2 videos** across this runner —
  never 3+. Use the full available pool before reusing anyone.

---

## Quick checklist before you save a block
- [ ] Easy → med → hard order (most-known first).
- [ ] No two adjacent items break the same-{adj_label} rule.
{fame_check}
- [ ] {size_check}
- [ ] No {single} appears 3+ times across this runner; minimal overlap with other blocks.
- [ ] Mixed block has no competition name; competition block uses the real roster.
"""

def adj_label(kind):
    if kind == "player":
        return "club/country"
    if kind == "club":
        return "country"
    return "region"

def fame_check(kind):
    if kind == "player":
        return "- [ ] ≥95% of players are globally known; no obscure players."
    if kind == "club":
        return "- [ ] Only well-known teams (from the well-known-teams list)."
    return "- [ ] Only well-known national teams; confederations spread out."

def size_check(kind, variant):
    if variant == "shorts":
        return "Short is ~5 levels, taken from the easiest tiers of the matching Regular video."
    return "Mixed block has ≥35 levels (competition block = full competition set)."

for folder, kind, variant, quiz in RUNNERS:
    plural = {"club": "clubs", "national": "national teams", "player": "players"}[kind]
    single = entity_word(kind)
    content = TEMPLATE.format(
        title=folder.replace(" - Regular", "").replace(" - Shorts", ""),
        variant_caps=variant.capitalize(),
        quiz=quiz,
        plural=plural,
        single=single,
        adj_label=adj_label(kind),
        adjacency=adjacency_rule(kind),
        fame=fame_rule(kind),
        size=size_rule(kind, variant),
        fame_check=fame_check(kind),
        size_check=size_check(kind, variant),
    )
    out = os.path.join(ROOT, folder, "CALENDAR_RULES.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write(content)
    print("wrote", out)

print("DONE", len(RUNNERS), "files")
