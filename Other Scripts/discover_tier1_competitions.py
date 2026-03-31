#!/usr/bin/env python3
"""
Build Squad Formation/_tier1_competitions.json from Transfermarkt regional listing pages
(each row: top domestic league + country). Used for worldwide tier-1 squad generation.

Application Security Requirement: HTTPS only (transfermarkt.co.uk); certifi SSL; parse allowlisted HTML only;
no shell; output is local JSON.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import certifi

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT = _SCRIPT_DIR.parent.parent
_DEFAULT_OUT = _PROJECT / "Squad Formation" / "_tier1_competitions.json"

_BASE = "https://www.transfermarkt.co.uk"
_REGIONS = ("europa", "amerika", "asien", "afrika")


def _ssl_ctx():
    import ssl

    return ssl.create_default_context(cafile=certifi.where())


def fetch_html(url: str, *, delay_s: float) -> str:
    if delay_s > 0:
        time.sleep(delay_s)
    ctx = _ssl_ctx()
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; FootballChannelTier1Index/1.0; +local project)",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-GB,en;q=0.9",
        },
    )
    try:
        with urlopen(req, context=ctx, timeout=90) as resp:
            return resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} for {url}") from e


def parse_tier_rows(html: str) -> list[dict[str, Any]]:
    """One row per country: top league shown on regional overview table."""
    parts = re.split(r'<tr class="(?:odd|even)">', html, flags=re.IGNORECASE)
    out: list[dict[str, Any]] = []
    for chunk in parts[1:]:
        if "flagge/tiny" not in chunk:
            continue
        wc = re.search(r"/startseite/wettbewerb/([A-Z0-9]+)", chunk)
        flag = re.search(r'/flagge/tiny/(\d+)\.png[^>]*title="([^"]+)"', chunk)
        if not wc or not flag:
            continue
        titles = re.findall(r'title="([^"]+)"', chunk)
        league_name = titles[0] if titles else ""
        out.append(
            {
                "competitionId": wc.group(1),
                "countryId": int(flag.group(1)),
                "countryName": flag.group(2).strip(),
                "leagueName": league_name.strip(),
            }
        )
    return out


def discover_region(region: str, *, max_pages: int, delay_s: float) -> list[dict[str, Any]]:
    base = f"{_BASE}/wettbewerbe/{region}"
    rows_all: list[dict[str, Any]] = []
    seen_country_ids: set[int] = set()
    for page in range(1, max_pages + 1):
        url = f"{base}/wettbewerbe" if page == 1 else f"{base}?page={page}"
        print(f"  {region} page {page} …", file=sys.stderr)
        html = fetch_html(url, delay_s=delay_s)
        rows = parse_tier_rows(html)
        print(f"  {region} page {page}: {len(rows)} rows", file=sys.stderr)
        if not rows:
            break
        new_rows: list[dict[str, Any]] = []
        for r in rows:
            cid = int(r["countryId"])
            if cid in seen_country_ids:
                continue
            seen_country_ids.add(cid)
            new_rows.append(r)
        if not new_rows:
            # Listing repeats the last page forever once all countries are seen
            break
        for r in new_rows:
            r["region"] = region
        rows_all.extend(new_rows)
    return rows_all


def dedupe(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[int] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        cid = int(e["countryId"])
        if cid in seen:
            continue
        seen.add(cid)
        out.append(e)
    return out


def run(args: argparse.Namespace) -> int:
    regions = [r.strip().lower() for r in args.regions.split(",") if r.strip()]
    if not regions:
        regions = list(_REGIONS)

    combined: list[dict[str, Any]] = []
    for reg in regions:
        if reg not in _REGIONS:
            print(f"Unknown region {reg!r}, expected one of {_REGIONS}", file=sys.stderr)
            return 1
        print(f"Fetching {reg} …", file=sys.stderr)
        combined.extend(discover_region(reg, max_pages=args.max_pages, delay_s=args.delay))

    entries = dedupe(combined)
    payload = {
        "version": 1,
        "description": "Top domestic league per country from Transfermarkt regional overview (not tmapi).",
        "generated": datetime.now(timezone.utc).isoformat(),
        "regions": regions,
        "entryCount": len(entries),
        "entries": sorted(entries, key=lambda x: (x["countryName"], x["leagueName"])),
    }

    out_path = Path(args.output)
    if args.dry_run:
        print(json.dumps(payload, indent=2, ensure_ascii=False)[:4000], file=sys.stderr)
        print(f"[dry-run] would write {len(entries)} entries to {out_path}", file=sys.stderr)
        return 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} tier-1 competitions to {out_path}", file=sys.stderr)
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Discover Transfermarkt tier-1 league codes per country.")
    p.add_argument(
        "--output",
        default=str(_DEFAULT_OUT),
        help=f"JSON output path (default: {_DEFAULT_OUT.name})",
    )
    p.add_argument(
        "--regions",
        default=",".join(_REGIONS),
        help=f"Comma-separated: {','.join(_REGIONS)}",
    )
    p.add_argument("--max-pages", type=int, default=40, help="Max pagination per region")
    p.add_argument("--delay", type=float, default=0.35, help="Seconds between HTTP requests")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    raise SystemExit(run(args))


if __name__ == "__main__":
    main()
