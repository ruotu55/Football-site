# How to Build a Calendar Item for this Runner

**Runner:** 7_Guess The Football Team Logo Name - Main Runner
**Variant:** Shorts
**Quiz:** Guess the club by its logo

A "calendar item" = one video's worth of content (a block of clubs) that you
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
   Champions League, etc.). Use that competition's actual clubs.
2. **Mixed blocks** — random well-known clubs, no competition theme. Most of
   the rules below are about these.

**Do not invent new competition videos** — keep the existing competitions as
they are; only add/edit **mixed** videos unless the owner asks otherwise.

---

## The rules

### 1. Difficulty order: easy → medium → hard
- Arrange the clubs **most-known first, least-known last**
  (*"arrange the teams by the most known to less known — easy - med - hard"*).
- Within the video the difficulty climbs smoothly from Tier 1 (most famous) down
  through the harder tiers. Spread your tiers evenly so the gradient is smooth.

### 2. No same country back-to-back
- **Never two clubs from the same COUNTRY back-to-back** in a mixed video (*"players from the same team or country can't be one after another"*).
- In **competition** blocks (a single league, e.g. La Liga) every club is from the same country, so this adjacency rule does not apply there — it only governs the **mixed** videos.
- The rule may relax in the hardest tail levels if the pool is exhausted, but aim for **0 same-country adjacency** in mixed videos.

### 3. Fame / who is allowed in mixed videos
- Use **well-known teams only** in mixed videos. The mixed videos are built from the user's canonical well-known-teams list (`.Storage/storage/well-known-teams.json`).
- Don't drop in obscure clubs/teams that 90% of viewers wouldn't recognise.

### 4. Size
- **Shorts are short by design.** Aim for **~5 levels** (existing shorts range about 7–13). They are NOT competition videos — every short is a **mixed** clip.
- Build each short from the **easiest tiers** of its matching Regular video: take the Tier-1 openers first and keep the easy→med→hard order.
- All the adjacency + fame rules below still apply, just over fewer levels.

### 5. Don't repeat across blocks of the same quiz type
- Different videos in THIS runner should **not share a lot of the same clubs**
  (*"block 9 and 10 should not have the same teams"*).
- A given club should appear in **at most 2 videos** across this runner —
  never 3+. Use the full available pool before reusing anyone.

---

## Quick checklist before you save a block
- [ ] Easy → med → hard order (most-known first).
- [ ] No two adjacent items break the same-country rule.
- [ ] Only well-known teams (from the well-known-teams list).
- [ ] Short is ~5 levels, taken from the easiest tiers of the matching Regular video.
- [ ] No club appears 3+ times across this runner; minimal overlap with other blocks.
- [ ] Mixed block has no competition name; competition block uses the real roster.
