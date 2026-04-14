#!/usr/bin/env python3
"""
Download club crest PNGs for Squad Formation/Teams JSON when the file at imagePath is missing.
Uses Transfermarkt CDN URLs only (same ids as transfermarktClubId).

Application Security Requirement: HTTPS to allowlisted TM CDN; certifi SSL; validate PNG magic bytes;
no shell; paths confined to project Teams Images via JSON imagePath.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT = _SCRIPT_DIR.parent.parent
_SQUAD_TEAMS = _PROJECT / "Squad Formation" / "Teams"

_TM_CDN_PREFIX = "https://tmssl.akamaized.net/images/wappen/big/"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_MIN_BYTES = 500
_USER_AGENT = "FootballChannelLogoSync/1.0"


def _crest_url(club_id: int) -> str:
    return f"{_TM_CDN_PREFIX}{club_id}.png"


def _is_under_teams_images(p: Path) -> bool:
    try:
        p.resolve().relative_to((_PROJECT / "Teams Images").resolve())
        return True
    except ValueError:
        return False


def _load_club_jsons() -> list[Path]:
    return sorted(p for p in _SQUAD_TEAMS.rglob("*.json") if p.is_file())


def _resolve_json_paths(only_under: str = "", club_stem: str = "") -> list[Path]:
    """Club squad JSONs under Teams. Optional folder scope and/or one club stem (filename without .json)."""
    scoped = bool(only_under.strip() or club_stem.strip())
    if only_under.strip():
        base = _SQUAD_TEAMS / only_under.strip().replace("\\", "/")
        if not base.is_dir():
            return []
        candidates = sorted(base.rglob("*.json"))
    else:
        candidates = _load_club_jsons()
    out: list[Path] = []
    for p in candidates:
        try:
            rel = p.relative_to(_SQUAD_TEAMS)
        except ValueError:
            continue
        if scoped and len(rel.parts) < 3:
            continue
        if club_stem and p.stem != club_stem:
            continue
        out.append(p)
    return sorted(out)


def _download_png(url: str, dest: Path, dry_run: bool) -> bool:
    if not url.startswith(_TM_CDN_PREFIX):
        print(f"  [skip] non-allowlisted URL: {url}", file=sys.stderr)
        return False
    if dry_run:
        print(f"  [dry-run] GET {url} -> {dest.relative_to(_PROJECT)}", file=sys.stderr)
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    ctx = ssl.create_default_context(cafile=certifi.where())
    req = Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urlopen(req, context=ctx, timeout=60) as resp:
            data = resp.read()
    except (HTTPError, URLError, OSError) as e:
        print(f"  [error] {url}: {e}", file=sys.stderr)
        return False
    if not data.startswith(_PNG_MAGIC):
        print(f"  [error] not a PNG: {url} ({len(data)} bytes)", file=sys.stderr)
        return False
    if len(data) < _MIN_BYTES:
        print(f"  [error] suspiciously small PNG: {url}", file=sys.stderr)
        return False
    dest.write_bytes(data)
    return True


def _clear_missing_flag(data: dict[str, Any]) -> bool:
    src = data.get("source")
    if not isinstance(src, dict) or "missingLogoFile" not in src:
        return False
    del src["missingLogoFile"]
    return True


def run(
    dry_run: bool,
    delay_s: float,
    *,
    only_under: str = "",
    club_stem: str = "",
) -> int:
    ok = 0
    skipped = 0
    failed = 0
    cleared = 0

    paths = _resolve_json_paths(only_under, club_stem)
    if not paths:
        print("No squad JSON files matched the scope.", file=sys.stderr)
        return 1

    for jf in paths:
        try:
            raw = json.loads(jf.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if raw.get("kind") != "club":
            continue
        img_rel = (raw.get("imagePath") or "").strip().replace("\\", "/")
        if not img_rel:
            continue
        dest = _PROJECT / img_rel
        if not _is_under_teams_images(dest):
            print(f"  [skip] imagePath outside Teams Images: {jf}", file=sys.stderr)
            failed += 1
            continue

        cid = raw.get("transfermarktClubId")
        if cid is None:
            print(f"  [skip] no transfermarktClubId: {jf}", file=sys.stderr)
            failed += 1
            continue
        try:
            club_id = int(cid)
        except (TypeError, ValueError):
            print(f"  [skip] bad transfermarktClubId: {jf}", file=sys.stderr)
            failed += 1
            continue

        if dest.is_file():
            if _clear_missing_flag(raw):
                cleared += 1
                if not dry_run:
                    jf.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            skipped += 1
            continue

        url = _crest_url(club_id)
        if _download_png(url, dest, dry_run):
            ok += 1
            if not dry_run:
                _clear_missing_flag(raw)
                jf.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        else:
            failed += 1
        if delay_s > 0 and not dry_run:
            time.sleep(delay_s)

    print(
        f"Done. downloaded={ok} already_had_file={skipped} flags_cleared={cleared} failed_or_skip={failed}",
        file=sys.stderr,
    )
    return 0 if failed == 0 else 1


def main() -> None:
    p = argparse.ArgumentParser(
        description="Download missing club logos from Transfermarkt CDN using transfermarktClubId."
    )
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--delay",
        type=float,
        default=0.12,
        help="Seconds between downloads (default: 0.12)",
    )
    p.add_argument(
        "--only-under",
        default="",
        metavar="REL_PATH",
        help="Only JSON under Squad Formation/Teams/<REL_PATH>, e.g. England/Premier League.",
    )
    p.add_argument(
        "--club",
        default="",
        metavar="STEM",
        help="Only this club JSON filename without .json (e.g. Arsenal FC). Works with or without --only-under.",
    )
    args = p.parse_args()
    raise SystemExit(
        run(args.dry_run, args.delay, only_under=args.only_under, club_stem=args.club)
    )


if __name__ == "__main__":
    main()
