# Footbal channel

Dual-site football quiz workspace with two independent web runners:

- `Main Runner - Career Path`
- `Main Runner - Lineups`

## Project policy
- Keep both sites runnable independently.
- Do not create runtime imports between the two site folders.
- If a shared improvement applies to both, implement it in both folders.
- Preserve 100% existing UI and behavior unless explicitly requested otherwise.

## Run either site
From PowerShell (adjust the path to match where you cloned the project):

```powershell
& "c:\Users\Rom\Documents\GitHub\Football Channel\Main Runner - Career Path - Regular\run_site.bat" --no-browser
& "c:\Users\Rom\Documents\GitHub\Football Channel\Main Runner - Lineups - Regular\run_site.bat" --no-browser
```

Then open the printed local URL in the browser. The dev server uses the **Football Channel repo root** as its web root, so the URL includes the runner folder name (for example `.../Main%20Runner%20-%20Career%20Path%20-%20Regular/index.html`). Shared assets (`data/`, `Voices/`, `Teams Images/`, etc.) load from the repo root.

### Open the site from another PC or phone (same Wi‑Fi)
By default the server only listens on this PC (`127.0.0.1`). To allow other devices on your home network, pass **`--host 0.0.0.0`** before any other flags (arguments after the `.bat` are forwarded to Python):

```powershell
& "...\Main Runner - Career Path - Regular\run_site.bat" --host 0.0.0.0 --no-browser
```

Leave that window open. The console prints a **LAN** line like `http://192.168.x.x:8886/index.html` — use that full URL on the other device’s browser. Both machines must be on the same LAN; if Windows Firewall asks to allow Python, choose **Allow** for private networks.

**Not on the same network:** use a tunnel (for example [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)) pointing at your chosen port, or deploy the static files to real hosting.

## Structure
- `Main Runner - Career Path - Regular` / `Main Runner - Career Path - Shorts`: career-path quiz runners (site code only).
- `Main Runner - Lineups - Regular` / `Main Runner - Lineups - Shorts`: lineup runners (site code only).
- **Shared at repo root** (used by all runners): `data/`, `emojies/`, `General values/`, `icons/`, `Legacy scripts/`, `Logo/`, `Nationality images/`, `Other Scripts/`, `Player Images No Background/`, `Players images/`, `Squad Formation/`, `Teams Images/`, `Voices/`.

## Agent context files
- `.cursor/rules/`: always-apply rules for independence + zero-regression.
- `.cursor/skills/main-runner-maintainer/SKILL.md`: maintenance playbook for agents.
- `ARCHITECTURE.md` inside each site: runtime dependency map and safe-edit boundaries.
