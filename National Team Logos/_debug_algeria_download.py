from playwright.sync_api import sync_playwright


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        seen = []
        page.on("response", lambda r: seen.append((r.status, r.url)))
        page.on("download", lambda d: print("DOWNLOAD_EVENT", d.suggested_filename))

        page.goto(
            "https://football-logos.cc/algeria/algeria-national-team/",
            wait_until="networkidle",
            timeout=90000,
        )
        select = page.locator("select[name='png-size']")
        options = select.locator("option").evaluate_all(
            "opts => opts.map(o => ({ value: o.value, text: (o.textContent || '').trim(), selected: o.selected }))"
        )
        print("OPTIONS:", options[:3])

        if len(options) > 1:
            select.select_option(index=1)
            page.wait_for_timeout(5000)
            print("PAGE_URL_AFTER_SELECT:", page.url)

        print("LAST_RESPONSES:")
        for status, url in seen[-60:]:
            if "download" in url.lower() or "png" in url.lower() or "assets.football-logos.cc" in url.lower() or status >= 300:
                print(status, url)

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
