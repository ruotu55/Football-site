#!/usr/bin/env python3
"""One-time YouTube OAuth helper. Run ONCE PER CHANNEL.

    python ".Storage/Scripts/authorize_youtube.py" --channel en
    python ".Storage/Scripts/authorize_youtube.py" --channel es

What it does
------------
1. Reads .Storage/youtube/client_secret.json (the OAuth "Desktop app" client you
   downloaded from Google Cloud).
2. Opens your browser to Google's consent screen. Sign in with the Google
   account that owns the channel for this --channel, and grant access.
3. Catches the redirect on a local loopback port, exchanges the code, and saves
   the refresh token to .Storage/youtube/token_<channel>.json.

After running it for both "en" and "es", the calendar's "Upload to YouTube"
button will work. Re-run any time to re-authorize.

Stdlib only — no pip installs needed.
"""
from __future__ import annotations

import argparse
import http.server
import json
import secrets
import ssl
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

# .Storage/Scripts/authorize_youtube.py  ->  project root is two levels up.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
YT_DIR = PROJECT_ROOT / ".Storage" / "youtube"

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube"

try:
    import certifi  # type: ignore

    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl.create_default_context()


def _client_path(slot):
    # Slot 1 = client_secret.json (original project). Slot N = client_secret_N.json.
    return YT_DIR / ("client_secret.json" if slot == 1 else f"client_secret_{slot}.json")


def _token_path(channel, slot):
    return YT_DIR / (f"token_{channel}.json" if slot == 1 else f"token_{channel}_{slot}.json")


def _load_client(slot):
    path = _client_path(slot)
    if not path.is_file():
        sys.exit(f"Missing {path.name} in {YT_DIR}\n"
                 f"(download the OAuth 'Desktop app' client JSON for project slot {slot} from Google Cloud, "
                 f"and save it as {path.name}).")
    raw = json.loads(path.read_text(encoding="utf-8"))
    node = raw.get("installed") or raw.get("web") or raw
    if not node.get("client_id") or not node.get("client_secret"):
        sys.exit(f"{path.name} has no client_id/client_secret (is it the right file?).")
    print(f"Using {path.name}")
    return node["client_id"], node["client_secret"]


class _CatchHandler(http.server.BaseHTTPRequestHandler):
    captured = {}

    def do_GET(self):  # noqa: N802
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        _CatchHandler.captured = {k: v[0] for k, v in params.items()}
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        ok = "code" in _CatchHandler.captured
        msg = "Authorization complete — you can close this tab." if ok else "Authorization failed."
        self.wfile.write(f"<html><body style='font-family:sans-serif;padding:40px'><h2>{msg}</h2></body></html>".encode("utf-8"))

    def log_message(self, *args):  # silence
        return


def main():
    ap = argparse.ArgumentParser(description="Authorize a YouTube channel for uploads.")
    ap.add_argument("--channel", required=True, choices=["en", "es"], help="Which channel to authorize")
    ap.add_argument("--slot", type=int, default=1,
                    help="Project slot in the quota-fallback chain (1 = original project / client_secret.json, "
                         "2 = client_secret_2.json, etc.)")
    ap.add_argument("--port", type=int, default=8765, help="Loopback port for the OAuth redirect")
    args = ap.parse_args()

    client_id, client_secret = _load_client(args.slot)
    YT_DIR.mkdir(parents=True, exist_ok=True)

    redirect_uri = f"http://localhost:{args.port}"
    state = secrets.token_urlsafe(16)
    auth_link = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",          # force a refresh_token every time
        "state": state,
    })

    httpd = http.server.HTTPServer(("localhost", args.port), _CatchHandler)
    t = threading.Thread(target=httpd.handle_request, daemon=True)  # serve exactly one request
    t.start()

    print(f"\nAuthorizing the '{args.channel}' channel on project slot {args.slot}.")
    print("A browser window will open. Sign in with the Google account that owns")
    print(f"the {args.channel.upper()} channel, then grant access.\n")
    print("If the browser doesn't open, paste this URL manually:\n")
    print(auth_link + "\n")
    webbrowser.open(auth_link)

    t.join(timeout=300)
    captured = _CatchHandler.captured
    if captured.get("state") != state or "code" not in captured:
        sys.exit("Did not receive a valid authorization code (timed out or state mismatch).")

    # Exchange the code for tokens.
    body = urllib.parse.urlencode({
        "code": captured["code"],
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")
    req = urllib.request.Request(TOKEN_URL, data=body, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        tokens = json.loads(r.read().decode("utf-8"))

    refresh = tokens.get("refresh_token")
    if not refresh:
        sys.exit("No refresh_token returned. Revoke prior access at "
                 "https://myaccount.google.com/permissions and re-run (prompt=consent should force one).")

    out = _token_path(args.channel, args.slot)
    out.write_text(json.dumps({"refresh_token": refresh, "channel": args.channel, "slot": args.slot}, indent=2), encoding="utf-8")
    print(f"\nSaved {out}")
    print(f"Channel '{args.channel}' is now authorized for uploads.\n")


if __name__ == "__main__":
    main()
