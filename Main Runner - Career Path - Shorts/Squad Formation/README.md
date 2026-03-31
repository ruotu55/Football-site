# Squad Formation data

Python tools that **generate and sync** these JSON files live in **`Main Runner/scripts/`** (same folder as the quiz site runner). This document describes the **data** only.

JSON squads mirror the folder layout of `Teams Images/` and `Nationality images/`:

- `Squad Formation/Teams/<Country>/<League>/<Official club name>.json` — club squads. The **filename** is the Transfermarkt club name (e.g. `Birmingham City.json`, `Arsenal FC.json`), not the logo filename (e.g. `birmingham.football-logos.cc.png`). The `imagePath` field inside the JSON still points at the real logo file.
- `Squad Formation/Nationalities/<Continent>/<Country>.json` — senior national teams.

Each file lists players in **goalkeepers**, **defenders**, **midfielders**, and **attackers**. Every player entry includes **name**, **position**, **age**, **nationality**, **club**, and season totals **appearances**, **goals**, **assists** (summed across all competitions for the current Transfermarkt `seasonId`, e.g. 25/26).

The top-level **`name`** field is always the **official Transfermarkt club or national-team name** from the API (e.g. `Amiens SC`), not text derived from logo filenames (e.g. `amiens.football-logos.cc`). Player **nationality** strings use the same official country/region names as on Transfermarkt, via `_transfermarkt_nationality_id_map.json` (rebuild with `--refresh-nat-map` after changing flags).

## Python environment

Scripts use **`tmkt`** (`transfermarkt-wrapper`). Plain `python3` on your Mac will raise `ModuleNotFoundError: No module named 'tmkt'` unless you install deps.

From the **project root**, use the project venv:

```bash
.venv-squad/bin/python3 -c "import tmkt; print('ok')"
```

If that fails, create it once:

```bash
python3 -m venv .venv-squad
.venv-squad/bin/pip install -r "Main Runner/scripts/requirements.txt"
```

In the commands below, use **`.venv-squad/bin/python3`** instead of `python3`, or run `source .venv-squad/bin/activate` and then `python3 ...`.

## Refresh all club squads (e.g. after schema changes)

To **rewrite every existing** `Squad Formation/Teams/.../*.json` from the API (same fields as a full regen, including apps/goals/assists):

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/refresh_all_club_squads_from_transfermarkt.py"
```

Options: `--concurrency 4`, `--limit N` (test), `--dry-run`.

### Refresh all national-team squads (appearances / goals / assists)

To **rewrite every** `Squad Formation/Nationalities/.../*.json` from the API with the same season stats as clubs:

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/refresh_all_national_squads_from_transfermarkt.py"
```

Options: `--concurrency 4`, `--limit N` (test), `--dry-run`. Up to **10** retries per team on transient API errors; the process **exits** if a team still fails after that.

To **regenerate** national squads from flag images (first-time / new countries), use `generate_squads_from_transfermarkt.py --only nationalities` instead.

## Source and season

Data is loaded from Transfermarkt’s public tmapi (`https://tmapi-alpha.transfermarkt.technology`), aligned with the current season returned by the API (e.g. **25/26** with **cyclicalName 2026**). Per-player **appearances / goals / assists** come from the same season on Transfermarkt’s performance feed (`get_player_stats`), aggregated across competitions. Re-run after transfer windows to refresh.

## Sync squads to the current league season (25/26)

Transfermarkt’s **competition squad list** (same as on the site for the current API season) is the source of truth for **which clubs** belong in each league folder.

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/sync_teams_to_season.py"
```

This **removes** `Squad Formation/Teams/...` JSON files whose `transfermarktClubId` is **not** in that league’s official list, and **adds** JSON files for promoted clubs that were missing. New clubs without a matching logo file get `source.missingLogoFile: true` and an expected `imagePath` until a PNG exists.

## Download missing club logos (Transfermarkt crests)

For any club JSON whose `imagePath` file is missing, download the official crest from Transfermarkt’s CDN using `transfermarktClubId` (`…/wappen/big/<id>.png`), write it under `Teams Images/`, and clear `source.missingLogoFile`.

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/download_missing_club_logos.py"
```

Dry run: `--dry-run`. Optional `--delay 0.12` (seconds between requests).

For **sync** only: append `--dry-run` to the `sync_teams_to_season.py` command above.

## Worldwide tier-1 leagues (all countries on Transfermarkt)

Transfermarkt groups countries under **Europe / Americas / Asia / Africa**. Each regional “domestic leagues” table lists **one top-tier league per country**. The script below scrapes those listing pages (HTTPS, read-only) and writes `Squad Formation/_tier1_competitions.json`. Then **`sync_tier1_worldwide.py`** applies the same 25/26 logic as `sync_teams_to_season.py` for **every** tier-1 league in that index (add/remove club JSON under `Squad Formation/Teams/<Country>/<League>/`).

**1. Refresh the tier-1 index** (re-run when TM changes league codes or you want an up-to-date country list):

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/discover_tier1_competitions.py"
```

Options: `--regions europa,amerika,asien,afrika` (default: all four), `--max-pages 40`, `--delay 0.12`, `--dry-run`.

**2. Sync squads for all tier-1 leagues** (many thousands of tmapi calls — can take hours):

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/sync_tier1_worldwide.py"
```

That walks the whole `_tier1_competitions.json` list (~119 countries). Leagues you already filled (e.g. Albania) are **reconciled** again: usually `removed=0 added=0` if nothing changed.

**Batch / resume** — process chunks so you can stop and continue later:

| Example | Meaning |
|--------|---------|
| `--limit 10` | Only the **first 10** leagues in the index |
| `--offset 1 --limit 20` | Skip league 1, then do the **next 20** (leagues 2–21) |
| `--offset 21 --limit 20` | Next batch (leagues 22–41), etc. |

`--competition-id ALB1` syncs **one** league by code. `--dry-run` prints actions without writing JSON.

**3. Logos** — after each batch (or once at the end):

```bash
python3 "Main Runner/scripts/download_missing_club_logos.py"
```

**Note:** This **adds** folders for many countries alongside your existing big-five leagues. It does **not** remove second-tier data you already have. To refresh only the leagues in `sync_teams_to_season.py`’s fixed list, keep using `sync_teams_to_season.py`.

## Generate or refresh JSON

From the project root (or this folder), using the venv that has dependencies installed:

```bash
export SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')"
python3 "Main Runner/scripts/generate_squads_from_transfermarkt.py" --concurrency 6
```

Options:

| Flag | Meaning |
|------|---------|
| `--only teams` | Only club JSON files |
| `--only nationalities` | Only national-team JSON files |
| `--fast` | Do not build `_transfermarkt_nationality_id_map.json` automatically (may leave numeric nationality ids if no map exists) |
| `--refresh-nat-map` | Rebuild the nationality-id map from all flag images |
| `--limit N` | Process only the first N files per category (testing) |
| `--dry-run` | No file writes |

First full club run (without an existing `_transfermarkt_nationality_id_map.json`) will build that map once from `Nationality images/` so player **nationality** strings match your flag names (~251 short API calls).

## Dependencies

See `Main Runner/scripts/requirements.txt` (`transfermarkt-wrapper`, `certifi`). On macOS, if SSL verification fails, set `SSL_CERT_FILE` to certifi’s bundle as above.
