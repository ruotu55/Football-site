#!/usr/bin/env python3
"""
Download actual 3000x3000 PNG files via football-logos.cc UI flow.

This script uses Playwright to interact with each national team page:
it selects PNG size "3000x3000" and captures the browser download.
"""

from __future__ import annotations

import argparse
import os
import re
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

BASE_URL = "https://football-logos.cc/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

EXCLUDED_ROOT_SLUGS = {
    "",
    "all",
    "countries",
    "collections",
    "logos-on-map",
    "new-logos",
    "request-logo",
    "tournaments",
    "map",
    "new",
}


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.add(href)


def fetch_html(url: str) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def normalize(url: str) -> str:
    parts = urlparse(url)
    scheme = parts.scheme or "https"
    netloc = parts.netloc.lower()
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if not path.endswith("/"):
        path = f"{path}/"
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{scheme}://{netloc}{path}"


def parse_links(url: str) -> set[str]:
    html = fetch_html(url)
    parser = LinkParser()
    parser.feed(html)
    return {urljoin(url, href) for href in parser.links}


def is_country_url(url: str) -> bool:
    p = urlparse(url)
    if p.netloc.lower() != "football-logos.cc":
        return False
    segs = [s for s in p.path.strip("/").split("/") if s]
    if len(segs) != 1:
        return False
    if segs[0].lower() in EXCLUDED_ROOT_SLUGS:
        return False
    return True


def is_national_team_url(url: str) -> bool:
    p = urlparse(url)
    if p.netloc.lower() != "football-logos.cc":
        return False
    return p.path.strip("/").lower().endswith("-national-team")


def discover_national_team_pages(delay: float) -> list[str]:
    home_links = parse_links(BASE_URL)
    country_pages = sorted({normalize(u) for u in home_links if is_country_url(u)})

    national_pages: set[str] = set()
    for idx, country in enumerate(country_pages, start=1):
        print(f"[discover {idx}/{len(country_pages)}] {country}")
        try:
            links = parse_links(country)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! failed: {exc}")
            time.sleep(delay)
            continue

        for link in links:
            if is_national_team_url(link):
                national_pages.add(normalize(link))
        time.sleep(delay)

    return sorted(national_pages)


def pick_3000_option_value(page) -> str | None:
    select = page.locator("select[name='png-size']")
    if select.count() == 0:
        return None
    options = select.locator("option").evaluate_all(
        "opts => opts.map(o => ({value: o.value, text: (o.textContent || '').trim()}))"
    )
    for item in options:
        text = item.get("text", "")
        if text.startswith("3000x3000"):
            return item.get("value")
    return None


def download_3000_png(page, output_dir: str, overwrite: bool) -> tuple[str | None, str]:
    option_value = pick_3000_option_value(page)
    if not option_value:
        return None, "no-3000-option"

    select = page.locator("select[name='png-size']")

    # Make sure a change event happens even if 3000 is currently selected.
    options_count = select.locator("option").count()
    if options_count > 1:
        try:
            select.select_option(index=1)
            page.wait_for_timeout(150)
        except Exception:
            pass

    with page.expect_download(timeout=90000) as dl_info:
        select.select_option(value=option_value)
    download = dl_info.value
    filename = download.suggested_filename
    output_path = os.path.join(output_dir, filename)
    if os.path.exists(output_path) and not overwrite:
        return filename, "exists"
    download.save_as(output_path)
    return filename, "saved"


def main() -> int:
    parser = argparse.ArgumentParser(description="Download actual 3000x3000 national team PNG logos.")
    parser.add_argument(
        "--output-dir",
        default=os.path.dirname(os.path.abspath(__file__)),
        help="Directory to save downloads (default: script folder).",
    )
    parser.add_argument("--overwrite", action="store_true", help="Overwrite files if they already exist.")
    parser.add_argument("--delay", type=float, default=0.15, help="Delay between page actions.")
    parser.add_argument(
        "--test-url",
        default="",
        help="Optional: run only one national team page URL for testing.",
    )
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode.")
    args = parser.parse_args()

    output_dir = os.path.abspath(args.output_dir)
    os.makedirs(output_dir, exist_ok=True)

    if args.test_url:
        pages = [normalize(args.test_url)]
    else:
        print("Discovering national team pages...")
        pages = discover_national_team_pages(args.delay)

    print(f"Total pages: {len(pages)}")
    if not pages:
        return 1

    saved = 0
    exists = 0
    failed = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(accept_downloads=True)
        context.set_default_timeout(90000)

        for idx, url in enumerate(pages, start=1):
            print(f"[{idx}/{len(pages)}] {url}")
            page = context.new_page()
            try:
                page.goto(url, wait_until="networkidle")
                filename, state = download_3000_png(page, output_dir, args.overwrite)
                if state == "saved":
                    saved += 1
                    print(f"  + saved {filename}")
                elif state == "exists":
                    exists += 1
                    print(f"  = exists {filename}")
                else:
                    failed += 1
                    print(f"  ! failed ({state})")
            except PlaywrightTimeoutError:
                failed += 1
                print("  ! failed (timeout)")
            except PlaywrightError as exc:
                failed += 1
                print(f"  ! failed (playwright: {exc})")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"  ! failed ({exc})")
            finally:
                try:
                    if not page.is_closed():
                        page.close()
                except Exception:
                    pass

            if args.delay > 0:
                time.sleep(args.delay)

        context.close()
        browser.close()

    print("")
    print("Done.")
    print(f"Saved: {saved}")
    print(f"Exists: {exists}")
    print(f"Failed: {failed}")
    return 0 if (saved > 0 or exists > 0) else 1


if __name__ == "__main__":
    raise SystemExit(main())
