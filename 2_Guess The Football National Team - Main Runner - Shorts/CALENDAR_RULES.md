# How to Build a Calendar Item for this Runner

**Runner:** 2_Guess The Football National Team - Main Runner
**Variant:** Shorts
**Quiz:** Guess the national team

A "calendar item" = one video's worth of content (a block of national teams) that you
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
   Champions League, etc.). Use that competition's actual national teams.
2. **Mixed blocks** — random well-known national teams, no competition theme. Most of
   the rules below are about these.

**Do not invent new competition videos** — keep the existing competitions as
they are; only add/edit **mixed** videos unless the owner asks otherwise.

---

## The rules

### 1. Difficulty order: easy → medium → hard
- Arrange the national teams **most-known first, least-known last**
  (*"arrange the teams by the most known to less known — easy - med - hard"*).
- Within the video the difficulty climbs smoothly from Tier 1 (most famous) down
  through the harder tiers. Spread your tiers evenly so the gradient is smooth.

### 2. No same region back-to-back
- Each item is a whole **national team (= one country)**, so "same country back-to-back" can't happen by definition.
- Instead, **spread the confederations / regions** — don't stack a long run of all-European or all-African teams together. Alternate so the video feels varied.
- In **competition** blocks (World Cup, Euro) you simply use that tournament's teams, so this spacing is whatever the tournament gives you.

### 3. Fame / who is allowed in mixed videos
- Use **well-known teams only** in mixed videos. The mixed videos are built from the user's canonical well-known-teams list (`.Storage/storage/well-known-teams.json`).
- Don't drop in obscure clubs/teams that 90% of viewers wouldn't recognise.

### 4. Size
- **Shorts are short by design.** Aim for **~5 levels** (existing shorts range about 7–13). They are NOT competition videos — every short is a **mixed** clip.
- Build each short from the **easiest tiers** of its matching Regular video: take the Tier-1 openers first and keep the easy→med→hard order.
- All the adjacency + fame rules below still apply, just over fewer levels.

### 5. Don't repeat across blocks of the same quiz type
- Different videos in THIS runner should **not share a lot of the same national teams**
  (*"block 9 and 10 should not have the same teams"*).
- A given national team should appear in **at most 2 videos** across this runner —
  never 3+. Use the full available pool before reusing anyone.

---

## Quick checklist before you save a block
- [ ] Easy → med → hard order (most-known first).
- [ ] No two adjacent items break the same-region rule.
- [ ] Only well-known national teams; confederations spread out.
- [ ] Short is ~5 levels, taken from the easiest tiers of the matching Regular video.
- [ ] No national team appears 3+ times across this runner; minimal overlap with other blocks.
- [ ] Mixed block has no competition name; competition block uses the real roster.
