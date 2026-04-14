#!/usr/bin/env python3
"""
Download Fut.gg FC 26 player-item face images from club squad JSONs.

Resolves EA player IDs via a public EAFC26 players CSV (GitHub), matches squad JSON
names to CSV rows, then for each Fut.gg card variant fetches the player-item asset.

Default scope is England / Premier League; use --all-leagues or --only-under to scan
other folders under Squad Formation/Teams (EA CSV league_name must match the league
folder name unless --ea-league-name is set with --only-under).

Application Security Requirement: HTTPS with certifi; urllib only; validate URLs against
allowed fut.gg / game-assets hosts; no shell; bounded file writes under project paths.
"""

from __future__ import annotations

import argparse
import csv
import json
import io
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

_SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _SCRIPT_DIR.parent
if not (PROJECT_ROOT / "Squad Formation" / "Teams").is_dir():
    PROJECT_ROOT = _SCRIPT_DIR.parent.parent

DEFAULT_CSV = (
    "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/"
    "main/data/players.csv"
)
SQUAD_TEAMS_ROOT = PROJECT_ROOT / "Squad Formation" / "Teams"
SQUAD_PL = SQUAD_TEAMS_ROOT / "England" / "Premier League"
OUT_CLUB_ROOT = PROJECT_ROOT / "Players images" / "Club images"
OUT_PL = OUT_CLUB_ROOT / "England" / "Premier League"

POSITION_KEYS = ("goalkeepers", "defenders", "midfielders", "attackers")

# Transfermarkt-style position -> EA position tokens (substring match in player_positions)
POS_HINT: dict[str, tuple[str, ...]] = {
    "Goalkeeper": ("GK",),
    "Centre-Back": ("CB",),
    "Left-Back": ("LB",),
    "Right-Back": ("RB",),
    "Defensive Midfield": ("CDM", "DM"),
    "Central Midfield": ("CM",),
    "Attacking Midfield": ("CAM",),
    "Left Midfield": ("LM",),
    "Right Midfield": ("RM",),
    "Left Winger": ("LW",),
    "Right Winger": ("RW",),
    "Centre-Forward": ("CF",),
    "Second Striker": ("CF", "CAM"),
    "Striker": ("ST",),
}

# Squad JSON folder name (TM) -> EA CSV club_name (players.csv league_name + club_name).
# Top-5 leagues: when TM squad stem is not identical to EA club_name, map here; see _tm_club_to_ea for
# German "1.FC" / "1.FSV" spacing.
TM_CLUB_TO_EA: dict[str, str] = {
    # Premier League
    "Arsenal FC": "Arsenal",
    "Brentford FC": "Brentford",
    "Burnley FC": "Burnley",
    "Chelsea FC": "Chelsea",
    "Everton FC": "Everton",
    "Liverpool FC": "Liverpool",
    "Sunderland AFC": "Sunderland",
    # La Liga
    "Athletic Bilbao": "Athletic Club",
    "Atlético de Madrid": "Atlético Madrid",
    "Celta de Vigo": "RC Celta",
    "RCD Espanyol Barcelona": "RCD Espanyol",
    # Serie A
    "ACF Fiorentina": "Fiorentina",
    "AS Roma": "Roma",
    "Atalanta BC": "Atalanta",
    "Bologna FC 1909": "Bologna",
    "Cagliari Calcio": "Cagliari",
    "Como 1907": "Como",
    "Genoa CFC": "Genoa",
    "Hellas Verona": "Hellas Verona FC",
    "Inter Milan": "Inter",
    "Parma Calcio 1913": "Parma",
    "Pisa Sporting Club": "Pisa",
    "SS Lazio": "Lazio",
    "SSC Napoli": "Napoli",
    "US Cremonese": "Cremonese",
    "US Lecce": "Lecce",
    "US Sassuolo": "Sassuolo",
    "Udinese Calcio": "Udinese",
    # Bundesliga (Bayern; 1.FC* handled in _tm_club_to_ea)
    "Bayern Munich": "FC Bayern München",
    # Ligue 1
    "FC Toulouse": "Toulouse FC",
    "LOSC Lille": "Lille OSC",
    "Olympique Lyon": "Olympique Lyonnais",
    "Olympique Marseille": "Olympique de Marseille",
}

# (country folder, league folder) -> EA players.csv league_name when it differs from the folder name
EA_LEAGUE_FOLDER_OVERRIDES: dict[tuple[str, str], str] = {
    ("Spain", "LaLiga"): "La Liga",
}

# --standard-leagues: (country folder under Teams/, league folder)
STANDARD_LEAGUE_TARGETS: tuple[tuple[str, str], ...] = (
    ("England", "Premier League"),
    ("England", "Championship"),
    ("Germany", "Bundesliga"),
    ("Italy", "Serie A"),
    ("France", "Ligue 1"),
    ("Spain", "LaLiga"),
    ("Saudi Arabia", "Saudi Pro League"),
    ("Belgium", "Jupiler Pro League"),
    ("Netherlands", "Eredivisie"),
    ("Portugal", "Liga Portugal"),
    ("United States", "Major League Soccer"),
    ("Türkiye", "Süper Lig"),
)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

CARD_LINK_RE = re.compile(
    r"/players/\d+-[^/]+/26-(\d+)/",
    re.IGNORECASE,
)
# Face cutout (not social-small / not full card render)
PLAYER_ITEM_RE = re.compile(
    r'(https://game-assets\.fut\.gg/cdn-cgi/image/[^"\']+'
    r"/\d{4}/player-item/(26-\d+\.[a-f0-9]+\.webp))",
    re.IGNORECASE,
)


def _try_certifi() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _try_certifi()


def _ea_league_name_for_folder(
    country: str, league_folder: str, explicit_cli: str
) -> str:
    """Map Teams/…/<league>/ folder to EA CSV league_name (optional --ea-league-name wins)."""
    e = (explicit_cli or "").strip()
    if e:
        return e
    return EA_LEAGUE_FOLDER_OVERRIDES.get((country, league_folder), league_folder)


def _safe_dir_name(name: str) -> str:
    s = (name or "").strip()
    for ch in '\\/:*?"<>|':
        s = s.replace(ch, "")
    s = s.strip(". \t")
    return s or "unknown"


def _strip_cyrillic(s: str) -> str:
    """EA CSV sometimes appends Cyrillic duplicates to long_name; drop for matching."""
    return "".join(c for c in s if not ("\u0400" <= c <= "\u04ff"))


def _name_key(s: str) -> str:
    """
    Normalize squad vs EA names: accents (NFKD), Serbian đ→dj, hyphens, stray Cyrillic.
    Used for equality and ordered-token matching (TM vs EAFC full legal names).
    """
    t = unicodedata.normalize("NFKD", s or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = _strip_cyrillic(t)
    t = t.casefold().replace("-", " ")
    out: list[str] = []
    for c in t:
        if c in "đ":
            out.append("dj")
        elif c in "ł":
            out.append("l")
        elif c in "ø":
            out.append("o")
        else:
            out.append(c)
    t = "".join(out)
    return " ".join(t.split())


def _tokens_subsequence(need: list[str], hay: list[str]) -> bool:
    """True if every token in need appears in hay in the same order (e.g. Marcos Senesi vs Marcos Nicolás Senesi Barón)."""
    if not need:
        return True
    i = 0
    for tok in hay:
        if i < len(need) and tok == need[i]:
            i += 1
    return i == len(need)


def _tm_club_to_ea(tm: str) -> str:
    if tm in TM_CLUB_TO_EA:
        return TM_CLUB_TO_EA[tm]
    s = tm.strip()
    # EA Bundesliga CSV uses "1. FC …" / "1. FSV …"; TM squad JSON uses "1.FC" / "1.FSV" (no space).
    if s.startswith("1.FC"):
        s = "1. FC" + s[4:]
    elif s.startswith("1.FSV"):
        s = "1. FSV" + s[5:]
    for suf in (" FC", " AFC", " SC", " CF"):
        if s.endswith(suf):
            return s[: -len(suf)].strip()
    return s


def _fetch_text(url: str, *, timeout: float = 60.0) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read().decode("utf-8", "replace")


def _fetch_bytes(url: str, *, timeout: float = 90.0) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read()


def _allowed_asset_url(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    return p.scheme == "https" and p.netloc == "game-assets.fut.gg"


def _load_ea_csv(path_or_url: str) -> list[dict[str, Any]]:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        raw = _fetch_text(path_or_url, timeout=120.0)
    else:
        raw = Path(path_or_url).read_text(encoding="utf-8", errors="replace")
    return list(csv.DictReader(io.StringIO(raw)))


def _filter_league_club(
    rows: list[dict[str, Any]], ea_league: str, ea_club: str
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    el = (ea_league or "").strip()
    ec = (ea_club or "").strip()
    for row in rows:
        if (row.get("league_name") or "").strip() != el:
            continue
        if (row.get("club_name") or "").strip() != ec:
            continue
        out.append(row)
    return out


def _club_rows_for_squad_name(
    all_rows: list[dict[str, Any]], ea_league: str, club_tm_stem: str
) -> list[dict[str, Any]]:
    """Match EA CSV club_name: try normalized name first, then exact squad filename stem (e.g. Fulham vs Fulham FC)."""
    ea_club = _tm_club_to_ea(club_tm_stem)
    found = _filter_league_club(all_rows, ea_league, ea_club)
    if found:
        return found
    return _filter_league_club(all_rows, ea_league, club_tm_stem.strip())


def _player_dir_has_any_webp(out_dir: Path) -> bool:
    try:
        return out_dir.is_dir() and any(out_dir.glob("*.webp"))
    except OSError:
        return False


def _position_hint_match(json_pos: str, ea_positions: str) -> bool:
    hints = POS_HINT.get(json_pos)
    if not hints:
        return True
    ep = (ea_positions or "").upper()
    return any(h in ep for h in hints)


def _ea_name_matches_display(fd: str, sn: str, ln: str) -> bool:
    """
    fd, sn, ln must be _name_key() outputs (same normalization for display and EA fields).
    """
    if fd == ln or fd == sn:
        return True
    if fd in ln:
        return True
    ds = fd.split()
    lt_tokens = ln.split()
    if len(ds) >= 2 and len(lt_tokens) >= len(ds) and _tokens_subsequence(ds, lt_tokens):
        return True
    ds, ls = fd.split(), ln.split()
    if len(ds) >= 2 and len(ls) >= 2 and ds[-1] == ls[-1]:
        if ds[0] == ls[0]:
            return True
        # Nickname vs full first name (e.g. Ben Davies vs Benjamin Thomas Davies)
        a, b = ds[0], ls[0]
        if len(a) >= 2 and len(b) >= 2 and (b.startswith(a) or a.startswith(b)):
            return True
        # Display first name appears inside a legal-name token (e.g. Tosin ⊂ Oluwatosin Adarabioyo)
        if len(a) >= 4 and any(a in t for t in ls[:-1]):
            return True
    if len(ds) >= 2 and len(ls) >= 2 and ds[0] == ls[0] and ds[-1] == ls[-1]:
        return True
    # EA short_name like "B. Davies" / "N. Madueke" (must match display surname)
    sp = sn.split()
    if (
        len(ds) >= 2
        and len(sp) == 2
        and len(sp[0]) >= 2
        and sp[0].endswith(".")
        and len(ls) >= 2
    ):
        initial = sp[0][0]
        if (
            ds[-1] == sp[1]
            and sp[1] == ls[-1]
            and ds[0].lower().startswith(initial.lower())
            and ls[0].lower().startswith(initial.lower())
        ):
            return True
        # Legal first name does not start with initial, but short + display agree (e.g. Noni vs Chukwunonso + N. Madueke)
        if (
            ds[-1] == sp[1]
            and sp[1] == ls[-1]
            and ds[0].lower().startswith(initial.lower())
            and not ls[0].lower().startswith(initial.lower())
        ):
            return True
    if len(ds) == 1 and ds[0] and (fd == sn or (ls and ds[0] == ls[0])):
        return True
    return False


def _pick_player_row(
    candidates: list[dict[str, Any]],
    display_name: str,
    json_position: str,
) -> Optional[dict[str, Any]]:
    fd = _name_key(display_name)
    exact: list[dict[str, Any]] = []
    loose: list[dict[str, Any]] = []

    for row in candidates:
        sn = _name_key((row.get("short_name") or "").strip())
        ln = _name_key((row.get("long_name") or "").strip())
        if fd == ln or fd == sn:
            exact.append(row)
        elif _ea_name_matches_display(fd, sn, ln):
            loose.append(row)

    for pool in (exact, loose):
        if not pool:
            continue
        if len(pool) == 1:
            return pool[0]
        hinted = [r for r in pool if _position_hint_match(json_position, r.get("player_positions") or "")]
        if len(hinted) == 1:
            return hinted[0]
        if hinted:
            return hinted[0]
        return pool[0]
    return None


def _resolve_futgg_hub_url(ea_player_id: int) -> str:
    """GET /players/{id}/ follows redirect to canonical slug URL."""
    url = f"https://www.fut.gg/players/{ea_player_id}/"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60.0, context=SSL_CTX) as r:
        final = r.geturl().rstrip("/")
    if not re.match(r"^https://www\.fut\.gg/players/\d+-", final):
        raise RuntimeError(
            f"fut.gg has no player hub for id {ea_player_id} (got {final!r}); "
            "EA CSV id may be missing from FUT.GG or delisted."
        )
    return final


def _card_item_ids_from_hub(html: str) -> list[str]:
    seen: set[str] = set()
    order: list[str] = []
    for m in CARD_LINK_RE.finditer(html):
        iid = m.group(1)
        if iid not in seen:
            seen.add(iid)
            order.append(iid)
    return order


def _player_item_urls_from_card_html(html: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for m in PLAYER_ITEM_RE.finditer(html):
        u = m.group(1)
        if "player-item-social" in u or "social-small" in u:
            continue
        if not _allowed_asset_url(u):
            continue
        key = m.group(1).split("/player-item/", 1)[-1]
        if key not in seen:
            seen.add(key)
            found.append(u)
    # Prefer width=300 if duplicates differ only by width
    preferred = [u for u in found if "width=300" in u]
    return preferred if preferred else found


def _download_one(url: str, dest: Path) -> bool:
    if dest.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = _fetch_bytes(url)
    dest.write_bytes(data)
    return True


def _iter_squad_players(data: dict[str, Any]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for key in POSITION_KEYS:
        block = data.get(key)
        if not isinstance(block, list):
            continue
        for row in block:
            if not isinstance(row, dict):
                continue
            name = row.get("name")
            pos = row.get("position")
            if isinstance(name, str) and name.strip():
                out.append((name.strip(), (pos or "").strip() if isinstance(pos, str) else ""))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Download Fut.gg FC26 player-item images from club squad JSONs."
    )
    ap.add_argument(
        "--csv",
        default=DEFAULT_CSV,
        help="Path or URL to EAFC26 players.csv (default: GitHub raw).",
    )
    ap.add_argument(
        "--delay",
        type=float,
        default=0.35,
        help="Seconds to sleep between HTTP requests (default: 0.35).",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without downloading.",
    )
    ap.add_argument(
        "--limit-players",
        type=int,
        default=0,
        help="Stop after N successful player lookups (0 = no limit).",
    )
    ap.add_argument(
        "--club",
        default="",
        metavar="STEM",
        help="Only process one club JSON stem, e.g. 'Arsenal FC' (optional).",
    )
    ap.add_argument(
        "--player-contains",
        default="",
        metavar="SUBSTR",
        help="Only process players whose name contains this substring (case-insensitive).",
    )
    ap.add_argument(
        "--all-leagues",
        action="store_true",
        help="Scan every Squad Formation/Teams/<Country>/<League>/*.json (not only PL).",
    )
    ap.add_argument(
        "--only-under",
        default="",
        metavar="REL_PATH",
        help="Restrict scan to this path under Teams/, e.g. England/Premier League or Spain/La Liga.",
    )
    ap.add_argument(
        "--ea-league-name",
        default="",
        metavar="NAME",
        help="EA CSV league_name override when the folder name does not match (use with --only-under).",
    )
    ap.add_argument(
        "--skip-if-has-image",
        action="store_true",
        help="Skip a player if their output folder already has at least one .webp (saves HTTP).",
    )
    ap.add_argument(
        "--standard-leagues",
        action="store_true",
        help=(
            "Scan the built-in list of top leagues (England PL+Championship, big-5, "
            "Saudi, Belgium, Netherlands, Portugal, MLS, Türkiye). "
            "Conflicts with --all-leagues and --only-under."
        ),
    )
    args = ap.parse_args()

    if args.standard_leagues and (args.all_leagues or args.only_under):
        print(
            "Use either --standard-leagues or --all-leagues / --only-under, not both.",
            file=sys.stderr,
        )
        return 1

    if args.ea_league_name and args.all_leagues and not args.only_under:
        print(
            "--ea-league-name cannot be used with --all-leagues without --only-under "
            "(each league needs its own folder name or a single subtree).",
            file=sys.stderr,
        )
        return 1

    paths: list[Path]
    if args.standard_leagues:
        paths = []
        for country, league_folder in STANDARD_LEAGUE_TARGETS:
            base = SQUAD_TEAMS_ROOT / country / league_folder
            if not base.is_dir():
                print(f"[warn] missing league folder, skip: {base}", file=sys.stderr)
                continue
            for p in sorted(base.rglob("*.json")):
                try:
                    rel = p.relative_to(SQUAD_TEAMS_ROOT)
                except ValueError:
                    continue
                if len(rel.parts) < 3:
                    continue
                paths.append(p)
        multi = True
    else:
        multi = bool(args.all_leagues or args.only_under)
        if multi:
            base = SQUAD_TEAMS_ROOT / args.only_under if args.only_under else SQUAD_TEAMS_ROOT
            if not base.is_dir():
                print(f"Missing: {base}", file=sys.stderr)
                return 1
            paths = []
            for p in sorted(base.rglob("*.json")):
                try:
                    rel = p.relative_to(SQUAD_TEAMS_ROOT)
                except ValueError:
                    continue
                if len(rel.parts) < 3:
                    continue
                paths.append(p)
        else:
            if not SQUAD_PL.is_dir():
                print(f"Missing: {SQUAD_PL}", file=sys.stderr)
                return 1
            paths = sorted(SQUAD_PL.glob("*.json"))

    if args.club:
        if multi:
            paths = [p for p in paths if p.stem == args.club]
            if not paths:
                print(f"No club JSON stem {args.club!r} in current scan scope.", file=sys.stderr)
                return 1
        else:
            p = SQUAD_PL / f"{args.club}.json"
            if not p.is_file():
                print(f"--club {args.club!r} not found under {SQUAD_PL}", file=sys.stderr)
                return 1
            paths = [p]

    print("Loading EA player CSV…", file=sys.stderr)
    try:
        all_rows = _load_ea_csv(args.csv)
    except (urllib.error.URLError, OSError) as e:
        print(f"Failed to load CSV: {e}", file=sys.stderr)
        return 1

    err = 0
    skipped = 0
    skipped_player_dirs = 0
    players_processed = 0

    for squad_path in paths:
        club_tm = squad_path.stem
        if multi:
            rel = squad_path.relative_to(SQUAD_TEAMS_ROOT)
            _country, league_folder = rel.parts[0], rel.parts[1]
            out_base = OUT_CLUB_ROOT / _country / league_folder
            ea_league = _ea_league_name_for_folder(
                _country, league_folder, args.ea_league_name
            )
        else:
            out_base = OUT_PL
            ea_league = "Premier League"

        club_rows = _club_rows_for_squad_name(all_rows, ea_league, club_tm)
        if not club_rows:
            ea_try = _tm_club_to_ea(club_tm)
            print(
                f"[warn] no EA CSV rows for league {ea_league!r} club {club_tm!r} "
                f"(tried club_name {ea_try!r} and {club_tm!r})",
                file=sys.stderr,
            )
            continue

        try:
            data = json.loads(squad_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"[warn] skip {squad_path.name}: {e}", file=sys.stderr)
            continue
        if not isinstance(data, dict):
            continue

        for display_name, json_pos in _iter_squad_players(data):
            if args.player_contains and args.player_contains.casefold() not in display_name.casefold():
                continue
            row = _pick_player_row(club_rows, display_name, json_pos)
            if not row:
                # Stale CSV club/league vs squad (transfers) or TM naming drift
                row = _pick_player_row(all_rows, display_name, json_pos)
            if not row:
                print(
                    f"[miss] {club_tm} / {display_name} ({json_pos}) — no EA row",
                    file=sys.stderr,
                )
                err += 1
                continue
            try:
                pid = int((row.get("player_id") or "").strip())
            except ValueError:
                print(f"[miss] bad player_id for {display_name}", file=sys.stderr)
                err += 1
                continue

            out_dir = out_base / club_tm / _safe_dir_name(display_name)
            if args.skip_if_has_image and _player_dir_has_any_webp(out_dir):
                skipped_player_dirs += 1
                continue
            try:
                hub = _resolve_futgg_hub_url(pid)
                time.sleep(args.delay)
                hub_html = _fetch_text(hub + "/")
                time.sleep(args.delay)
            except (urllib.error.URLError, OSError, RuntimeError) as e:
                print(f"[err] hub {display_name} ({pid}): {e}", file=sys.stderr)
                err += 1
                continue

            item_ids = _card_item_ids_from_hub(hub_html)
            if not item_ids:
                print(f"[warn] no FC26 cards on hub for {display_name} ({hub})", file=sys.stderr)

            players_processed += 1
            any_saved = False
            for iid in item_ids:
                card_url = f"{hub}/26-{iid}/"
                try:
                    card_html = _fetch_text(card_url)
                    time.sleep(args.delay)
                except (urllib.error.URLError, OSError) as e:
                    print(f"[err] card page {card_url}: {e}", file=sys.stderr)
                    continue
                urls = _player_item_urls_from_card_html(card_html)
                if not urls:
                    print(f"[warn] no player-item URL on {card_url}", file=sys.stderr)
                    continue
                for asset_url in urls:
                    fname = asset_url.split("/player-item/", 1)[-1].split("?", 1)[0]
                    dest = out_dir / fname
                    if args.dry_run:
                        print(f"GET {asset_url} -> {dest}", flush=True)
                        any_saved = True
                        continue
                    try:
                        wrote = _download_one(asset_url, dest)
                        if wrote:
                            any_saved = True
                            print(f"saved {dest.relative_to(PROJECT_ROOT)}", file=sys.stderr)
                        else:
                            skipped += 1
                    except (urllib.error.URLError, OSError) as e:
                        print(f"[err] download {asset_url}: {e}", file=sys.stderr)

            if args.limit_players and players_processed >= args.limit_players:
                print(
                    f"Stopped after --limit-players={args.limit_players}",
                    file=sys.stderr,
                )
                print(
                    f"Done. players_processed={players_processed} errors={err} "
                    f"skipped_existing_files≈{skipped} skipped_player_dirs={skipped_player_dirs}",
                    file=sys.stderr,
                )
                return 0

    print(
        f"Done. players_processed={players_processed} errors={err} "
        f"skipped_existing_files≈{skipped} skipped_player_dirs={skipped_player_dirs}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
