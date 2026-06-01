# Rebuild Saved-Team Lineups (Runner 1) — Reproducible Procedure

This documents exactly how the **saved team formations + starting XIs** for the
two runners below are researched and rewritten, so the job can be repeated
**identically** on request.

- `1_Guess The Football Team Name - Main Runner - Regular`
- `1_Guess The Football Team Name - Main Runner - Shorts`

> Both runners share **one** data file, so doing this once updates both.

---

## 0. The golden rules (read every time)

1. **Most up-to-date season, always.** Use the *current* season's real
   formation and lineup. **The moment a new season has started — even one week
   in — switch to the new season.** Do not keep last season's XI once a new
   campaign is under way. (When this was first done the current season was
   **2025/26**; on a future run, determine today's date and use whatever season
   is live then.)
2. **Strongest team, by QUALITY — not by appearance count.** Pick the lineup a
   knowledgeable fan would call the club's best possible XI. Marquee signings,
   star talents and the genuinely best players start **even if they have few
   appearances or are currently injured** (e.g. include Maddison/Palmer when
   injured; pick Cherki over Savinho at Man City because he is the better
   first-choice creator). Appearance counts in the data are only a *hint*.
3. **Get the formation right too**, not just the players. Use the club's real
   most-used shape this season.
4. **Clubs only. NEVER touch national teams.** Runner 2 shares the same file;
   its `/Nationalities/` entries must be left alone.
5. **Only edit the runner(s) the user named** (here: runner 1 Regular + Shorts,
   which is the whole shared club blob). Don't mirror to other runners.
6. **Web-verify every club.** Don't guess — search the club's actual recent
   lineups/formation.

---

## 1. Where the data lives

| Thing | Path |
|---|---|
| Saved layouts (the file we edit) | `.Storage/storage/runner-blobs/lineups_runner_team_layouts_shared.json` |
| Per-club squad rosters (source of players) | `.Storage/Squad Formation/Teams/<Country>/<League>/<Club>.json` |
| Formation slot geometry (reference) | `1_Guess The Football Team Name - Main Runner - Regular/js/formations.js` |
| Which clubs actually have videos | blocks `1\|long\|*` and `1\|short\|*` in `.Storage/storage/recording-status.json` (`teamsImportText`) |

The layouts file is a map. **Keys** look like
`../.Storage/Squad Formation/Teams/England/Premier League/Tottenham Hotspur.json`.
Club entries contain `/Teams/`; national entries contain `/Nationalities/`
(leave those alone).

### What we change per club (only these)

- `formationId` — one of the 12 valid ids (below)
- `lastFormationId` — **must equal** `formationId` (else `customXi` is ignored)
- `customXi` — array of **11 full player objects**, copied verbatim from the
  club's squad JSON, ordered by formation slot

`customXi` is **positional**: `customXi[i]` renders at `formation.slots[i]`. Any
player can be placed in any slot. Each player object must be findable by `name`
in the squad JSON so it rehydrates — that's why we copy the whole object and why
names must be verbatim. Everything else in the entry (logo scales, displayMode,
etc.) is left as-is; the apply script just normalises the 3 length-11 slot
arrays.

### The 12 valid formations and their slot order (index 0..10)

```
3421 : GK, CB, CB, CB, LeftWB, RightWB, CM, CM, AM, AM, CF
343  : GK, CB, CB, CB, LeftWB, RightWB, CM, CM, LW, CF, RW
352  : GK, CB, CB, CB, LeftWB, RightWB, DM, DM, AM, CF, CF
4141 : GK, RB, CB, CB, LB, DM, RW, CM, CM, LW, CF
433  : GK, RB, CB, CB, LB, CM, CM, CM, RW, CF, LW
4231 : GK, RB, CB, CB, LB, DM, DM, LeftAM, CentralAM, RightAM, CF
442  : GK, RB, CB, CB, LB, RM, CM, CM, LM, CF, CF
451  : GK, RB, CB, CB, LB, LeftAM, CM, CM, CM, RightAM, CF
41212: GK, RB, CB, CB, LB, DM, CM, CM, AM, CF, CF
4321 : GK, RB, CB, CB, LB, CM, CM, CM, AM, AM, CF
532  : GK, RB, CB, CB, CB, LB, CM, CM, CM, CF, CF
523  : GK, RB, CB, CB, CB, LB, CM, CM, RW, CF, LW
```

Right-sided players go in RB/RW/RM slots, left-sided in LB/LW/LM. (This mirrors
`js/formations.js` — re-derive it from there if the formations file ever changes.)

---

## 2. The tooling (lives in this repo)

`scripts/lineup_rebuild/`:

| Script | Purpose |
|---|---|
| `fixlib.py` | Shared helpers: paths, the 12 slot templates, `norm()` name folding, roster loading. **The slot templates here are the source of truth for ordering.** |
| `dump_rosters.py` | Writes `work/teams/<Club>.txt` (one per club, listing every selectable player) + `work/groups.json` (clubs grouped by league, for planning batches). These text files are what the research agents read. |
| `apply.py` | Validates an assignments JSON against the squads and writes the 3 fields. Makes a one-time backup. Has a DRY mode. |
| `verify_coverage.py` | Confirms every club was covered and the blob is structurally sound. |

`work/` is git-ignored — it holds regenerated roster dumps and the per-wave
assignment files.

---

## 3. Step-by-step procedure

All commands assume the repo root as CWD and `PYTHONIOENCODING=utf-8` (Windows
console defaults to cp1255 and will crash on accented names otherwise).

### Step 1 — Dump rosters + see the league groups
```powershell
$env:PYTHONIOENCODING="utf-8"; python scripts/lineup_rebuild/dump_rosters.py
```
This prints the league groups (used to plan batches) and writes
`scripts/lineup_rebuild/work/teams/*.txt`. Note any club it reports as MISSING a
roster JSON — those can't be processed (see "Known edge cases").

### Step 2 — Research, in batches, with parallel agents
Decide today's live season first. Then split the clubs into batches of ~4–6 by
league/region (big-5 leagues get their own batches; group minnow leagues
together). **Dispatch one research agent per batch** using the prompt template
in §4. Each agent reads its clubs' `work/teams/*.txt` files, web-verifies the
real formation + best XI, and returns strict JSON.

Run them in waves of ~8 agents. Keep going until every club is assigned. (First
run: ~33 agents across the ~184 clubs.)

### Step 3 — Collect each wave's results into an assignments file
Paste the agents' JSON objects into one array per wave, e.g.
`scripts/lineup_rebuild/work/assign_w1.json`:
```json
[
  {"team":"Arsenal FC","formationId":"433","xi":["David Raya","Jurriën Timber","William Saliba","Gabriel","Riccardo Calafiori","Martín Zubimendi","Declan Rice","Martin Ødegaard","Bukayo Saka","Viktor Gyökeres","Gabriel Martinelli"]}
]
```
`team` must match the club's display name (the apply script strips a leading
`TEAM:` prefix and folds accents, so small differences are tolerated). `xi` must
be 11 names, each present in that club's squad, ordered by the formation slots.

### Step 4 — Validate (DRY), then apply
```powershell
# validate only — fix any "PLAYER NOT IN ROSTER" before writing
$env:PYTHONIOENCODING="utf-8"; $env:ASSIGN="scripts/lineup_rebuild/work/assign_w1.json"; $env:DRY="1"
python scripts/lineup_rebuild/apply.py

# write (one backup is made the first time per STAMP)
$env:DRY="0"; $env:STAMP="<yyyymmdd>-bulk"
python scripts/lineup_rebuild/apply.py
```
If a name fails validation, open that club's `work/teams/*.txt`, pick the correct
verbatim name (the agent may have used a player no longer in the squad), fix the
assignments JSON, re-validate.

### Step 5 — Verify full coverage + integrity
```powershell
$env:PYTHONIOENCODING="utf-8"; python scripts/lineup_rebuild/verify_coverage.py scripts/lineup_rebuild/work/assign_*.json
```
Expect: `uncovered clubs: NONE` (except known edge cases), `structural problems:
NONE`, and the nations count unchanged.

### Step 6 — Tell the user to reload
The blob is loaded by the runner at page load. Any open runner tab must be
**reloaded** to pick up the new saves. (No `?v=` cache-bump needed — it's data,
not a JS/CSS module.)

---

## 4. The research-agent prompt template (use verbatim, fill the brackets)

> You are a football researcher. For each assigned club, output its REAL
> **<CURRENT SEASON, e.g. 2025/26>** formation and the SMARTEST, STRONGEST
> possible first-choice XI as strict JSON. Today is **<DATE>**.
>
> For each club: READ its roster file (Read tool) — it lists every selectable
> player with position/appearances/shirt/age. Then WEB-SEARCH the club's actual
> **<SEASON>** most-used formation and best lineup; verify, don't guess.
>
> PICK THE BEST TEAM ON QUALITY, not appearance counts. Marquee signings, star
> talents and the genuinely best players START even with fewer appearances or if
> currently injured. Appearances in the file are only a hint. Build the lineup a
> knowledgeable fan would call the club's strongest possible XI.
>
> CONSTRAINT: use ONLY names that appear VERBATIM in that club's roster file
> (copy exactly incl. accents). If a real first-choice player isn't in the file,
> pick the best roster alternative for that slot. NEVER invent a name.
>
> formationId from EXACTLY: 3421,343,352,4141,433,4231,442,451,41212,4321,532,523.
> Output 11 names IN SLOT ORDER for the chosen formation. Templates (index0..10):
> *(paste the 12-line slot table from §1)*
> (Right-sided players in RB/RW/RM, left-sided in LB/LW/LM; position label is a
> hint, any player may fill any slot.)
>
> ASSIGNED CLUBS (roster files):
> - `scripts/lineup_rebuild/work/teams/<Club A>.txt`
> - … (4–6 per agent)
>
> OUTPUT: Return ONLY a JSON array (no prose), one object per club:
> `[{"team":"<exact TEAM line, no 'TEAM:' prefix>","formationId":"...","xi":[11 verbatim names in slot order],"notes":"short"}]`

Tips that came up last time:
- For Saudi/MLS clubs, explicitly remind the agent that galáctico signings
  (Ronaldo, Benzema, Messi, Son, etc.) start.
- For tiny leagues (Gibraltar, Malta, Armenia, Kosovo, North Macedonia, Iceland,
  Faroe-tier) web data is thin — tell the agent to lean on the roster's
  appearance counts plus whatever it can verify.
- A player the agent names may have left the club / not be in the squad JSON —
  the DRY validation catches it; substitute the best squad alternative.

---

## 5. Known edge cases & gotchas

- **Windows console encoding:** always set `PYTHONIOENCODING=utf-8`, or accented
  names throw `UnicodeEncodeError` (cp1255).
- **Git-Bash/MSYS path mangling:** never pass an argument that starts with `/`
  (e.g. a `/England/...` filter) — MSYS rewrites it into a Windows path. Pass
  filters via the `FILTER` env var instead. Also, Bash `/tmp` maps to
  `C:\Users\<you>\AppData\Local\Temp`, while Windows Python reads `/tmp` as
  `C:\tmp` — that's why the tooling now lives in the repo with repo-relative
  paths and writes to `work/`.
- **`lastFormationId` must equal `formationId`** or the app ignores `customXi`.
  `apply.py` always sets them equal.
- **Stale duplicate "Panathinaikos FC":** this layout key has **no** squad JSON
  on disk and can't be rebuilt. The videos reference **"Panathinaikos"** (which
  *does* have a squad and gets updated), so the duplicate is harmless and is the
  one expected entry in `uncovered clubs`.
- **Don't run the old auto-picker over these saves.** Earlier, layouts were
  bulk-generated by an appearances-based `pickStartingXI` port. This procedure
  *replaces* that with hand-verified XIs. Re-running the auto-picker would undo
  the work.

---

## 6. Reverting

A timestamped backup is written before the first write of each `STAMP`:
`...lineups_runner_team_layouts_shared.json.bak-<STAMP>`. To fully revert,
copy the earliest pre-run backup back over the live file. (On the first run the
pre-everything backup was `...bak-20260601-pilot-pl`.)

---

## 7. First-run record (2026-06-01, season 2025/26)

- 184 / 185 club layouts rebuilt (all that have videos). Only the dead
  "Panathinaikos FC" duplicate skipped.
- National-team entries (76) untouched.
- Done in waves: PL pilot (20) → La Liga + Serie A → Bundesliga + Ligue 1 →
  Portugal/NL/Belgium/Scotland/Turkey/Greece/Cyprus/Saudi/Americas/Austria/
  Switzerland → Scandinavia/Balkans/Eastern Europe/minnows/Romania/Ireland/
  Championship/LaLiga2 → final Serie A batch.
- Smarter-by-quality examples applied: Man City 4-2-3-1 with **Cherki** at 10
  (not Savinho); injured **Maddison** (Spurs) and **Palmer** (Chelsea) kept;
  several formations corrected vs. the old auto-generated saves.
